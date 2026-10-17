package sim

import "testing"

// carriedPair is a killer with a downed survivor on his shoulder.
func carriedPair(t *testing.T, recover int16) State {
	t.Helper()
	withMap(t, nil, nil)
	return State{Players: []Player{
		{ID: 1, Role: Killer, Pos: Vec2{0, 0}, Carrying: 2},
		{ID: 2, Role: Survivor, Pos: Vec2{0, 0}, Health: Downed, Carried: true, Recover: recover},
	}}
}

func TestStunAfterBreakingFreeIsOneAndAHalfSeconds(t *testing.T) {
	if StunTicks != 3*TickRate/2 {
		t.Fatalf("StunTicks %d, want 1.5 s", StunTicks)
	}
}

var (
	pressE = map[PlayerID]Input{2: {Act: true}}
	pressQ = map[PlayerID]Input{2: {Alt: true}}
	letGo  = map[PlayerID]Input{2: {}}
)

func TestStrugglingAlternatesEAndQ(t *testing.T) {
	// each tick of lying there adds one to Recover; a counted press adds StruggleTicks on top
	tests := []struct {
		name   string
		inputs []map[PlayerID]Input
		counts int
	}{
		{"E then Q", []map[PlayerID]Input{pressE, letGo, pressQ}, 2},
		{"Q then E", []map[PlayerID]Input{pressQ, letGo, pressE}, 2},
		{"E, Q, E, Q", []map[PlayerID]Input{pressE, letGo, pressQ, letGo, pressE, letGo, pressQ}, 4},
		{"E twice counts once", []map[PlayerID]Input{pressE, letGo, pressE}, 1},
		{"holding E counts once", []map[PlayerID]Input{pressE, pressE, pressE, pressE}, 1},
		{"E and Q held together", []map[PlayerID]Input{{2: {Act: true, Alt: true}}}, 2},
		{"nothing pressed", []map[PlayerID]Input{letGo, letGo}, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := carriedPair(t, 0)
			for _, in := range tt.inputs {
				s = Step(s, in)
			}
			want := int16(len(tt.inputs) + tt.counts*StruggleTicks)
			if got := s.Players[1].Recover; got != want {
				t.Fatalf("Recover %d, want %d", got, want)
			}
		})
	}
}

func TestOnlyACarriedSurvivorStruggles(t *testing.T) {
	withMap(t, nil, nil)
	s := State{Players: []Player{{ID: 2, Role: Survivor, Health: Downed}}}
	for _, in := range []map[PlayerID]Input{pressE, letGo, pressQ} {
		s = Step(s, in)
	}
	if got := s.Players[0].Recover; got != 3 {
		t.Fatalf("a downed survivor on the ground has Recover %d, want just the 3 ticks", got)
	}
}

func TestStrugglingFreeStunsTheKiller(t *testing.T) {
	s := carriedPair(t, DownedRecoverTicks-3*StruggleTicks)
	for i := 0; s.Players[1].Carried && i < 20; i++ {
		in := []map[PlayerID]Input{pressE, letGo, pressQ, letGo}[i%4]
		s = Step(s, in)
	}
	k, v := s.Players[0], s.Players[1]
	if v.Carried || v.Health != Injured || k.Carrying != 0 || k.Stun != StunTicks {
		t.Fatalf("survivor carried %v health %d, killer carrying %d stun %d: want freed, injured, stunned %d", v.Carried, v.Health, k.Carrying, k.Stun, StunTicks)
	}
}

func TestSurvivorGetsOffInSecondsNotAMinute(t *testing.T) {
	s := carriedPair(t, 0)
	ticks := 0
	// five alternating presses a second, which a quick player manages
	for s.Players[1].Carried && ticks < 60*TickRate {
		in := letGo
		if ticks%6 == 0 {
			in = pressE
			if (ticks/6)%2 == 1 {
				in = pressQ
			}
		}
		s = Step(s, in)
		ticks++
	}
	if s.Players[1].Carried || ticks > 12*TickRate {
		t.Fatalf("still on the shoulder after %d ticks, or took longer than 12 s (%d)", ticks, ticks)
	}
}
