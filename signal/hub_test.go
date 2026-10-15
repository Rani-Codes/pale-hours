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
	h := NewHub(4, 4, time.Minute)
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
	h := NewHub(4, 2, time.Minute)
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
	h := NewHub(4, 4, time.Minute)
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

// manualTimers stands in for time.AfterFunc so expiry fires exactly when a test says.
type manualTimers struct{ pending []func() }

func (m *manualTimers) after(_ time.Duration, f func()) { m.pending = append(m.pending, f) }

func (m *manualTimers) fireAll() {
	fs := m.pending
	m.pending = nil
	for _, f := range fs {
		f()
	}
}

func TestHubDropsPeersThatNeverAttach(t *testing.T) {
	tests := []struct {
		name         string
		hostAttaches bool
		guestAttach  bool
		roomOpen     bool // can a new guest still join after expiry
		seatsTaken   int  // peers left in the room after expiry
	}{
		{"host never attaches closes the room", false, false, false, 0},
		{"guest never attaches frees its seat", true, false, true, 1},
		{"both attached keeps everyone", true, true, true, 2},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			timers := &manualTimers{}
			h := NewHub(4, 5, time.Minute)
			h.afterFunc = timers.after
			code, host := h.Create()
			guest, err := h.Join(code)
			if err != nil {
				t.Fatal(err)
			}
			if tt.hostAttaches {
				if _, err := h.Attach(code, host.ID); err != nil {
					t.Fatal(err)
				}
			}
			if tt.guestAttach {
				if _, err := h.Attach(code, guest.ID); err != nil {
					t.Fatal(err)
				}
			}

			timers.fireAll()

			_, err = h.Join(code)
			if open := err == nil; open != tt.roomOpen {
				t.Fatalf("join after expiry: err %v, want room open %v", err, tt.roomOpen)
			}
			if !tt.roomOpen {
				return
			}
			if got := h.seats(code); got != tt.seatsTaken+1 {
				t.Fatalf("seats after expiry and one new join = %d, want %d", got, tt.seatsTaken+1)
			}
		})
	}
}

func TestHubExpiryAfterNormalLeaveIsHarmless(t *testing.T) {
	timers := &manualTimers{}
	h := NewHub(4, 5, time.Minute)
	h.afterFunc = timers.after
	code, host := h.Create()
	h.Attach(code, host.ID)
	h.Leave(code, host.ID)
	code2, host2 := h.Create()
	h.Attach(code2, host2.ID)

	timers.fireAll()

	if _, err := h.Join(code2); err != nil {
		t.Fatalf("an old room's expiry closed a live room: %v", err)
	}
}

func (h *Hub) seats(code string) int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.rooms[code].peers)
}
