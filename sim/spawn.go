package sim

// Spawns places a match's players in random open ground: index 0 is the
// killer, then one per survivor. Same seed, same places. A spot must clear
// every obstacle by SpawnClearance, sit SpawnEdgeMargin inside the fence,
// and every survivor must start at least SpawnKillerGap from the killer on
// one axis or the other, so nobody begins in his arms.
func Spawns(seed uint32, survivors int) []Vec2 {
	state := seed
	out := make([]Vec2, 0, survivors+1)
	for len(out) < survivors+1 {
		p := Vec2{drawCoord(&state), drawCoord(&state)}
		if !openGround(p) || !apart(p, out) {
			continue
		}
		out = append(out, p)
	}
	return out
}

func drawCoord(state *uint32) int32 {
	const half = MapHalfExtent - SpawnEdgeMargin
	return int32(rand(state)%(2*half)) - half
}

// openGround reports whether a player standing at p, and SpawnClearance
// around them, touches no wall, vault, fence, lane or generator.
func openGround(p Vec2) bool {
	for _, d := range []Vec2{{0, 0}, {SpawnClearance, 0}, {-SpawnClearance, 0}, {0, SpawnClearance}, {0, -SpawnClearance}} {
		if _, hit := hitWall(Vec2{p.X + d.X, p.Y + d.Y}, blockers{}); hit {
			return false
		}
	}
	return true
}

// apart reports whether p keeps its distance from those already placed:
// the first of them is the killer.
func apart(p Vec2, placed []Vec2) bool {
	for i, q := range placed {
		if i == 0 && max(abs(p.X-q.X), abs(p.Y-q.Y)) < SpawnKillerGap {
			return false
		}
		if i > 0 && distSq(p, q) < SpawnSurvivorGap*SpawnSurvivorGap {
			return false
		}
	}
	return true
}
