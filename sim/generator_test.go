package sim

import "testing"

// A generator at the origin, no walls, so tests control everything.
func withGen(t *testing.T) {
	t.Helper()
	oldW, oldG := Walls, GenSites
	Walls = nil
	GenSites = []Vec2{{0, 0}}
	t.Cleanup(func() { Walls, GenSites = oldW, oldG })
}

func survivor(id PlayerID, pos Vec2) Player { return Player{ID: id, Role: Survivor, Pos: pos} }

func gensOf(s State) int32 { return s.Gens[0].Progress }

func TestRepairProgress(t *testing.T) {
	near := Vec2{RepairRange - 100_000, 0}
	far := Vec2{RepairRange + 100_000, 0}
	tests := []struct {
		name    string
		players []Player
		inputs  map[PlayerID]Input
		want    int32
	}{
		{"holding act in range repairs", []Player{survivor(1, near)}, map[PlayerID]Input{1: {Act: true}}, 1},
		{"not holding act does nothing", []Player{survivor(1, near)}, map[PlayerID]Input{1: {}}, 0},
		{"out of range does nothing", []Player{survivor(1, far)}, map[PlayerID]Input{1: {Act: true}}, 0},
		{"two survivors stack", []Player{survivor(1, near), survivor(2, near)}, map[PlayerID]Input{1: {Act: true}, 2: {Act: true}}, 2},
		{"killer cannot repair", []Player{{ID: 1, Role: Killer, Pos: near}}, map[PlayerID]Input{1: {Act: true}}, 0},
		{"no input does nothing", []Player{survivor(1, near)}, nil, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			withGen(t)
			s := State{Players: tt.players, Gens: make([]Generator, 1)}
			s = Step(s, tt.inputs)
			if got := gensOf(s); got != tt.want {
				t.Errorf("progress = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestRepairCompletes(t *testing.T) {
	withGen(t)
	s := State{Players: []Player{survivor(1, Vec2{})}, Gens: []Generator{{Progress: GeneratorTicks - 1}}}
	s = Step(s, map[PlayerID]Input{1: {Act: true}})
	if !s.Gens[0].Done() {
		t.Fatalf("progress %d, want done", s.Gens[0].Progress)
	}
	s = Step(s, map[PlayerID]Input{1: {Act: true}})
	if gensOf(s) != GeneratorTicks {
		t.Errorf("progress went past done: %d", gensOf(s))
	}
	if s.Players[0].Repairing {
		t.Error("still repairing a finished generator")
	}
}

func TestSkillCheckStarts(t *testing.T) {
	withGen(t)
	p := survivor(1, Vec2{})
	p.CheckIn, p.Rng = 1, 99
	s := State{Players: []Player{p}, Gens: make([]Generator, 1)}
	s = Step(s, map[PlayerID]Input{1: {Act: true}})
	got := s.Players[0]
	if !got.CheckActive || got.CheckAge != 0 {
		t.Fatalf("check not started: %+v", got)
	}
	if got.CheckZone < CheckZoneMin || got.CheckZone > CheckZoneMax {
		t.Errorf("zone start %d outside %d..%d", got.CheckZone, CheckZoneMin, CheckZoneMax)
	}
}

func TestSkillCheckResolves(t *testing.T) {
	active := func(age int16, held bool) Player {
		p := survivor(1, Vec2{})
		p.CheckActive, p.CheckAge, p.CheckZone, p.SkillHeld = true, age, 20, held
		return p
	}
	const start = 1000
	tests := []struct {
		name     string
		player   Player
		in       Input
		wantProg int32
		wantRes  CheckResult
		wantOver bool
	}{
		{"press inside the zone is a hit", active(20, false), Input{Act: true, Skill: true}, start + 1 + CheckBonus, CheckHit, true},
		{"press at the last zone tick is a hit", active(20+CheckZoneLen-2, false), Input{Act: true, Skill: true}, start + 1 + CheckBonus, CheckHit, true},
		{"press too early is a miss", active(5, false), Input{Act: true, Skill: true}, start + 1 - CheckPenalty, CheckMiss, true},
		{"press too late is a miss", active(20+CheckZoneLen, false), Input{Act: true, Skill: true}, start + 1 - CheckPenalty, CheckMiss, true},
		{"no press mid check keeps going", active(10, false), Input{Act: true}, start + 1, CheckNone, false},
		{"a held key is not a press", active(20, true), Input{Act: true, Skill: true}, start + 1, CheckNone, false},
		{"timing out is a miss", active(CheckDuration-1, false), Input{Act: true}, start + 1 - CheckPenalty, CheckMiss, true},
		{"letting go mid check is a miss", active(10, false), Input{}, start - CheckPenalty, CheckMiss, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			withGen(t)
			s := State{Players: []Player{tt.player}, Gens: []Generator{{Progress: start}}}
			s = Step(s, map[PlayerID]Input{1: tt.in})
			p := s.Players[0]
			if got := gensOf(s); got != tt.wantProg {
				t.Errorf("progress = %d, want %d", got, tt.wantProg)
			}
			if p.CheckResult != tt.wantRes {
				t.Errorf("result = %d, want %d", p.CheckResult, tt.wantRes)
			}
			if p.CheckActive == tt.wantOver {
				t.Errorf("active = %v, want %v", p.CheckActive, !tt.wantOver)
			}
		})
	}
}

func TestSkillCheckPenaltyFloorsAtZero(t *testing.T) {
	withGen(t)
	p := survivor(1, Vec2{})
	p.CheckActive, p.CheckAge, p.CheckZone = true, 2, 20
	s := State{Players: []Player{p}, Gens: []Generator{{Progress: 10}}}
	s = Step(s, map[PlayerID]Input{1: {Act: true, Skill: true}})
	if gensOf(s) != 0 {
		t.Errorf("progress = %d, want 0", gensOf(s))
	}
}

func TestSkillChecksAreDeterministic(t *testing.T) {
	run := func() State {
		withGen(t)
		p := survivor(1, Vec2{})
		p.Rng = 1234
		s := State{Players: []Player{p}, Gens: make([]Generator, 1)}
		for range 600 {
			s = Step(s, map[PlayerID]Input{1: {Act: true}})
		}
		return s
	}
	a, b := run(), run()
	if a.Gens[0] != b.Gens[0] || a.Players[0] != b.Players[0] {
		t.Errorf("same seed diverged: %+v vs %+v", a, b)
	}
	if a.Players[0].Rng == 1234 {
		t.Error("rng never advanced")
	}
}

func TestGeneratorsBlockMovement(t *testing.T) {
	withGen(t)
	// Generator box is GeneratorHalf either side of the site; the body stops PlayerRadius short.
	face := int32(-GeneratorHalf - PlayerRadius)
	s := State{Players: []Player{survivor(1, Vec2{face - 50_000, 0})}, Gens: make([]Generator, 1)}
	s = Step(s, map[PlayerID]Input{1: {MoveX: 127}})
	if got := s.Players[0].Pos.X; got != face {
		t.Errorf("x = %d, want %d", got, face)
	}
}

func TestGeneratorLayout(t *testing.T) {
	if len(GenSites) != GeneratorCount {
		t.Fatalf("%d generator sites, want %d", len(GenSites), GeneratorCount)
	}
	for i, g := range GenSites {
		// Stand on the near side of the box: a player must be able to reach repair range.
		for _, w := range Walls {
			if g.X+GeneratorHalf+PlayerRadius > w.MinX && g.X-GeneratorHalf-PlayerRadius < w.MaxX &&
				g.Y+GeneratorHalf+PlayerRadius > w.MinY && g.Y-GeneratorHalf-PlayerRadius < w.MaxY {
				t.Errorf("generator %d overlaps wall %+v", i, w)
			}
		}
		if RepairRange <= GeneratorHalf+PlayerRadius {
			t.Fatal("repair range is inside the generator body")
		}
	}
}

func TestSkillChecksIgnoreOtherPlayers(t *testing.T) {
	// A guest predicts only its own player, so a survivor's checks must be
	// the same whether or not someone else is repairing alongside them.
	run := func(others bool) Player {
		withGen(t)
		a := survivor(1, Vec2{})
		a.Rng = 42
		players := []Player{a}
		if others {
			b := survivor(2, Vec2{})
			b.Rng = 7
			players = []Player{b, a}
		}
		s := State{Players: players, Gens: make([]Generator, 1)}
		in := map[PlayerID]Input{1: {Act: true}, 2: {Act: true}}
		for range 900 {
			s = Step(s, in)
		}
		for _, p := range s.Players {
			if p.ID == 1 {
				return p
			}
		}
		panic("no player 1")
	}
	if alone, together := run(false), run(true); alone != together {
		t.Errorf("checks differ with company: %+v vs %+v", alone, together)
	}
}
