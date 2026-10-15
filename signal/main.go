package main

import (
	"flag"
	"log"
	"net/http"
	"time"
)

func main() {
	addr := flag.String("addr", "localhost:8787", "listen address")
	flag.Parse()
	// Room codes are 4 chars; a room holds the killer plus four survivors.
	// A peer must open its event stream within 30 s of creating or joining a room.
	hub := NewHub(4, 5, 30*time.Second)
	log.Printf("signaling on http://%s", *addr)
	log.Fatal(http.ListenAndServe(*addr, NewServer(hub)))
}
