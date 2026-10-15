package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
)

// NewServer exposes the hub over plain HTTP: POST to send, Server-Sent
// Events to receive. Stdlib only, so there is no WebSocket dependency to vet.
func NewServer(h *Hub) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("POST /rooms", func(w http.ResponseWriter, r *http.Request) {
		code, host := h.Create()
		writeJSON(w, map[string]string{"code": code, "peer": host.ID})
	})

	mux.HandleFunc("POST /rooms/{code}/join", func(w http.ResponseWriter, r *http.Request) {
		p, err := h.Join(r.PathValue("code"))
		if err != nil {
			httpError(w, err)
			return
		}
		writeJSON(w, map[string]string{"peer": p.ID})
	})

	mux.HandleFunc("GET /rooms/{code}/peers/{id}/events", func(w http.ResponseWriter, r *http.Request) {
		code, id := r.PathValue("code"), r.PathValue("id")
		p, err := h.Attach(code, id)
		if err != nil {
			httpError(w, err)
			return
		}
		fl, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unsupported", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.WriteHeader(http.StatusOK)
		fl.Flush()
		defer h.Leave(code, id)
		for {
			select {
			case <-r.Context().Done():
				return
			case m, open := <-p.out:
				if !open {
					return
				}
				b, _ := json.Marshal(m)
				fmt.Fprintf(w, "data: %s\n\n", b)
				fl.Flush()
			}
		}
	})

	mux.HandleFunc("POST /rooms/{code}/peers/{id}/signal", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			To   string          `json:"to"`
			Data json.RawMessage `json:"data"`
		}
		raw, err := io.ReadAll(io.LimitReader(r.Body, 64<<10))
		if err != nil || json.Unmarshal(raw, &body) != nil || body.To == "" {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		if err := h.Relay(r.PathValue("code"), r.PathValue("id"), body.To, body.Data); err != nil {
			httpError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	return cors(mux)
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func httpError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrNoRoom), errors.Is(err, ErrNoPeer):
		http.Error(w, err.Error(), http.StatusNotFound)
	case errors.Is(err, ErrRoomFull):
		http.Error(w, err.Error(), http.StatusConflict)
	default:
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
