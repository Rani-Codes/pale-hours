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
	// Act is held to repair. Skill is a skill check press and Attack the
	// killer's swing; the sim only counts the tick each goes down, so
	// holding one does nothing.
	Act, Skill, Attack bool
	// Alt is the second struggle key (Q): a survivor on the killer's shoulder
	// alternates it with Act to wriggle free faster.
	Alt bool
	// Crouch is held to get low. A crouched survivor walks slowly, cannot
	// repair, open a gate or vault, and hides in tall grass.
	Crouch bool
	// ViewLagMs is how far behind this tick the attacker's screen showed the
	// other players. The host measures it; a swing rewinds survivors by it,
	// up to RewindCapMs.
	ViewLagMs uint16
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
	Escaped     bool   // walked out down an exit lane; out of play
	Opening     uint8  // the gate they are opening, plus one, or 0

	// Crouching is set while a survivor is held low. HideTicks counts how long
	// they have been crouched in grass, up to HideSettleTicks.
	Crouching bool
	HideTicks int16

	Health  Health
	Boost   int16 // ticks of shove left after being hit
	Recover int16 // ticks spent downed and left alone; reaching DownedRecoverTicks stands them up

	// Helping is the downed teammate this survivor is getting up, or 0.
	// Their skill checks are help checks while it is set.
	Helping PlayerID

	// Carry and hook. Carrying is on the killer, the rest on the survivor.
	ActHeld bool // E was down last tick; the killer acts on presses
	AltHeld bool // Q was down last tick
	// StruggleLast is the key (1 E, 2 Q, 0 neither) of the last counted press
	// while carried; the next must be the other one.
	StruggleLast uint8
	Carrying     PlayerID
	Carried      bool
	OnHook       uint8 // 0, or the index into HookSites plus one
	HookUsed     int16 // ticks spent on hooks, ever; at HookTicks they are eliminated
	Rescue       int16 // ticks a teammate has held E to unhook them, this hold
	Eliminated   bool  // died on a hook; out of play
	Stun         int16 // ticks the killer is stunned: no moving, swinging or E

	// A vault in progress: ticks left, and the straight line it follows.
	VaultTicks         int16
	VaultFrom, VaultTo Vec2

	// The killer's attack.
	AttackHeld  bool
	Swing       SwingPhase
	SwingTicks  int16 // ticks left in the current phase
	SwingResult SwingResult

	// Trail is where this player stood at the end of each recent tick,
	// indexed by tick % TrailLen, so a swing can be checked in the past.
	Trail [TrailLen]Vec2
}

type State struct {
	Tick    uint32
	Players []Player
	// Gens runs parallel to GenSites.
	Gens []Generator
	// Gates runs parallel to GateSites.
	Gates []Gate
	// Pallets runs parallel to PalletSites.
	Pallets []Pallet
	// Over is set once every survivor has escaped or been eliminated. From
	// then on the match is frozen: only Tick moves.
	Over bool
}

