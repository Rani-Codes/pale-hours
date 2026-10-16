package sim

import "testing"

// An empty map with hooks at the given sites.
func withHooks(t *testing.T, hooks ...Vec2) {
	t.Helper()
	withMap(t, nil, nil)
	old := HookSites
	HookSites = hooks
	t.Cleanup(func() { HookSites = old })
}

func byID(s State, id PlayerID) Player {
	for _, p := range s.Players {
		if p.ID == id {
			return p
		}
	}
	panic("no such player")
}

func TestHitShove(t *testing.T) {
	withMap(t, nil, nil)
	s := swing(State{Players: []Player{killerAt(Vec2{}, 0), target(2, Vec2{0, 1500_000}, Healthy)}}, 0)
	start := s.Players[1].Pos.Y
	for range HitBoostTicks + 5 {
		s = Step(s, map[PlayerID]Input{1: {}, 2: {MoveY: MaxAxis}})
	}
	ran := s.Players[1].Pos.Y - start
	extra := ran - 5*SurvivorSpeed/TickRate // the five ticks after the shove are a normal run
	if extra < HitBoostDistance-50_000 || extra > HitBoostDistance+50_000 {
		t.Errorf("the shove carried %d, want about %d", extra, HitBoostDistance)
	}
}

func TestDownedRecovers(t *testing.T) {
	withMap(t, nil, nil)
	tests := []struct {
		name  string
		p     func() Player
		ticks int
		want  Health
	}{
		{"left alone stands up injured", func() Player { return target(2, Vec2{}, Downed) }, DownedRecoverTicks, Injured},
		{"not a tick early", func() Player { return target(2, Vec2{}, Downed) }, DownedRecoverTicks - 1, Downed},
		{"progress carries over", func() Player { p := target(2, Vec2{}, Downed); p.Recover = DownedRecoverTicks - 3; return p }, 3, Injured},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := State{Players: []Player{tt.p()}}
			for range tt.ticks {
				s = Step(s, map[PlayerID]Input{2: {}})
			}
			if got := s.Players[0].Health; got != tt.want {
				t.Errorf("health = %d, want %d", got, tt.want)
			}
		})
	}
}

// helper is a survivor next to a downed teammate with a help check already running.
func helping(age int16, held bool) State {
	h := target(3, Vec2{ReviveRange - 100_000, 0}, Healthy)
	h.Helping, h.CheckActive, h.CheckAge, h.CheckZone, h.SkillHeld = 2, true, age, 20, held
	return State{Players: []Player{target(2, Vec2{}, Downed), h}, Gens: make([]Generator, 1)}
}

func TestHelpUp(t *testing.T) {
	tests := []struct {
		name    string
		s       State
		in      Input
		want    Health
		wantRes CheckResult
	}{
		{"a good check stands them up injured", helping(20, false), Input{Act: true, Skill: true}, Injured, CheckHit},
		{"an early press misses", helping(5, false), Input{Act: true, Skill: true}, Downed, CheckMiss},
		{"timing out misses", helping(CheckDuration-1, false), Input{Act: true}, Downed, CheckMiss},
		{"letting go misses", helping(10, false), Input{}, Downed, CheckMiss},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// A generator right here must not pay for a missed help check.
			withMap(t, nil, []Vec2{{ReviveRange - 100_000, 1_200_000}})
			tt.s.Gens[0].Progress = 1000
			s := Step(tt.s, map[PlayerID]Input{3: tt.in})
			if got := byID(s, 2).Health; got != tt.want {
				t.Errorf("health = %d, want %d", got, tt.want)
			}
			if got := byID(s, 3).CheckResult; got != tt.wantRes {
				t.Errorf("check result = %d, want %d", got, tt.wantRes)
			}
			if s.Gens[0].Progress != 1000 || s.Gens[0].Noise != 0 {
				t.Errorf("the generator was charged: %+v", s.Gens[0])
			}
		})
	}
}

func TestHelpCheckComesQuickly(t *testing.T) {
	withMap(t, nil, nil)
	h := target(3, Vec2{ReviveRange - 100_000, 0}, Healthy)
	h.Rng = 7
	s := State{Players: []Player{target(2, Vec2{}, Downed), h}}
	for i := 1; i <= ReviveCheckDelay; i++ {
		s = Step(s, map[PlayerID]Input{3: {Act: true}})
		if active := byID(s, 3).CheckActive; active != (i == ReviveCheckDelay) {
			t.Fatalf("tick %d: check active %v", i, active)
		}
	}
	// A miss is followed by another check just as quickly.
	for byID(s, 3).CheckActive {
		s = Step(s, map[PlayerID]Input{3: {Act: true}})
	}
	for range ReviveCheckDelay {
		s = Step(s, map[PlayerID]Input{3: {Act: true}})
	}
	if !byID(s, 3).CheckActive {
		t.Error("no second check after a miss")
	}
}

