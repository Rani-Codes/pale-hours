package sim

import "testing"

func TestTheKillerStandsStillAtTheStart(t *testing.T) {
	withMap(t, nil, nil)
	k := killerAt(Vec2{}, 0)
	k.Freeze = SpawnFreezeTicks
	s := State{Players: []Player{k, target(2, Vec2{5 * m, 5 * m}, Healthy)}}
	go_ := map[PlayerID]Input{1: {MoveX: 127, Attack: true}, 2: {MoveX: 127}}
	for range SpawnFreezeTicks - 1 {
		s = Step(s, go_)
	}
	if k := s.Players[0]; k.Pos != (Vec2{}) || k.Swing != SwingIdle || k.Freeze != 1 {
		t.Fatalf("killer moved to %v, swing %d, freeze %d: want still, idle, 1 tick left", k.Pos, k.Swing, k.Freeze)
	}
	if s.Players[1].Pos.X <= 5*m {
		t.Fatal("the survivor was held too")
	}
	s = Step(s, go_)
	s = Step(s, map[PlayerID]Input{1: {MoveX: 127}})
	if s.Players[0].Pos.X <= 0 {
		t.Fatalf("killer still frozen after %d ticks", SpawnFreezeTicks)
	}
}

func TestTheStartFreezeIsFiveSeconds(t *testing.T) {
	if SpawnFreezeTicks != 5*TickRate {
		t.Fatalf("SpawnFreezeTicks %d, want 5 s", SpawnFreezeTicks)
	}
}
