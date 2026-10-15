package sim

// Generator is one repairable machine. Its site is fixed by the map, so the
// state only carries how far along it is, in repair ticks.
type Generator struct{ Progress int32 }

// Done reports whether the generator is fully repaired.
func (g Generator) Done() bool { return g.Progress >= GeneratorTicks }

// CheckResult is how a player's last skill check ended.
type CheckResult uint8

const (
	CheckNone CheckResult = iota
	CheckHit
	CheckMiss
)

// stepRepair advances one survivor's repair and skill check for this tick.
// It reads in.Act and in.Skill, and updates p and gens in place. gens is the
// next state's own slice, so the caller's state is never touched. Each
// player draws from their own Rng, so one player's checks never depend on
// who else is repairing and a guest can predict its own checks exactly.
func stepRepair(p *Player, in Input, hasInput bool, gens []Generator) {
	gen := -1
	if p.Role == Survivor && hasInput && in.Act {
		gen = repairable(p.Pos, gens)
	}
	p.Repairing = gen >= 0

	press := hasInput && in.Skill && !p.SkillHeld
	if hasInput {
		p.SkillHeld = in.Skill
	}

	if gen < 0 {
		if p.CheckActive {
			// Letting go in the middle of a check is a miss, so it cannot be dodged.
			missCheck(p, gens, nearest(p.Pos))
		}
		return
	}

	g := &gens[gen]
	g.Progress = min(g.Progress+1, GeneratorTicks)

	if !p.CheckActive {
		if p.CheckIn <= 0 {
			p.CheckIn = int16(CheckMinGap + rand(&p.Rng)%(CheckMaxGap-CheckMinGap+1))
		}
		p.CheckIn--
		if p.CheckIn > 0 {
			return
		}
		p.CheckActive = true
		p.CheckAge = 0
		p.CheckZone = uint8(CheckZoneMin + rand(&p.Rng)%(CheckZoneMax-CheckZoneMin+1))
		p.CheckResult = CheckNone
		return
	}

	p.CheckAge++
	switch {
	case press && p.CheckAge >= int16(p.CheckZone) && p.CheckAge < int16(p.CheckZone)+CheckZoneLen:
		g.Progress = min(g.Progress+CheckBonus, GeneratorTicks)
		endCheck(p, CheckHit)
	case press || p.CheckAge >= CheckDuration:
		g.Progress = max(g.Progress-CheckPenalty, 0)
		endCheck(p, CheckMiss)
	}
}

// missCheck ends a check the player abandoned, charging the penalty to the
// generator they were standing at, if any.
func missCheck(p *Player, gens []Generator, gen int) {
	if gen >= 0 {
		gens[gen].Progress = max(gens[gen].Progress-CheckPenalty, 0)
	}
	endCheck(p, CheckMiss)
}

func endCheck(p *Player, r CheckResult) {
	p.CheckActive = false
	p.CheckResult = r
	p.CheckIn = int16(CheckMinGap + rand(&p.Rng)%(CheckMaxGap-CheckMinGap+1))
}

// repairable is the nearest unfinished generator within RepairRange, or -1.
func repairable(pos Vec2, gens []Generator) int {
	best, bestD := -1, int64(RepairRange)*int64(RepairRange)+1
	for i, site := range GenSites {
		if i >= len(gens) || gens[i].Done() {
			continue
		}
		if d := distSq(pos, site); d < bestD {
			best, bestD = i, d
		}
	}
	return best
}

// nearest is the closest generator site within RepairRange, finished or not.
func nearest(pos Vec2) int {
	best, bestD := -1, int64(RepairRange)*int64(RepairRange)+1
	for i, site := range GenSites {
		if d := distSq(pos, site); d < bestD {
			best, bestD = i, d
		}
	}
	return best
}

func distSq(a, b Vec2) int64 {
	dx, dy := int64(a.X)-int64(b.X), int64(a.Y)-int64(b.Y)
	return dx*dx + dy*dy
}

// rand is xorshift32, so the same seed always draws the same checks on
// every platform, and the state fits a JavaScript number exactly. A zero
// state would stick at zero, so it is replaced.
func rand(state *uint32) int {
	x := *state
	if x == 0 {
		x = 0x9E3779B9
	}
	x ^= x << 13
	x ^= x >> 17
	x ^= x << 5
	*state = x
	return int(x >> 1)
}
