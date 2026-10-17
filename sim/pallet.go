package sim

import "slices"

// PalletState is where a pallet is in its one life: standing, thrown down,
// then broken for good.
type PalletState uint8

const (
	PalletUp PalletState = iota
	PalletDown
	PalletBroken
)

// Pallet is one entry of State.Pallets, parallel to PalletSites. Break counts
// the ticks the killer has held E on it while it lies dropped.
type Pallet struct {
	State PalletState
	Break int16
}

// distToBoxSq is the squared distance from pos to the nearest point of b.
func distToBoxSq(pos Vec2, b Box) int64 {
	dx := int64(max(b.MinX-pos.X, 0, pos.X-b.MaxX))
	dy := int64(max(b.MinY-pos.Y, 0, pos.Y-b.MaxY))
	return dx*dx + dy*dy
}

// dropPallet is the index of the standing pallet p throws down, or -1: a
// survivor on their feet, with no skill check waiting for the key, within
// PalletReach of it. Even standing in its footprint will do; they are pushed
// out to their own side when it lands.
func dropPallet(p *Player, pallets []Pallet) int {
	if p.Role != Survivor || p.Health == Downed || p.Carried || p.OnHook != 0 || p.CheckActive {
		return -1
	}
	best, bestD := -1, int64(PalletReach)*int64(PalletReach)+1
	for i, pl := range pallets {
		if i >= len(PalletSites) || pl.State != PalletUp {
			continue
		}
		if d := distToBoxSq(p.Pos, PalletSites[i]); d < bestD {
			best, bestD = i, d
		}
	}
	return best
}

// landPallet is what a pallet does the tick it falls: anyone standing in its
// footprint is pushed out to the side they were on, and a killer within
// PalletStunRange is stunned and loses his swing.
func landPallet(b Box, players []Player) {
	for i := range players {
		q := &players[i]
		if q.Escaped || q.Eliminated {
			continue
		}
		if inGrown(q.Pos, b) {
			q.Pos = pushedOut(q.Pos, b)
		}
		if q.Role == Killer && distToBoxSq(q.Pos, b) <= int64(PalletStunRange)*int64(PalletStunRange) {
			q.Stun = max(q.Stun, PalletStunTicks)
			q.Swing, q.SwingTicks = SwingIdle, 0
		}
	}
}

// pushedOut moves pos across the thin axis of b to the face on its own side.
func pushedOut(pos Vec2, b Box) Vec2 {
	if b.MaxY-b.MinY < b.MaxX-b.MinX {
		if pos.Y >= (b.MinY+b.MaxY)/2 {
			pos.Y = b.MaxY + PlayerRadius
		} else {
			pos.Y = b.MinY - PlayerRadius
		}
	} else if pos.X >= (b.MinX+b.MaxX)/2 {
		pos.X = b.MaxX + PlayerRadius
	} else {
		pos.X = b.MinX - PlayerRadius
	}
	return pos
}

// stepPalletBreak advances the killer's work on each dropped pallet: he must
// hold E within reach, empty-handed and not stunned, and letting go starts it
// over. A killer who pressed E this tick (pressed holds their indexes) spent
// it on picking up, hanging or dropping, so it does not count.
func stepPalletBreak(pallets []Pallet, players []Player, pressed []int) {
	for i := range pallets {
		if i >= len(PalletSites) || pallets[i].State != PalletDown {
			continue
		}
		breaking := false
		for j, k := range players {
			if !slices.Contains(pressed, j) && k.Role == Killer && k.ActHeld && k.Carrying == 0 && k.Stun == 0 && !k.Escaped && !k.Eliminated &&
				distToBoxSq(k.Pos, PalletSites[i]) <= int64(PalletBreakReach)*int64(PalletBreakReach) {
				breaking = true
				break
			}
		}
		if !breaking {
			pallets[i].Break = 0
			continue
		}
		if pallets[i].Break++; pallets[i].Break >= PalletBreakTicks {
			pallets[i] = Pallet{State: PalletBroken}
		}
	}
}
