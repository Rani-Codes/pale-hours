package sim

import "testing"

func TestSpawnsAreValid(t *testing.T) {
	for _, tc := range []struct {
		name      string
		survivors int
	}{{"one survivor", 1}, {"two", 2}, {"four", 4}} {
		t.Run(tc.name, func(t *testing.T) {
			for seed := uint32(1); seed <= 2000; seed++ {
				got := Spawns(seed, tc.survivors)
				if len(got) != tc.survivors+1 {
					t.Fatalf("seed %d: got %d spawns, want %d", seed, len(got), tc.survivors+1)
				}
				for i, p := range got {
					if _, hit := hitWall(p, nil); hit {
						t.Fatalf("seed %d: spawn %d at %v is inside an obstacle", seed, i, p)
					}
					if abs(p.X) > MapHalfExtent-SpawnEdgeMargin || abs(p.Y) > MapHalfExtent-SpawnEdgeMargin {
						t.Fatalf("seed %d: spawn %d at %v is too near the fence", seed, i, p)
					}
					if i > 0 && max(abs(p.X-got[0].X), abs(p.Y-got[0].Y)) < SpawnKillerGap {
						t.Fatalf("seed %d: survivor %d at %v is closer than %d to the killer at %v", seed, i, p, SpawnKillerGap, got[0])
					}
					for j := 1; j < i; j++ {
						if distSq(p, got[j]) < SpawnSurvivorGap*SpawnSurvivorGap {
							t.Fatalf("seed %d: survivors %d and %d overlap", seed, j, i)
						}
					}
				}
			}
		})
	}
}

func TestSpawnsAreDeterministicAndVary(t *testing.T) {
	a, b := Spawns(7, 4), Spawns(7, 4)
	for i := range a {
		if a[i] != b[i] {
			t.Fatalf("same seed gave %v then %v", a, b)
		}
	}
	seen := map[Vec2]bool{}
	for seed := uint32(1); seed <= 50; seed++ {
		seen[Spawns(seed, 1)[0]] = true
	}
	if len(seen) < 40 {
		t.Fatalf("only %d distinct killer spawns in 50 seeds", len(seen))
	}
}
