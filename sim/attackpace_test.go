package sim

import "testing"

func TestAttackReachIsTwentyPercentShorter(t *testing.T) {
	withMap(t, nil, nil)
	// the range was 2.2 m and is now 1.76 m, measured to the nearest point of
	// the body, so a body centred 2.16 m away is just touched
	for _, tt := range []struct {
		dist int32
		want bool
	}{{1_700_000, true}, {2_100_000, true}, {2_200_000, false}, {2_500_000, false}} {
		if got := InReach(Vec2{}, 0, Vec2{0, tt.dist}, nil); got != tt.want {
			t.Errorf("target %d µm away: in reach %v, want %v", tt.dist, got, tt.want)
		}
	}
}

func TestADoubleHitTakesLonger(t *testing.T) {
	withMap(t, nil, nil)
	s := State{Players: []Player{killerAt(Vec2{}, 0), target(2, Vec2{0, 1_200_000}, Healthy)}}
	hits, first, ticks := 0, 0, 0
	for ticks < 5*TickRate && hits < 2 {
		before := byID(s, 2).Health
		s = Step(s, map[PlayerID]Input{1: {Attack: ticks%2 == 0}}) // clicking as fast as the sim lets him
		ticks++
		if byID(s, 2).Health != before {
			if hits++; hits == 1 {
				first = ticks
			}
		}
	}
	if hits != 2 {
		t.Fatalf("only %d hits in 5 s", hits)
	}
	if gap := ticks - first; gap < 36 {
		t.Fatalf("second hit came %d ticks after the first, want at least 1.2 s (36)", gap)
	}
}

// A hit survivor and the killer both run straight ahead. The shove has to
// leave them well clear when it ends, or the killer is on them again at once.
func TestAHitSurvivorGetsClearOfAChasingKiller(t *testing.T) {
	withMap(t, nil, nil)
	s := State{Players: []Player{killerAt(Vec2{}, 0), target(2, Vec2{0, 1_200_000}, Healthy)}}
	run := map[PlayerID]Input{1: {MoveY: 127}, 2: {MoveY: 127}}
	press := map[PlayerID]Input{1: {MoveY: 127, Attack: true}, 2: {MoveY: 127}}
	s = Step(s, press)
	var gap int32
	boosted := false
	for ticks := 0; ticks < 6*TickRate; ticks++ {
		s = Step(s, run)
		if s.Players[1].Boost > 0 {
			boosted = true
		}
		if boosted && s.Players[1].Boost == 0 {
			gap = s.Players[1].Pos.Y - s.Players[0].Pos.Y
			break
		}
	}
	if !boosted {
		t.Fatal("the survivor was never hit")
	}
	t.Logf("the survivor is %.1f m ahead when the boost ends", float64(gap)/1e6)
	if gap < 5_000_000 {
		t.Fatalf("when the boost ends the survivor is %d µm ahead, want at least 5 m", gap)
	}
}

// swingsAt has the killer click as fast as the sim lets him, and returns the
// ticks (from the start) at which each survivor's health changed.
func hitTicks(s State, ticks int) []int {
	var at []int
	for i := 0; i < ticks; i++ {
		before := s.Players[1].Health
		s = Step(s, map[PlayerID]Input{1: {Attack: i%2 == 0}})
		if s.Players[1].Health != before {
			at = append(at, i)
		}
	}
	return at
}

func TestAHitSurvivorCannotBeHitAgainForTwoSeconds(t *testing.T) {
	withMap(t, nil, nil)
	// standing right in front of him the whole time, so only invincibility saves them
	s := State{Players: []Player{killerAt(Vec2{}, 0), target(2, Vec2{0, 1_200_000}, Healthy)}}
	at := hitTicks(s, 6*TickRate)
	if len(at) != 2 {
		t.Fatalf("hits at ticks %v, want two in 6 s", at)
	}
	if gap := at[1] - at[0]; gap < 2*TickRate {
		t.Fatalf("second hit %d ticks after the first, want at least 2 s (%d)", gap, 2*TickRate)
	}
}

func TestInvincibilityEndsAndOnlyCoversTheHitSurvivor(t *testing.T) {
	withMap(t, nil, nil)
	hit := target(2, Vec2{0, 1_200_000}, Injured)
	hit.Invuln = HitInvulnTicks
	other := target(3, Vec2{0, 1_500_000}, Healthy)
	s := State{Players: []Player{killerAt(Vec2{}, 0), hit, other}}
	s = Step(s, map[PlayerID]Input{1: {Attack: true}})
	for range AttackWindupTicks {
		s = Step(s, map[PlayerID]Input{1: {}})
	}
	if byID(s, 2).Health != Injured || byID(s, 3).Health != Injured {
		t.Fatalf("health %d and %d: want the invincible one untouched and the one behind them hit", byID(s, 2).Health, byID(s, 3).Health)
	}
	if byID(s, 2).Invuln >= HitInvulnTicks {
		t.Fatalf("invulnerability did not count down: %d", byID(s, 2).Invuln)
	}
}
