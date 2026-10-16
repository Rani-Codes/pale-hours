package sim

import "testing"

func withGrass(t *testing.T, patches ...Box) {
	t.Helper()
	old := Grass
	Grass = patches
	t.Cleanup(func() { Grass = old })
}

var patch = Box{-3 * m, -3 * m, 3 * m, 3 * m}

func crouchFor(s State, id PlayerID, ticks int, extra Input) State {
	in := extra
	in.Crouch = true
	for range ticks {
		s = Step(s, map[PlayerID]Input{id: in})
	}
	return s
}

func TestCrouchSlowsAndHidesInGrass(t *testing.T) {
	withMap(t, nil, nil)
	withGrass(t, patch)
	s := State{Players: []Player{target(2, Vec2{}, Healthy)}}
	s = crouchFor(s, 2, HideSettleTicks-1, Input{})
	if p := s.Players[0]; !p.Crouching || p.Hidden() {
		t.Fatalf("one tick short of settling: %+v", p)
	}
	s = crouchFor(s, 2, 1, Input{})
	if !s.Players[0].Hidden() {
		t.Fatal("not hidden after settling in grass")
	}
	// Walking crouched is slow, and still hidden.
	before := s.Players[0].Pos
	s = crouchFor(s, 2, TickRate, Input{MoveX: MaxAxis})
	if got := int64(s.Players[0].Pos.X - before.X); got < CrouchSpeed*99/100 || got > CrouchSpeed {
		t.Errorf("crouched a second at %d um, want about %d", got, CrouchSpeed)
	}
	if !s.Players[0].Hidden() {
		t.Error("walking crouched in grass revealed them")
	}
	// Standing up reveals at once.
	s = Step(s, map[PlayerID]Input{2: {}})
	if p := s.Players[0]; p.Crouching || p.Hidden() {
		t.Errorf("after standing: %+v", p)
	}
}

func TestCrouchOutsideGrassHidesNobody(t *testing.T) {
	withMap(t, nil, nil)
	withGrass(t, patch)
	s := State{Players: []Player{target(2, Vec2{10 * m, 0}, Healthy)}}
	s = crouchFor(s, 2, 3*HideSettleTicks, Input{})
	if p := s.Players[0]; !p.Crouching || p.Hidden() {
		t.Errorf("crouched in the open: %+v", p)
	}
	// Crawling out of the grass drops the cover.
	s = State{Players: []Player{target(2, Vec2{}, Healthy)}}
	s = crouchFor(s, 2, HideSettleTicks, Input{})
	s = crouchFor(s, 2, 8*TickRate, Input{MoveX: MaxAxis})
	if s.Players[0].Hidden() {
		t.Errorf("still hidden at x=%d past the patch", s.Players[0].Pos.X)
	}
}

func TestWhoCannotCrouch(t *testing.T) {
	withMap(t, nil, nil)
	withGrass(t, patch)
	down := target(2, Vec2{}, Downed)
	carried := target(3, Vec2{}, Injured)
	carried.Carried = true
	hit := target(4, Vec2{}, Injured)
	hit.Boost = 5
	hooked := target(5, Vec2{}, Injured)
	hooked.OnHook = 1
	killer := Player{ID: 6, Role: Killer}
	s := State{Players: []Player{down, carried, hit, hooked, killer}}
	s = crouchFor(s, 2, 1, Input{})
	for _, id := range []PlayerID{3, 4, 5, 6} {
		s = Step(s, map[PlayerID]Input{id: {Crouch: true}})
	}
	for _, p := range s.Players {
		if p.Crouching {
			t.Errorf("player %d (role %d) is crouching: %+v", p.ID, p.Role, p)
		}
	}
}

func TestCrouchLetsGoOfRepair(t *testing.T) {
	withMap(t, nil, []Vec2{{0, 0}})
	s := State{Players: []Player{target(2, Vec2{RepairRange / 2, 0}, Healthy)}, Gens: make([]Generator, 1)}
	s = Step(s, map[PlayerID]Input{2: {Act: true}})
	s = Step(s, map[PlayerID]Input{2: {Act: true}})
	was := s.Gens[0].Progress
	if was == 0 {
		t.Fatal("no repair progress without crouching")
	}
	s = Step(s, map[PlayerID]Input{2: {Act: true, Crouch: true}})
	if s.Gens[0].Progress != was || s.Players[0].Repairing {
		t.Errorf("crouched and still repairing: progress %d -> %d", was, s.Gens[0].Progress)
	}
}

func TestCrouchStopsVault(t *testing.T) {
	withVault(t)
	s := State{Players: []Player{target(2, west, Healthy)}}
	s = Step(s, map[PlayerID]Input{2: {Skill: true, Crouch: true}})
	if s.Players[0].VaultTicks != 0 {
		t.Error("vaulted while crouched")
	}
}

func TestConcealed(t *testing.T) {
	hidden := Player{HideTicks: HideSettleTicks, Pos: Vec2{HideRevealRange + 1, 0}}
	if !Concealed(Vec2{}, hidden) {
		t.Error("a hidden survivor beyond the reveal range is seen")
	}
	hidden.Pos.X = HideRevealRange
	if Concealed(Vec2{}, hidden) {
		t.Error("a hidden survivor inside the reveal range stays hidden")
	}
	out := Player{HideTicks: HideSettleTicks - 1, Pos: Vec2{20 * m, 0}}
	if Concealed(Vec2{}, out) {
		t.Error("a survivor still settling is concealed")
	}
}

// Grass is cover to run to, not part of the walls: it must sit in open ground inside the map.
func TestGrassLayout(t *testing.T) {
	overlaps := func(a, b Box) bool { return a.MinX < b.MaxX && a.MaxX > b.MinX && a.MinY < b.MaxY && a.MaxY > b.MinY }
	if len(Grass) < 4 || len(Grass) > 8 {
		t.Errorf("%d grass patches: want a handful", len(Grass))
	}
	for i, g := range Grass {
		if g.MinX >= g.MaxX || g.MinY >= g.MaxY {
			t.Errorf("grass %d is empty: %+v", i, g)
		}
		if g.MinX < -MapHalfExtent+meter || g.MaxX > MapHalfExtent-meter || g.MinY < -MapHalfExtent+meter || g.MaxY > MapHalfExtent-meter {
			t.Errorf("grass %d reaches the fence: %+v", i, g)
		}
		for _, list := range [][]Box{Walls, Vaults, Fences, Lanes} {
			for _, w := range list {
				if overlaps(g, w) {
					t.Errorf("grass %d overlaps wall %+v", i, w)
				}
			}
		}
		for _, s := range GenSites {
			if overlaps(g, Box{s.X - GeneratorHalf, s.Y - GeneratorHalf, s.X + GeneratorHalf, s.Y + GeneratorHalf}) {
				t.Errorf("grass %d covers a generator at %v", i, s)
			}
		}
		for _, h := range HookSites {
			if h.X > g.MinX && h.X < g.MaxX && h.Y > g.MinY && h.Y < g.MaxY {
				t.Errorf("grass %d covers a hook at %v", i, h)
			}
		}
		for j, o := range Grass[:i] {
			if overlaps(g, o) {
				t.Errorf("grass %d overlaps grass %d", i, j)
			}
		}
	}
}
