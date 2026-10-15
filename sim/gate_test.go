package sim

import "testing"

// One gate at the origin, no walls, no generator sites.
func withGate(t *testing.T) {
	t.Helper()
	oldW, oldG, oldS := Walls, GateSites, GenSites
	Walls, GateSites, GenSites = nil, []Vec2{{0, 0}}, nil
	t.Cleanup(func() { Walls, GateSites, GenSites = oldW, oldG, oldS })
}

func doneGens(n int) []Generator {
	g := make([]Generator, GeneratorCount)
	for i := range n {
		g[i].Progress = GeneratorTicks
	}
	return g
}

func TestGateOpens(t *testing.T) {
	near := Vec2{GateRange - 100_000, 0}
	far := Vec2{GateRange + 100_000, 0}
	tests := []struct {
		name   string
		gens   int
		pos    Vec2
		role   Role
		in     Input
		want   int32
		wantOn bool // repairing flag
	}{
		{"powered gate opens by hand", GensRequired, near, Survivor, Input{Act: true}, 1, true},
		{"not enough generators", GensRequired - 1, near, Survivor, Input{Act: true}, 0, false},
		{"out of range", GensRequired, far, Survivor, Input{Act: true}, 0, false},
		{"must hold act", GensRequired, near, Survivor, Input{}, 0, false},
		{"killer cannot open it", GensRequired, near, Killer, Input{Act: true}, 0, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			withGate(t)
			s := State{
				Players: []Player{{ID: 1, Role: tt.role, Pos: tt.pos}},
				Gens:    doneGens(tt.gens),
				Gates:   make([]Gate, 1),
			}
			s = Step(s, map[PlayerID]Input{1: tt.in})
			if got := s.Gates[0].Progress; got != tt.want {
				t.Errorf("progress = %d, want %d", got, tt.want)
			}
			if got := s.Players[0].Repairing; got != tt.wantOn {
				t.Errorf("repairing = %v, want %v", got, tt.wantOn)
			}
		})
	}
}

func TestGateOpensAndStays(t *testing.T) {
	withGate(t)
	s := State{Players: []Player{survivor(1, Vec2{})}, Gens: doneGens(GensRequired), Gates: []Gate{{Progress: GateTicks - 1}}}
	s = Step(s, map[PlayerID]Input{1: {Act: true}})
	if !s.Gates[0].Open() {
		t.Fatalf("gate not open: %d", s.Gates[0].Progress)
	}
	s = Step(s, map[PlayerID]Input{1: {Act: true}})
	if s.Gates[0].Progress != GateTicks {
		t.Errorf("progress past open: %d", s.Gates[0].Progress)
	}
}

func TestEscape(t *testing.T) {
	tests := []struct {
		name string
		open bool
		pos  Vec2
		role Role
		want bool
	}{
		{"survivor at an open gate escapes", true, Vec2{GateRange - 100_000, 0}, Survivor, true},
		{"closed gate lets nobody out", false, Vec2{}, Survivor, false},
		{"too far from an open gate", true, Vec2{GateRange + 100_000, 0}, Survivor, false},
		{"killer never escapes", true, Vec2{}, Killer, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			withGate(t)
			g := Gate{}
			if tt.open {
				g.Progress = GateTicks
			}
			s := State{
				Players: []Player{{ID: 1, Role: tt.role, Pos: tt.pos}},
				Gens:    doneGens(GensRequired),
				Gates:   []Gate{g},
			}
			s = Step(s, map[PlayerID]Input{1: {}})
			if got := s.Players[0].Escaped; got != tt.want {
				t.Errorf("escaped = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestEscapedPlayerIsOutOfPlay(t *testing.T) {
	withGate(t)
	p := survivor(1, Vec2{})
	p.Escaped = true
	s := State{Players: []Player{p}, Gens: doneGens(0), Gates: make([]Gate, 1)}
	s = Step(s, map[PlayerID]Input{1: {MoveX: 127, Act: true}})
	if got := s.Players[0].Pos; got != (Vec2{}) {
		t.Errorf("escaped player moved to %v", got)
	}
	if s.Gates[0].Progress != 0 {
		t.Error("escaped player opened a gate")
	}
}

func TestFailedCheckMakesNoise(t *testing.T) {
	withGen(t)
	p := survivor(1, Vec2{})
	p.CheckActive, p.CheckAge, p.CheckZone = true, 2, 20
	s := State{Players: []Player{p}, Gens: make([]Generator, 1)}

	s = Step(s, map[PlayerID]Input{1: {Act: true, Skill: true}}) // too early: a miss
	if got := s.Gens[0].Noise; got != NoiseTicks {
		t.Fatalf("noise = %d, want %d", got, NoiseTicks)
	}
	// The noise fades on its own, and the player letting go does not renew it.
	for range NoiseTicks {
		s = Step(s, map[PlayerID]Input{1: {}})
	}
	if got := s.Gens[0].Noise; got != 0 {
		t.Errorf("noise = %d after fading, want 0", got)
	}
}

func TestHitMakesNoNoise(t *testing.T) {
	withGen(t)
	p := survivor(1, Vec2{})
	p.CheckActive, p.CheckAge, p.CheckZone = true, 19, 20
	s := State{Players: []Player{p}, Gens: make([]Generator, 1)}
	s = Step(s, map[PlayerID]Input{1: {Act: true, Skill: true}})
	if s.Players[0].CheckResult != CheckHit || s.Gens[0].Noise != 0 {
		t.Errorf("result %d noise %d, want a hit with no noise", s.Players[0].CheckResult, s.Gens[0].Noise)
	}
}

func TestGateLayout(t *testing.T) {
	if len(GateSites) != GateCount {
		t.Fatalf("%d gate sites, want %d", len(GateSites), GateCount)
	}
	for i, g := range GateSites {
		if inWall(g) {
			t.Errorf("gate %d site %v is inside a wall", i, g)
		}
		if g.X < -MapHalfExtent || g.X > MapHalfExtent || g.Y < -MapHalfExtent || g.Y > MapHalfExtent {
			t.Errorf("gate %d leaves the map", i)
		}
	}
}
