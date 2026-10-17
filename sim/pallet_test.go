package sim

import "testing"

// A pallet 2 m wide and 0.5 m thick across the x axis at the origin, so it is
// crossed north-south.
var testPallet = Box{-1 * m, -250_000, 1 * m, 250_000}

func withPallets(t *testing.T, boxes ...Box) {
	t.Helper()
	withMap(t, nil, nil)
	old := PalletSites
	PalletSites = boxes
	t.Cleanup(func() { PalletSites = old })
}

func palletState(players ...Player) State {
	return State{Players: players, Pallets: make([]Pallet, len(PalletSites))}
}

var (
	south = Vec2{0, -1 * m} // a survivor's spot beside the pallet, clear of its grown box
	north = Vec2{0, 1 * m}
	press = map[PlayerID]Input{2: {Skill: true}}
)

func surv(id PlayerID, pos Vec2) Player { return Player{ID: id, Role: Survivor, Pos: pos} }

func TestStandingPalletDoesNotBlock(t *testing.T) {
	withPallets(t, testPallet)
	s := palletState(surv(2, south))
	for range 60 {
		s = Step(s, map[PlayerID]Input{2: {MoveY: 127}})
	}
	if s.Players[0].Pos.Y <= north.Y {
		t.Fatalf("walked only to y %d, want through the standing pallet", s.Players[0].Pos.Y)
	}
}

func TestDropMakesAWallForEveryone(t *testing.T) {
	for _, role := range []Role{Survivor, Killer} {
		withPallets(t, testPallet)
		s := palletState(surv(2, Vec2{-3 * m, -3 * m}), Player{ID: 1, Role: role, Pos: south})
		s.Pallets[0].State = PalletDown
		for range 60 {
			s = Step(s, map[PlayerID]Input{1: {MoveY: 127}})
		}
		want := testPallet.MinY - PlayerRadius
		if got := s.Players[1].Pos.Y; got != want {
			t.Errorf("role %d stopped at y %d, want %d", role, got, want)
		}
	}
}

func TestSurvivorDropsAPalletBesideIt(t *testing.T) {
	tests := []struct {
		name string
		at   Vec2
		mod  func(*Player)
		want PalletState
	}{
		{"beside it", south, nil, PalletDown},
		{"from the north side too", north, nil, PalletDown},
		{"a generous reach", Vec2{0, -2_800_000}, nil, PalletDown},
		{"just out of reach", Vec2{0, -3_400_000}, nil, PalletUp},
		{"too far", Vec2{0, -6 * m}, nil, PalletUp},
		{"standing in its footprint", Vec2{0, -300_000}, nil, PalletDown},
		{"downed", south, func(p *Player) { p.Health = Downed }, PalletUp},
		{"carried", south, func(p *Player) { p.Carried = true }, PalletUp},
		{"mid skill check", south, func(p *Player) { p.CheckActive = true }, PalletUp},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			withPallets(t, testPallet)
			p := surv(2, tt.at)
			if tt.mod != nil {
				tt.mod(&p)
			}
			s := Step(palletState(p), press)
			if got := s.Pallets[0].State; got != tt.want {
				t.Fatalf("pallet %d, want %d", got, tt.want)
			}
		})
	}
}

func TestPalletIsThrownOnce(t *testing.T) {
	withPallets(t, testPallet)
	s := Step(palletState(surv(2, south)), press)
	s = Step(s, map[PlayerID]Input{2: {}})
	s = Step(s, press) // a second press beside the dropped pallet vaults it instead
	if s.Pallets[0].State != PalletDown || s.Players[0].VaultTicks == 0 {
		t.Fatalf("pallet %d, vault ticks %d: want it still down and the survivor vaulting", s.Pallets[0].State, s.Players[0].VaultTicks)
	}
}

func TestDropStunsAKillerNearby(t *testing.T) {
	tests := []struct {
		name   string
		killer Vec2
		want   int16
	}{
		{"right behind", Vec2{0, -2 * m}, PalletStunTicks},
		{"on the far side", Vec2{0, 2 * m}, PalletStunTicks},
		{"far away", Vec2{0, -9 * m}, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			withPallets(t, testPallet)
			k := Player{ID: 1, Role: Killer, Pos: tt.killer, Swing: SwingWindup, SwingTicks: 5}
			s := Step(palletState(surv(2, south), k), press)
			if got := s.Players[1].Stun; got != tt.want {
				t.Fatalf("stun %d, want %d", got, tt.want)
			}
			if tt.want > 0 && s.Players[1].Swing != SwingIdle {
				t.Fatalf("a stunned killer's swing is still %d", s.Players[1].Swing)
			}
		})
	}
}

