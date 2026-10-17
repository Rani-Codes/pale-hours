package sim

import "testing"

// swingFrom has the killer at pos facing yaw swing once at a survivor, and returns their health after.
func swingFrom(s State, yaw uint16) Health {
	s = Step(s, map[PlayerID]Input{1: {Attack: true, Yaw: yaw}})
	for range AttackWindupTicks {
		s = Step(s, map[PlayerID]Input{1: {Yaw: yaw}})
	}
	return s.Players[1].Health
}

// pickUp has the killer press E and says whether he now carries the survivor.
func pickUp(s State) bool {
	s = Step(s, map[PlayerID]Input{1: {Act: true}})
	return s.Players[0].Carrying != 0
}

func TestNoSwingOrPickupAcrossAWindow(t *testing.T) {
	east := uint16(16384)
	for _, tt := range []struct {
		name   string
		from   Vec2   // where the killer is
		to     Vec2   // where the survivor is
		swing  Health // want after a swing, from Healthy
		pickup bool
	}{
		{"across the window", west, vaultTo(true), Healthy, false},
		{"on his own side", Vec2{west.X - 1_100_000, 0}, west, Injured, true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			withVault(t)
			swung := State{Players: []Player{killerAt(tt.from, east), target(2, tt.to, Healthy)}}
			if got := swingFrom(swung, east); got != tt.swing {
				t.Errorf("swing left them %d, want %d", got, tt.swing)
			}
			down := State{Players: []Player{killerAt(tt.from, east), target(2, tt.to, Downed)}}
			if got := pickUp(down); got != tt.pickup {
				t.Errorf("pickup %v, want %v", got, tt.pickup)
			}
		})
	}
}

func TestNoSwingOrPickupAcrossADroppedPallet(t *testing.T) {
	north := uint16(0)
	killerPos, far := Vec2{0, -700_000}, Vec2{0, 700_000} // 1.4 m apart: inside both the swing and the pickup reach
	for _, tt := range []struct {
		name  string
		state PalletState
		hits  bool
	}{
		{"standing pallets are no barrier", PalletUp, true},
		{"a dropped pallet is", PalletDown, false},
		{"a broken one is gone", PalletBroken, true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			withPallets(t, testPallet)
			mk := func(h Health) State {
				s := palletState(killerAt(killerPos, north), target(2, far, h))
				s.Pallets[0].State = tt.state
				return s
			}
			want := Healthy
			if tt.hits {
				want = Injured
			}
			if got := swingFrom(mk(Healthy), north); got != want {
				t.Errorf("swing left them %d, want %d", got, want)
			}
			if got := pickUp(mk(Downed)); got != tt.hits {
				t.Errorf("pickup %v, want %v", got, tt.hits)
			}
		})
	}
}

func TestNoPickupThroughAWall(t *testing.T) {
	withMap(t, []Box{{-1 * m, 500_000, 1 * m, 600_000}}, nil)
	s := State{Players: []Player{killerAt(Vec2{}, 0), target(2, Vec2{0, 1_100_000}, Downed)}}
	if pickUp(s) {
		t.Fatal("the killer picked a survivor up through a wall")
	}
}

func TestAVaultingSurvivorCannotBeHitOnTheWindow(t *testing.T) {
	east := uint16(16384)
	withVault(t)
	mid := target(2, Vec2{0, 0}, Healthy) // standing on the sill
	s := State{Players: []Player{killerAt(west, east), mid}}
	if got := swingFrom(s, east); got != Healthy {
		t.Errorf("a survivor on the window was hit (%d)", got)
	}
}
