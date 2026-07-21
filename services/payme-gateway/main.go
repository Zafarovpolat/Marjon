package main

import (
	"bytes"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	_ "github.com/lib/pq"
)

// ── Config ────────────────────────────────────────────────────────────────────

type Config struct {
	Port          string
	DSN           string
	WebhookSecret string // shared secret with Marjon backend
	BackendURL    string
}

var conf Config

func loadConfig() Config {
	return Config{
		Port:          getEnv("PORT", "8001"),
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
		CREATE TABLE IF NOT EXISTS payme_transactions (
			id           VARCHAR(36)  PRIMARY KEY,
			company_id   VARCHAR(36)  NOT NULL,
			payme_id     VARCHAR(255) UNIQUE NOT NULL,
			order_id     VARCHAR(255) NOT NULL,
			amount       BIGINT       NOT NULL,
			state        INTEGER      NOT NULL DEFAULT 1,
			reason       INTEGER,
			create_time  BIGINT       NOT NULL DEFAULT 0,
			perform_time BIGINT       NOT NULL DEFAULT 0,
			cancel_time  BIGINT       NOT NULL DEFAULT 0,
			created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
			updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
		)
	`)
	if err != nil {
		log.Fatalf("migrate: %v", err)
	}
}

// ── Per-company credentials ───────────────────────────────────────────────────

type PaymeCredentials struct {
	PaymeKey string
}

func getCompanyPaymeKey(companyID string) (string, error) {
	var key sql.NullString
	err := db.QueryRow(`
		SELECT payme_key FROM payment_gateway_settings
		WHERE company_id = $1 AND payme_enabled = TRUE
	`, companyID).Scan(&key)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	return key.String, nil
}

// ── Models ────────────────────────────────────────────────────────────────────

type PaymeTx struct {
	ID          string
	CompanyID   string
	PaymeID     string
	OrderID     string
	Amount      int64
	State       int
	Reason      sql.NullInt32
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

func txByPaymeID(paymeID string) (*PaymeTx, error) {
	t := &PaymeTx{}
	err := db.QueryRow(`
		SELECT id, company_id, payme_id, order_id, amount, state, reason,
		       create_time, perform_time, cancel_time
		FROM payme_transactions WHERE payme_id = $1
	`, paymeID).Scan(
		&t.ID, &t.CompanyID, &t.PaymeID, &t.OrderID, &t.Amount, &t.State, &t.Reason,
		&t.CreateTime, &t.PerformTime, &t.CancelTime,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return t, err
}

func insertTx(companyID, paymeID, orderID string, amount, createTime int64) (*PaymeTx, error) {
	id := newUUID()
	_, err := db.Exec(`
		INSERT INTO payme_transactions
		  (id, company_id, payme_id, order_id, amount, state, create_time)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, id, companyID, paymeID, orderID, amount, StateCreated, createTime)
	if err != nil {
		return nil, err
	}
	return &PaymeTx{
		ID: id, CompanyID: companyID, PaymeID: paymeID, OrderID: orderID,
		Amount: amount, State: StateCreated, CreateTime: createTime,
	}, nil
}

func setPerformed(paymeID string, ts int64) error {
	_, err := db.Exec(`
		UPDATE payme_transactions
		SET state=$1, perform_time=$2, updated_at=NOW()
		WHERE payme_id=$3
	`, StateCompleted, ts, paymeID)
	return err
}

func setCancelled(paymeID string, ts int64, reason, state int) error {
	_, err := db.Exec(`
		UPDATE payme_transactions
		SET state=$1, cancel_time=$2, reason=$3, updated_at=NOW()
		WHERE payme_id=$4
	`, state, ts, reason, paymeID)
	return err
}

