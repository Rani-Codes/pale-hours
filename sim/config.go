package sim

// Distances are in micrometers so the sim stays in integer math and every
// platform (native Go, WASM in any browser) produces identical state.
const (
	TickRate = 30 // ticks per second

	MapHalfExtent = 30_000_000 // the plane spans -30m..30m on both axes

	SurvivorSpeed = 4_000_000 // per second
	KillerSpeed   = 4_600_000 // per second

	MaxAxis = 127 // full stick deflection on one Input axis
)

var roleSpeed = [...]int64{
	Survivor: SurvivorSpeed,
	Killer:   KillerSpeed,
}
