package main

import (
	"testing"
	"time"
)

func recv(t *testing.T, p *Peer) Message {
	t.Helper()
	select {
	case m := <-p.out:
		return m
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for message")
		return Message{}
	}
}

func TestHubRoomLifecycle(t *testing.T) {
	h := NewHub(4, 4)
	code, host := h.Create()
	if len(code) != 4 {
		t.Fatalf("code %q: want 4 chars", code)
	}
	guest, err := h.Join(code)
	if err != nil {
		t.Fatal(err)
	}
	if m := recv(t, host); m.Type != "peer-joined" || m.From != guest.ID {
		t.Fatalf("host got %+v, want peer-joined from guest", m)
	}
	if m := recv(t, guest); m.Type != "welcome" || m.Host != host.ID {
		t.Fatalf("guest got %+v, want welcome naming host", m)
	}

	if err := h.Relay(code, guest.ID, host.ID, []byte(`{"sdp":"x"}`)); err != nil {
		t.Fatal(err)
	}
	m := recv(t, host)
	if m.Type != "signal" || m.From != guest.ID || string(m.Data) != `{"sdp":"x"}` {
		t.Fatalf("host got %+v", m)
	}

	h.Leave(code, guest.ID)
	if m := recv(t, host); m.Type != "peer-left" || m.From != guest.ID {
		t.Fatalf("host got %+v, want peer-left", m)
	}
}

func TestHubErrors(t *testing.T) {
	h := NewHub(4, 2)
	if _, err := h.Join("NOPE"); err != ErrNoRoom {
		t.Fatalf("join missing room: %v", err)
	}
	code, host := h.Create()
	if _, err := h.Join(code); err != nil {
		t.Fatal(err)
	}
	if _, err := h.Join(code); err != ErrRoomFull {
		t.Fatalf("third peer into 2-peer room: %v", err)
	}
	if err := h.Relay(code, host.ID, "ghost", []byte(`1`)); err != ErrNoPeer {
		t.Fatalf("relay to ghost: %v", err)
	}
}

func TestHubHostLeavingClosesRoom(t *testing.T) {
	h := NewHub(4, 4)
	code, host := h.Create()
	guest, _ := h.Join(code)
	h.Leave(code, host.ID)
	if _, err := h.Join(code); err != ErrNoRoom {
		t.Fatalf("room should be gone: %v", err)
	}
	for m := range guest.out {
		if m.Type == "room-closed" {
			return
		}
	}
	t.Fatal("guest never saw room-closed")
}
