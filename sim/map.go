package sim

import "slices"

// Box is an axis-aligned wall in micrometers.
type Box struct{ MinX, MinY, MaxX, MaxY int32 }

const (
	meter     = 1_000_000
	wallThick = 500_000
)

// Walls is the gray-box layout: two walled buildings with doorways and
// windows to loop around, plus loose cover. Players spawn at random in open ground
// (see Spawns). Collision lives here,
// not in the client, because the host decides where players end up.
var Walls = []Box{
	// Building A, north west. Doorways at the north and south, a window
	// (see Vaults) in the west wall, and a pillar in the middle to circle.
	hWall(-24, -19, 20), hWall(-17, -12, 20),
	hWall(-24, -16, 8), hWall(-14, -12, 8),
	vWall(-24, 8, 12), vWall(-24, 14, 20),
	vWall(-12, 8, 20),
	block(-19, 13, -17, 15),

	// Building B, south east, mirrored but with its openings shifted; its
	// window is in the east wall.
	hWall(12, 16, -10), hWall(18, 24, -10),
	hWall(12, 19, -22), hWall(21, 24, -22),
	vWall(12, -22, -10),
	vWall(24, -22, -17), vWall(24, -15, -10),
	block(17, -17, 19, -15),

	// Long walls either side of the centre lane.
	vWall(0, 8, 24),
	vWall(0, -24, -8),

	// Loose cover.
	block(-9, -19, -6, -16),
	block(6, 16, 9, 19),
	hWall(-26, -18, -8),
	hWall(18, 26, 8),

	// Window loops in the open: a wall either side of a vault, to run around
	// while the killer chases, and to cut through where he cannot.
	hWall(-16, -14, -14), hWall(-12, -10, -14),
	vWall(12, 11, 13), vWall(12, 15, 17),
	vWall(-4, 2, 4), vWall(-4, 6, 8),
}

// Vaults are waist-high walls: they block walking like Walls, a survivor
// beside one can vault over it, and the killer's swing reaches across.
var Vaults = []Box{
	vWall(-24, 12, 14),  // building A's west window
	vWall(24, -17, -15), // building B's east window
	hWall(-14, -12, -14),
	vWall(12, 13, 15),
	vWall(-4, 4, 6),
}

// PalletSites are the wooden pallets: thin boxes hinged to a brick wall, in the
// doorways of the two buildings and at the end of two loose walls, where a
// chase ends up. Every one touches a wall at one end, and falls across its gap
// away from it. A standing pallet is walked through; thrown down once by a
// survivor it blocks everyone and can be vaulted, until the killer breaks it.
var PalletSites = []Box{
	hWall(-19, -17, 20), // building A, north doorway
	hWall(-16, -14, 8),  // building A, south doorway
	hWall(16, 18, -10),  // building B, north doorway
	hWall(19, 21, -22),  // building B, south doorway
	hWall(-18, -16, -8), // the east end of the loose wall at y = -8
	hWall(16, 18, 8),    // the west end of the loose wall at y = 8
}

// GenSites are the generator positions. They block movement like walls.
// Two are inside the buildings, the rest are in the open.
var GenSites = []Vec2{
	{-21 * meter, 17 * meter},
	{21 * meter, -13 * meter},
	{0, 5 * meter},
	{-20 * meter, -20 * meter},
	{20 * meter, 20 * meter},
}

// GateSites are the exits, set into the fence on the north and south
// edges. A shut gate blocks its opening; behind it an exit lane runs
// outward, and a survivor who walks ExitDepth down it escapes. A site on
// the north half leads north, any other south.
var GateSites = []Vec2{
	{0, MapHalfExtent},
	{0, -MapHalfExtent},
}

// Fences close the map's four edges, with a gap at each gate, and Lanes are
// the walls of the exit lanes behind the gates. Both block movement like
// Walls. They follow GateSites; call edges again after changing it.
var Fences, Lanes = edges(GateSites)

// outer is how far from the centre anything can ever be: the ends of the lanes.
const outer = MapHalfExtent + ExitDepth + 2*meter

