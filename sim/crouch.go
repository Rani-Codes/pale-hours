package sim

// Hidden reports whether this survivor has crouched in tall grass long enough
// to be out of sight.
func (p Player) Hidden() bool { return p.HideTicks >= HideSettleTicks }

// Concealed reports whether a killer standing at viewer cannot see p: p is
// hidden and farther off than HideRevealRange. A hidden survivor can still be
// hit; this only decides what the killer's screen shows.
func Concealed(viewer Vec2, p Player) bool {
	if !p.Hidden() {
		return false
	}
	dx, dy := int64(p.Pos.X-viewer.X), int64(p.Pos.Y-viewer.Y)
	return dx*dx+dy*dy > HideRevealRange*HideRevealRange
}

// inGrass reports whether a point is inside a patch of tall grass.
func inGrass(pos Vec2) bool {
	for _, g := range Grass {
		if pos.X > g.MinX && pos.X < g.MaxX && pos.Y > g.MinY && pos.Y < g.MaxY {
			return true
		}
	}
	return false
}

// canCrouch is whether a survivor in this state may get low: not downed, hit
// and running, carried, hooked or mid-vault.
func canCrouch(p Player) bool {
	return p.Role == Survivor && p.Health != Downed && p.Boost == 0 && !p.Carried && p.OnHook == 0 && p.VaultTicks == 0
}

// stepHide counts how long a survivor has been crouched in grass.
func stepHide(p *Player) {
	if p.Crouching && inGrass(p.Pos) {
		p.HideTicks = min(p.HideTicks+1, HideSettleTicks)
	} else {
		p.HideTicks = 0
	}
}
