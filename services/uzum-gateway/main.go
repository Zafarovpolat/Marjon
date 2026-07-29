package main

import (
	"bytes"
	"crypto/md5"
	"crypto/rand"
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	_ "github.com/lib/pq"
)

// ── Config ────────────────────────────────────────────────────────────────────

type Config struct {
	Port          string
	DSN           string
	WebhookSecret string
	BackendURL    string
}

var conf Config

func loadConfig() Config {
	return Config{
		Port:          getEnv("PORT", "8003"),
		DSN:           mustEnv("DATABASE_URL"),
		WebhookSecret: mustEnv("WEBHOOK_SECRET"),
		BackendURL:    getEnv("BACKEND_URL", "http://backend:8000/api/v1"),
	}
}

func getEnv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func mustEnv(k string) string {
	v := os.Getenv(k)
	if v == "" {
		log.Fatalf("required env var %s is not set", k)
	}
	return v
}

// ── DB ────────────────────────────────────────────────────────────────────────

var db *sql.DB

func initDB(dsn string) {
	var err error
	db, err = sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalf("db open: %v", err)
	}
	db.SetMaxOpenConns(20)
	db.SetMaxIdleConns(5)
	for i := 0; i < 10; i++ {
		if err = db.Ping(); err == nil {
			break
		}
		log.Printf("waiting for db... (%v)", err)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		log.Fatalf("db ping failed: %v", err)
	}
	autoMigrate()
	log.Println("database ready")
}

func autoMigrate() {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS uzum_transactions (
			id           VARCHAR(36)   PRIMARY KEY,
			company_id   VARCHAR(36)   NOT NULL,
			uzum_trans_id VARCHAR(255) UNIQUE NOT NULL,
			order_id     VARCHAR(255)  NOT NULL,
			amount       BIGINT        NOT NULL,
			state        INTEGER       NOT NULL DEFAULT 1,
			create_time  BIGINT        NOT NULL DEFAULT 0,
			perform_time BIGINT        NOT NULL DEFAULT 0,
			cancel_time  BIGINT        NOT NULL DEFAULT 0,
			created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
			updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
		)
	`)
	if err != nil {
		log.Fatalf("migrate: %v", err)
	}
}

// ── Per-company credentials ───────────────────────────────────────────────────

type UzumCreds struct {
	ServiceID string
	SecretKey string
}

func getCompanyUzumCreds(companyID string) (*UzumCreds, error) {
	var serviceID, secretKey sql.NullString
	err := db.QueryRow(`
		SELECT uzum_store_id, uzum_key
		FROM payment_gateway_settings
		WHERE company_id = $1 AND uzum_enabled = TRUE
	`, companyID).Scan(&serviceID, &secretKey)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if !serviceID.Valid || serviceID.String == "" || !secretKey.Valid || secretKey.String == "" {
		return nil, nil
	}
	return &UzumCreds{ServiceID: serviceID.String, SecretKey: secretKey.String}, nil
}

// ── Models ────────────────────────────────────────────────────────────────────

type UzumTx struct {
	ID          string
	CompanyID   string
	UzumTransID string
	OrderID     string
	Amount      int64
	State       int
	CreateTime  int64
	PerformTime int64
	CancelTime  int64
}

const (
	StateCreated         = 1
	StateCompleted       = 2
	StateCancelledBefore = -1
	StateCancelledAfter  = -2
)

func txByUzumID(uzumTransID string) (*UzumTx, error) {
	t := &UzumTx{}
	err := db.QueryRow(`
		SELECT id, company_id, uzum_trans_id, order_id, amount, state,
		       create_time, perform_time, cancel_time
		FROM uzum_transactions WHERE uzum_trans_id = $1
	`, uzumTransID).Scan(
		&t.ID, &t.CompanyID, &t.UzumTransID, &t.OrderID, &t.Amount, &t.State,
		&t.CreateTime, &t.PerformTime, &t.CancelTime,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return t, err
}

func insertTx(companyID, uzumTransID, orderID string, amount, createTime int64) (*UzumTx, error) {
	id := newUUID()
	_, err := db.Exec(`
		INSERT INTO uzum_transactions
		  (id, company_id, uzum_trans_id, order_id, amount, state, create_time)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, id, companyID, uzumTransID, orderID, amount, StateCreated, createTime)
	if err != nil {
		return nil, err
	}
	return &UzumTx{
		ID: id, CompanyID: companyID, UzumTransID: uzumTransID, OrderID: orderID,
		Amount: amount, State: StateCreated, CreateTime: createTime,
	}, nil
}