func txsInRange(companyID string, from, to int64) ([]PaymeTx, error) {
	rows, err := db.Query(`
		SELECT id, company_id, payme_id, order_id, amount, state, reason,
		       create_time, perform_time, cancel_time
		FROM payme_transactions
		WHERE company_id=$1 AND create_time >= $2 AND create_time <= $3
		ORDER BY create_time
	`, companyID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []PaymeTx
	for rows.Next() {
		var t PaymeTx
		if err := rows.Scan(
			&t.ID, &t.CompanyID, &t.PaymeID, &t.OrderID, &t.Amount, &t.State, &t.Reason,
			&t.CreateTime, &t.PerformTime, &t.CancelTime,
		); err != nil {
			return nil, err
		}
		result = append(result, t)
	}
	return result, rows.Err()
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
	Code    int         `json:"code"`
	Message interface{} `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

const (
	ErrMethodNotFound  = -32601
	ErrAuthFailed      = -32504
	ErrIncorrectAmount = -31001
	ErrTransNotFound   = -31003
	ErrBadState        = -31008
	ErrOrderNotFound   = -31050
	ErrTooMany         = -31099
)

func errResp(id interface{}, code int, msg interface{}, data ...interface{}) RPCResponse {
	e := &RPCError{Code: code, Message: msg}
	if len(data) > 0 {
		e.Data = data[0]
	}
	return RPCResponse{Error: e, ID: id}
}

func ml(ru, en string) map[string]string {
	return map[string]string{"ru": ru, "uz": en, "en": en}
}

// ── Auth ──────────────────────────────────────────────────────────────────────

// Payme sends: Authorization: Basic base64("Paycom:<key>")
func extractPaymeKey(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "Basic ") {
		return ""
	}
	decoded, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(auth, "Basic "))
	if err != nil {
		return ""
	}
	if idx := strings.IndexByte(string(decoded), ':'); idx >= 0 {
		return string(decoded)[idx+1:]
	}
	return ""
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

func notifyBackend(p WebhookPayload) {
	body, _ := json.Marshal(p)
	req, _ := http.NewRequest("POST", conf.BackendURL+"/internal/payment-webhook", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Webhook-Secret", conf.WebhookSecret)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Printf("notify backend error: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		log.Printf("notify backend %d: %s", resp.StatusCode, b)
	}
}

// ── Params ────────────────────────────────────────────────────────────────────

type CheckPerformParams struct {
	Amount  int64          `json:"amount"`
	Account map[string]any `json:"account"`
}

type CreateParams struct {
	ID      string         `json:"id"`
	Time    int64          `json:"time"`
	Amount  int64          `json:"amount"`
	Account map[string]any `json:"account"`
}

type IDParams struct {
	ID string `json:"id"`
}

type CancelParams struct {
	ID     string `json:"id"`
	Reason int    `json:"reason"`
}

type StatementParams struct {
	From int64 `json:"from"`
	To   int64 `json:"to"`
}

// ── Method handlers ───────────────────────────────────────────────────────────

func handleCheckPerform(companyID string, id interface{}, raw json.RawMessage) RPCResponse {
	var p CheckPerformParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return errResp(id, ErrOrderNotFound, "invalid params", "account")
	}
	orderID, _ := p.Account["order_id"].(string)
	if orderID == "" {
		return errResp(id, ErrOrderNotFound, ml("Заказ не найден", "Order not found"), "order_id")
	}
	order, err := fetchOrder(orderID)
	if err != nil || order == nil {
		return errResp(id, ErrOrderNotFound, ml("Заказ не найден", "Order not found"), "order_id")
	}
	if p.Amount != int64(order.TotalAmount*100) {
		return errResp(id, ErrIncorrectAmount, ml("Неверная сумма", "Incorrect amount"))
	}
	return RPCResponse{Result: map[string]any{"allow": true}, ID: id}
}

func handleCreateTx(companyID string, id interface{}, raw json.RawMessage) RPCResponse {
	var p CreateParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return errResp(id, ErrOrderNotFound, "invalid params")
	}
	orderID, _ := p.Account["order_id"].(string)
	if orderID == "" {
		return errResp(id, ErrOrderNotFound, ml("Заказ не найден", "Order not found"), "order_id")
	}

	existing, err := txByPaymeID(p.ID)
	if err != nil {
		return errResp(id, -32400, "internal error")
	}
	if existing != nil {
		if existing.OrderID != orderID {
			return errResp(id, ErrTooMany, ml("Транзакция в очереди", "Transaction in queue"))
		}
		return RPCResponse{Result: map[string]any{
			"create_time": existing.CreateTime,
			"transaction": existing.ID,
			"state":       existing.State,
		}, ID: id}
	}

	order, err := fetchOrder(orderID)
	if err != nil || order == nil {
		return errResp(id, ErrOrderNotFound, ml("Заказ не найден", "Order not found"), "order_id")
	}
	if p.Amount != int64(order.TotalAmount*100) {
		return errResp(id, ErrIncorrectAmount, ml("Неверная сумма", "Incorrect amount"))
	}

	tx, err := insertTx(companyID, p.ID, orderID, p.Amount, p.Time)
	if err != nil {
		return errResp(id, -32400, "internal error")
	}
	return RPCResponse{Result: map[string]any{
		"create_time": tx.CreateTime,
		"transaction": tx.ID,
		"state":       tx.State,
	}, ID: id}
}

func handlePerformTx(id interface{}, raw json.RawMessage) RPCResponse {
	var p IDParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return errResp(id, ErrTransNotFound, "invalid params")
	}
	tx, err := txByPaymeID(p.ID)
	if err != nil || tx == nil {
		return errResp(id, ErrTransNotFound, ml("Транзакция не найдена", "Transaction not found"))
	}
	if tx.State == StateCompleted {
		return RPCResponse{Result: map[string]any{
			"perform_time": tx.PerformTime, "transaction": tx.ID, "state": tx.State,
		}, ID: id}
	}
	if tx.State != StateCreated {
		return errResp(id, ErrBadState, ml("Невозможно выполнить операцию", "Cannot perform in current state"))
	}

	performTime := time.Now().UnixMilli()
	if err := setPerformed(p.ID, performTime); err != nil {
		return errResp(id, -32400, "internal error")
	}
	go notifyBackend(WebhookPayload{
		OrderID: tx.OrderID, Amount: float64(tx.Amount) / 100,
		Method: "payme", GatewayTxID: tx.ID, Action: "confirm",
	})
	return RPCResponse{Result: map[string]any{
		"perform_time": performTime, "transaction": tx.ID, "state": StateCompleted,
	}, ID: id}
}

func handleCancelTx(id interface{}, raw json.RawMessage) RPCResponse {
	var p CancelParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return errResp(id, ErrTransNotFound, "invalid params")
	}
	tx, err := txByPaymeID(p.ID)
	if err != nil || tx == nil {
		return errResp(id, ErrTransNotFound, ml("Транзакция не найдена", "Transaction not found"))
	}
	if tx.State == StateCancelledBefore || tx.State == StateCancelledAfter {
		var reason interface{}
		if tx.Reason.Valid {
			reason = tx.Reason.Int32
		}
		return RPCResponse{Result: map[string]any{
			"state": tx.State, "cancel_time": tx.CancelTime,
			"transaction": tx.ID, "reason": reason,
		}, ID: id}
	}

	cancelTime := time.Now().UnixMilli()
	newState := StateCancelledBefore
	if tx.State == StateCompleted {
		newState = StateCancelledAfter
	}
	if err := setCancelled(p.ID, cancelTime, p.Reason, newState); err != nil {
		return errResp(id, -32400, "internal error")
	}
	if newState == StateCancelledAfter {
		go notifyBackend(WebhookPayload{
			OrderID: tx.OrderID, Amount: float64(tx.Amount) / 100,
			Method: "payme", GatewayTxID: tx.ID, Action: "cancel",
		})
	}
	return RPCResponse{Result: map[string]any{
		"state": newState, "cancel_time": cancelTime,
		"transaction": tx.ID, "reason": p.Reason,
	}, ID: id}
}

func handleCheckTx(id interface{}, raw json.RawMessage) RPCResponse {
	var p IDParams
	if err := json.Unmarshal(raw, &p); err != nil {
		return errResp(id, ErrTransNotFound, "invalid params")
	}
	tx, err := txByPaymeID(p.ID)
	if err != nil || tx == nil {
		return errResp(id, ErrTransNotFound, ml("Транзакция не найдена", "Transaction not found"))
	}
	var reason interface{}
	if tx.Reason.Valid {
		reason = tx.Reason.Int32
	}
	return RPCResponse{Result: map[string]any{
		"create_time": tx.CreateTime, "perform_time": tx.PerformTime,
		"cancel_time": tx.CancelTime, "transaction": tx.ID,
		"state": tx.State, "reason": reason,
	}, ID: id}
}

func handleStatement(companyID string, id interface{}, raw json.RawMessage) RPCResponse {
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
		var reason interface{}
		if t.Reason.Valid {
			reason = t.Reason.Int32
		}
		items = append(items, map[string]any{
			"id": t.PaymeID, "time": t.CreateTime, "amount": t.Amount,
			"account":      map[string]any{"order_id": t.OrderID},
			"create_time":  t.CreateTime, "perform_time": t.PerformTime,
			"cancel_time":  t.CancelTime, "transaction": t.ID,
			"state": t.State, "reason": reason,
		})
	}
	return RPCResponse{Result: map[string]any{"transactions": items}, ID: id}
}

// ── HTTP handler ──────────────────────────────────────────────────────────────

// URL: POST /payme/{company_id}/callback
func callbackHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		writeJSON(w, errResp(nil, -32300, "Only POST method allowed"))
		return
	}

	// Extract company_id from path: /payme/{company_id}/callback
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	companyID := parts[1]

	// Load company-specific Payme key from DB
	paymeKey, err := getCompanyPaymeKey(companyID)
	if err != nil || paymeKey == "" {
		log.Printf("payme: company %s not found or payme not enabled", companyID)
		writeJSON(w, errResp(nil, ErrAuthFailed, "Payme not configured for this merchant"))
		return
	}

	// Verify Basic Auth against company key
	incomingKey := extractPaymeKey(r)
	if incomingKey != paymeKey {
		w.WriteHeader(http.StatusUnauthorized)
		writeJSON(w, errResp(nil, ErrAuthFailed, "Permission denied"))
		return
	}

	var req RPCRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, errResp(nil, -32700, "Parse error"))
		return
	}

	log.Printf("payme company=%s ← %s", companyID, req.Method)

	var resp RPCResponse
	switch req.Method {
	case "CheckPerformTransaction":
		resp = handleCheckPerform(companyID, req.ID, req.Params)
	case "CreateTransaction":
		resp = handleCreateTx(companyID, req.ID, req.Params)
	case "PerformTransaction":
		resp = handlePerformTx(req.ID, req.Params)
	case "CancelTransaction":
		resp = handleCancelTx(req.ID, req.Params)
	case "CheckTransaction":
		resp = handleCheckTx(req.ID, req.Params)
	case "GetStatement":
		resp = handleStatement(companyID, req.ID, req.Params)
	default:
		resp = errResp(req.ID, ErrMethodNotFound, "Method not found")
	}

	writeJSON(w, resp)
}

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok", "service": "payme-gateway"})
}

func writeJSON(w http.ResponseWriter, v any) {
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("encode error: %v", err)
	}
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
	// Pattern: /payme/{company_id}/callback
	mux.HandleFunc("/payme/", callbackHandler)
	mux.HandleFunc("/health", healthHandler)

	addr := ":" + conf.Port
	log.Printf("payme-gateway listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
