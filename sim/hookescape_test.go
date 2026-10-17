package sim

import "testing"

// seedFor finds a Rng whose next draw escapes the hook (win) or does not.
func seedFor(t *testing.T, win bool) uint32 {
	t.Helper()
	for seed := uint32(1); seed < 10_000; seed++ {
		s := seed
		if (rand(&s)%100 < HookEscapeChance) == win {
			return seed
		}
	}
	t.Fatal("no seed found")
	return 0
}

func hookedWith(seed uint32, used int16) State {
	p := hooked(used)
	p.Rng = seed
	return State{Players: []Player{p}}
}

var tryEscape = map[PlayerID]Input{2: {Act: true}}

func TestAHookedSurvivorCanWriggleOff(t *testing.T) {
	withHooks(t, Vec2{})
	s := Step(hookedWith(seedFor(t, true), 300), tryEscape)
	v := byID(s, 2)
	if v.OnHook != 0 || v.Health != Injured || v.Eliminated || v.CheckActive || v.HookUsed < 300 {
		t.Fatalf("after a lucky try: %+v, want off the hook injured with the hook time kept", v)
	}
}

func TestAFailedTryStaysHookedAndUsesATry(t *testing.T) {
	withHooks(t, Vec2{})
	s := Step(hookedWith(seedFor(t, false), 0), tryEscape)
	if v := byID(s, 2); v.OnHook != 1 || v.HookTries != 1 || v.Health != Downed {
		t.Fatalf("after an unlucky try: %+v", v)
	}
}

func TestTheTriesRunOut(t *testing.T) {
	withHooks(t, Vec2{})
	s := hookedWith(seedFor(t, false), 0)
	for i := 0; i < HookEscapeTries; i++ {
		s = Step(s, tryEscape)
		s = Step(s, map[PlayerID]Input{2: {}})
	}
	// every later draw would win, but there are no tries left
	s.Players[0].Rng = seedFor(t, true)
	s = Step(s, tryEscape)
	if v := byID(s, 2); v.OnHook != 1 || v.HookTries != HookEscapeTries {
		t.Fatalf("after %d tries: %+v, want still hooked", HookEscapeTries, v)
	}
}

func TestHoldingEIsOneTry(t *testing.T) {
	withHooks(t, Vec2{})
	s := hookedWith(seedFor(t, false), 0)
	for range 10 {
		s = Step(s, tryEscape)
	}
	if v := byID(s, 2); v.HookTries != 1 {
		t.Fatalf("holding E used %d tries, want 1", v.HookTries)
	}
}

func TestOnlyAHookedSurvivorTries(t *testing.T) {
	withHooks(t, Vec2{})
	p := target(2, Vec2{5 * m, 0}, Healthy)
	p.Rng = seedFor(t, true)
	s := Step(State{Players: []Player{p}}, tryEscape)
	if v := byID(s, 2); v.HookTries != 0 || v.Health != Healthy {
		t.Fatalf("a free survivor pressing E: %+v", v)
	}
}

func TestEachHangStartsWithFreshTries(t *testing.T) {
	withHooks(t, Vec2{20 * m, 0}, Vec2{0, HookRange - 100_000})
	s := carrying(t)
	s.Players[1].HookTries = HookEscapeTries
	s = Step(s, map[PlayerID]Input{1: {Act: true}})
	if v := byID(s, 2); v.OnHook == 0 || v.HookTries != 0 {
		t.Fatalf("hung survivor %+v, want a fresh set of tries", v)
	}
}
