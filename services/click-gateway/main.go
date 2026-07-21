package main

import (
	"bytes"
	"crypto/md5"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
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
		Port:          getEnv("PORT", "8002"),
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
		CREATE TABLE IF NOT EXISTS click_transactions (
			id                BIGSERIAL    PRIMARY KEY,
			company_id        VARCHAR(36)  NOT NULL,
			click_trans_id    BIGINT       NOT NULL,
			click_paydoc_id   BIGINT       NOT NULL DEFAULT 0,
			service_id        BIGINT       NOT NULL DEFAULT 0,
			merchant_trans_id VARCHAR(255) NOT NULL,
			amount            DECIMAL(15,2) NOT NULL,
			state             INTEGER      NOT NULL DEFAULT 0,
			error_code        INTEGER      NOT NULL DEFAULT 0,
			created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
			updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
			UNIQUE (company_id, click_trans_id)
		)
	`)
	if err != nil {
		log.Fatalf("migrate: %v", err)
	}
}

// ── Per-company credentials ───────────────────────────────────────────────────

type ClickCreds struct {
	ServiceID string
	SecretKey string
}

func getCompanyClickCreds(companyID string) (*ClickCreds, error) {
	var serviceID, secretKey sql.NullString
	err := db.QueryRow(`
		SELECT click_service_id, click_secret_key
		FROM payment_gateway_settings
		WHERE company_id = $1 AND click_enabled = TRUE
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
	return &ClickCreds{ServiceID: serviceID.String, SecretKey: secretKey.String}, nil
}

// ── Models ────────────────────────────────────────────────────────────────────

type ClickTx struct {
	ID              int64
	CompanyID       string
	ClickTransID    int64
	ClickPaydocID   int64
	ServiceID       int64
	MerchantTransID string
	Amount          float64
	State           int
	ErrorCode       int
}

const (
	ClickStatePrepared  = 0
	ClickStateCompleted = 1
	ClickStateFailed    = -1
)

func txByClickID(companyID string, clickTransID int64) (*ClickTx, error) {
	t := &ClickTx{}
	err := db.QueryRow(`
		SELECT id, company_id, click_trans_id, click_paydoc_id, service_id,
		       merchant_trans_id, amount, state, error_code
		FROM click_transactions WHERE company_id = $1 AND click_trans_id = $2
	`, companyID, clickTransID).Scan(
		&t.ID, &t.CompanyID, &t.ClickTransID, &t.ClickPaydocID, &t.ServiceID,
		&t.MerchantTransID, &t.Amount, &t.State, &t.ErrorCode,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return t, err
}

func insertClickTx(companyID string, clickTransID, clickPaydocID, serviceID int64, merchantTransID string, amount float64) (*ClickTx, error) {
	t := &ClickTx{CompanyID: companyID, ClickTransID: clickTransID, MerchantTransID: merchantTransID, Amount: amount}
	err := db.QueryRow(`
		INSERT INTO click_transactions
		  (company_id, click_trans_id, click_paydoc_id, service_id, merchant_trans_id, amount, state)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id
	`, companyID, clickTransID, clickPaydocID, serviceID, merchantTransID, amount, ClickStatePrepared).Scan(&t.ID)
	return t, err
}

func updateClickTxState(companyID string, clickTransID int64, state, errCode int) error {
	_, err := db.Exec(`
		UPDATE click_transactions
		SET state=$1, error_code=$2, updated_at=NOW()
		WHERE company_id=$3 AND click_trans_id=$4
	`, state, errCode, companyID, clickTransID)
	return err
}

// ── Click error codes ─────────────────────────────────────────────────────────

const (
	ClickOK              = 0
	ClickErrSignCheck    = -1
	ClickErrAmountWrong  = -2
	ClickErrBadAction    = -3
	ClickErrAlreadyPaid  = -4
	ClickErrUserNotFound = -5
	ClickErrNoTx         = -6
	ClickErrMissingParam = -8
	ClickErrCancelled    = -9
)

// ── Signature ─────────────────────────────────────────────────────────────────

// Prepare  (action=0): MD5(click_trans_id + service_id + secret_key + merchant_trans_id + amount + action + sign_time)
// Complete (action=1): MD5(click_trans_id + service_id + secret_key + merchant_trans_id + merchant_prepare_id + amount + action + sign_time)
func calcSignature(clickTransID, serviceID int64, secretKey, merchantTransID, merchantPrepareID, amount, action, signTime string) string {
	var raw string
	if action == "0" {
		raw = fmt.Sprintf("%s%d%s%s%s%s%s",
			clickTransID, serviceID, secretKey, merchantTransID, amount, action, signTime)
	} else {
		raw = fmt.Sprintf("%s%d%s%s%s%s%s%s",
			clickTransID, serviceID, secretKey, merchantTransID, merchantPrepareID, amount, action, signTime)
	}
	sum := md5.Sum([]byte(raw))
	return fmt.Sprintf("%x", sum)
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

// ── Request parsing ───────────────────────────────────────────────────────────

type ClickWebhookRequest struct {
	ClickTransID      int64
	ServiceID         int64
	ClickPaydocID     int64
	MerchantTransID   string
	Amount            float64
	Action            string
	Error             int
	ErrorNote         string
	SignTime          string
	SignString        string
	MerchantPrepareID string
}

func parseRequest(r *http.Request) (*ClickWebhookRequest, error) {
	if err := r.ParseForm(); err != nil {
		return nil, err
	}
	parseInt64 := func(s string) int64 { v, _ := strconv.ParseInt(s, 10, 64); return v }
	parseFloat := func(s string) float64 { v, _ := strconv.ParseFloat(s, 64); return v }
	parseInt := func(s string) int { v, _ := strconv.Atoi(s); return v }

	return &ClickWebhookRequest{
		ClickTransID:      parseInt64(r.FormValue("click_trans_id")),
		ServiceID:         parseInt64(r.FormValue("service_id")),
		ClickPaydocID:     parseInt64(r.FormValue("click_paydoc_id")),
		MerchantTransID:   r.FormValue("merchant_trans_id"),
		Amount:            parseFloat(r.FormValue("amount")),
		Action:            r.FormValue("action"),
		Error:             parseInt(r.FormValue("error")),
		ErrorNote:         r.FormValue("error_note"),
		SignTime:          r.FormValue("sign_time"),
		SignString:        r.FormValue("sign_string"),
		MerchantPrepareID: r.FormValue("merchant_prepare_id"),
	}, nil
}

func requiredFieldsMissing(req *ClickWebhookRequest) bool {
	return req.ClickTransID == 0 || req.ServiceID == 0 ||
		req.MerchantTransID == "" || req.SignTime == "" || req.SignString == ""
}

// ── Response helpers ──────────────────────────────────────────────────────────

type ClickResponse struct {
	ClickTransID      int64  `json:"click_trans_id"`
	MerchantTransID   string `json:"merchant_trans_id"`
	MerchantPrepareID int64  `json:"merchant_prepare_id,omitempty"`
	MerchantConfirmID int64  `json:"merchant_confirm_id,omitempty"`
	Error             int    `json:"error"`
	ErrorNote         string `json:"error_note"`
}

func writeClickError(w http.ResponseWriter, clickTransID int64, merchantTransID string, errCode int, errNote string) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ClickResponse{
		ClickTransID:    clickTransID,
		MerchantTransID: merchantTransID,
		Error:           errCode,
		ErrorNote:       errNote,
	})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("encode error: %v", err)
	}
}

