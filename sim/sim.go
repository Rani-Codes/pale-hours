// Package sim is the deterministic, authoritative game simulation.
package sim

import "math"

type PlayerID uint8

type Role uint8

const (
	Survivor Role = iota
	Killer
)

// Vec2 is a position on the plane in micrometers.
type Vec2 struct{ X, Y int32 }

// Input is one tick of a player's intent. MoveX and MoveY are a world-space
// direction where MaxAxis on one axis means full speed.
type Input struct{ MoveX, MoveY int8 }

type Player struct {
	ID   PlayerID
	Role Role
	Pos  Vec2
}

type State struct {
	Tick    uint32
	Players []Player
}

// Step advances the state by one tick. A player with no entry in inputs
// stands still. The input state is not modified.
func Step(s State, inputs map[PlayerID]Input) State {
	next := State{Tick: s.Tick + 1, Players: make([]Player, len(s.Players))}
	for i, p := range s.Players {
		p.Pos = move(p.Pos, inputs[p.ID], roleSpeed[p.Role])
		next.Players[i] = p
	}
	return next
}

func move(pos Vec2, in Input, speed int64) Vec2 {
	dx, dy := int64(in.MoveX), int64(in.MoveY)
	// Clients can send any int8, including diagonals longer than full speed
	// and -128, so cap the direction's length at MaxAxis.
	if lenSq := dx*dx + dy*dy; lenSq > MaxAxis*MaxAxis {
		l := int64(math.Sqrt(float64(lenSq)))
		dx, dy = dx*MaxAxis/l, dy*MaxAxis/l
	}
	return Vec2{
		X: clamp(int64(pos.X) + dx*speed/(MaxAxis*TickRate)),
		Y: clamp(int64(pos.Y) + dy*speed/(MaxAxis*TickRate)),
	}
}

func clamp(v int64) int32 {
	return int32(min(max(v, -MapHalfExtent), MapHalfExtent))
}
