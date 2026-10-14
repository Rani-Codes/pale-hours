package main

import (
	"bufio"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func postJSON(t *testing.T, url, body string) (*http.Response, map[string]string) {
	t.Helper()
	res, err := http.Post(url, "application/json", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	out := map[string]string{}
	json.NewDecoder(res.Body).Decode(&out)
	return res, out
}

func nextEvent(t *testing.T, sc *bufio.Scanner) Message {
	t.Helper()
	for sc.Scan() {
		if line, ok := strings.CutPrefix(sc.Text(), "data: "); ok {
			var m Message
			if err := json.Unmarshal([]byte(line), &m); err != nil {
				t.Fatal(err)
			}
			return m
		}
	}
	t.Fatal("stream ended")
	return Message{}
}

func TestServerRelaysBetweenPeers(t *testing.T) {
	srv := httptest.NewServer(NewServer(NewHub(4, 4)))
	defer srv.Close()

	_, created := postJSON(t, srv.URL+"/rooms", "")
	code, host := created["code"], created["peer"]
	if code == "" || host == "" {
		t.Fatalf("create returned %v", created)
	}
	hostEvents, err := http.Get(srv.URL + "/rooms/" + code + "/peers/" + host + "/events")
	if err != nil {
		t.Fatal(err)
	}
	defer hostEvents.Body.Close()
	hostSc := bufio.NewScanner(hostEvents.Body)

	res, joined := postJSON(t, srv.URL+"/rooms/"+code+"/join", "")
	if res.StatusCode != 200 {
		t.Fatalf("join status %d", res.StatusCode)
	}
	guest := joined["peer"]
	if m := nextEvent(t, hostSc); m.Type != "peer-joined" || m.From != guest {
		t.Fatalf("host got %+v", m)
	}

	res, _ = postJSON(t, srv.URL+"/rooms/"+code+"/peers/"+guest+"/signal",
		`{"to":"`+host+`","data":{"candidate":"c1"}}`)
	if res.StatusCode != 204 {
		t.Fatalf("signal status %d", res.StatusCode)
	}
	m := nextEvent(t, hostSc)
	if m.Type != "signal" || m.From != guest || string(m.Data) != `{"candidate":"c1"}` {
		t.Fatalf("host got %+v", m)
	}
}

func TestServerStatusCodes(t *testing.T) {
	srv := httptest.NewServer(NewServer(NewHub(4, 4)))
	defer srv.Close()
	if res, _ := postJSON(t, srv.URL+"/rooms/ZZZZ/join", ""); res.StatusCode != 404 {
		t.Fatalf("join missing room: %d", res.StatusCode)
	}
}
