package sim

import "math"

// Health is how hurt a survivor is. Each hit moves them one step down.
type Health uint8

const (
	Healthy Health = iota
	Injured
	Downed
)

// SwingPhase is where the killer is in an attack.
type SwingPhase uint8

const (
	SwingIdle SwingPhase = iota
	SwingWindup
	SwingRecover
)

// SwingResult is how the killer's last swing ended.
type SwingResult uint8

const (
	SwingNone SwingResult = iota
	SwingHit
	SwingMiss
)

var attackCos = math.Cos(AttackHalfAngleDeg * math.Pi / 180)

// stepSwing advances the killer's attack. A windup that reaches zero is
// left for resolveSwing, which runs after every player has moved. Without
// an input the swing does not advance, so a guest never decides a hit.
func stepSwing(p *Player, in Input, hasInput bool) {
	if p.Role != Killer || !hasInput {
		return
	}
	press := in.Attack && !p.AttackHeld
	p.AttackHeld = in.Attack
	switch p.Swing {
	case SwingIdle:
		if press && p.Carrying == 0 {
			p.Swing, p.SwingTicks = SwingWindup, AttackWindupTicks
		}
	case SwingWindup:
		p.SwingTicks--
	case SwingRecover:
		if p.SwingTicks--; p.SwingTicks <= 0 {
			p.Swing, p.SwingTicks = SwingIdle, 0
		}
	}
}

// resolveSwing hits the nearest survivor in the killer's cone, checked
// against where each survivor stood lagMs ago, and starts the recovery.
func resolveSwing(k *Player, players []Player, now uint32, lagMs uint16) {
	best, bestD := -1, math.Inf(1)
	for i, p := range players {
		if p.Role != Survivor || p.Escaped || p.Eliminated || p.Health == Downed {
			continue
		}
		if d, ok := reach(k.Pos, k.Yaw, rewound(p, now, lagMs)); ok && d < bestD {
			best, bestD = i, d
		}
	}
	k.Swing, k.SwingTicks, k.SwingResult = SwingRecover, AttackRecoverMissTicks, SwingMiss
	if best < 0 {
		return
	}
	k.SwingTicks, k.SwingResult = AttackRecoverHitTicks, SwingHit
	v := &players[best]
	v.Health++
	if v.Health == Injured {
		v.Boost = HitBoostTicks
	}
}

// rewound is where p stood lagMs before tick now, capped at RewindCapMs,
// interpolated between the two trail entries around it.
func rewound(p Player, now uint32, lagMs uint16) Vec2 {
	q := int64(min(lagMs, RewindCapMs)) * TickRate // thousandths of a tick
	back, frac := uint32(q/1000), q%1000
	a, b := p.Trail[(now-back)%TrailLen], p.Trail[(now-back-1)%TrailLen]
	return Vec2{
		int32(int64(a.X) + (int64(b.X)-int64(a.X))*frac/1000),
		int32(int64(a.Y) + (int64(b.Y)-int64(a.Y))*frac/1000),
	}
}

// reach reports whether a swing from pos facing yaw touches a survivor body
// centred at target, and how far the nearest touching point is. The body is
// sampled at its centre, corners and edge midpoints; a point counts when it
// is in range, inside the cone, and no wall or generator stands in between.
func reach(pos Vec2, yaw uint16, target Vec2) (float64, bool) {
	sin, cos := math.Sincos(float64(yaw) / 65536 * 2 * math.Pi)
	best, ok := math.Inf(1), false
	for _, ox := range [...]int32{-PlayerRadius, 0, PlayerRadius} {
		for _, oy := range [...]int32{-PlayerRadius, 0, PlayerRadius} {
			pt := Vec2{target.X + ox, target.Y + oy}
			dx, dy := float64(pt.X)-float64(pos.X), float64(pt.Y)-float64(pos.Y)
			d := math.Hypot(dx, dy)
			if d > AttackRange || d >= best {
				continue
			}
			// Facing 0 is +Y and grows clockwise, so forward is (sin, cos).
			if d > 0 && dx*sin+dy*cos < d*attackCos {
				continue
			}
			if blocked(pos, pt) {
				continue
			}
			best, ok = d, true
		}
	}
	return best, ok
}

// blocked reports whether the segment from a to b passes through the inside
// of a wall or a generator. Grazing a face does not count.
func blocked(a, b Vec2) bool {
	for _, w := range Walls {
		if crosses(a, b, w) {
			return true
		}
	}
	for _, g := range GenSites {
		if crosses(a, b, Box{g.X - GeneratorHalf, g.Y - GeneratorHalf, g.X + GeneratorHalf, g.Y + GeneratorHalf}) {
			return true
		}
	}
	return false
}

// crosses is the slab test: the parameter range where the segment is inside
// the box on both axes must be non-empty and of positive length.
func crosses(a, b Vec2, w Box) bool {
	t0, t1 := 0.0, 1.0
	for _, ax := range [...]struct{ p, d, lo, hi float64 }{
		{float64(a.X), float64(b.X) - float64(a.X), float64(w.MinX), float64(w.MaxX)},
		{float64(a.Y), float64(b.Y) - float64(a.Y), float64(w.MinY), float64(w.MaxY)},
	} {
		if ax.d == 0 {
			if ax.p <= ax.lo || ax.p >= ax.hi {
				return false
			}
			continue
		}
		lo, hi := (ax.lo-ax.p)/ax.d, (ax.hi-ax.p)/ax.d
		if lo > hi {
			lo, hi = hi, lo
		}
		t0, t1 = max(t0, lo), min(t1, hi)
	}
	return t0 < t1
}

// InReach is reach for the tools: whether a swing from pos facing yaw would
// touch a survivor standing at target right now.
func InReach(pos Vec2, yaw uint16, target Vec2) bool {
	_, ok := reach(pos, yaw, target)
	return ok
}
