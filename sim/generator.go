package sim

// Generator is one repairable machine. Its site is fixed by the map, so the
// state only carries how far along it is, in repair ticks.
type Generator struct {
	Progress int32
	// Noise counts down the ticks a missed skill check stays loud. The killer
	// sees where it came from while it is above zero.
	Noise int16
}

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
// It reads in.Act and press (the skill key went down this tick), and
// updates p and gens in place. gens is the next state's own slice, so the
// caller's state is never touched. Each player draws from their own Rng, so
// one player's checks never depend on who else is repairing and a guest can
// predict its own checks exactly.
func stepRepair(p *Player, in Input, hasInput, press bool, gens []Generator) {
	gen := -1
	if p.Role == Survivor && hasInput && in.Act {
		gen = repairable(p.Pos, gens)
	}
	p.Repairing = gen >= 0

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
		countdownCheck(p)
		return
	}

	switch r := judgeCheck(p, press); r {
	case CheckHit:
		g.Progress = min(g.Progress+CheckBonus, GeneratorTicks)
		endCheck(p, r)
	case CheckMiss:
		g.Progress = max(g.Progress-CheckPenalty, 0)
		g.Noise = NoiseTicks
		endCheck(p, r)
	}
}

// countdownCheck counts down to the next check and starts it when due.
func countdownCheck(p *Player) {
	if p.CheckIn--; p.CheckIn > 0 {
		return
	}
	p.CheckActive = true
	p.CheckAge = 0
	p.CheckZone = uint8(CheckZoneMin + rand(&p.Rng)%(CheckZoneMax-CheckZoneMin+1))
	p.CheckResult = CheckNone
}

// judgeCheck advances an active check one tick: a hit for a press in the
// zone, a miss for any other press or for running out, otherwise none yet.
func judgeCheck(p *Player, press bool) CheckResult {
	p.CheckAge++
	switch {
	case press && p.CheckAge >= int16(p.CheckZone) && p.CheckAge < int16(p.CheckZone)+CheckZoneLen:
		return CheckHit
	case press || p.CheckAge >= CheckDuration:
		return CheckMiss
	}
	return CheckNone
}

// missCheck ends a check the player abandoned, charging the penalty to the
// generator they were standing at, if any.
func missCheck(p *Player, gens []Generator, gen int) {
	if gen >= 0 {
		gens[gen].Progress = max(gens[gen].Progress-CheckPenalty, 0)
		gens[gen].Noise = NoiseTicks
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

// Gate is one exit. It opens by hand once enough generators are done.
type Gate struct{ Progress int32 }

// Open reports whether survivors can walk out through the gate.
func (g Gate) Open() bool { return g.Progress >= GateTicks }

// gensDone counts finished generators.
func gensDone(gens []Generator) int {
	n := 0
	for _, g := range gens {
		if g.Done() {
			n++
		}
	}
	return n
}

// stepGate opens a powered gate for a survivor holding Act beside it. open
// is the gates as the tick began, so who escapes never depends on the order
// players are processed in.
func stepGate(p *Player, in Input, hasInput bool, gates []Gate, open []Gate, powered bool) {
	if p.Role != Survivor {
		return
	}
	for i, site := range GateSites {
		if i >= len(gates) || distSq(p.Pos, site) > int64(GateRange)*int64(GateRange) {
			continue
		}
		if open[i].Open() {
			p.Escaped = true
			return
		}
		if powered && hasInput && in.Act {
			gates[i].Progress = min(gates[i].Progress+1, GateTicks)
			p.Repairing = true
		}
		return
	}
}
