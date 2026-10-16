package sim

import "testing"

const m = meter

// An empty map, or one with only the given obstacles, so tests control everything.
func withMap(t *testing.T, walls []Box, gens []Vec2) {
	t.Helper()
	oldW, oldG, oldV := Walls, GenSites, Vaults
	Walls, GenSites, Vaults = walls, gens, nil
	t.Cleanup(func() { Walls, GenSites, Vaults = oldW, oldG, oldV })
}

// settled is a player who has stood at pos long enough to fill their trail.
func settled(p Player) Player {
	for i := range p.Trail {
		p.Trail[i] = p.Pos
	}
	return p
}

func killerAt(pos Vec2, yaw uint16) Player {
	return settled(Player{ID: 1, Role: Killer, Pos: pos, Yaw: yaw})
}

func target(id PlayerID, pos Vec2, h Health) Player {
	return settled(Player{ID: id, Role: Survivor, Pos: pos, Health: h})
}

// swing presses attack, then holds still until the swing resolves.
func swing(s State, lagMs uint16) State {
	s = Step(s, map[PlayerID]Input{1: {Attack: true, ViewLagMs: lagMs}})
	for range AttackWindupTicks {
		s = Step(s, map[PlayerID]Input{1: {ViewLagMs: lagMs}})
	}
	return s
}

func TestSwingTiming(t *testing.T) {
	withMap(t, nil, nil)
	in := func(attack bool) map[PlayerID]Input { return map[PlayerID]Input{1: {Attack: attack}} }
	tests := []struct {
		name      string
		survivor  Vec2
		recover   int
		resultWas SwingResult
	}{
		{"a whiff recovers slowly", Vec2{0, 10 * m}, AttackRecoverMissTicks, SwingMiss},
		{"a hit recovers faster", Vec2{0, 1500_000}, AttackRecoverHitTicks, SwingHit},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := State{Players: []Player{killerAt(Vec2{}, 0), target(2, tt.survivor, Healthy)}}
			s = Step(s, in(true))
			if k := s.Players[0]; k.Swing != SwingWindup {
				t.Fatalf("press did not start a windup: %+v", k)
			}
			// Holding the button through the windup changes nothing.
			for i := 1; i < AttackWindupTicks; i++ {
				s = Step(s, in(true))
				if k := s.Players[0]; k.Swing != SwingWindup {
					t.Fatalf("windup ended after %d ticks, want %d", i, AttackWindupTicks)
				}
			}
			s = Step(s, in(true))
			if k := s.Players[0]; k.Swing != SwingRecover || k.SwingResult != tt.resultWas {
				t.Fatalf("after windup: swing %d result %d, want recover with %d", k.Swing, k.SwingResult, tt.resultWas)
			}
			// A fresh press during recovery is ignored.
			for i := 1; i < tt.recover; i++ {
				s = Step(s, in(i%2 == 0))
				if k := s.Players[0]; k.Swing != SwingRecover {
					t.Fatalf("recovery ended after %d ticks, want %d", i, tt.recover)
				}
			}
			s = Step(s, in(false))
			if k := s.Players[0]; k.Swing != SwingIdle {
				t.Fatalf("still recovering after %d ticks: %+v", tt.recover, k)
			}
			s = Step(s, in(true))
			if k := s.Players[0]; k.Swing != SwingWindup {
				t.Fatalf("press after recovery did not swing: %+v", k)
			}
		})
	}
}

func TestHoldingAttackDoesNotRepeat(t *testing.T) {
	withMap(t, nil, nil)
	s := State{Players: []Player{killerAt(Vec2{}, 0)}}
	for range AttackWindupTicks + AttackRecoverMissTicks + 5 {
		s = Step(s, map[PlayerID]Input{1: {Attack: true}})
	}
	if k := s.Players[0]; k.Swing != SwingIdle {
		t.Errorf("held attack swung again: %+v", k)
	}
}

func TestOnlyTheKillerSwings(t *testing.T) {
	withMap(t, nil, nil)
	s := State{Players: []Player{target(2, Vec2{}, Healthy), target(3, Vec2{0, 1 * m}, Healthy)}}
	s = swing(s, 0)
	s = Step(s, map[PlayerID]Input{2: {Attack: true}})
	if s.Players[0].Swing != SwingIdle || s.Players[1].Health != Healthy {
		t.Errorf("a survivor attacked: %+v", s.Players)
	}
}