func setPerformed(uzumTransID string, ts int64) error {
	_, err := db.Exec(`
		UPDATE uzum_transactions
		SET state=$1, perform_time=$2, updated_at=NOW()
		WHERE uzum_trans_id=$3
	`, StateCompleted, ts, uzumTransID)
	return err
}

func setCancelled(uzumTransID string, ts int64, state int) error {
	_, err := db.Exec(`
		UPDATE uzum_transactions
		SET state=$1, cancel_time=$2, updated_at=NOW()
		WHERE uzum_trans_id=$3
	`, state, ts, uzumTransID)
	return err
}

func txsInRange(companyID string, from, to int64) ([]UzumTx, error) {
	rows, err := db.Query(`
		SELECT id, company_id, uzum_trans_id, order_id, amount, state,
		       create_time, perform_time, cancel_time
		FROM uzum_transactions
		WHERE company_id=$1 AND create_time >= $2 AND create_time <= $3
		ORDER BY create_time
	`, companyID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []UzumTx
	for rows.Next() {
		var t UzumTx
		if err := rows.Scan(
			&t.ID, &t.CompanyID, &t.UzumTransID, &t.OrderID, &t.Amount, &t.State,
			&t.CreateTime, &t.PerformTime, &t.CancelTime,
		); err != nil {
			return nil, err
		}
		result = append(result, t)
	}
	return result, rows.Err()
}

// ── Auth ──────────────────────────────────────────────────────────────────────

// Uzum Bank sends: Authorization: <serviceId>:<timestamp>:<md5(secretKey+serviceId+timestamp)>
func verifyAuth(r *http.Request, creds *UzumCreds) bool {
	auth := r.Header.Get("Authorization")
	// Strip "Bearer " prefix if present
	auth = strings.TrimPrefix(auth, "Bearer ")
	parts := strings.SplitN(auth, ":", 3)
	if len(parts) != 3 {
		return false
	}
	serviceID, timestamp, signature := parts[0], parts[1], parts[2]
	if serviceID != creds.ServiceID {
		return false
	}
	expected := fmt.Sprintf("%x", md5.Sum([]byte(creds.SecretKey+serviceID+timestamp)))
	// Подпись сверяем constant-time (защита от тайминг-атаки).
	if subtle.ConstantTimeCompare([]byte(strings.ToLower(expected)), []byte(strings.ToLower(signature))) != 1 {
		return false
	}
	// Свежесть метки времени — защита от replay. Единицу (сек/мс) определяем по
	// величине; при непарсинге НЕ отвергаем, чтобы не рубить легитимные запросы.
	if ts, err := strconv.ParseInt(timestamp, 10, 64); err == nil {
		if ts > 1_000_000_000_000 { // похоже на миллисекунды
			ts /= 1000
		}
		if diff := time.Now().Unix() - ts; diff > 300 || diff < -300 {
			log.Printf("uzum auth: устаревшая метка времени (delta=%ds)", diff)
			return false
		}
	}
	return true
}

// ── JSON-RPC ──────────────────────────────────────────────────────────────────

type RPCRequest struct {
	Method string          `json:"method"`
	Params json.RawMessage `json:"params"`
	ID     interface{}     `json:"id"`
}

type RPCResponse struct {
	Result interface{} `json:"result,omitempty"`
	Error  *RPCError   `json:"error,omitempty"`
	ID     interface{} `json:"id"`
}

type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

const (
	ErrAuthFailed      = -32504
	ErrMethodNotFound  = -32601
	ErrOrderNotFound   = -31050
	ErrIncorrectAmount = -31001
	ErrTransNotFound   = -31003
	ErrBadState        = -31008
	ErrTooMany         = -31099
)

func errResp(id interface{}, code int, msg string) RPCResponse {
	return RPCResponse{Error: &RPCError{Code: code, Message: msg}, ID: id}
}

// ── Backend calls ─────────────────────────────────────────────────────────────

type OrderInfo struct {
	ID          string  `json:"id"`
	TotalAmount float64 `json:"total_amount"`
	Status      string  `json:"status"`
}

func fetchOrder(orderID string) (*OrderInfo, error) {
	url := fmt.Sprintf("%s/internal/orders/%s", conf.BackendURL, orderID)
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("X-Webhook-Secret", conf.WebhookSecret)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 404 {
		return nil, nil
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("backend %d", resp.StatusCode)
	}
	var o OrderInfo
	return &o, json.NewDecoder(resp.Body).Decode(&o)
}

type WebhookPayload struct {
	OrderID     string  `json:"order_id"`
	Amount      float64 `json:"amount"`
	Method      string  `json:"method"`
	GatewayTxID string  `json:"gateway_tx_id"`
	Action      string  `json:"action"`
}

// Клиент с таймаутом: без него зависший бэкенд подвесил бы горутину навсегда.
var backendClient = &http.Client{Timeout: 10 * time.Second}

func notifyBackend(p WebhookPayload) {
	body, _ := json.Marshal(p)
	const attempts = 5
	var lastErr error
	for i := 1; i <= attempts; i++ {
		req, _ := http.NewRequest("POST", conf.BackendURL+"/internal/payment-webhook", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Webhook-Secret", conf.WebhookSecret)
		resp, err := backendClient.Do(req)
		if err != nil {
			lastErr = err
		} else {
			code := resp.StatusCode
			b, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			if code < 300 {
				if i > 1 {
					log.Printf("notify backend ok on attempt %d", i)
				}
				return
			}
			lastErr = fmt.Errorf("status %d: %s", code, b)
		}
		log.Printf("notify backend attempt %d/%d failed: %v", i, attempts, lastErr)
		if i < attempts {
			time.Sleep(time.Duration(i*i) * time.Second) // backoff 1,4,9,16s
		}
	}
	// DEAD-LETTER: оплата прошла у провайдера, но бэкенд не подтвердил — нужен ручной разбор.
	log.Printf("DEAD-LETTER notify backend gave up after %d attempts: %v | payload=%s", attempts, lastErr, body)
}

// ── Params ────────────────────────────────────────────────────────────────────

type CheckOrderParams struct {
	ServiceID int64          `json:"serviceId"`
	Timestamp int64          `json:"timestamp"`
	Params    CheckOrderInner `json:"params"`
}

type CheckOrderInner struct {
	Account map[string]any `json:"account"`
	Amount  int64          `json:"amount"`
}

type CreateTxParams struct {
	ServiceID int64          `json:"serviceId"`
	Timestamp int64          `json:"timestamp"`
	TransID   string         `json:"transId"`
	Params    CheckOrderInner `json:"params"`
}

type TransIDParams struct {
	ServiceID int64  `json:"serviceId"`
	Timestamp int64  `json:"timestamp"`
	TransID   string `json:"transId"`
}

type StatementParams struct {
	ServiceID int64 `json:"serviceId"`
	Timestamp int64 `json:"timestamp"`
	From      int64 `json:"from"`
	To        int64 `json:"to"`
}

// ── Method handlers ───────────────────────────────────────────────────────────

func handleCheckOrder(companyID string, id interface{}, raw json.RawMessage) RPCResponse {
	var p CheckOrderParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return errResp(id, ErrOrderNotFound, "invalid params")
	}
	orderID, _ := p.Params.Account["order_id"].(string)
	if orderID == "" {
		return errResp(id, ErrOrderNotFound, "order_id required in account")
	}
	order, err := fetchOrder(orderID)
	if err != nil || order == nil {
		return errResp(id, ErrOrderNotFound, "order not found")
	}
	if p.Params.Amount != int64(math.Round(order.TotalAmount*100)) {
		return errResp(id, ErrIncorrectAmount, "incorrect amount")
	}
	return RPCResponse{Result: map[string]any{
		"serviceId": p.ServiceID,
		"timestamp": nowMs(),
		"status":    0,
	}, ID: id}
}

func handleCreateTransaction(companyID string, id interface{}, raw json.RawMessage) RPCResponse {
	var p CreateTxParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return errResp(id, ErrOrderNotFound, "invalid params")
	}
	if p.TransID == "" {
		return errResp(id, ErrTransNotFound, "transId required")
	}
	orderID, _ := p.Params.Account["order_id"].(string)
	if orderID == "" {
		return errResp(id, ErrOrderNotFound, "order_id required in account")
	}

	existing, err := txByUzumID(p.TransID)
	if err != nil {
		return errResp(id, -32400, "internal error")
	}
	if existing != nil {
		if existing.OrderID != orderID {
			return errResp(id, ErrTooMany, "transaction in queue for another order")
		}
		return RPCResponse{Result: map[string]any{
			"serviceId":  p.ServiceID,
			"timestamp":  nowMs(),
			"transId":    existing.UzumTransID,
			"status":     existing.State,
			"createTime": existing.CreateTime,
		}, ID: id}
	}

	order, err := fetchOrder(orderID)
	if err != nil || order == nil {
		return errResp(id, ErrOrderNotFound, "order not found")
	}
	if p.Params.Amount != int64(math.Round(order.TotalAmount*100)) {
		return errResp(id, ErrIncorrectAmount, "incorrect amount")
	}

	createTime := nowMs()
	tx, err := insertTx(companyID, p.TransID, orderID, p.Params.Amount, createTime)
	if err != nil {
		return errResp(id, -32400, "internal error")
	}
	log.Printf("uzum create company=%s order=%s trans=%s", companyID, orderID, p.TransID)
	return RPCResponse{Result: map[string]any{
		"serviceId":  p.ServiceID,
		"timestamp":  nowMs(),
		"transId":    tx.UzumTransID,
		"status":     tx.State,
		"createTime": tx.CreateTime,
	}, ID: id}
}

