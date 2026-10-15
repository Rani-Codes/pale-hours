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
// direction where MaxAxis on one axis means full speed. Yaw is where the
// player faces, in 1/65536 turns: 0 is +Y (north) and it grows clockwise.
type Input struct {
	MoveX, MoveY int8
	Yaw          uint16
}

type Player struct {
	ID   PlayerID
	Role Role
	Pos  Vec2
	Yaw  uint16
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
		in, ok := inputs[p.ID]
		p.Pos = move(p.Pos, in, roleSpeed[p.Role])
		if ok {
			p.Yaw = in.Yaw
		}
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
	// Resolve each axis on its own so a player slides along a wall.
	next := pos
	next.X = clamp(int64(pos.X) + dx*speed/(MaxAxis*TickRate))
	if w, ok := hitWall(next); ok {
		next.X = w.MaxX + PlayerRadius
		if dx > 0 {
			next.X = w.MinX - PlayerRadius
		}
	}
	next.Y = clamp(int64(pos.Y) + dy*speed/(MaxAxis*TickRate))
	if w, ok := hitWall(next); ok {
		next.Y = w.MaxY + PlayerRadius
		if dy > 0 {
			next.Y = w.MinY - PlayerRadius
		}
	}
	return next
}

func clamp(v int64) int32 {
	return int32(min(max(v, -MapHalfExtent), MapHalfExtent))
}