func TestStunnedKillerCannotMoveAndRecovers(t *testing.T) {
	withPallets(t, testPallet)
	s := Step(palletState(surv(2, south), Player{ID: 1, Role: Killer, Pos: Vec2{0, -2 * m}}), press)
	at := s.Players[1].Pos
	for range PalletStunTicks - 1 {
		s = Step(s, map[PlayerID]Input{1: {MoveX: 127}})
	}
	if s.Players[1].Pos != at || s.Players[1].Stun != 1 {
		t.Fatalf("killer moved to %v or stun %d, want still at %v with 1 tick left", s.Players[1].Pos, s.Players[1].Stun, at)
	}
	s = Step(s, map[PlayerID]Input{1: {MoveX: 127}})
	s = Step(s, map[PlayerID]Input{1: {MoveX: 127}})
	if s.Players[1].Pos.X <= at.X {
		t.Fatal("killer still frozen after the stun ended")
	}
}

func TestDropPushesOthersOutOfTheFootprint(t *testing.T) {
	withPallets(t, testPallet)
	k := Player{ID: 1, Role: Killer, Pos: Vec2{0, -100_000}}
	s := Step(palletState(surv(2, south), k), press)
	if _, in := hitWall(s.Players[1].Pos, blockers{pallets: []bool{true}}); in {
		t.Fatalf("killer left inside the pallet at %v", s.Players[1].Pos)
	}
	if s.Players[1].Pos.Y >= 0 {
		t.Fatalf("killer pushed across to %v, want out on his own side", s.Players[1].Pos)
	}
}

func TestSurvivorVaultsADroppedPallet(t *testing.T) {
	withPallets(t, testPallet)
	s := palletState(surv(2, Vec2{0, testPallet.MinY - PlayerRadius - 100_000}))
	s.Pallets[0].State = PalletDown
	s = Step(s, press)
	if s.Players[0].VaultTicks == 0 {
		t.Fatal("no vault started")
	}
	for range VaultTicks {
		s = Step(s, map[PlayerID]Input{})
	}
	if s.Players[0].Pos.Y <= testPallet.MaxY {
		t.Fatalf("landed at y %d, want past the far face", s.Players[0].Pos.Y)
	}
}

func TestKillerBreaksADroppedPallet(t *testing.T) {
	hold := map[PlayerID]Input{1: {Act: true}}
	at := Vec2{0, -1_200_000}
	t.Run("holding E for the full time breaks it", func(t *testing.T) {
		withPallets(t, testPallet)
		s := palletState(Player{ID: 1, Role: Killer, Pos: at, ActHeld: true}) // E already down, so no press to spend
		s.Pallets[0].State = PalletDown
		for range PalletBreakTicks - 1 {
			s = Step(s, hold)
		}
		if s.Pallets[0].State != PalletDown || s.Pallets[0].Break != PalletBreakTicks-1 {
			t.Fatalf("pallet %+v one tick early", s.Pallets[0])
		}
		s = Step(s, hold)
		if s.Pallets[0].State != PalletBroken {
			t.Fatalf("pallet %+v, want broken", s.Pallets[0])
		}
		s = Step(s, map[PlayerID]Input{1: {MoveY: 127}})
		for range 30 {
			s = Step(s, map[PlayerID]Input{1: {MoveY: 127}})
		}
		if s.Players[0].Pos.Y <= testPallet.MaxY {
			t.Fatalf("a broken pallet still blocks: killer at y %d", s.Players[0].Pos.Y)
		}
	})
	t.Run("letting go starts over", func(t *testing.T) {
		withPallets(t, testPallet)
		s := palletState(Player{ID: 1, Role: Killer, Pos: at})
		s.Pallets[0].State = PalletDown
		for range 40 {
			s = Step(s, hold)
		}
		s = Step(s, map[PlayerID]Input{1: {}})
		if s.Pallets[0].Break != 0 {
			t.Fatalf("progress %d after letting go", s.Pallets[0].Break)
		}
	})
	t.Run("out of reach, stunned or carrying does nothing", func(t *testing.T) {
		for name, k := range map[string]Player{
			"far":      {ID: 1, Role: Killer, Pos: Vec2{0, -5 * m}},
			"stunned":  {ID: 1, Role: Killer, Pos: at, Stun: 60},
			"carrying": {ID: 1, Role: Killer, Pos: at, Carrying: 2},
		} {
			withPallets(t, testPallet)
			s := palletState(k, surv(2, Vec2{-9 * m, 0}))
			s.Pallets[0].State = PalletDown
			s = Step(s, hold)
			if s.Pallets[0].Break != 0 {
				t.Errorf("%s: progress %d", name, s.Pallets[0].Break)
			}
		}
	})
	t.Run("a standing pallet is not broken", func(t *testing.T) {
		withPallets(t, testPallet)
		s := Step(palletState(Player{ID: 1, Role: Killer, Pos: at}), hold)
		if s.Pallets[0].Break != 0 {
			t.Fatalf("progress %d on a standing pallet", s.Pallets[0].Break)
		}
	})
}

