package sim

import "testing"

// One gate on the north fence at x = 0, no walls, no generator sites.
func withGate(t *testing.T) {
	t.Helper()
	oldW, oldG, oldS, oldF, oldL := Walls, GateSites, GenSites, Fences, Lanes
	Walls, GateSites, GenSites = nil, []Vec2{{0, MapHalfExtent}}, nil
	Fences, Lanes = edges(GateSites)
	t.Cleanup(func() { Walls, GateSites, GenSites, Fences, Lanes = oldW, oldG, oldS, oldF, oldL })
}

func doneGens(n int) []Generator {
	g := make([]Generator, GeneratorCount)
	for i := range n {
		g[i].Progress = GeneratorTicks
	}
	return g
}

// front is where a survivor walking north stops against the shut gate.
var front = Vec2{0, MapHalfExtent - wallThick/2 - PlayerRadius}

func TestGateOpens(t *testing.T) {
	far := Vec2{0, MapHalfExtent - GateRange - 100_000}
	tests := []struct {
		name   string
		gens   int
		pos    Vec2
		role   Role
		in     Input
		want   int32
		wantOn bool // repairing flag
	}{
		{"powered gate opens by hand", GensRequired, front, Survivor, Input{Act: true}, 1, true},
		{"not enough generators", GensRequired - 1, front, Survivor, Input{Act: true}, 0, false},
		{"out of range", GensRequired, far, Survivor, Input{Act: true}, 0, false},
		{"must hold act", GensRequired, front, Survivor, Input{}, 0, false},
		{"killer cannot open it", GensRequired, front, Killer, Input{Act: true}, 0, false},
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
	p := survivor(1, front)
	p.Opening, p.CheckIn = 1, 50
	s := State{Players: []Player{p}, Gens: doneGens(GensRequired), Gates: []Gate{{Progress: GateTicks - 1}}}
	s = Step(s, map[PlayerID]Input{1: {Act: true}})
	if !s.Gates[0].Open() {
		t.Fatalf("gate not open: %d", s.Gates[0].Progress)
	}
	s = Step(s, map[PlayerID]Input{1: {Act: true}})
	if s.Gates[0].Progress != GateTicks {
		t.Errorf("progress past open: %d", s.Gates[0].Progress)
	}
	if s.Players[0].Escaped {
		t.Error("escaped just by opening the gate")
	}
}

// Holding E at a gate brings a skill check within GateCheckMaxGap ticks,
// every time, and a full open without checks never happens.
func TestGateBringsChecks(t *testing.T) {
	withGate(t)
	for seed := uint32(1); seed < 40; seed++ {
		p := survivor(1, front)
		p.Rng = seed
		s := State{Players: []Player{p}, Gens: doneGens(GensRequired), Gates: make([]Gate, 1)}
		ticks := 0
		for !s.Players[0].CheckActive && ticks <= GateCheckMaxGap+1 {
			s = Step(s, map[PlayerID]Input{1: {Act: true}})
			ticks++
		}
		if !s.Players[0].CheckActive || ticks < GateCheckMinGap {
			t.Fatalf("seed %d: check after %d ticks, want %d..%d", seed, ticks, GateCheckMinGap, GateCheckMaxGap)
		}
	}
}

func TestGateCheckResults(t *testing.T) {
	const at = GateTicks / 2
	tests := []struct {
		name string
		age  int16 // CheckAge before the tick; the zone starts at 20
		in   Input
		want int32
		res  CheckResult
	}{
		{"a hit adds a little", 19, Input{Act: true, Skill: true}, at + 1 + GateCheckBonus, CheckHit},
		{"a miss takes some away", 2, Input{Act: true, Skill: true}, at + 1 - GateCheckPenalty, CheckMiss},
		{"running out is a miss", CheckDuration - 1, Input{Act: true}, at + 1 - GateCheckPenalty, CheckMiss},
		{"letting go is a miss", 10, Input{}, at - GateCheckPenalty, CheckMiss},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			withGate(t)
			p := survivor(1, front)
			p.Opening, p.CheckActive, p.CheckAge, p.CheckZone = 1, true, tt.age, 20
			s := State{Players: []Player{p}, Gens: doneGens(GensRequired), Gates: []Gate{{Progress: at}}}
			s = Step(s, map[PlayerID]Input{1: tt.in})
			if got := s.Gates[0].Progress; got != tt.want {
				t.Errorf("progress = %d, want %d", got, tt.want)
			}
			q := s.Players[0]
			if q.CheckActive || q.CheckResult != tt.res {
				t.Errorf("check active %v result %d, want over with %d", q.CheckActive, q.CheckResult, tt.res)
			}
			if tt.in.Act && (q.CheckIn < GateCheckMinGap || q.CheckIn > GateCheckMaxGap) {
				t.Errorf("next check in %d, want a gate gap", q.CheckIn)
			}
		})
	}
}

func TestGateOpeningClearsCheck(t *testing.T) {
	withGate(t)
	p := survivor(1, front)
	p.Opening, p.CheckActive, p.CheckAge, p.CheckZone = 1, true, 5, 20
	s := State{Players: []Player{p}, Gens: doneGens(GensRequired), Gates: []Gate{{Progress: GateTicks - 1}}}
	s = Step(s, map[PlayerID]Input{1: {Act: true}})
	s = Step(s, map[PlayerID]Input{})
	if !s.Gates[0].Open() || s.Players[0].CheckActive || s.Players[0].CheckResult != CheckNone {
		t.Errorf("open %v, check %v result %d: want open with the check gone, not missed", s.Gates[0].Open(), s.Players[0].CheckActive, s.Players[0].CheckResult)
	}
}

