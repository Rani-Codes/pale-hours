package sim

import "testing"

func out(id PlayerID, escaped, eliminated bool) Player {
	p := target(id, Vec2{int32(id) * m, 0}, Healthy)
	p.Escaped, p.Eliminated = escaped, eliminated
	return p
}

func TestMatchEnds(t *testing.T) {
	downed := target(4, Vec2{}, Downed)
	onHook := target(4, Vec2{}, Downed)
	onHook.OnHook = 1
	tests := []struct {
		name    string
		players []Player
		want    bool
	}{
		{"everyone escaped", []Player{killerAt(Vec2{}, 0), out(2, true, false), out(3, true, false)}, true},
		{"everyone died", []Player{killerAt(Vec2{}, 0), out(2, false, true), out(3, false, true)}, true},
		{"some of each", []Player{killerAt(Vec2{}, 0), out(2, true, false), out(3, false, true)}, true},
		{"one still running", []Player{killerAt(Vec2{}, 0), out(2, true, false), out(3, false, false)}, false},
		{"one still downed", []Player{killerAt(Vec2{}, 0), out(2, true, false), downed}, false},
		{"one still on a hook", []Player{killerAt(Vec2{}, 0), out(2, false, true), onHook}, false},
		{"no survivors yet", []Player{killerAt(Vec2{}, 0)}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			withHooks(t, Vec2{50 * m, 50 * m})
			s := Step(State{Players: tt.players}, nil)
			if s.Over != tt.want {
				t.Errorf("over = %v, want %v", s.Over, tt.want)
			}
		})
	}
}

func TestLastHookDeathEndsTheMatch(t *testing.T) {
	withHooks(t, Vec2{})
	s := State{Players: []Player{killerAt(Vec2{5 * m, 0}, 0), out(2, true, false), hooked(HookTicks - 1)}}
	s = Step(s, nil)
	if !s.Over {
		t.Error("the last survivor died on the hook but the match goes on")
	}
}

func TestOverFreezesTheMatch(t *testing.T) {
	withHooks(t)
	s := State{Over: true, Tick: 10, Players: []Player{killerAt(Vec2{}, 0), out(2, true, false)}}
	before := s.Players[0]
	s = Step(s, map[PlayerID]Input{1: {MoveX: MaxAxis, Attack: true, Yaw: 500}})
	if !s.Over || s.Tick != 11 {
		t.Errorf("over %v tick %d, want over at tick 11", s.Over, s.Tick)
	}
	if s.Players[0] != before {
		t.Errorf("a finished match changed: %+v", s.Players[0])
	}
}