// abutsAWall reports whether one end of b touches a wall: the pallet is hinged
// to it, so it never stands alone in open ground.
func abutsAWall(b Box) bool {
	acrossX := b.MaxX-b.MinX < b.MaxY-b.MinY
	ends := [2]Box{b, b}
	if acrossX {
		ends[0].MaxY, ends[1].MinY = b.MinY, b.MaxY
		ends[0].MinY, ends[1].MaxY = b.MinY-wallThick, b.MaxY+wallThick
	} else {
		ends[0].MaxX, ends[1].MinX = b.MinX, b.MaxX
		ends[0].MinX, ends[1].MaxX = b.MinX-wallThick, b.MaxX+wallThick
	}
	for _, e := range ends {
		for _, w := range Walls {
			if e.MinX <= w.MaxX && w.MinX <= e.MaxX && e.MinY <= w.MaxY && w.MinY <= e.MaxY {
				return true
			}
		}
	}
	return false
}

func TestEveryPalletIsHingedToAWall(t *testing.T) {
	for i, b := range PalletSites {
		if !abutsAWall(b) {
			t.Errorf("pallet %d at %v touches no wall at either end", i, b)
		}
	}
	if abutsAWall(Box{40 * m, 40 * m, 42 * m, 40*m + wallThick}) {
		t.Fatal("a pallet far from every wall counted as attached")
	}
}

func TestPalletSitesFitTheMap(t *testing.T) {
	if n := len(PalletSites); n < 4 || n > 8 {
		t.Fatalf("%d pallets, want a few", n)
	}
	for i, b := range PalletSites {
		mid := Vec2{(b.MinX + b.MaxX) / 2, (b.MinY + b.MaxY) / 2}
		acrossX := b.MaxX-b.MinX < b.MaxY-b.MinY
		for _, side := range []int32{-1, 1} {
			p := Vec2{mid.X, mid.Y + side*(b.MaxY-b.MinY)/2 + side*(PalletReach/2)}
			if acrossX {
				p = Vec2{mid.X + side*(b.MaxX-b.MinX)/2 + side*(PalletReach/2), mid.Y}
			}
			if _, hit := hitWall(p, blockers{}); hit {
				t.Errorf("pallet %d: the spot beside it at %v is inside an obstacle", i, p)
			}
		}
		if _, hit := hitWall(mid, blockers{}); hit {
			t.Errorf("pallet %d sits inside a wall, vault or generator", i)
		}
		for j, o := range PalletSites[:i] {
			if b.MinX < o.MaxX+2*PlayerRadius && o.MinX < b.MaxX+2*PlayerRadius && b.MinY < o.MaxY+2*PlayerRadius && o.MinY < b.MaxY+2*PlayerRadius {
				t.Errorf("pallets %d and %d are on top of each other", j, i)
			}
		}
	}
}

func TestDroppingFromInsideTheFootprintPushesTheThrowerOut(t *testing.T) {
	withPallets(t, testPallet)
	s := Step(palletState(surv(2, Vec2{0, -300_000})), press)
	if _, in := hitWall(s.Players[0].Pos, blockers{pallets: []bool{true}}); in {
		t.Fatalf("thrower left inside the pallet at %v", s.Players[0].Pos)
	}
	if s.Players[0].Pos.Y >= 0 {
		t.Fatalf("thrower pushed across to %v, want out on their own side", s.Players[0].Pos)
	}
}
