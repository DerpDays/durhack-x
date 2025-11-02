package main

import (
	"crypto/ed25519"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"strings"
	"sync"

	"github.com/gorilla/mux"
	_ "github.com/mattn/go-sqlite3"
)

type Task struct {
	ID                   string          `json:"id"`
	Operation            uint8           `json:"operation"`
	Input                float64         `json:"input"`
	Price                int64           `json:"price"`
	Kind                 string          `json:"kind"`
	Payload              json.RawMessage `json:"payload,omitempty"`
	RequiredCapabilities []string        `json:"required_capabilities,omitempty"`
}

type ResultData struct {
	ID        string          `json:"id"`
	Worker    string          `json:"worker"`
	Output    float64         `json:"output"`
	Signature string          `json:"signature"` // Base64 encoded
	PubKey    string          `json:"pub_key"`   // Base64 encoded
	Kind      string          `json:"kind,omitempty"`
	Payload   json.RawMessage `json:"payload,omitempty"`
}

type TaskOverview struct {
	ID                   string          `json:"id"`
	Operation            uint8           `json:"operation"`
	Kind                 string          `json:"kind"`
	Price                int64           `json:"price"`
	AssignedTo           *string         `json:"assigned_to,omitempty"`
	Completed            bool            `json:"completed"`
	Verified             bool            `json:"verified"`
	RemainingSlots       int             `json:"remaining_slots"`
	RequiredCapabilities []string        `json:"required_capabilities,omitempty"`
	Payload              json.RawMessage `json:"payload,omitempty"`
}

type Worker struct {
	ID           string
	Trust        int
	Token        int64
	PubKey       ed25519.PublicKey
	Capabilities []string
}

var db *sql.DB
var mu sync.Mutex // protects SQLite access

func main() {
	var err error
	db, err = sql.Open("sqlite3", "./coordinator_v4.db")
	if err != nil {
		log.Fatal(err)
	}

	if err := ensureSchema(db); err != nil {
		log.Fatalf("failed to ensure schema: %v", err)
	}

	router := mux.NewRouter()
	router.HandleFunc("/register", RegisterWorker).Methods("POST")
	router.HandleFunc("/get_task", GetTask).Methods("GET")
	router.HandleFunc("/submit_result", SubmitResult).Methods("POST")
	router.HandleFunc("/balance", GetBalance).Methods("GET")
	router.HandleFunc("/generate_tasks", GenerateTasks).Methods("POST")
	router.HandleFunc("/tasks_overview", TasksOverview).Methods("GET")
	router.HandleFunc("/create_task", CreateTask).Methods("POST")
	router.Use(corsMiddleware)

	log.Println("Coordinator v4 running on :8080")
	log.Fatal(http.ListenAndServe(":8080", router))
}

