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
		if got := InReach(Vec2{}, 0, Vec2{0, tt.dist}); got != tt.want {
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

func TestAHitShovesFasterThanBefore(t *testing.T) {
	if HitBoostSpeed < 8_500_000 {
		t.Fatalf("the shove runs at %d µm/s, want at least 8.5 m/s (it was 6.6)", HitBoostSpeed)
	}
}