func edges(gates []Vec2) (fences, lanes []Box) {
	const e, t = MapHalfExtent, wallThick / 2
	fences = []Box{{-e - t, -e - t, -e + t, e + t}, {e - t, -e - t, e + t, e + t}}
	for _, dir := range []int32{1, -1} {
		var gaps []Vec2
		for _, g := range gates {
			if outward(g) == dir {
				gaps = append(gaps, g)
			}
		}
		slices.SortFunc(gaps, func(a, b Vec2) int { return int(a.X - b.X) })
		x := int32(-e - t)
		for _, g := range gaps {
			fences = append(fences, Box{x, dir*e - t, g.X - GateHalfWidth, dir*e + t})
			x = g.X + GateHalfWidth
			// Side walls the length of the lane plus a metre, and an end wall.
			end := dir * (e + ExitDepth + meter)
			y0, y1 := min(dir*e, end), max(dir*e, end)
			lanes = append(lanes,
				Box{g.X - GateHalfWidth - 2*t, y0, g.X - GateHalfWidth, y1},
				Box{g.X + GateHalfWidth, y0, g.X + GateHalfWidth + 2*t, y1},
				Box{g.X - GateHalfWidth - 2*t, min(end, end+dir*2*t), g.X + GateHalfWidth + 2*t, max(end, end+dir*2*t)},
			)
		}
		fences = append(fences, Box{x, dir*e - t, e + t, dir*e + t})
	}
	return fences, lanes
}

// outward is the direction a gate's lane runs in Y: 1 north, -1 south.
func outward(g Vec2) int32 {
	if g.Y > 0 {
		return 1
	}
	return -1
}

// gateLeaf is the box a shut gate fills: its opening, on the gate line.
func gateLeaf(g Vec2) Box {
	return Box{g.X - GateHalfWidth, g.Y - wallThick/2, g.X + GateHalfWidth, g.Y + wallThick/2}
}

// outThrough reports whether pos is ExitDepth or more down a gate's lane.
func outThrough(pos Vec2) bool {
	for _, g := range GateSites {
		if abs(pos.X-g.X) <= GateHalfWidth && outward(g)*(pos.Y-g.Y) >= ExitDepth {
			return true
		}
	}
	return false
}

func abs(v int32) int32 { return max(v, -v) }

// Grass is tall grass in open ground. A survivor crouched in it hides from
// the killer's screen. The patches are small and kept apart: places to run
// to, not a place to live.
var Grass = []Box{
	block(4, 8, 10, 14),
	block(-9, -12, -3, -6),
	block(-28, -6, -22, 0),
	block(22, -2, 28, 4),
	block(14, 24, 21, 28),
	block(-18, 22, -12, 27),
}

// HookSites are where the killer hangs survivors, spread through open
// ground so one is always a short carry away. They do not block movement.
var HookSites = []Vec2{
	{-6 * meter, 10 * meter},
	{6 * meter, -10 * meter},
	{-16 * meter, 0},
	{20 * meter, 0},
	{-10 * meter, -24 * meter},
	{10 * meter, 24 * meter},
}

func hWall(x0, x1, y int32) Box {
	return Box{x0 * meter, y*meter - wallThick/2, x1 * meter, y*meter + wallThick/2}
}

func vWall(x, y0, y1 int32) Box {
	return Box{x*meter - wallThick/2, y0 * meter, x*meter + wallThick/2, y1 * meter}
}

func block(x0, y0, x1, y1 int32) Box {
	return Box{x0 * meter, y0 * meter, x1 * meter, y1 * meter}
}

// blockers are the movable obstacles for one role: gates[i] is set while gate
// i is shut to them, pallets[i] while pallet i lies dropped.
type blockers struct{ gates, pallets []bool }

// hitWall returns the obstacle whose radius-grown box contains the player's
// centre: a wall, a fence, a generator's body, a shut gate or a dropped pallet
// as b says. Touching a face does not count.
func hitWall(p Vec2, b blockers) (Box, bool) {
	for i, g := range GateSites {
		if i < len(b.gates) && b.gates[i] && inGrown(p, gateLeaf(g)) {
			return gateLeaf(g), true
		}
	}
	for i, box := range PalletSites {
		if i < len(b.pallets) && b.pallets[i] && inGrown(p, box) {
			return box, true
		}
	}
	for _, list := range [][]Box{Walls, Vaults, Fences, Lanes} {
		for _, w := range list {
			if inGrown(p, w) {
				return w, true
			}
		}
	}
	for _, g := range GenSites {
		b := Box{g.X - GeneratorHalf, g.Y - GeneratorHalf, g.X + GeneratorHalf, g.Y + GeneratorHalf}
		if inGrown(p, b) {
			return b, true
		}
	}
	return Box{}, false
}

func inGrown(p Vec2, w Box) bool {
	return p.X > w.MinX-PlayerRadius && p.X < w.MaxX+PlayerRadius &&
		p.Y > w.MinY-PlayerRadius && p.Y < w.MaxY+PlayerRadius
}

func inWall(p Vec2) bool {
	_, ok := hitWall(p, blockers{})
	return ok
}
