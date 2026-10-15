package sim

// Box is an axis-aligned wall in micrometers.
type Box struct{ MinX, MinY, MaxX, MaxY int32 }

const (
	meter     = 1_000_000
	wallThick = 500_000
)

// Walls is the gray-box layout: two walled buildings with doorways and
// windows to loop around, plus loose cover. The killer spawns at (-10, 0) m
// and survivors east of (10, 0) m, all in open ground. Collision lives here,
// not in the client, because the host decides where players end up.
var Walls = []Box{
	// Building A, north west. Doorways at the north and south, a window gap
	// in the west wall, and a pillar in the middle to circle.
	hWall(-24, -19, 20), hWall(-17, -12, 20),
	hWall(-24, -16, 8), hWall(-14, -12, 8),
	vWall(-24, 8, 12), vWall(-24, 14, 20),
	vWall(-12, 8, 20),
	block(-19, 13, -17, 15),

	// Building B, south east, mirrored but with its openings shifted.
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

// GateSites are the exits, on the north and south edges. They are
// doorways, not obstacles: players walk up to them and open them by hand.
var GateSites = []Vec2{
	{0, 28 * meter},
	{0, -28 * meter},
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

// hitWall returns the obstacle whose radius-grown box contains the player's
// centre: a wall, or a generator's body. Touching a face does not count.
func hitWall(p Vec2) (Box, bool) {
	for _, w := range Walls {
		if inGrown(p, w) {
			return w, true
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
	_, ok := hitWall(p)
	return ok
}
