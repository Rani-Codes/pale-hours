//go:build js && wasm

// Command wasm exposes the sim to JavaScript as the global paleSim.
package main

import (
	"syscall/js"

	"github.com/Rani-Codes/pale-hours/sim"
)

var state sim.State

func main() {
	js.Global().Set("paleSim", js.ValueOf(map[string]any{
		"tickRate":         sim.TickRate,
		"mapHalfExtent":    sim.MapHalfExtent,
		"roles":            map[string]any{"survivor": int(sim.Survivor), "killer": int(sim.Killer)},
		"walls":            walls(),
		"genSites":         sites(sim.GenSites),
		"genTicks":         sim.GeneratorTicks,
		"gateSites":        sites(sim.GateSites),
		"gateTicks":        sim.GateTicks,
		"gateRange":        sim.GateRange,
		"gensRequired":     sim.GensRequired,
		"noiseTicks":       sim.NoiseTicks,
		"repairRange":      sim.RepairRange,
		"generatorHalf":    sim.GeneratorHalf,
		"check":            map[string]any{"duration": sim.CheckDuration, "zoneLen": sim.CheckZoneLen},
		"health":           map[string]any{"healthy": int(sim.Healthy), "injured": int(sim.Injured), "downed": int(sim.Downed)},
		"swing":            map[string]any{"idle": int(sim.SwingIdle), "windup": int(sim.SwingWindup), "recover": int(sim.SwingRecover), "hit": int(sim.SwingHit), "miss": int(sim.SwingMiss)},
		"rewindCapMs":      sim.RewindCapMs,
		"hookSites":        sites(sim.HookSites),
		"hookTicks":        sim.HookTicks,
		"hookRange":        sim.HookRange,
		"rescueTicks":      sim.RescueTicks,
		"rescueRange":      sim.RescueRange,
		"reviveRange":      sim.ReviveRange,
		"pickupRange":      sim.PickupRange,
		"recoverTicks":     sim.DownedRecoverTicks,
		"hookCheckPenalty": sim.HookCheckPenalty,
		"inReach":          js.FuncOf(inReach),
		"load":             js.FuncOf(load),
		"step":             js.FuncOf(step),
		"state":            js.FuncOf(snapshot),
	}))
	select {}
}

// load({tick, players: [{id, role, x, y, yaw}, ...]}) replaces the state, in the
// same shape state() returns, so a guest can rewind to a host snapshot.
func load(_ js.Value, args []js.Value) any {
	list := args[0].Get("players")
	players := make([]sim.Player, list.Length())
	for i := range players {
		p := list.Index(i)
		players[i] = sim.Player{
			ID:   sim.PlayerID(p.Get("id").Int()),
			Role: sim.Role(p.Get("role").Int()),
			Pos:  sim.Vec2{X: int32(p.Get("x").Int()), Y: int32(p.Get("y").Int())},
			Yaw:  uint16(p.Get("yaw").Int()),

			Repairing:   p.Get("repairing").Bool(),
			SkillHeld:   p.Get("skillHeld").Bool(),
			CheckActive: p.Get("checkActive").Bool(),
			CheckResult: sim.CheckResult(p.Get("checkResult").Int()),
			CheckZone:   uint8(p.Get("checkZone").Int()),
			CheckAge:    int16(p.Get("checkAge").Int()),
			CheckIn:     int16(p.Get("checkIn").Int()),
			Rng:         uint32(p.Get("rng").Int()),
			Escaped:     p.Get("escaped").Bool(),

			Health:      sim.Health(p.Get("health").Int()),
			Boost:       int16(p.Get("boost").Int()),
			AttackHeld:  p.Get("attackHeld").Bool(),
			Swing:       sim.SwingPhase(p.Get("swing").Int()),
			SwingTicks:  int16(p.Get("swingTicks").Int()),
			SwingResult: sim.SwingResult(p.Get("swingResult").Int()),

			Recover:    int16(p.Get("recover").Int()),
			Helping:    sim.PlayerID(p.Get("helping").Int()),
			ActHeld:    p.Get("actHeld").Bool(),
			Carrying:   sim.PlayerID(p.Get("carrying").Int()),
			Carried:    p.Get("carried").Bool(),
			OnHook:     uint8(p.Get("onHook").Int()),
			HookUsed:   int16(p.Get("hookUsed").Int()),
			Rescue:     int16(p.Get("rescue").Int()),
			Eliminated: p.Get("eliminated").Bool(),
			Stun:       int16(p.Get("stun").Int()),
		}
		// Guests get snapshots without trails; they never resolve a swing.
		tr := p.Get("trail")
		for j := range players[i].Trail {
			players[i].Trail[j] = players[i].Pos
			if !tr.IsUndefined() && 2*j+1 < tr.Length() {
				players[i].Trail[j] = sim.Vec2{X: int32(tr.Index(2 * j).Int()), Y: int32(tr.Index(2*j + 1).Int())}
			}
		}
	}
	genList, noiseList, gateList := args[0].Get("gens"), args[0].Get("noise"), args[0].Get("gates")
	gens := make([]sim.Generator, len(sim.GenSites))
	for i := range gens {
		if i < genList.Length() {
			gens[i].Progress = int32(genList.Index(i).Int())
		}
		if i < noiseList.Length() {
			gens[i].Noise = int16(noiseList.Index(i).Int())
		}
	}
	gates := make([]sim.Gate, len(sim.GateSites))
	for i := range gates {
		if i < gateList.Length() {
			gates[i].Progress = int32(gateList.Index(i).Int())
		}
	}
	state = sim.State{
		Tick:    uint32(args[0].Get("tick").Int()),
		Players: players,
		Gens:    gens,
		Gates:   gates,
		Over:    args[0].Get("over").Truthy(),
	}
	return nil
}

