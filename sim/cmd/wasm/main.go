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
		"reset":         js.FuncOf(reset),
		"step":          js.FuncOf(step),
		"state":         js.FuncOf(snapshot),
	}))
	select {}
}

// reset([{id, role, x, y}, ...]) replaces the state with these players at tick 0.
func reset(_ js.Value, args []js.Value) any {
	list := args[0]
	players := make([]sim.Player, list.Length())
	for i := range players {
		p := list.Index(i)
		players[i] = sim.Player{
			ID:   sim.PlayerID(p.Get("id").Int()),
			Role: sim.Role(p.Get("role").Int()),
			Pos:  sim.Vec2{X: int32(p.Get("x").Int()), Y: int32(p.Get("y").Int())},
		}
	}
	state = sim.State{Players: players}
	return nil
}

// step([{id, moveX, moveY}, ...]) advances one tick.
func step(_ js.Value, args []js.Value) any {
	list := args[0]
	inputs := make(map[sim.PlayerID]sim.Input, list.Length())
	for i := range list.Length() {
		in := list.Index(i)
		inputs[sim.PlayerID(in.Get("id").Int())] = sim.Input{
			MoveX: int8(in.Get("moveX").Int()),
			MoveY: int8(in.Get("moveY").Int()),
		}
	}
	state = sim.Step(state, inputs)
	return nil
}

// state() returns {tick, players: [{id, role, x, y}, ...]}.
func snapshot(js.Value, []js.Value) any {
	players := make([]any, len(state.Players))
	for i, p := range state.Players {
		players[i] = map[string]any{
			"id":   int(p.ID),
			"role": int(p.Role),
			"x":    int(p.Pos.X),
			"y":    int(p.Pos.Y),
		}
	}
	return map[string]any{"tick": int(state.Tick), "players": players}
}