// walkNorth holds W for n ticks and returns the state.
func walkNorth(s State, id PlayerID, n int) State {
	for range n {
		if s.Players[0].Escaped {
			break
		}
		s = Step(s, map[PlayerID]Input{id: {MoveY: MaxAxis}})
	}
	return s
}

func TestGateAndFenceBlock(t *testing.T) {
	tests := []struct {
		name  string
		role  Role
		x     int32
		open  bool
		wantY int32 // where they end up; 0 means escaped
	}{
		{"a shut gate holds a survivor", Survivor, 0, false, front.Y},
		{"an open gate lets a survivor out", Survivor, 0, true, 0},
		{"an open gate still holds the killer", Killer, 0, true, front.Y},
		{"the fence holds beside the gate", Survivor, 10 * meter, true, front.Y},
		{"the fence holds at the corner", Survivor, front.Y, true, front.Y},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			withGate(t)
			g := Gate{}
			if tt.open {
				g.Progress = GateTicks
			}
			s := State{Players: []Player{{ID: 1, Role: tt.role, Pos: Vec2{tt.x, 25 * meter}}}, Gens: doneGens(0), Gates: []Gate{g}}
			s = walkNorth(s, 1, 4*TickRate)
			p := s.Players[0]
			if tt.wantY == 0 {
				if !p.Escaped {
					t.Errorf("not escaped, at %v", p.Pos)
				}
				return
			}
			if p.Escaped || p.Pos.Y != tt.wantY {
				t.Errorf("at %v escaped %v, want stopped at y %d", p.Pos, p.Escaped, tt.wantY)
			}
		})
	}
}

func TestEscape(t *testing.T) {
	line := int32(MapHalfExtent)
	tests := []struct {
		name    string
		pos     Vec2
		role    Role
		carried bool
		want    bool
	}{
		{"standing in the open gate is not out", Vec2{0, line}, Survivor, false, false},
		{"just short of the exit depth", Vec2{0, line + ExitDepth - 1}, Survivor, false, false},
		{"far enough down the lane", Vec2{GateHalfWidth - PlayerRadius, line + ExitDepth}, Survivor, false, true},
		{"the killer never escapes", Vec2{0, line + ExitDepth}, Killer, false, false},
		{"carried out does not count", Vec2{0, line + ExitDepth}, Survivor, true, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			withGate(t)
			s := State{
				Players: []Player{{ID: 1, Role: tt.role, Pos: tt.pos, Carried: tt.carried, Health: map[bool]Health{true: Downed}[tt.carried]}},
				Gens:    doneGens(GensRequired),
				Gates:   []Gate{{Progress: GateTicks}},
			}
			s = Step(s, map[PlayerID]Input{1: {}})
			if got := s.Players[0].Escaped; got != tt.want {
				t.Errorf("escaped = %v, want %v", got, tt.want)
			}
		})
	}
}

// From the gate line a survivor walks ExitDepth before getting out.
func TestWalkOutTakesTime(t *testing.T) {
	withGate(t)
	s := State{Players: []Player{survivor(1, front)}, Gens: doneGens(0), Gates: []Gate{{Progress: GateTicks}}}
	ticks := 0
	for !s.Players[0].Escaped && ticks < 5*TickRate {
		s = Step(s, map[PlayerID]Input{1: {MoveY: MaxAxis}})
		ticks++
	}
	want := int((ExitDepth + MapHalfExtent - int64(front.Y)) * TickRate / SurvivorSpeed)
	if !s.Players[0].Escaped || ticks < want {
		t.Errorf("escaped %v after %d ticks, want at least %d", s.Players[0].Escaped, ticks, want)
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
		if abs(g.Y) != MapHalfExtent || abs(g.X) > MapHalfExtent-2*meter {
			t.Errorf("gate %d at %v is not in the north or south fence", i, g)
		}
		// Open, the lane is clear from the gate line to past the exit depth.
		for d := int32(-meter); d <= ExitDepth; d += meter / 4 {
			if p := (Vec2{g.X, g.Y + outward(g)*d}); inWall(p) {
				t.Errorf("gate %d: the way out is blocked at %v", i, p)
			}
		}
		if !inWall(Vec2{g.X + GateHalfWidth + meter, g.Y}) {
			t.Errorf("gate %d: no fence beside it", i)
		}
	}
}

// The killer stops at the gate line, but a survivor close past it in the
// lane is still in reach; one further down is not.
func TestKillerSwingsIntoTheLane(t *testing.T) {
	tests := []struct {
		name string
		y    int32 // the survivor, past the gate line
		want Health
	}{
		{"just past the gate", MapHalfExtent + meter, Injured},
		{"out of reach down the lane", MapHalfExtent + 3*meter, Healthy},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			withGate(t)
			s := State{
				Players: []Player{killerAt(front, 0), target(2, Vec2{0, tt.y}, Healthy)},
				Gens:    doneGens(GensRequired),
				Gates:   []Gate{{Progress: GateTicks}},
			}
			s = swing(s, 0)
			if got := s.Players[1].Health; got != tt.want {
				t.Errorf("health = %d, want %d", got, tt.want)
			}
		})
	}
}
