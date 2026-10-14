package main

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"sync"
)

var (
	ErrNoRoom   = errors.New("no such room")
	ErrNoPeer   = errors.New("no such peer")
	ErrRoomFull = errors.New("room is full")
)

// Message is what a peer receives on its event stream.
type Message struct {
	Type string          `json:"type"` // welcome | peer-joined | peer-left | signal | room-closed
	From string          `json:"from,omitempty"`
	Host string          `json:"host,omitempty"`
	Data json.RawMessage `json:"data,omitempty"`
}

type Peer struct {
	ID  string
	out chan Message
}

type room struct {
	host  string
	peers map[string]*Peer
}

// Hub holds rooms in memory. Peers only exchange opaque signaling blobs;
// game traffic never touches it.
type Hub struct {
	mu       sync.Mutex
	rooms    map[string]*room
	codeLen  int
	maxPeers int
}

func NewHub(codeLen, maxPeers int) *Hub {
	return &Hub{rooms: map[string]*room{}, codeLen: codeLen, maxPeers: maxPeers}
}

// No 0/O, 1/I/L so codes survive being read aloud.
const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

func randString(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	for i := range b {
		b[i] = alphabet[int(b[i])%len(alphabet)]
	}
	return string(b)
}

func newPeer() *Peer {
	return &Peer{ID: randString(8), out: make(chan Message, 64)}
}

func (h *Hub) Create() (string, *Peer) {
	h.mu.Lock()
	defer h.mu.Unlock()
	var code string
	for {
		code = randString(h.codeLen)
		if _, taken := h.rooms[code]; !taken {
			break
		}
	}
	host := newPeer()
	h.rooms[code] = &room{host: host.ID, peers: map[string]*Peer{host.ID: host}}
	return code, host
}

func (h *Hub) Join(code string) (*Peer, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	r, ok := h.rooms[code]
	if !ok {
		return nil, ErrNoRoom
	}
	if len(r.peers) >= h.maxPeers {
		return nil, ErrRoomFull
	}
	p := newPeer()
	p.out <- Message{Type: "welcome", Host: r.host}
	for _, other := range r.peers {
		send(other, Message{Type: "peer-joined", From: p.ID})
	}
	r.peers[p.ID] = p
	return p, nil
}

func (h *Hub) Relay(code, from, to string, data []byte) error {
	h.mu.Lock()
	defer h.mu.Unlock()
	r, ok := h.rooms[code]
	if !ok {
		return ErrNoRoom
	}
	dst, ok := r.peers[to]
	if !ok || r.peers[from] == nil {
		return ErrNoPeer
	}
	send(dst, Message{Type: "signal", From: from, Data: data})
	return nil
}

func (h *Hub) Leave(code, id string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	r, ok := h.rooms[code]
	if !ok || r.peers[id] == nil {
		return
	}
	delete(r.peers, id)
	if id == r.host {
		for _, p := range r.peers {
			send(p, Message{Type: "room-closed"})
			close(p.out)
		}
		delete(h.rooms, code)
		return
	}
	for _, p := range r.peers {
		send(p, Message{Type: "peer-left", From: id})
	}
}

// send never blocks the hub: a peer that stops reading just loses messages.
func send(p *Peer, m Message) {
	select {
	case p.out <- m:
	default:
	}
}

// Peer looks up an existing peer so its event stream can attach.
func (h *Hub) Peer(code, id string) (*Peer, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	r, ok := h.rooms[code]
	if !ok {
		return nil, ErrNoRoom
	}
	p, ok := r.peers[id]
	if !ok {
		return nil, ErrNoPeer
	}
	return p, nil
}
