package sim

import "testing"

func TestStepMovement(t *testing.T) {
	tests := []struct {
		name  string
		role  Role
		start Vec2
		input Input
		ticks int
		want  Vec2
	}{
		{"idle stays put", Survivor, Vec2{0, 0}, Input{}, 1, Vec2{0, 0}},
		{"survivor east one tick", Survivor, Vec2{0, 0}, Input{127, 0}, 1, Vec2{133333, 0}},
		{"survivor north one tick", Survivor, Vec2{0, 0}, Input{0, 127}, 1, Vec2{0, 133333}},
		{"killer is faster", Killer, Vec2{0, 0}, Input{127, 0}, 1, Vec2{153333, 0}},
		{"half stick is half speed", Survivor, Vec2{0, 0}, Input{-64, 0}, 1, Vec2{-67191, 0}},
		{"diagonal is normalized", Survivor, Vec2{0, 0}, Input{127, 127}, 1, Vec2{94488, 94488}},
		{"out of range input is clamped", Survivor, Vec2{0, 0}, Input{-128, 0}, 1, Vec2{-133333, 0}},
		{"one second covers four meters", Survivor, Vec2{0, 0}, Input{127, 0}, 30, Vec2{3999990, 0}},
		{"stops at east edge", Survivor, Vec2{29_950_000, 0}, Input{127, 0}, 1, Vec2{30_000_000, 0}},
		{"stops at south west corner", Killer, Vec2{-29_990_000, -29_990_000}, Input{-127, -127}, 1, Vec2{-30_000_000, -30_000_000}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := State{Players: []Player{{ID: 1, Role: tt.role, Pos: tt.start}}}
			for range tt.ticks {
				s = Step(s, map[PlayerID]Input{1: tt.input})
			}
			if s.Players[0].Pos != tt.want {
				t.Errorf("pos = %v, want %v", s.Players[0].Pos, tt.want)
			}
			if s.Tick != uint32(tt.ticks) {
				t.Errorf("tick = %d, want %d", s.Tick, tt.ticks)
			}
		})
	}
}

func TestStepTwoPlayers(t *testing.T) {
	s := State{Players: []Player{
		{ID: 1, Role: Killer, Pos: Vec2{0, 0}},
		{ID: 2, Role: Survivor, Pos: Vec2{1_000_000, 0}},
	}}
	before := s.Players[1].Pos

	next := Step(s, map[PlayerID]Input{1: {127, 0}})

	if got, want := next.Players[0].Pos, (Vec2{153333, 0}); got != want {
		t.Errorf("killer pos = %v, want %v", got, want)
	}
	if got := next.Players[1].Pos; got != before {
		t.Errorf("survivor without input moved to %v, want %v", got, before)
	}
	if got := s.Players[0].Pos; got != (Vec2{0, 0}) {
		t.Errorf("Step mutated its input state: killer pos = %v", got)
	}
}
