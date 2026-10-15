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
		"tickRate":      sim.TickRate,
		"mapHalfExtent": sim.MapHalfExtent,
		"roles":         map[string]any{"survivor": int(sim.Survivor), "killer": int(sim.Killer)},
		"walls":         walls(),
		"genSites":      genSites(),
		"genTicks":      sim.GeneratorTicks,
		"gateSites":     gateSites(),
		"gateTicks":     sim.GateTicks,
		"gateRange":     sim.GateRange,
		"gensRequired":  sim.GensRequired,
		"noiseTicks":    sim.NoiseTicks,
		"repairRange":   sim.RepairRange,
		"generatorHalf": sim.GeneratorHalf,
		"check":         map[string]any{"duration": sim.CheckDuration, "zoneLen": sim.CheckZoneLen},
		"load":          js.FuncOf(load),
		"step":          js.FuncOf(step),
		"state":         js.FuncOf(snapshot),
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
	return map[string]any{"tick": int(state.Tick), "players": players, "gens": gens, "noise": noise, "gates": gates}
}

// walls returns the layout as [{minX, minY, maxX, maxY}, ...] in micrometers.
func walls() []any {
	out := make([]any, len(sim.Walls))
	for i, w := range sim.Walls {
		out[i] = map[string]any{"minX": int(w.MinX), "minY": int(w.MinY), "maxX": int(w.MaxX), "maxY": int(w.MaxY)}
	}
	return out
}

// genSites returns [{x, y}, ...] in micrometers, indexed like state().gens.
func genSites() []any {
	out := make([]any, len(sim.GenSites))
	for i, g := range sim.GenSites {
		out[i] = map[string]any{"x": int(g.X), "y": int(g.Y)}
	}
	return out
}

// gateSites returns [{x, y}, ...] in micrometers, indexed like state().gates.
func gateSites() []any {
	out := make([]any, len(sim.GateSites))
	for i, g := range sim.GateSites {
		out[i] = map[string]any{"x": int(g.X), "y": int(g.Y)}
	}
	return out
}
