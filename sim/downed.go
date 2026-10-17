package sim

// stepHelp lets a survivor holding E beside a downed teammate get them up.
// A skill check comes ReviveCheckDelay ticks after they start, and again
// after every miss; a hit returns the teammate's ID so Step can stand them
// up once every player has moved. prev is the players as the tick began.
func stepHelp(p *Player, in Input, hasInput, press bool, prev []Player, gens []Generator) PlayerID {
	var target PlayerID
	if p.Role == Survivor && p.Health != Downed && hasInput && in.Act {
		target = downedNear(p, prev)
	}
	if target != p.Helping {
		if p.CheckActive && p.Helping != 0 {
			endCheck(p, CheckMiss) // giving up a help check costs nothing else
		} else if p.CheckActive {
			missCheck(p, gens, nearest(p.Pos)) // walking off a generator check, as anywhere else
		}
		p.Helping, p.CheckIn = target, ReviveCheckDelay
		if target == 0 {
			p.CheckIn = 0 // the next generator check draws its own gap
		}
	}
	if target == 0 {
		return 0
	}
	if !p.CheckActive {
		countdownCheck(p)
		return 0
	}
	r := judgeCheck(p, press)
	if r == CheckNone {
		return 0
	}
	endCheck(p, r)
	p.CheckIn = ReviveCheckDelay
	if r == CheckHit {
		return target
	}
	return 0
}

// downedNear is the nearest downed teammate within ReviveRange who is lying
// on the ground, not carried or hooked, or 0.
func downedNear(p *Player, players []Player) PlayerID {
	var best PlayerID
	bestD := int64(ReviveRange)*int64(ReviveRange) + 1
	for _, q := range players {
		if q.ID == p.ID || q.Role != Survivor || q.Health != Downed || q.Carried || q.OnHook != 0 || q.Escaped || q.Eliminated {
			continue
		}
		if d := distSq(p.Pos, q.Pos); d < bestD {
			best, bestD = q.ID, d
		}
	}
	return best
}

// stepDowned runs a survivor's own timers: the hook eating into their hook
// time, or lying alone on the ground working toward standing up.
func stepDowned(p *Player) {
	switch {
	case p.OnHook != 0:
		p.Recover = 0
		if p.HookUsed++; p.HookUsed >= HookTicks {
			p.Eliminated, p.OnHook, p.CheckActive = true, 0, false
		}
	case p.Health == Downed:
		// Carried, a full timer means breaking free, which Step settles with the killer.
		if p.Recover++; p.Recover >= DownedRecoverTicks && !p.Carried {
			p.Health, p.Recover = Injured, 0
		}
	default:
		p.Recover = 0
	}
}

// killerAct is the killer pressing E: pick up a downed survivor in reach and
// not behind a wall, window or dropped pallet,
// or, when carrying, hang them on a free hook in range or drop them here.
func killerAct(k *Player, players []Player, pallets []Pallet) {
	if k.Carrying == 0 {
		var best *Player
		bestD := int64(PickupRange)*int64(PickupRange) + 1
		for i := range players {
			v := &players[i]
			if v.Role != Survivor || v.Health != Downed || v.Carried || v.OnHook != 0 || v.Escaped || v.Eliminated || blocked(k.Pos, v.Pos, pallets) {
				continue
			}
			if d := distSq(k.Pos, v.Pos); d < bestD {
				best, bestD = v, d
			}
		}
		if best != nil {
			k.Carrying = best.ID
			best.Carried = true
		}
		return
	}
	v := find(players, k.Carrying)
	k.Carrying = 0
	if v == nil {
		return
	}
	v.Carried = false
	v.Pos = k.Pos
	if h := freeHook(k.Pos, players); h >= 0 {
		v.OnHook, v.Pos, v.Rescue, v.HookTries = uint8(h+1), HookSites[h], 0, 0
	}
}

// freeHook is the nearest empty hook within HookRange of pos, or -1.
func freeHook(pos Vec2, players []Player) int {
	best, bestD := -1, int64(HookRange)*int64(HookRange)+1
	for i, site := range HookSites {
		taken := false
		for _, p := range players {
			taken = taken || int(p.OnHook) == i+1
		}
		if d := distSq(pos, site); !taken && d < bestD {
			best, bestD = i, d
		}
	}
	return best
}

// stepRescue counts up rescue progress on each hooked survivor while a
// teammate holds E beside them, and unhooks them injured when it is full.
// Any let-go resets the count.
func stepRescue(players []Player, inputs map[PlayerID]Input) {
	for i := range players {
		v := &players[i]
		if v.OnHook == 0 {
			continue
		}
		site := HookSites[v.OnHook-1]
		held := false
		for _, r := range players {
			in, ok := inputs[r.ID]
			if ok && in.Act && r.ID != v.ID && r.Role == Survivor && r.Health != Downed && !r.Escaped && !r.Eliminated &&
				distSq(r.Pos, site) <= int64(RescueRange)*int64(RescueRange) {
				held = true
			}
		}
		if !held {
			v.Rescue = 0
			continue
		}
		if v.Rescue++; v.Rescue >= RescueTicks {
			v.OnHook, v.Health, v.Rescue, v.Recover = 0, Injured, 0, 0
			v.CheckActive = false // a hook check in progress just ends
		}
	}
}

// tryHookEscape is a hooked survivor pressing E to wriggle off: one try per
// press, HookEscapeTries each hanging, HookEscapeChance percent each. Luck
// takes them down injured with their hook time kept, as a rescue would.
func tryHookEscape(p *Player, press bool) {
	if !press || p.HookTries >= HookEscapeTries {
		return
	}
	p.HookTries++
	if rand(&p.Rng)%100 < HookEscapeChance {
		p.OnHook, p.Health, p.Rescue, p.Recover, p.CheckActive, p.HookTries = 0, Injured, 0, 0, false, 0
	}
}

// stepHookCheck runs a hooked survivor's skill checks, on the generator
// schedule. A miss costs HookCheckPenalty of hook time; stepDowned, which
// runs next, eliminates them if that uses it up.
func stepHookCheck(p *Player, press bool) {
	if !p.CheckActive {
		if p.CheckIn <= 0 {
			p.CheckIn = int16(CheckMinGap + rand(&p.Rng)%(CheckMaxGap-CheckMinGap+1))
		}
		countdownCheck(p)
		return
	}
	switch r := judgeCheck(p, press); r {
	case CheckMiss:
		p.HookUsed += HookCheckPenalty
		endCheck(p, r)
	case CheckHit:
		endCheck(p, r)
	}
}