// ---------------- Worker registration ----------------
func RegisterWorker(w http.ResponseWriter, r *http.Request) {
	var body struct {
		WorkerID     string   `json:"worker_id"`
		PubKey       string   `json:"pub_key"` // base64 encoded
		Capabilities []string `json:"capabilities"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	pubBytes, err := base64.StdEncoding.DecodeString(body.PubKey)
	if err != nil || len(pubBytes) != ed25519.PublicKeySize {
		http.Error(w, "Invalid public key", http.StatusBadRequest)
		return
	}

	capsJSON, err := json.Marshal(body.Capabilities)
	if err != nil {
		http.Error(w, "Invalid capabilities payload", http.StatusBadRequest)
		return
	}

	mu.Lock()
	defer mu.Unlock()
	_, err = db.Exec(`INSERT INTO workers(worker_id, trust, token, pub_key, capabilities)
		VALUES (?,?,?,?,?)
		ON CONFLICT(worker_id) DO UPDATE SET pub_key=excluded.pub_key, capabilities=excluded.capabilities`,
		body.WorkerID, 10, 0, body.PubKey, string(capsJSON))
	if err != nil {
		http.Error(w, "Failed to register", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

// ---------------- Get task (trust-weighted) ----------------
func GetTask(w http.ResponseWriter, r *http.Request) {
	workerID := r.Header.Get("X-Worker-Id")

	workerCaps, err := loadWorkerCapabilities(workerID)
	if err != nil {
		http.Error(w, "Unknown worker", http.StatusNotFound)
		return
	}

	rows, err := db.Query(`
		SELECT id, operation, input, price, kind, payload, required_capabilities
		FROM tasks
		WHERE completed=0 AND results_collected < redundancy
		ORDER BY RANDOM()
		LIMIT 20`)
	if err != nil {
		http.Error(w, "Failed to fetch task", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var task Task
	found := false
	for rows.Next() {
		var payload sql.NullString
		var reqCapsString sql.NullString
		err = rows.Scan(&task.ID, &task.Operation, &task.Input, &task.Price, &task.Kind, &payload, &reqCapsString)
		if err != nil {
			continue
		}
		if payload.Valid {
			task.Payload = json.RawMessage(payload.String)
		} else {
			task.Payload = nil
		}
		task.RequiredCapabilities = parseCapabilityJSON(reqCapsString.String)

		if matchesCapabilities(workerCaps, task.RequiredCapabilities) {
			found = true
			break
		}
	}

	if !found {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	mu.Lock()
	db.Exec("UPDATE tasks SET results_collected = results_collected + 1, assigned_to=? WHERE id=?", workerID, task.ID)
	mu.Unlock()

	json.NewEncoder(w).Encode(task)
}

// ---------------- Submit result with signature verification ----------------
func SubmitResult(w http.ResponseWriter, r *http.Request) {
	var res ResultData
	if err := json.NewDecoder(r.Body).Decode(&res); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}

	pubBytes, err := base64.StdEncoding.DecodeString(res.PubKey)
	if err != nil || len(pubBytes) != ed25519.PublicKeySize {
		http.Error(w, "Invalid public key", http.StatusBadRequest)
		return
	}
	sigBytes, err := base64.StdEncoding.DecodeString(res.Signature)
	if err != nil {
		http.Error(w, "Invalid signature", http.StatusBadRequest)
		return
	}

	// Verify signature
	dataBytes, _ := json.Marshal(struct {
		ID     string  `json:"id"`
		Worker string  `json:"worker"`
		Output float64 `json:"output"`
	}{res.ID, res.Worker, res.Output})

	if !ed25519.Verify(pubBytes, dataBytes, sigBytes) {
		mu.Lock()
		db.Exec("UPDATE workers SET trust = trust - 1 WHERE worker_id=?", res.Worker)
		mu.Unlock()
		http.Error(w, "Signature verification failed", http.StatusUnauthorized)
		return
	}

	// Insert result
	mu.Lock()
	db.Exec("INSERT INTO results(id,worker,output,verified) VALUES(?,?,?,0)", res.ID, res.Worker, res.Output)
	mu.Unlock()

	// Majority vote
	rows, err := db.Query("SELECT output FROM results WHERE id=?", res.ID)
	if err != nil {
		http.Error(w, "Failed to load results", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	var outputs []float64
	for rows.Next() {
		var o float64
		rows.Scan(&o)
		outputs = append(outputs, o)
	}

	verified, _ := Majority(outputs)
	mu.Lock()
	defer mu.Unlock()
	if verified {
		db.Exec("UPDATE results SET verified=1 WHERE id=?", res.ID)
		db.Exec("UPDATE workers SET trust = trust + 1, token = token + 1 WHERE worker_id=?", res.Worker)
		db.Exec("UPDATE tasks SET completed=1, verified=1 WHERE id=?", res.ID)
	} else {
		db.Exec("UPDATE workers SET trust = trust - 1 WHERE worker_id=?", res.Worker)
	}

	w.WriteHeader(http.StatusOK)
}

// ---------------- Query balance (trust + token) ----------------
func GetBalance(w http.ResponseWriter, r *http.Request) {
	worker := r.URL.Query().Get("worker")
	row := db.QueryRow("SELECT trust, token FROM workers WHERE worker_id=?", worker)
	var trust int
	var token int64
	row.Scan(&trust, &token)
	json.NewEncoder(w).Encode(map[string]interface{}{"trust": trust, "token": token})
}

// ---------------- Dynamic task generation ----------------
func GenerateTasks(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()
	for i := 0; i < 10; i++ {
		id := RandomString(8)
		op := "square"
		kind := "arithmetic"
		required := []string{"math:basic"}
		payload := map[string]interface{}{
			"note": fmt.Sprintf("Auto-generated square task %s", id),
		}
		if i%3 == 1 {
			op = "factorial"
			kind = "math_extended"
			required = []string{"math:advanced"}
		} else if i%3 == 2 {
			op = "vector_sum"
			kind = "dataset"
			required = []string{"math:basic", "analytics:vector"}
			payload = map[string]interface{}{
				"values": []float64{rand.Float64()*10 + 1, rand.Float64()*10 + 1, rand.Float64()*10 + 1},
			}
		}
		payloadJSON, _ := json.Marshal(payload)
		reqJSON, _ := json.Marshal(required)
		input := rand.Float64()*100 + 1
		db.Exec(`INSERT INTO tasks(id,operation,input,price, redundancy, results_collected, kind, payload, required_capabilities) 
			VALUES (?,?,?,?,?,?,?, ?, ?)`,
			id, op, input, 1, 3, 0, kind, string(payloadJSON), string(reqJSON))
	}
	w.WriteHeader(http.StatusOK)
}

func CreateTask(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Operation            uint8           `json:"operation"`
		Input                float64         `json:"input"`
		Price                int64           `json:"price"`
		Kind                 string          `json:"kind"`
		Payload              json.RawMessage `json:"payload"`
		RequiredCapabilities []string        `json:"required_capabilities"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid payload", http.StatusBadRequest)
		return
	}
	if body.Kind == "" {
		body.Kind = "custom"
	}
	if body.Price < 0 {
		body.Price = 0
	}

	payloadString := "null"
	if len(body.Payload) > 0 {
		payloadString = string(body.Payload)
	}
	reqCapsJSON, err := json.Marshal(body.RequiredCapabilities)
	if err != nil {
		http.Error(w, "Invalid capabilities", http.StatusBadRequest)
		return
	}

	mu.Lock()
	defer mu.Unlock()
	id := RandomString(10)
	_, err = db.Exec(`INSERT INTO tasks(id, operation, input, price, assigned_to, completed, verified, redundancy, results_collected, kind, payload, required_capabilities)
		VALUES (?,?,?,?,NULL,0,0,1,0,?,?,?)`,
		id, body.Operation, body.Input, body.Price, body.Kind, payloadString, string(reqCapsJSON))
	if err != nil {
		http.Error(w, "Failed to create task", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": id})
}

// ---------------- Task overview for visualization ----------------
func TasksOverview(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query(`SELECT id, operation, price, assigned_to, completed, verified, redundancy, results_collected, kind, payload, required_capabilities
		FROM tasks`)
	if err != nil {
		http.Error(w, "Failed to load tasks", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var tasks []TaskOverview
	for rows.Next() {
		var (
			record             TaskOverview
			assigned           sql.NullString
			completedInt       int
			verifiedInt        int
			redundancy         int
			resultsCollected   int
			payloadString      sql.NullString
			requiredCapsString sql.NullString
		)
		if err := rows.Scan(
			&record.ID,
			&record.Operation,
			&record.Price,
			&assigned,
			&completedInt,
			&verifiedInt,
			&redundancy,
			&resultsCollected,
			&record.Kind,
			&payloadString,
			&requiredCapsString,
		); err != nil {
			continue
		}

		if assigned.Valid {
			record.AssignedTo = new(string)
			*record.AssignedTo = assigned.String
		}
		record.Completed = completedInt != 0
		record.Verified = verifiedInt != 0
		record.RemainingSlots = redundancy - resultsCollected
		if record.RemainingSlots < 0 {
			record.RemainingSlots = 0
		}
		record.RequiredCapabilities = parseCapabilityJSON(requiredCapsString.String)
		if payloadString.Valid {
			record.Payload = json.RawMessage(payloadString.String)
		}

		tasks = append(tasks, record)
	}

	json.NewEncoder(w).Encode(tasks)
}

// ---------------- Helpers ----------------
func RandomString(n int) string {
	letters := []rune("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
	s := make([]rune, n)
	for i := range s {
		s[i] = letters[rand.Intn(len(letters))]
	}
	return string(s)
}

func ensureSchema(db *sql.DB) error {
	createStatements := []string{
		`CREATE TABLE IF NOT EXISTS workers (
			worker_id TEXT PRIMARY KEY,
			trust INT DEFAULT 10,
			token INTEGER DEFAULT 0,
			pub_key TEXT NOT NULL,
			capabilities TEXT DEFAULT '[]'
		);`,
		`CREATE TABLE IF NOT EXISTS tasks (
			id TEXT PRIMARY KEY,
			operation INTEGER NOT NULL,
			input REAL NOT NULL,
			price INTEGER NOT NULL,
			assigned_to TEXT,
			completed INTEGER DEFAULT 0,
			verified INTEGER DEFAULT 0,
			redundancy INTEGER DEFAULT 3,
			results_collected INTEGER DEFAULT 0,
			kind TEXT DEFAULT 'arithmetic',
			payload TEXT,
			required_capabilities TEXT DEFAULT '[]'
		);`,
		`CREATE TABLE IF NOT EXISTS results (
			result_id INTEGER PRIMARY KEY AUTOINCREMENT,
			id TEXT NOT NULL,
			worker TEXT NOT NULL,
			output REAL NOT NULL,
			verified INTEGER DEFAULT 0
		);`,
	}
	for _, stmt := range createStatements {
		if _, err := db.Exec(stmt); err != nil {
			return err
		}
	}

	alterStatements := []string{
		`ALTER TABLE workers ADD COLUMN capabilities TEXT DEFAULT '[]';`,
		`ALTER TABLE tasks ADD COLUMN kind TEXT DEFAULT 'arithmetic';`,
		`ALTER TABLE tasks ADD COLUMN payload TEXT;`,
		`ALTER TABLE tasks ADD COLUMN required_capabilities TEXT DEFAULT '[]';`,
	}
	for _, stmt := range alterStatements {
		if _, err := db.Exec(stmt); err != nil {
			if strings.Contains(err.Error(), "duplicate column") || strings.Contains(err.Error(), "already exists") {
				continue
			}
			// The results table may already have a primary key; ignore related errors.
			if strings.Contains(strings.ToLower(err.Error()), "duplicate") {
				continue
			}
			return err
		}
	}

	return nil
}

func loadWorkerCapabilities(workerID string) ([]string, error) {
	var capsJSON sql.NullString
	err := db.QueryRow("SELECT capabilities FROM workers WHERE worker_id=?", workerID).Scan(&capsJSON)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("worker not found")
		}
		return nil, err
	}
	if !capsJSON.Valid || capsJSON.String == "" {
		return []string{}, nil
	}
	return parseCapabilityJSON(capsJSON.String), nil
}

func parseCapabilityJSON(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return []string{}
	}
	var caps []string
	if err := json.Unmarshal([]byte(raw), &caps); err != nil {
		return []string{}
	}
	return caps
}

func matchesCapabilities(workerCaps, required []string) bool {
	if len(required) == 0 {
		return true
	}
	capSet := make(map[string]struct{}, len(workerCaps))
	for _, c := range workerCaps {
		capSet[strings.TrimSpace(c)] = struct{}{}
	}
	for _, req := range required {
		req = strings.TrimSpace(req)
		if req == "" {
			continue
		}
		if _, ok := capSet[req]; !ok {
			return false
		}
	}
	return true
}

// Majority vote returns (verified, majority_value)
func Majority(values []float64) (bool, float64) {
	count := make(map[float64]int)
	for _, v := range values {
		count[v]++
	}
	for k, v := range count {
		if v >= (len(values)/2)+1 {
			return true, k
		}
	}
	return false, 0
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Worker-Id")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