func TestSwingHits(t *testing.T) {
	north := uint16(0)
	east := uint16(16384)
	wallBetween := Box{-1 * m, 700_000, 1 * m, 800_000}
	tests := []struct {
		name   string
		walls  []Box
		gens   []Vec2
		yaw    uint16
		target Player
		want   Health
	}{
		{"in front and in range", nil, nil, north, target(2, Vec2{0, 1500_000}, Healthy), Injured},
		{"touching", nil, nil, north, target(2, Vec2{0, 800_000}, Healthy), Injured},
		{"out of range", nil, nil, north, target(2, Vec2{0, 2700_000}, Healthy), Healthy},
		{"centre out of range but body in", nil, nil, north, target(2, Vec2{0, 2500_000}, Healthy), Injured},
		{"behind", nil, nil, north, target(2, Vec2{0, -1500_000}, Healthy), Healthy},
		{"to the side", nil, nil, north, target(2, Vec2{2 * m, 0}, Healthy), Healthy},
		{"inside the cone edge", nil, nil, north, target(2, Vec2{1500_000, 1500_000}, Healthy), Injured},
		{"outside the cone edge", nil, nil, north, target(2, Vec2{1900_000, 600_000}, Healthy), Healthy},
		{"facing matters", nil, nil, east, target(2, Vec2{1500_000, 0}, Healthy), Injured},
		{"facing away", nil, nil, east, target(2, Vec2{0, 1500_000}, Healthy), Healthy},
		{"a wall blocks", []Box{wallBetween}, nil, north, target(2, Vec2{0, 1500_000}, Healthy), Healthy},
		{"a body peeking past a wall is hit", []Box{{-2 * m, 700_000, 200_000, 800_000}}, nil, north, target(2, Vec2{0, 1500_000}, Healthy), Injured},
		{"a generator blocks", nil, []Vec2{{0, 900_000}}, north, target(2, Vec2{0, 1800_000}, Healthy), Healthy},
		{"injured goes down", nil, nil, north, target(2, Vec2{0, 1500_000}, Injured), Downed},
		{"downed takes no hit", nil, nil, north, target(2, Vec2{0, 1500_000}, Downed), Downed},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			withMap(t, tt.walls, tt.gens)
			s := State{Players: []Player{killerAt(Vec2{}, tt.yaw), tt.target}}
			s = Step(s, map[PlayerID]Input{1: {Yaw: tt.yaw, Attack: true}})
			for range AttackWindupTicks {
				s = Step(s, map[PlayerID]Input{1: {Yaw: tt.yaw}})
			}
			if got := s.Players[1].Health; got != tt.want {
				t.Errorf("health = %d, want %d", got, tt.want)
			}
			wantResult := SwingMiss
			if tt.want != tt.target.Health {
				wantResult = SwingHit
			}
			if got := s.Players[0].SwingResult; got != wantResult {
				t.Errorf("swing result = %d, want %d", got, wantResult)
			}
		})
	}
}

func TestTwoHitsDown(t *testing.T) {
	withMap(t, nil, nil)
	s := State{Players: []Player{killerAt(Vec2{}, 0), target(2, Vec2{0, 1500_000}, Healthy)}}
	want := []Health{Injured, Downed, Downed}
	for i, h := range want {
		s = swing(s, 0)
		if got := s.Players[1].Health; got != h {
			t.Fatalf("after hit %d health = %d, want %d", i+1, got, h)
		}
		for range AttackRecoverMissTicks {
			s = Step(s, map[PlayerID]Input{1: {}})
		}
		// The boost carries the survivor away; put them back in reach.
		s.Players[1] = target(2, Vec2{0, 1500_000}, s.Players[1].Health)
	}
}

func TestOneSwingHitsOneSurvivor(t *testing.T) {
	withMap(t, nil, nil)
	s := State{Players: []Player{
		killerAt(Vec2{}, 0),
		target(2, Vec2{0, 2 * m}, Healthy),
		target(3, Vec2{300_000, 1200_000}, Healthy),
	}}
	s = swing(s, 0)
	if s.Players[1].Health != Healthy || s.Players[2].Health != Injured {
		t.Errorf("want only the nearer survivor hit, got %d and %d", s.Players[1].Health, s.Players[2].Health)
	}
}

func TestEscapedTakesNoHit(t *testing.T) {
	withMap(t, nil, nil)
	gone := target(2, Vec2{0, 1500_000}, Healthy)
	gone.Escaped = true
	s := swing(State{Players: []Player{killerAt(Vec2{}, 0), gone}}, 0)
	if s.Players[1].Health != Healthy {
		t.Error("hit an escaped survivor")
	}
}

func TestRewound(t *testing.T) {
	p := Player{}
	for i := range p.Trail {
		p.Trail[i] = Vec2{int32(i) * 1000, 0}
	}
	const now = 98 // now % TrailLen is 2, so Trail[2] is this tick
	tests := []struct {
		name  string
		lagMs uint16
		want  int32
	}{
		{"no lag is now", 0, 2000},
		{"a tick and a half back is between", 50, 500},
		{"back across the ring", 100, 7000},
		{"the cap", RewindCapMs, 4000},
		{"far past the cap is the cap", 1000, 4000},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := rewound(p, now, tt.lagMs); got != (Vec2{tt.want, 0}) {
				t.Errorf("rewound = %v, want x %d", got, tt.want)
			}
		})
	}
}

func TestTrailCoversRewindCap(t *testing.T) {
	if back := RewindCapMs*TickRate/1000 + 2; TrailLen < back {
		t.Errorf("TrailLen %d cannot rewind %d ticks", TrailLen, back)
	}
	if TrailLen&(TrailLen-1) != 0 {
		t.Errorf("TrailLen %d must be a power of two so tick wraparound indexes it cleanly", TrailLen)
	}
}

