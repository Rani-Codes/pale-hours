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
		}
	}
	state = sim.State{Tick: uint32(args[0].Get("tick").Int()), Players: players}
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
		}
	}
	state = sim.Step(state, inputs)
	return nil
}

// state() returns {tick, players: [{id, role, x, y, yaw}, ...]}.
func snapshot(js.Value, []js.Value) any {
	players := make([]any, len(state.Players))
	for i, p := range state.Players {
		players[i] = map[string]any{
			"id":   int(p.ID),
			"role": int(p.Role),
			"x":    int(p.Pos.X),
			"y":    int(p.Pos.Y),
			"yaw":  int(p.Yaw),
		}
	}
	return map[string]any{"tick": int(state.Tick), "players": players}
}

// walls returns the layout as [{minX, minY, maxX, maxY}, ...] in micrometers.
func walls() []any {
	out := make([]any, len(sim.Walls))
	for i, w := range sim.Walls {
		out[i] = map[string]any{"minX": int(w.MinX), "minY": int(w.MinY), "maxX": int(w.MaxX), "maxY": int(w.MaxY)}
	}
	return out
}
