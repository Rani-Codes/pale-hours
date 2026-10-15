package sim

// Distances are in micrometers so the sim stays in integer math and every
// platform (native Go, WASM in any browser) produces identical state.
const (
	TickRate = 30 // ticks per second

	MapHalfExtent = 30_000_000 // the plane spans -30m..30m on both axes

	SurvivorSpeed = 4_000_000 // per second
	KillerSpeed   = 4_600_000 // per second

	PlayerRadius = 400_000 // half-width of the square collision body

	GeneratorCount = 5
	GeneratorHalf  = 500_000       // half the side of a generator's square body
	RepairRange    = 1_800_000     // centre to centre, so you can stand at any face
	GeneratorTicks = 80 * TickRate // repair work for one survivor alone

	// A skill check appears every CheckMinGap..CheckMaxGap ticks of repairing.
	// The player has CheckDuration ticks to press; the good zone starts
	// CheckZoneMin..CheckZoneMax ticks in and lasts CheckZoneLen ticks.
	CheckMinGap   = 4 * TickRate
	CheckMaxGap   = 9 * TickRate
	CheckDuration = 45
	CheckZoneMin  = 18
	CheckZoneMax  = 33
	CheckZoneLen  = 7
	CheckBonus    = 1 * TickRate // ticks of progress gained on a hit
	CheckPenalty  = 3 * TickRate // ticks lost on a miss

	MaxAxis = 127 // full stick deflection on one Input axis
)

var roleSpeed = [...]int64{
	Survivor: SurvivorSpeed,
	Killer:   KillerSpeed,
}
