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

	// A missed skill check lights up its generator for the killer this long.
	NoiseTicks = 2 * TickRate

	GensRequired = 4 // generators that must be done to power the gates
	GateCount    = 2
	GateTicks    = 5 * TickRate // hand-opening time for one survivor
	GateRange    = 2_500_000    // centre to centre, to open it or to walk out

	MaxAxis = 127 // full stick deflection on one Input axis

	// The killer's attack: a visible windup, one tick to resolve, then a
	// recovery that is longer on a whiff so missing costs something.
	AttackWindupTicks      = 6  // 0.2 s
	AttackRecoverHitTicks  = 18 // 0.6 s
	AttackRecoverMissTicks = 30 // 1.0 s
	AttackRange            = 2_200_000
	AttackHalfAngleDeg     = 50 // the cone is twice this wide
	KillerRecoverSpeed     = 2_400_000

	// A hit survivor sprints for a moment so the chase goes on.
	HitBoostTicks = 2 * TickRate
	HitBoostSpeed = 5_600_000
	CrawlSpeed    = 700_000 // a downed survivor

	// Lag compensation: a swing is checked against survivors as the killer
	// saw them, at most this far back. TrailLen ticks of positions are kept;
	// it must be a power of two and cover the cap plus two ticks.
	RewindCapMs = 200
	TrailLen    = 8
)

var roleSpeed = [...]int64{
	Survivor: SurvivorSpeed,
	Killer:   KillerSpeed,
}
