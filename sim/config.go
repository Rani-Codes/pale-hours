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
	// recovery before the next swing that is longer on a whiff, so missing
	// costs something. He moves at full speed throughout.
	AttackWindupTicks      = 6  // 0.2 s
	AttackRecoverHitTicks  = 18 // 0.6 s
	AttackRecoverMissTicks = 30 // 1.0 s
	AttackRange            = 2_200_000
	AttackHalfAngleDeg     = 50 // the cone is twice this wide

	// A hit shoves the survivor forward: a short burst that carries a
	// running survivor HitBoostDistance.
	HitBoostDistance = 2_200_000
	HitBoostTicks    = 10
	HitBoostSpeed    = HitBoostDistance * TickRate / HitBoostTicks
	CrawlSpeed       = 700_000 // a downed survivor

	// Downed. Left alone long enough, a survivor gets back up injured. The
	// timer keeps running on the killer's shoulder; if it fills there they
	// break free injured and the killer is stunned. A teammate holding E
	// beside them gets a skill check almost at once; a good one stands them
	// up injured.
	DownedRecoverTicks = 60 * TickRate
	StunTicks          = 1 * TickRate
	ReviveRange        = 1_500_000
	ReviveCheckDelay   = 6 // ticks of holding E before each help check

	// Carry and hook. The killer presses E by a downed survivor to pick them
	// up, and again to hang them on a hook in range or drop them elsewhere.
	PickupRange      = 1_500_000
	KillerCarrySpeed = 3_800_000
	HookCount        = 6
	HookRange        = 2_000_000
	// Each survivor has this much hook time in total, across every hook;
	// rescue does not refill it. When it runs out they are eliminated.
	HookTicks   = 60 * TickRate
	RescueRange = 1_500_000
	RescueTicks = 1 * TickRate // a teammate holding E this long unhooks them
	// A hooked survivor gets skill checks on the generator schedule; each
	// miss costs this much hook time.
	HookCheckPenalty = 5 * TickRate

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