func handlePerformTransaction(id interface{}, raw json.RawMessage) RPCResponse {
	var p TransIDParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return errResp(id, ErrTransNotFound, "invalid params")
	}
	tx, err := txByUzumID(p.TransID)
	if err != nil || tx == nil {
		return errResp(id, ErrTransNotFound, "transaction not found")
	}
	if tx.State == StateCompleted {
		return RPCResponse{Result: map[string]any{
			"serviceId":   p.ServiceID,
			"timestamp":   nowMs(),
			"transId":     tx.UzumTransID,
			"status":      tx.State,
			"performTime": tx.PerformTime,
		}, ID: id}
	}
	if tx.State != StateCreated {
		return errResp(id, ErrBadState, "cannot perform in current state")
	}

	performTime := nowMs()
	if err := setPerformed(p.TransID, performTime); err != nil {
		return errResp(id, -32400, "internal error")
	}
	go notifyBackend(WebhookPayload{
		OrderID: tx.OrderID, Amount: float64(tx.Amount) / 100,
		Method: "uzum", GatewayTxID: tx.ID, Action: "confirm",
	})
	log.Printf("uzum perform company=%s order=%s trans=%s", tx.CompanyID, tx.OrderID, p.TransID)
	return RPCResponse{Result: map[string]any{
		"serviceId":   p.ServiceID,
		"timestamp":   nowMs(),
		"transId":     tx.UzumTransID,
		"status":      StateCompleted,
		"performTime": performTime,
	}, ID: id}
}