func TestHelpRules(t *testing.T) {
	withMap(t, nil, nil)
	far := target(3, Vec2{ReviveRange + 100_000, 0}, Healthy)
	downedHelper := target(3, Vec2{1 * m, 0}, Downed)
	tests := []struct {
		name   string
		downed Player
		helper Player
	}{
		{"out of range", target(2, Vec2{}, Downed), far},
		{"a downed helper", target(2, Vec2{}, Downed), downedHelper},
		{"an injured survivor needs no help", target(2, Vec2{}, Injured), target(3, Vec2{1 * m, 0}, Healthy)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := State{Players: []Player{tt.downed, tt.helper}}
			for range ReviveCheckDelay + 2 {
				s = Step(s, map[PlayerID]Input{3: {Act: true}})
			}
			if h := byID(s, 3); h.Helping != 0 || h.CheckActive {
				t.Errorf("helping: %+v", h)
			}
		})
	}
}

func carrying(t *testing.T) State {
	t.Helper()
	s := State{Players: []Player{killerAt(Vec2{}, 0), target(2, Vec2{PickupRange - 100_000, 0}, Downed)}}
	s = Step(s, map[PlayerID]Input{1: {Act: true}})
	if k := byID(s, 1); k.Carrying != 2 {
		t.Fatalf("pickup failed: %+v", k)
	}
	return Step(s, map[PlayerID]Input{1: {}})
}

func TestPickUp(t *testing.T) {
	withHooks(t)
	s := carrying(t)
	if v := byID(s, 2); !v.Carried || v.Pos != byID(s, 1).Pos {
		t.Errorf("survivor not on the killer: %+v", v)
	}
	// The carried survivor follows the killer and their own input does nothing.
	s = Step(s, map[PlayerID]Input{1: {MoveX: MaxAxis}, 2: {MoveY: MaxAxis}})
	k, v := byID(s, 1), byID(s, 2)
	if k.Pos.X != KillerCarrySpeed/TickRate {
		t.Errorf("carrying killer moved %d, want %d", k.Pos.X, KillerCarrySpeed/TickRate)
	}
	if v.Pos != k.Pos {
		t.Errorf("carried survivor at %v, killer at %v", v.Pos, k.Pos)
	}
}

func TestPickUpRules(t *testing.T) {
	withHooks(t)
	tests := []struct {
		name string
		v    Player
		in   Input
	}{
		{"out of range", target(2, Vec2{PickupRange + 100_000, 0}, Downed), Input{Act: true}},
		{"not downed", target(2, Vec2{1 * m, 0}, Injured), Input{Act: true}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := Step(State{Players: []Player{killerAt(Vec2{}, 0), tt.v}}, map[PlayerID]Input{1: tt.in})
			if byID(s, 1).Carrying != 0 || byID(s, 2).Carried {
				t.Error("picked up")
			}
		})
	}
	t.Run("holding E is one press", func(t *testing.T) {
		k := killerAt(Vec2{}, 0)
		k.ActHeld = true
		s := Step(State{Players: []Player{k, target(2, Vec2{1 * m, 0}, Downed)}}, map[PlayerID]Input{1: {Act: true}})
		if byID(s, 1).Carrying != 0 {
			t.Error("a held key picked up")
		}
	})
}

// Carried too long, a survivor's get-up timer fills on the killer's
// shoulder: they break free injured and the killer is stunned.
func TestBreakFree(t *testing.T) {
	withHooks(t)
	s := State{Players: []Player{killerAt(Vec2{}, 0), target(2, Vec2{1 * m, 0}, Downed)}}
	s.Players[1].Recover = DownedRecoverTicks - 5
	s = Step(s, map[PlayerID]Input{1: {Act: true}}) // picked up with 4 ticks to go
	for range 3 {
		s = Step(s, map[PlayerID]Input{1: {MoveX: MaxAxis}})
	}
	if v := byID(s, 2); !v.Carried || v.Recover != DownedRecoverTicks-1 {
		t.Fatalf("the timer should run on while carried: %+v", v)
	}
	s = Step(s, map[PlayerID]Input{1: {MoveX: MaxAxis}})
	k, v := byID(s, 1), byID(s, 2)
	if k.Carrying != 0 || k.Stun != StunTicks {
		t.Errorf("killer after the break: carrying %d stun %d, want 0 and %d", k.Carrying, k.Stun, StunTicks)
	}
	if v.Carried || v.Health != Injured || v.Recover != 0 || v.Pos != k.Pos {
		t.Errorf("survivor after the break: %+v", v)
	}
}

