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
	// Act is held to repair. Skill is a skill check press; the sim only
	// counts the tick it goes down, so holding it does nothing.
	Act, Skill bool
}

type Player struct {
	ID   PlayerID
	Role Role
	Pos  Vec2
	Yaw  uint16

	// Repair and skill check state. All of it is sim state so every peer
	// sees the same checks and the host decides every outcome.
	Repairing   bool
	SkillHeld   bool
	CheckActive bool
	CheckResult CheckResult
	CheckZone   uint8  // tick the good zone starts, counted from CheckAge 0
	CheckAge    int16  // ticks since the active check began
	CheckIn     int16  // ticks of repairing until the next check
	Rng         uint32 // this player's skill check stream; seed it per player
	Escaped     bool   // left through a gate; out of play
}

type State struct {
	Tick    uint32
	Players []Player
	// Gens runs parallel to GenSites.
	Gens []Generator
	// Gates runs parallel to GateSites.
	Gates []Gate
}

// Step advances the state by one tick. A player with no entry in inputs
// stands still. The input state is not modified.
func Step(s State, inputs map[PlayerID]Input) State {
	next := State{Tick: s.Tick + 1, Players: make([]Player, len(s.Players)), Gens: append([]Generator(nil), s.Gens...), Gates: append([]Gate(nil), s.Gates...)}
	for i := range next.Gens {
		next.Gens[i].Noise = max(next.Gens[i].Noise-1, 0)
	}
	powered := gensDone(s.Gens) >= GensRequired
	for i, p := range s.Players {
		if p.Escaped {
			next.Players[i] = p
			continue
		}
		in, ok := inputs[p.ID]
		p.Pos = move(p.Pos, in, roleSpeed[p.Role])
		if ok {
			p.Yaw = in.Yaw
		}
		stepRepair(&p, in, ok, next.Gens)
		stepGate(&p, in, ok, next.Gates, s.Gates, powered)
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