func handleCancelTransaction(id interface{}, raw json.RawMessage) RPCResponse {
	var p TransIDParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return errResp(id, ErrTransNotFound, "invalid params")
	}
	tx, err := txByUzumID(p.TransID)
	if err != nil || tx == nil {
		return errResp(id, ErrTransNotFound, "transaction not found")
	}
	if tx.State == StateCancelledBefore || tx.State == StateCancelledAfter {
		return RPCResponse{Result: map[string]any{
			"serviceId":  p.ServiceID,
			"timestamp":  nowMs(),
			"transId":    tx.UzumTransID,
			"status":     tx.State,
			"cancelTime": tx.CancelTime,
		}, ID: id}
	}

	cancelTime := nowMs()
	newState := StateCancelledBefore
	if tx.State == StateCompleted {
		newState = StateCancelledAfter
	}
	if err := setCancelled(p.TransID, cancelTime, newState); err != nil {
		return errResp(id, -32400, "internal error")
	}
	if newState == StateCancelledAfter {
		go notifyBackend(WebhookPayload{
			OrderID: tx.OrderID, Amount: float64(tx.Amount) / 100,
			Method: "uzum", GatewayTxID: tx.ID, Action: "cancel",
		})
	}
	log.Printf("uzum cancel company=%s order=%s trans=%s state=%d", tx.CompanyID, tx.OrderID, p.TransID, newState)
	return RPCResponse{Result: map[string]any{
		"serviceId":  p.ServiceID,
		"timestamp":  nowMs(),
		"transId":    tx.UzumTransID,
		"status":     newState,
		"cancelTime": cancelTime,
	}, ID: id}
}

