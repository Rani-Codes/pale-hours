package sim

// Distances are in micrometers so the sim stays in integer math and every
// platform (native Go, WASM in any browser) produces identical state.
const (
	TickRate = 30 // ticks per second

	MapHalfExtent = 30_000_000 // the plane spans -30m..30m on both axes

	SurvivorSpeed = 4_000_000 // per second
	KillerSpeed   = 4_600_000 // per second

	PlayerRadius = 400_000 // half-width of the square collision body

	// A survivor within PalletReach of a standing pallet, on either side of it or
	// even standing in it, can throw it down once.
	// A killer within PalletStunRange of it then is stunned PalletStunTicks. A
	// killer within PalletBreakReach of a dropped one breaks it by holding E
	// for PalletBreakTicks.
	PalletReach      = 3_000_000
	PalletStunRange  = 3_000_000
	PalletStunTicks  = 3 * TickRate
	PalletBreakReach = 1_800_000
	PalletBreakTicks = 3 * TickRate

	// Where a match may place players. Every survivor starts at least
	// SpawnKillerGap from the killer on x or on y, and SpawnSurvivorGap from
	// each other. SpawnClearance keeps them off walls, SpawnEdgeMargin off the fence.
	SpawnKillerGap   = 5_000_000
	SpawnSurvivorGap = 2_000_000
	SpawnClearance   = 1_000_000
	SpawnEdgeMargin  = 2_000_000

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
	CheckBonus    = GeneratorTicks * 3 / 100 // ticks of progress gained on a hit, 3%
	CheckPenalty  = 3 * TickRate             // ticks lost on a miss, 3.75%

	// A missed skill check lights up its generator for everyone this long.
	NoiseTicks = 3 * TickRate / 2

	GensRequired = 4 // generators that must be done to power the gates
	GateCount    = 2
	GateTicks    = 15 * TickRate / 2 // 7.5 s of hand-opening for one survivor
	GateRange    = 2_500_000         // from the gate's centre, to open it
	// The gate sits in the fence. Its opening is twice GateHalfWidth wide and
	// leads into a walled exit lane; a survivor escapes once they are
	// ExitDepth down it. The killer never gets past the gate line, but his
	// swing reaches into the lane.
	GateHalfWidth = 1_750_000
	ExitDepth     = 5_000_000
	// Opening a gate brings skill checks every GateCheckMinGap..GateCheckMaxGap
	// ticks of holding E. A hit adds GateCheckBonus ticks, a miss takes
	// GateCheckPenalty away.
	GateCheckMinGap  = 2 * TickRate
	GateCheckMaxGap  = 3 * TickRate
	GateCheckBonus   = TickRate / 2
	GateCheckPenalty = 3 * TickRate / 2

	MaxAxis = 127 // full stick deflection on one Input axis

	// The killer's attack: a visible windup, one tick to resolve, then a
	// recovery before the next swing that is longer on a whiff, so missing
	// costs something. A double hit is at least a second and a half apart. He
	// moves at full speed throughout.
	AttackWindupTicks      = 6  // 0.2 s
	AttackRecoverHitTicks  = 36 // 1.2 s
	AttackRecoverMissTicks = 42 // 1.4 s
	AttackRange            = 1_760_000
	AttackHalfAngleDeg     = 50 // the cone is twice this wide

	// A hit sends the survivor sprinting: HitBoostSpeed for HitBoostTicks
	// while they run, enough to leave a chasing killer several metres behind
	// (his speed is 4.6 m/s, theirs 4.0).
	HitBoostSpeed    = 7_500_000
	HitBoostTicks    = 60 // 2 s
	HitBoostDistance = HitBoostSpeed * HitBoostTicks / TickRate
	CrawlSpeed       = 700_000 // a downed survivor

	// Downed. Left alone long enough, a survivor gets back up injured. The
	// timer keeps running on the killer's shoulder; if it fills there they
	// break free injured and the killer is stunned. A teammate holding E
	// beside them gets a skill check almost at once; a good one stands them
	// up injured.
	DownedRecoverTicks = 60 * TickRate
	StunTicks          = 3 * TickRate / 2 // the killer's stun when a carried survivor breaks free
	StruggleTicks      = 1 * TickRate     // each alternating E or Q press takes this much off a carry
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
	// A hooked survivor can press E to wriggle off: HookEscapeChance percent
	// a try, HookEscapeTries tries each time they are hung. They come down
	// injured with their hook time kept, as if rescued.
	HookEscapeChance = 10
	HookEscapeTries  = 2

	// The killer stands still for this long when a match starts, so
	// survivors can scatter.
	SpawnFreezeTicks = 5 * TickRate

	// Vaults: a survivor beside one presses Space to go over it in
	// VaultTicks; the killer has to go around. VaultReach is how far from
	// the face they can start, VaultClear how far past it they land.
	VaultTicks = 18 // 0.6 s
	VaultReach = 600_000
	VaultClear = 50_000

	// Crouching in tall grass hides a survivor from the killer's screen once
	// they have settled, unless he is within HideRevealRange. Crouching is slow,
	// and a crouched survivor cannot repair, open a gate or vault.
	CrouchSpeed     = 1_600_000
	HideSettleTicks = TickRate / 2
	HideRevealRange = 5_000_000

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