func TestStunnedKiller(t *testing.T) {
	withHooks(t)
	k := killerAt(Vec2{}, 0)
	k.Stun = StunTicks
	s := State{Players: []Player{k, target(2, Vec2{0, 1500_000}, Downed)}}
	for i := range StunTicks {
		s = Step(s, map[PlayerID]Input{1: {MoveX: MaxAxis, Attack: i%2 == 0, Act: i%2 == 0, Yaw: 100}})
	}
	k = byID(s, 1)
	if k.Pos != (Vec2{}) || k.Swing != SwingIdle || k.Carrying != 0 || k.Stun != 0 {
		t.Fatalf("a stunned killer acted: %+v", k)
	}
	if k.Yaw != 100 {
		t.Errorf("a stunned killer can still look around, yaw %d", k.Yaw)
	}
	s = Step(s, map[PlayerID]Input{1: {MoveX: MaxAxis}})
	if byID(s, 1).Pos.X == 0 {
		t.Error("the killer is still stuck after the stun")
	}
}

func TestCarryingKillerCannotSwing(t *testing.T) {
	withHooks(t)
	s := carrying(t)
	s = Step(s, map[PlayerID]Input{1: {Attack: true}})
	if k := byID(s, 1); k.Swing != SwingIdle {
		t.Errorf("swung while carrying: %+v", k)
	}
}

func TestDrop(t *testing.T) {
	withHooks(t, Vec2{20 * m, 0})
	s := carrying(t)
	s = Step(s, map[PlayerID]Input{1: {Act: true}})
	k, v := byID(s, 1), byID(s, 2)
	if k.Carrying != 0 || v.Carried || v.Health != Downed || v.Pos != k.Pos {
		t.Errorf("drop: killer %+v survivor %+v", k, v)
	}
}

func TestHang(t *testing.T) {
	withHooks(t, Vec2{20 * m, 0}, Vec2{0, HookRange - 100_000})
	s := carrying(t)
	s = Step(s, map[PlayerID]Input{1: {Act: true}})
	k, v := byID(s, 1), byID(s, 2)
	if k.Carrying != 0 || v.Carried || v.OnHook != 2 || v.Pos != HookSites[1] {
		t.Fatalf("hang: killer %+v survivor %+v", k, v)
	}
	// Hooked survivors cannot move, recover, or be hit.
	s = Step(s, map[PlayerID]Input{2: {MoveX: MaxAxis}})
	if v := byID(s, 2); v.Pos != HookSites[1] || v.Health != Downed {
		t.Errorf("hooked survivor: %+v", v)
	}
}

func TestHangSkipsAnOccupiedHook(t *testing.T) {
	withHooks(t, Vec2{0, 1 * m})
	other := target(3, HookSites[0], Downed)
	other.OnHook = 1
	s := carrying(t)
	s.Players = append(s.Players, other)
	s = Step(s, map[PlayerID]Input{1: {Act: true}})
	if v := byID(s, 2); v.OnHook != 0 || v.Carried {
		t.Errorf("want a drop beside a full hook, got %+v", v)
	}
}

func hooked(used int16) Player {
	p := target(2, Vec2{}, Downed)
	p.OnHook, p.HookUsed = 1, used
	return p
}

func TestHookTimer(t *testing.T) {
	withHooks(t, Vec2{})
	s := State{Players: []Player{hooked(HookTicks - 2)}}
	s = Step(s, nil)
	if v := byID(s, 2); v.Eliminated {
		t.Fatal("eliminated early")
	}
	s = Step(s, nil)
	if v := byID(s, 2); !v.Eliminated || v.OnHook != 0 {
		t.Errorf("hook ran out but %+v", v)
	}
	// Out of play: nothing moves them any more.
	s = Step(s, map[PlayerID]Input{2: {MoveX: MaxAxis}})
	if v := byID(s, 2); v.Pos != (Vec2{}) {
		t.Errorf("eliminated survivor moved: %+v", v)
	}
}

func TestRescue(t *testing.T) {
	withHooks(t, Vec2{})
	rescuer := target(3, Vec2{RescueRange - 100_000, 0}, Injured)
	s := State{Players: []Player{hooked(100), rescuer}}
	for i := 1; i < RescueTicks; i++ {
		s = Step(s, map[PlayerID]Input{3: {Act: true}})
	}
	if v := byID(s, 2); v.OnHook == 0 {
		t.Fatal("rescued early")
	}
	s = Step(s, map[PlayerID]Input{3: {Act: true}})
	v := byID(s, 2)
	if v.OnHook != 0 || v.Health != Injured || v.Rescue != 0 {
		t.Errorf("rescue: %+v", v)
	}
	if v.HookUsed != 100+RescueTicks {
		t.Errorf("hook time used %d, want it kept at %d", v.HookUsed, 100+RescueTicks)
	}
}

