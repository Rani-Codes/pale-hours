package sim

// stepStruggle is a carried survivor flailing: each press of E or Q that is
// not the same key as the last counted one takes StruggleTicks off the carry,
// so mashing one key does nothing and quick alternation frees them in
// seconds. Step settles the break-free once every player has moved.
func stepStruggle(p *Player, e, q bool) {
	if !p.Carried {
		p.StruggleLast = 0
		return
	}
	for _, k := range [...]struct {
		down bool
		key  uint8
	}{{e, 1}, {q, 2}} {
		if k.down && p.StruggleLast != k.key {
			p.Recover += StruggleTicks
			p.StruggleLast = k.key
		}
	}
}