// step([{id, moveX, moveY, yaw}, ...]) advances one tick.
func step(_ js.Value, args []js.Value) any {
	list := args[0]
	inputs := make(map[sim.PlayerID]sim.Input, list.Length())
	for i := range list.Length() {
		in := list.Index(i)
		inputs[sim.PlayerID(in.Get("id").Int())] = sim.Input{
			MoveX: int8(in.Get("moveX").Int()),
			MoveY: int8(in.Get("moveY").Int()),
			Yaw:   uint16(in.Get("yaw").Int()),
			Act:   in.Get("act").Bool(),
			Skill: in.Get("skill").Bool(),

			// Optional: only the host's killer input carries them.
			Attack:    in.Get("attack").Truthy(),
			ViewLagMs: viewLag(in.Get("viewLagMs")),
		}
	}
	state = sim.Step(state, inputs)
	return nil
}

// state() returns {tick, players: [{id, role, x, y, yaw, ...repair fields}, ...], gens: [progress, ...], noise: [ticks, ...], gates: [progress, ...]}.
func snapshot(js.Value, []js.Value) any {
	players := make([]any, len(state.Players))
	for i, p := range state.Players {
		players[i] = map[string]any{
			"id":   int(p.ID),
			"role": int(p.Role),
			"x":    int(p.Pos.X),
			"y":    int(p.Pos.Y),
			"yaw":  int(p.Yaw),

			"repairing":   p.Repairing,
			"skillHeld":   p.SkillHeld,
			"checkActive": p.CheckActive,
			"checkResult": int(p.CheckResult),
			"checkZone":   int(p.CheckZone),
			"checkAge":    int(p.CheckAge),
			"checkIn":     int(p.CheckIn),
			"rng":         int(p.Rng),
			"escaped":     p.Escaped,

			"health":      int(p.Health),
			"boost":       int(p.Boost),
			"attackHeld":  p.AttackHeld,
			"swing":       int(p.Swing),
			"swingTicks":  int(p.SwingTicks),
			"swingResult": int(p.SwingResult),
			"trail":       trail(p),

			"recover":    int(p.Recover),
			"helping":    int(p.Helping),
			"actHeld":    p.ActHeld,
			"carrying":   int(p.Carrying),
			"carried":    p.Carried,
			"onHook":     int(p.OnHook),
			"hookUsed":   int(p.HookUsed),
			"rescue":     int(p.Rescue),
			"eliminated": p.Eliminated,
			"stun":       int(p.Stun),
		}
	}
	gens := make([]any, len(state.Gens))
	noise := make([]any, len(state.Gens))
	for i, g := range state.Gens {
		gens[i] = int(g.Progress)
		noise[i] = int(g.Noise)
	}
	gates := make([]any, len(state.Gates))
	for i, g := range state.Gates {
		gates[i] = int(g.Progress)
	}
	return map[string]any{"tick": int(state.Tick), "players": players, "gens": gens, "noise": noise, "gates": gates, "over": state.Over}
}

func viewLag(v js.Value) uint16 {
	if v.Type() != js.TypeNumber {
		return 0
	}
	return uint16(min(max(v.Int(), 0), 0xffff))
}

// trail flattens a player's trail to [x0, y0, x1, y1, ...], indexed by tick % TrailLen.
func trail(p sim.Player) []any {
	out := make([]any, 0, 2*len(p.Trail))
	for _, v := range p.Trail {
		out = append(out, int(v.X), int(v.Y))
	}
	return out
}

// inReach(x, y, yaw, targetX, targetY) reports whether a swing from (x, y)
// facing yaw would touch a survivor standing at the target right now. For the tools.
func inReach(_ js.Value, a []js.Value) any {
	return sim.InReach(sim.Vec2{X: int32(a[0].Int()), Y: int32(a[1].Int())}, uint16(a[2].Int()), sim.Vec2{X: int32(a[3].Int()), Y: int32(a[4].Int())})
}

// walls returns the layout as [{minX, minY, maxX, maxY}, ...] in micrometers.
func walls() []any {
	out := make([]any, len(sim.Walls))
	for i, w := range sim.Walls {
		out[i] = map[string]any{"minX": int(w.MinX), "minY": int(w.MinY), "maxX": int(w.MaxX), "maxY": int(w.MaxY)}
	}
	return out
}

// sites returns [{x, y}, ...] in micrometers, indexed like the matching state() list.
func sites(list []sim.Vec2) []any {
	out := make([]any, len(list))
	for i, g := range list {
		out[i] = map[string]any{"x": int(g.X), "y": int(g.Y)}
	}
	return out
}