func TestRescueNeedsASteadyHold(t *testing.T) {
	withHooks(t, Vec2{})
	rescuer := target(3, Vec2{1 * m, 0}, Healthy)
	s := State{Players: []Player{hooked(0), rescuer}}
	for range RescueTicks - 1 {
		s = Step(s, map[PlayerID]Input{3: {Act: true}})
	}
	s = Step(s, map[PlayerID]Input{3: {}})
	if v := byID(s, 2); v.Rescue != 0 || v.OnHook == 0 {
		t.Errorf("letting go kept progress: %+v", v)
	}
}

func TestHookedSurvivorsCannotBeRescuedByTheKiller(t *testing.T) {
	withHooks(t, Vec2{})
	s := State{Players: []Player{killerAt(Vec2{1 * m, 0}, 0), hooked(0)}}
	for range RescueTicks + 1 {
		s = Step(s, map[PlayerID]Input{1: {Act: true}})
	}
	if byID(s, 2).OnHook == 0 {
		t.Error("the killer unhooked a survivor")
	}
}

func TestHookSitesStandInTheOpen(t *testing.T) {
	if len(HookSites) != HookCount {
		t.Errorf("%d hook sites, want %d", len(HookSites), HookCount)
	}
	for i, h := range HookSites {
		if inWall(h) {
			t.Errorf("hook %d at %v is inside a wall or generator", i, h)
		}
	}
}

func TestHookSkillChecks(t *testing.T) {
	withHooks(t, Vec2{})
	active := func(age int16, held bool) Player {
		p := hooked(100)
		p.CheckActive, p.CheckAge, p.CheckZone, p.SkillHeld = true, age, 20, held
		return p
	}
	tests := []struct {
		name     string
		p        Player
		in       Input
		wantUsed int16
		wantRes  CheckResult
	}{
		{"a good press costs nothing", active(20, false), Input{Skill: true}, 101, CheckHit},
		{"an early press costs five seconds", active(5, false), Input{Skill: true}, 101 + HookCheckPenalty, CheckMiss},
		{"timing out costs five seconds", active(CheckDuration-1, false), Input{}, 101 + HookCheckPenalty, CheckMiss},
		{"no input is no press", active(10, false), Input{}, 101, CheckNone},
		{"a held key is not a press", active(20, true), Input{Skill: true}, 101, CheckNone},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := Step(State{Players: []Player{tt.p}, Gens: make([]Generator, 1)}, map[PlayerID]Input{2: tt.in})
			v := byID(s, 2)
			if v.HookUsed != tt.wantUsed || v.CheckResult != tt.wantRes {
				t.Errorf("hook used %d result %d, want %d and %d", v.HookUsed, v.CheckResult, tt.wantUsed, tt.wantRes)
			}
		})
	}
}

func TestHookChecksKeepComing(t *testing.T) {
	withHooks(t, Vec2{})
	p := hooked(0)
	p.Rng = 3
	s := State{Players: []Player{p}}
	checks := 0
	for range 20 * TickRate {
		before := byID(s, 2).CheckActive
		s = Step(s, map[PlayerID]Input{2: {}})
		if !before && byID(s, 2).CheckActive {
			checks++
		}
	}
	if checks < 20/(CheckMaxGap/TickRate+2) || checks > 20/(CheckMinGap/TickRate) {
		t.Errorf("%d checks in 20 s on the hook", checks)
	}
}

func TestMissingAHookCheckCanKill(t *testing.T) {
	withHooks(t, Vec2{})
	p := hooked(HookTicks - 10)
	p.CheckActive, p.CheckAge, p.CheckZone = true, 3, 20
	s := Step(State{Players: []Player{p}}, map[PlayerID]Input{2: {Skill: true}})
	if !byID(s, 2).Eliminated {
		t.Error("a miss past the end of the hook time did not eliminate")
	}
}

func TestRescueEndsAHookCheck(t *testing.T) {
	withHooks(t, Vec2{})
	v := hooked(0)
	v.CheckActive, v.CheckZone, v.Rescue = true, 40, RescueTicks-1
	gens := []Generator{{Progress: 500}}
	withMap(t, nil, []Vec2{{0, -1_400_000}}) // in repair range of the hook, not of the rescuer
	s := State{Players: []Player{v, target(3, Vec2{1 * m, 500_000}, Healthy)}, Gens: gens}
	s = Step(s, map[PlayerID]Input{3: {Act: true}})
	s = Step(s, map[PlayerID]Input{2: {}, 3: {}})
	if got := byID(s, 2); got.OnHook != 0 || got.CheckActive {
		t.Errorf("after rescue: %+v", got)
	}
	if s.Gens[0].Progress != 500 {
		t.Errorf("a hook check charged a generator: %d", s.Gens[0].Progress)
	}
}