func absDiff(a, b float64) float64 {
	d := a - b
	if d < 0 {
		return -d
	}
	return d
}

// ── Prepare handler ───────────────────────────────────────────────────────────

func prepareHandler(companyID string, w http.ResponseWriter, r *http.Request) {
	req, err := parseRequest(r)
	if err != nil || requiredFieldsMissing(req) {
		writeClickError(w, 0, "", ClickErrMissingParam, "Missing required fields")
		return
	}

	// Load per-company Click credentials
	creds, err := getCompanyClickCreds(companyID)
	if err != nil || creds == nil {
		log.Printf("click prepare: company %s not found or click not enabled", companyID)
		writeClickError(w, req.ClickTransID, req.MerchantTransID, ClickErrUserNotFound, "Click not configured for this merchant")
		return
	}

	// Verify service_id matches company's registered service_id
	expectedServiceID, _ := strconv.ParseInt(creds.ServiceID, 10, 64)
	if req.ServiceID != expectedServiceID {
		writeClickError(w, req.ClickTransID, req.MerchantTransID, ClickErrSignCheck, "Invalid service_id")
		return
	}

	// Verify signature (Prepare: action=0, no merchant_prepare_id)
	expected := calcSignature(
		req.ClickTransID, req.ServiceID,
		creds.SecretKey, req.MerchantTransID,
		"",
		fmt.Sprintf("%.2f", req.Amount),
		req.Action, req.SignTime,
	)
	if !strings.EqualFold(expected, req.SignString) {
		log.Printf("click prepare sign mismatch company=%s: got=%s want=%s", companyID, req.SignString, expected)
		writeClickError(w, req.ClickTransID, req.MerchantTransID, ClickErrSignCheck, "SIGN CHECK FAILED!")
		return
	}

	// Fetch order
	order, err := fetchOrder(req.MerchantTransID)
	if err != nil || order == nil {
		writeClickError(w, req.ClickTransID, req.MerchantTransID, ClickErrUserNotFound, "Order not found")
		return
	}

	if absDiff(req.Amount, order.TotalAmount) > 0.01 {
		writeClickError(w, req.ClickTransID, req.MerchantTransID, ClickErrAmountWrong, "Incorrect amount")
		return
	}

	if order.Status == "completed" {
		writeClickError(w, req.ClickTransID, req.MerchantTransID, ClickErrAlreadyPaid, "Already paid")
		return
	}

	// Idempotency
	existing, _ := txByClickID(companyID, req.ClickTransID)
	if existing == nil {
		existing, err = insertClickTx(companyID, req.ClickTransID, req.ClickPaydocID, req.ServiceID, req.MerchantTransID, req.Amount)
		if err != nil {
			log.Printf("insert click tx: %v", err)
			writeClickError(w, req.ClickTransID, req.MerchantTransID, -1, "Internal error")
			return
		}
	}

	log.Printf("click prepare company=%s order=%s tx=%d", companyID, req.MerchantTransID, req.ClickTransID)
	writeJSON(w, ClickResponse{
		ClickTransID:      req.ClickTransID,
		MerchantTransID:   req.MerchantTransID,
		MerchantPrepareID: existing.ID,
		Error:             ClickOK,
		ErrorNote:         "Success",
	})
}

