package main

import (
	"flag"
	"log"
	"net/http"
)

func main() {
	addr := flag.String("addr", "localhost:8787", "listen address")
	flag.Parse()
	// Room codes are 4 chars; a room holds the killer plus four survivors.
	hub := NewHub(4, 5)
	log.Printf("signaling on http://%s", *addr)
	log.Fatal(http.ListenAndServe(*addr, NewServer(hub)))
}
