package sim

import "testing"

// withWalls swaps the map layout for one test.
func withWalls(t *testing.T, boxes ...Box) {
	t.Helper()
	old := Walls
	Walls = boxes
	t.Cleanup(func() { Walls = old })
}

func TestStepCollision(t *testing.T) {
	// A wall 1 m thick spanning x 5..6 m, y -5..5 m. The player is a square
	// with half-size PlayerRadius, so its centre stops PlayerRadius short.
	wall := Box{MinX: 5_000_000, MinY: -5_000_000, MaxX: 6_000_000, MaxY: 5_000_000}
	face := int32(5_000_000 - PlayerRadius)

	tests := []struct {
		name  string
		start Vec2
		input Input
		ticks int
		want  Vec2
	}{
		{"stops against the west face", Vec2{face - 50_000, 0}, Input{127, 0}, 1, Vec2{face, 0}},
		{"keeps pushing without moving", Vec2{face, 0}, Input{127, 0}, 5, Vec2{face, 0}},
		{"slides along the wall", Vec2{face, 0}, Input{127, 127}, 1, Vec2{face, 94488}},
		{"stops against the east face", Vec2{6_000_000 + PlayerRadius + 50_000, 0}, Input{-127, 0}, 1, Vec2{6_000_000 + PlayerRadius, 0}},
		{"walks around the end", Vec2{face, 5_000_000 + PlayerRadius}, Input{127, 0}, 1, Vec2{face + 133333, 5_000_000 + PlayerRadius}},
		{"free space is untouched", Vec2{0, 0}, Input{127, 0}, 1, Vec2{133333, 0}},
		{"map edge still clamps", Vec2{29_950_000, 20_000_000}, Input{127, 0}, 1, Vec2{30_000_000, 20_000_000}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			withWalls(t, wall)
			s := State{Players: []Player{{ID: 1, Role: Survivor, Pos: tt.start}}}
			for range tt.ticks {
				s = Step(s, map[PlayerID]Input{1: tt.input})
			}
			if s.Players[0].Pos != tt.want {
				t.Errorf("pos = %v, want %v", s.Players[0].Pos, tt.want)
			}
		})
	}
}

func TestStepCollisionCorner(t *testing.T) {
	// Diagonal into a corner must not tunnel through or stick inside it.
	withWalls(t, Box{MinX: 5_000_000, MinY: 5_000_000, MaxX: 6_000_000, MaxY: 6_000_000})
	s := State{Players: []Player{{ID: 1, Role: Killer, Pos: Vec2{0, 0}}}}
	for range 600 {
		s = Step(s, map[PlayerID]Input{1: {127, 127}})
		if inWall(s.Players[0].Pos) {
			t.Fatalf("tick %d: player inside wall at %v", s.Tick, s.Players[0].Pos)
		}
	}
}

func TestLayoutIsValid(t *testing.T) {
	for i, w := range Walls {
		if w.MinX >= w.MaxX || w.MinY >= w.MaxY {
			t.Errorf("wall %d is empty or inverted: %+v", i, w)
		}
		if w.MinX < -MapHalfExtent || w.MaxX > MapHalfExtent || w.MinY < -MapHalfExtent || w.MaxY > MapHalfExtent {
			t.Errorf("wall %d leaves the map: %+v", i, w)
		}
	}
	for _, spawn := range []Vec2{{-10_000_000, 0}, {10_000_000, 0}, {10_000_000, 4_000_000}, {10_000_000, -4_000_000}, {14_000_000, 0}} {
		if inWall(spawn) {
			t.Errorf("spawn %v is inside a wall", spawn)
		}
	}
}