func handleCheckTransaction(id interface{}, raw json.RawMessage) RPCResponse {
	var p TransIDParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return errResp(id, ErrTransNotFound, "invalid params")
	}
	tx, err := txByUzumID(p.TransID)
	if err != nil || tx == nil {
		return errResp(id, ErrTransNotFound, "transaction not found")
	}
	return RPCResponse{Result: map[string]any{
		"serviceId":   p.ServiceID,
		"timestamp":   nowMs(),
		"transId":     tx.UzumTransID,
		"status":      tx.State,
		"createTime":  tx.CreateTime,
		"performTime": tx.PerformTime,
		"cancelTime":  tx.CancelTime,
	}, ID: id}
}

func handleGetStatement(companyID string, id interface{}, raw json.RawMessage) RPCResponse {
	var p StatementParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return errResp(id, -32400, "invalid params")
	}
	txs, err := txsInRange(companyID, p.From, p.To)
	if err != nil {
		return errResp(id, -32400, "internal error")
	}
	items := make([]map[string]any, 0, len(txs))
	for _, t := range txs {
		items = append(items, map[string]any{
			"transId":     t.UzumTransID,
			"createTime":  t.CreateTime,
			"performTime": t.PerformTime,
			"cancelTime":  t.CancelTime,
			"amount":      t.Amount,
			"status":      t.State,
			"account":     map[string]any{"order_id": t.OrderID},
		})
	}
	return RPCResponse{Result: map[string]any{
		"serviceId":    p.ServiceID,
		"timestamp":    nowMs(),
		"transactions": items,
	}, ID: id}
}

// ── HTTP handler ──────────────────────────────────────────────────────────────

// URL: POST /uzum/{company_id}/callback
func callbackHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		writeJSON(w, errResp(nil, -32300, "Only POST method allowed"))
		return
	}

	// Extract company_id from path: /uzum/{company_id}/callback
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	companyID := parts[1]

	creds, err := getCompanyUzumCreds(companyID)
	if err != nil || creds == nil {
		log.Printf("uzum: company %s not found or uzum not enabled", companyID)
		writeJSON(w, errResp(nil, ErrAuthFailed, "Uzum Pay not configured for this merchant"))
		return
	}

	if !verifyAuth(r, creds) {
		w.WriteHeader(http.StatusUnauthorized)
		writeJSON(w, errResp(nil, ErrAuthFailed, "Authentication failed"))
		return
	}

	var req RPCRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, errResp(nil, -32700, "Parse error"))
		return
	}

	log.Printf("uzum company=%s ← %s", companyID, req.Method)

	var resp RPCResponse
	switch req.Method {
	case "CheckOrder":
		resp = handleCheckOrder(companyID, req.ID, req.Params)
	case "CreateTransaction":
		resp = handleCreateTransaction(companyID, req.ID, req.Params)
	case "PerformTransaction":
		resp = handlePerformTransaction(req.ID, req.Params)
	case "CancelTransaction":
		resp = handleCancelTransaction(req.ID, req.Params)
	case "CheckTransaction":
		resp = handleCheckTransaction(req.ID, req.Params)
	case "GetStatement":
		resp = handleGetStatement(companyID, req.ID, req.Params)
	default:
		resp = errResp(req.ID, ErrMethodNotFound, "method not found")
	}

	writeJSON(w, resp)
}

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok", "service": "uzum-gateway"})
}

func writeJSON(w http.ResponseWriter, v any) {
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("encode error: %v", err)
	}
}

func nowMs() int64 {
	return time.Now().UnixMilli()
}

func newUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}

// ── Main ──────────────────────────────────────────────────────────────────────

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	conf = loadConfig()
	initDB(conf.DSN)

	mux := http.NewServeMux()
	mux.HandleFunc("/uzum/", callbackHandler)
	mux.HandleFunc("/health", healthHandler)

	addr := ":" + conf.Port
	log.Printf("uzum-gateway listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