// A survivor runs east across the killer's cone. When the swing resolves
// they are already past the edge, but the killer's view lagged behind, and
// in that view they were still inside it.
func TestRewindDecidesTheHit(t *testing.T) {
	tests := []struct {
		name  string
		lagMs uint16
		want  Health
	}{
		{"no lag misses", 0, Healthy},
		{"what the killer saw 200 ms ago hits", 200, Injured},
		{"a lag past the cap is held to the cap", 1000, Injured},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			withMap(t, nil, nil)
			s := State{Players: []Player{killerAt(Vec2{}, 0), target(2, Vec2{400_000, 1500_000}, Healthy)}}
			const runTicks = 15 // ends at x = 2.4 m; the body leaves the cone after 2.01 m
			for i := range runTicks {
				s = Step(s, map[PlayerID]Input{
					1: {Attack: i == runTicks-AttackWindupTicks-1, ViewLagMs: tt.lagMs},
					2: {MoveX: MaxAxis},
				})
			}
			if k := s.Players[0]; k.SwingResult == SwingNone {
				t.Fatalf("swing has not resolved: %+v", k)
			}
			if x := s.Players[1].Pos.X; x < 2_300_000 {
				t.Fatalf("survivor at x %d, want past the cone edge", x)
			}
			if got := s.Players[1].Health; got != tt.want {
				t.Errorf("health = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestHitSpeeds(t *testing.T) {
	withMap(t, nil, nil)
	east := map[PlayerID]Input{2: {MoveX: MaxAxis}}
	boosted := target(2, Vec2{}, Injured)
	boosted.Boost = 3
	tests := []struct {
		name string
		p    Player
		want int32
	}{
		{"healthy runs", target(2, Vec2{}, Healthy), SurvivorSpeed / TickRate},
		{"injured without a boost runs", target(2, Vec2{}, Injured), SurvivorSpeed / TickRate},
		{"a fresh hit sprints", boosted, HitBoostSpeed / TickRate},
		{"downed crawls", target(2, Vec2{}, Downed), CrawlSpeed / TickRate},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := Step(State{Players: []Player{tt.p}}, east)
			if d := s.Players[0].Pos.X - tt.want; d < -1 || d > 1 {
				t.Errorf("moved %d, want %d", s.Players[0].Pos.X, tt.want)
			}
		})
	}
}

func TestHitGivesBoost(t *testing.T) {
	withMap(t, nil, nil)
	s := swing(State{Players: []Player{killerAt(Vec2{}, 0), target(2, Vec2{0, 1500_000}, Healthy)}}, 0)
	if got := s.Players[1].Boost; got != HitBoostTicks {
		t.Errorf("boost = %d, want %d", got, HitBoostTicks)
	}
	for range HitBoostTicks {
		s = Step(s, nil)
	}
	if got := s.Players[1].Boost; got != 0 {
		t.Errorf("boost = %d after it should run out", got)
	}
}

// Swinging costs the killer time before the next swing, never speed.
func TestKillerKeepsSpeedInRecovery(t *testing.T) {
	withMap(t, nil, nil)
	s := swing(State{Players: []Player{killerAt(Vec2{}, 16384)}}, 0)
	x := s.Players[0].Pos.X
	s = Step(s, map[PlayerID]Input{1: {MoveY: MaxAxis, Yaw: 16384}})
	if s.Players[0].Swing != SwingRecover {
		t.Fatal("not recovering")
	}
	if got, want := s.Players[0].Pos.Y, int32(KillerSpeed/TickRate); got != want {
		t.Errorf("recovering killer moved %d, want %d", got, want)
	}
	if s.Players[0].Pos.X != x {
		t.Error("killer drifted")
	}
}

func TestDownedCannotRepair(t *testing.T) {
	withMap(t, nil, []Vec2{{0, 0}})
	p := target(2, Vec2{RepairRange - 100_000, 0}, Downed)
	s := Step(State{Players: []Player{p}, Gens: make([]Generator, 1)}, map[PlayerID]Input{2: {Act: true}})
	if s.Gens[0].Progress != 0 || s.Players[0].Repairing {
		t.Errorf("a downed survivor repaired: %+v", s.Players[0])
	}
}

func TestAttackIsDeterministic(t *testing.T) {
	withMap(t, nil, nil)
	run := func() State {
		s := State{Players: []Player{killerAt(Vec2{}, 0), target(2, Vec2{-1 * m, 1500_000}, Healthy)}}
		for i := range 90 {
			s = Step(s, map[PlayerID]Input{
				1: {Attack: i%20 == 0, Yaw: uint16(i * 300), ViewLagMs: uint16(i * 7)},
				2: {MoveX: int8(i%7*30 - 90), MoveY: int8(i%5*40 - 80)},
			})
		}
		return s
	}
	a, b := run(), run()
	for i := range a.Players {
		if a.Players[i] != b.Players[i] {
			t.Fatalf("player %d differs between identical runs:\n%+v\n%+v", i, a.Players[i], b.Players[i])
		}
	}
}