// Step advances the state by one tick. A player with no entry in inputs
// stands still. The input state is not modified.
func Step(s State, inputs map[PlayerID]Input) State {
	next := State{Tick: s.Tick + 1, Players: make([]Player, len(s.Players)), Gens: append([]Generator(nil), s.Gens...), Gates: append([]Gate(nil), s.Gates...), Pallets: append([]Pallet(nil), s.Pallets...), Over: s.Over}
	if s.Over {
		copy(next.Players, s.Players)
		return next
	}
	for i := range next.Gens {
		next.Gens[i].Noise = max(next.Gens[i].Noise-1, 0)
	}
	powered := gensDone(s.Gens) >= GensRequired
	shut := [...]blockers{Survivor: blockersFor(Survivor, s.Gates, s.Pallets), Killer: blockersFor(Killer, s.Gates, s.Pallets)}
	var helped []PlayerID
	var thrown []int
	var killerPresses []int
	for i, p := range s.Players {
		if p.Escaped || p.Eliminated {
			next.Players[i] = p
			continue
		}
		in, ok := inputs[p.ID]
		if p.Stun > 0 {
			p.Stun--
			in = Input{Yaw: in.Yaw} // he can still look around
		}
		actPress := ok && in.Act && !p.ActHeld
		skillPress := ok && in.Skill && !p.SkillHeld
		altPress := ok && in.Alt && !p.AltHeld
		if ok {
			p.Yaw = in.Yaw
			p.ActHeld, p.SkillHeld, p.AltHeld = in.Act, in.Skill, in.Alt
		}
		stepStruggle(&p, actPress, altPress)
		// Low to the ground, hands off everything: no repairing, opening, or vaulting.
		p.Crouching = ok && in.Crouch && canCrouch(p)
		if p.Crouching {
			in.Act, skillPress = false, false
		}
		if p.VaultTicks == 0 && skillPress {
			if i := dropPallet(&p, next.Pallets); i >= 0 {
				next.Pallets[i].State = PalletDown
				thrown = append(thrown, i)
				skillPress = false
			} else if startVault(&p, next.Pallets) {
				skillPress = false
			}
		}
		before := p.Pos
		switch {
		case p.VaultTicks > 0:
			stepVault(&p)
			in, skillPress = Input{Yaw: in.Yaw}, false // over the wall, hands busy
		case !p.Carried && p.OnHook == 0:
			p.Pos = move(p.Pos, in, speed(p), shut[p.Role])
		}
		p.Trail[next.Tick%TrailLen] = p.Pos
		stepHide(&p, p.Pos != before)
		p.Boost = max(p.Boost-1, 0)
		if p.Health == Downed {
			in.Act = false
		}
		switch {
		case p.OnHook != 0:
			stepHookCheck(&p, skillPress)
		case p.Health == Downed:
			// Letting go of everything: an active skill check counts as a miss.
			stepGate(&p, in, ok, false, next.Gens, next.Gates, powered)
			stepRepair(&p, in, ok, false, next.Gens)
		default:
			if id := stepHelp(&p, in, ok, skillPress, s.Players, next.Gens); id != 0 {
				helped = append(helped, id)
			}
			switch {
			case p.Helping != 0:
				p.Repairing, p.Opening = false, 0
			default:
				p.Repairing = false
				stepGate(&p, in, ok, skillPress, next.Gens, next.Gates, powered)
				if p.Opening == 0 && !p.Repairing {
					stepRepair(&p, in, ok, skillPress, next.Gens)
				}
			}
		}
		if p.Role == Survivor && !p.Carried && p.OnHook == 0 && outThrough(p.Pos) {
			p.Escaped, p.Opening, p.CheckActive, p.Repairing = true, 0, false, false
		}
		stepSwing(&p, in, ok)
		stepDowned(&p)
		if p.Role == Killer && actPress {
			killerPresses = append(killerPresses, i)
		}
		next.Players[i] = p
	}
	// Everything that reaches across players happens once everyone has
	// moved, so it never depends on the order players are stored in.
	for _, i := range thrown {
		landPallet(PalletSites[i], next.Players)
	}
	for i := range next.Players {
		if k := &next.Players[i]; k.Swing == SwingWindup && k.SwingTicks == 0 {
			resolveSwing(k, next.Players, next.Tick, inputs[k.ID].ViewLagMs)
		}
	}
	for _, id := range helped {
		if v := find(next.Players, id); v != nil && v.Health == Downed && !v.Carried && v.OnHook == 0 {
			v.Health, v.Recover = Injured, 0
		}
	}
	for _, i := range killerPresses {
		killerAct(&next.Players[i], next.Players)
	}
	stepRescue(next.Players, inputs)
	stepPalletBreak(next.Pallets, next.Players, killerPresses)
	for i := range next.Players {
		k := &next.Players[i]
		if k.Carrying == 0 {
			continue
		}
		v := find(next.Players, k.Carrying)
		if v == nil {
			k.Carrying = 0
			continue
		}
		v.Pos = k.Pos
		v.Trail[next.Tick%TrailLen] = v.Pos
		if v.Recover >= DownedRecoverTicks {
			// Held too long: they get up on the killer's shoulder and break free.
			k.Carrying, k.Stun = 0, StunTicks
			v.Carried, v.Health, v.Recover = false, Injured, 0
		}
	}
	next.Over = matchOver(next.Players)
	return next
}

// matchOver reports whether there were survivors and none is left in play.
func matchOver(players []Player) bool {
	survivors := 0
	for _, p := range players {
		if p.Role != Survivor {
			continue
		}
		if !p.Escaped && !p.Eliminated {
			return false
		}
		survivors++
	}
	return survivors > 0
}

func find(players []Player, id PlayerID) *Player {
	for i := range players {
		if players[i].ID == id {
			return &players[i]
		}
	}
	return nil
}

func speed(p Player) int64 {
	switch {
	case p.Stun > 0:
		return 0
	case p.Role == Killer && p.Carrying != 0:
		return KillerCarrySpeed
	case p.Health == Downed:
		return CrawlSpeed
	case p.Boost > 0:
		return HitBoostSpeed
	case p.Crouching:
		return CrouchSpeed
	}
	return roleSpeed[p.Role]
}

// move walks pos along in at speed, stopped by walls and by whatever b
// shuts.
func move(pos Vec2, in Input, speed int64, shut blockers) Vec2 {
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
	if w, ok := hitWall(next, shut); ok {
		next.X = w.MaxX + PlayerRadius
		if dx > 0 {
			next.X = w.MinX - PlayerRadius
		}
	}
	next.Y = clamp(int64(pos.Y) + dy*speed/(MaxAxis*TickRate))
	if w, ok := hitWall(next, shut); ok {
		next.Y = w.MaxY + PlayerRadius
		if dy > 0 {
			next.Y = w.MinY - PlayerRadius
		}
	}
	return next
}

func clamp(v int64) int32 {
	return int32(min(max(v, -outer), outer))
}