// ── Complete handler ──────────────────────────────────────────────────────────

func completeHandler(companyID string, w http.ResponseWriter, r *http.Request) {
	req, err := parseRequest(r)
	if err != nil || requiredFieldsMissing(req) {
		writeClickError(w, 0, "", ClickErrMissingParam, "Missing required fields")
		return
	}

	// Load per-company Click credentials
	creds, err := getCompanyClickCreds(companyID)
	if err != nil || creds == nil {
		log.Printf("click complete: company %s not found or click not enabled", companyID)
		writeClickError(w, req.ClickTransID, req.MerchantTransID, ClickErrUserNotFound, "Click not configured for this merchant")
		return
	}

	expectedServiceID, _ := strconv.ParseInt(creds.ServiceID, 10, 64)
	if req.ServiceID != expectedServiceID {
		writeClickError(w, req.ClickTransID, req.MerchantTransID, ClickErrSignCheck, "Invalid service_id")
		return
	}

	// Verify signature (Complete: action=1, includes merchant_prepare_id)
	expected := calcSignature(
		req.ClickTransID, req.ServiceID,
		creds.SecretKey, req.MerchantTransID,
		req.MerchantPrepareID,
		fmt.Sprintf("%.2f", req.Amount),
		req.Action, req.SignTime,
	)
	if !strings.EqualFold(expected, req.SignString) {
		log.Printf("click complete sign mismatch company=%s: got=%s want=%s", companyID, req.SignString, expected)
		writeClickError(w, req.ClickTransID, req.MerchantTransID, ClickErrSignCheck, "SIGN CHECK FAILED!")
		return
	}

	tx, err := txByClickID(companyID, req.ClickTransID)
	if err != nil || tx == nil {
		writeClickError(w, req.ClickTransID, req.MerchantTransID, ClickErrNoTx, "Transaction not found")
		return
	}

	// Idempotent
	if tx.State == ClickStateCompleted {
		writeJSON(w, ClickResponse{
			ClickTransID:      req.ClickTransID,
			MerchantTransID:   req.MerchantTransID,
			MerchantConfirmID: tx.ID,
			Error:             ClickOK,
			ErrorNote:         "Success",
		})
		return
	}
	if tx.State == ClickStateFailed {
		writeClickError(w, req.ClickTransID, req.MerchantTransID, ClickErrCancelled, "Transaction cancelled")
		return
	}

	// Click-side error: mark failed
	if req.Error < 0 {
		_ = updateClickTxState(companyID, req.ClickTransID, ClickStateFailed, req.Error)
		writeClickError(w, req.ClickTransID, req.MerchantTransID, ClickErrCancelled, req.ErrorNote)
		return
	}

	if err := updateClickTxState(companyID, req.ClickTransID, ClickStateCompleted, 0); err != nil {
		log.Printf("update click tx: %v", err)
		writeClickError(w, req.ClickTransID, req.MerchantTransID, -1, "Internal error")
		return
	}

	go notifyBackend(WebhookPayload{
		OrderID:     req.MerchantTransID,
		Amount:      req.Amount,
		Method:      "click",
		GatewayTxID: strconv.FormatInt(req.ClickTransID, 10),
		Action:      "confirm",
	})

	log.Printf("click complete company=%s order=%s tx=%d", companyID, req.MerchantTransID, req.ClickTransID)
	writeJSON(w, ClickResponse{
		ClickTransID:      req.ClickTransID,
		MerchantTransID:   req.MerchantTransID,
		MerchantConfirmID: tx.ID,
		Error:             ClickOK,
		ErrorNote:         "Success",
	})
}

// ── HTTP routing ──────────────────────────────────────────────────────────────

// /click/{company_id}/prepare  → POST
// /click/{company_id}/complete → POST
func clickRouter(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, `{"error":"POST only"}`, http.StatusMethodNotAllowed)
		return
	}

	// Path: /click/{company_id}/prepare  or  /click/{company_id}/complete
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		http.NotFound(w, r)
		return
	}
	companyID := parts[1]
	endpoint  := parts[2]

	switch endpoint {
	case "prepare":
		prepareHandler(companyID, w, r)
	case "complete":
		completeHandler(companyID, w, r)
	default:
		http.NotFound(w, r)
	}
}

func healthHandler(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok", "service": "click-gateway"})
}

// ── Main ──────────────────────────────────────────────────────────────────────

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	conf = loadConfig()
	initDB(conf.DSN)

	mux := http.NewServeMux()
	mux.HandleFunc("/click/", clickRouter)
	mux.HandleFunc("/health", healthHandler)

	addr := ":" + conf.Port
	log.Printf("click-gateway listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
