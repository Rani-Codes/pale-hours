package sim

import "testing"

// A vault 2 m wide running north-south at x = 0, thin in x, so it is crossed east-west.
var testVault = Box{-250_000, -1 * m, 250_000, 1 * m}

func withVault(t *testing.T, walls ...Box) {
	t.Helper()
	withMap(t, walls, nil)
	old := Vaults
	Vaults = []Box{testVault}
	t.Cleanup(func() { Vaults = old })
}

// west is a survivor standing against the vault's west face.
var west = Vec2{testVault.MinX - PlayerRadius - 100_000, 0}

func vaultTo(east bool) Vec2 {
	if east {
		return Vec2{testVault.MaxX + PlayerRadius + VaultClear, 0}
	}
	return Vec2{testVault.MinX - PlayerRadius - VaultClear, 0}
}

func TestVaultCrosses(t *testing.T) {
	withVault(t)
	s := State{Players: []Player{target(2, west, Healthy)}}
	s = Step(s, map[PlayerID]Input{2: {Skill: true}})
	if p := s.Players[0]; p.VaultTicks != VaultTicks-1 || p.Pos.X <= west.X {
		t.Fatalf("vault did not start: %+v", p)
	}
	for range VaultTicks - 1 {
		s = Step(s, map[PlayerID]Input{2: {Skill: true, MoveX: -MaxAxis}}) // held key, steering back: both ignored
	}
	if p := s.Players[0]; p.Pos != vaultTo(true) || p.VaultTicks != 0 {
		t.Fatalf("after the vault: %+v, want at %v", p, vaultTo(true))
	}
	// Holding Space does not vault again; a fresh press goes back over.
	s = Step(s, map[PlayerID]Input{2: {Skill: true}})
	if s.Players[0].VaultTicks != 0 {
		t.Error("a held key vaulted again")
	}
	s = Step(s, map[PlayerID]Input{2: {}})
	s = Step(s, map[PlayerID]Input{2: {Skill: true}})
	for range VaultTicks - 1 {
		s = Step(s, map[PlayerID]Input{2: {}})
	}
	if got := s.Players[0].Pos; got != vaultTo(false) {
		t.Errorf("vault back landed at %v, want %v", got, vaultTo(false))
	}
}

func TestVaultAcrossY(t *testing.T) {
	withMap(t, nil, nil)
	old := Vaults
	Vaults = []Box{{-1 * m, -250_000, 1 * m, 250_000}}
	t.Cleanup(func() { Vaults = old })
	s := State{Players: []Player{target(2, Vec2{300_000, -250_000 - PlayerRadius - 200_000}, Healthy)}}
	s = Step(s, map[PlayerID]Input{2: {Skill: true}})
	for range VaultTicks - 1 {
		s = Step(s, nil)
	}
	if got, want := s.Players[0].Pos, (Vec2{300_000, 250_000 + PlayerRadius + VaultClear}); got != want {
		t.Errorf("landed at %v, want %v", got, want)
	}
}

func TestVaultRules(t *testing.T) {
	checking := target(2, west, Healthy)
	checking.CheckActive, checking.CheckZone, checking.CheckAge = true, 20, 20
	tests := []struct {
		name  string
		p     Player
		walls []Box
	}{
		{"the killer cannot vault", killerAt(west, 0), nil},
		{"downed cannot vault", target(2, west, Downed), nil},
		{"too far away", target(2, Vec2{west.X - VaultReach - 50_000, 0}, Healthy), nil},
		{"past the end of the opening", target(2, Vec2{west.X, testVault.MaxY + 100_000}, Healthy), nil},
		{"the landing is blocked", target(2, west, Healthy), []Box{{testVault.MaxX + 300_000, -1 * m, testVault.MaxX + 900_000, 1 * m}}},
		{"a skill check takes the press", checking, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			withVault(t, tt.walls...)
			s := Step(State{Players: []Player{tt.p}, Gens: make([]Generator, 1)}, map[PlayerID]Input{tt.p.ID: {Skill: true}})
			if s.Players[0].VaultTicks != 0 {
				t.Errorf("vaulted: %+v", s.Players[0])
			}
		})
	}
}

func TestVaultsBlockWalking(t *testing.T) {
	for _, p := range []Player{target(2, west, Healthy), killerAt(Vec2{west.X, 0}, 0)} {
		withVault(t)
		s := State{Players: []Player{p}}
		for range 30 {
			s = Step(s, map[PlayerID]Input{p.ID: {MoveX: MaxAxis}})
		}
		if x := s.Players[0].Pos.X; x > testVault.MinX-PlayerRadius {
			t.Errorf("role %d walked through the vault to x %d", p.Role, x)
		}
	}
}
