package sim

// vaultBoxes are the waist-high walls a survivor can cross: the map's vaults
// and every dropped pallet.
func vaultBoxes(pallets []Pallet) []Box {
	boxes := append([]Box(nil), Vaults...)
	for i, p := range pallets {
		if i < len(PalletSites) && p.State == PalletDown {
			boxes = append(boxes, PalletSites[i])
		}
	}
	return boxes
}

// startVault begins a vault if p is a survivor on their feet, with no skill
// check waiting for the key, standing at a vault with clear ground on the
// far side. It reports whether one started.
func startVault(p *Player, pallets []Pallet) bool {
	if p.Role != Survivor || p.Health == Downed || p.Carried || p.OnHook != 0 || p.CheckActive {
		return false
	}
	for _, v := range vaultBoxes(pallets) {
		if to, ok := vaultLanding(p.Pos, v); ok {
			p.VaultFrom, p.VaultTo, p.VaultTicks = p.Pos, to, VaultTicks
			return true
		}
	}
	return false
}

// vaultLanding is where a survivor at pos lands going over v: straight
// across its thin side, just clear of the far face. They must be within the
// opening's span and within VaultReach of the near face, and the landing
// must be free.
func vaultLanding(pos Vec2, v Box) (Vec2, bool) {
	// Work along the thin axis as "a" and the long one as "b".
	acrossX := v.MaxX-v.MinX < v.MaxY-v.MinY
	a, b, lo, hi, bLo, bHi := pos.X, pos.Y, v.MinX, v.MaxX, v.MinY, v.MaxY
	if !acrossX {
		a, b, lo, hi, bLo, bHi = pos.Y, pos.X, v.MinY, v.MaxY, v.MinX, v.MaxX
	}
	if b < bLo || b > bHi {
		return Vec2{}, false
	}
	var land int32
	switch {
	case lo-a >= PlayerRadius && lo-a <= PlayerRadius+VaultReach:
		land = hi + PlayerRadius + VaultClear
	case a-hi >= PlayerRadius && a-hi <= PlayerRadius+VaultReach:
		land = lo - PlayerRadius - VaultClear
	default:
		return Vec2{}, false
	}
	to := Vec2{land, b}
	if !acrossX {
		to = Vec2{b, land}
	}
	return to, !inWall(to)
}

// CanVault is startVault's position test, for the tools and the HUD: could
// a survivor standing at pos vault right now.
func CanVault(pos Vec2, pallets []Pallet) bool {
	for _, v := range vaultBoxes(pallets) {
		if _, ok := vaultLanding(pos, v); ok {
			return true
		}
	}
	return false
}

// stepVault moves a vaulting survivor one tick along the line, landing
// exactly on VaultTo at the end.
func stepVault(p *Player) {
	done := int64(VaultTicks - p.VaultTicks + 1)
	lerp := func(from, to int32) int32 { return int32(int64(from) + (int64(to)-int64(from))*done/VaultTicks) }
	p.Pos = Vec2{lerp(p.VaultFrom.X, p.VaultTo.X), lerp(p.VaultFrom.Y, p.VaultTo.Y)}
	p.VaultTicks--
}
