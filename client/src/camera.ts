/** A wall seen from above, in the renderer's ground plane (x east, z south). */
export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const M = 1_000_000; // micrometers per meter

/** The sim's boxes (y north, micrometers) as rectangles on the ground plane, in meters. */
export function rectsFrom(boxes: { minX: number; minY: number; maxX: number; maxY: number }[]): Rect[] {
  return boxes.map((b) => ({ minX: b.minX / M, maxX: b.maxX / M, minZ: -b.maxY / M, maxZ: -b.minY / M }));
}

/**
 * Where a third-person camera ends up when it wants to be at `to` and the
 * player is at `from`: stopped short of the first wall on the way, by its own
 * radius, but never closer to the player than minDistance.
 */
export function clipCamera(from: { x: number; z: number }, to: { x: number; z: number }, walls: Rect[], radius: number, minDistance: number): { x: number; z: number } {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len === 0) return from;
  let t = 1;
  for (const w of walls) {
    const [x0, x1] = span(from.x, dx, w.minX - radius, w.maxX + radius);
    const [z0, z1] = span(from.z, dz, w.minZ - radius, w.maxZ + radius);
    const enter = Math.max(x0, z0);
    const leave = Math.min(x1, z1);
    if (enter < leave && leave > 0 && enter < 1) t = Math.min(t, Math.max(enter, 0));
  }
  t = Math.min(1, Math.max(t, minDistance / len));
  return t === 1 ? to : { x: from.x + dx * t, z: from.z + dz * t };
}

/** The range of t along start + t * delta that lies between lo and hi. */
function span(start: number, delta: number, lo: number, hi: number): [number, number] {
  if (delta === 0) return start > lo && start < hi ? [-Infinity, Infinity] : [Infinity, -Infinity];
  const a = (lo - start) / delta;
  const b = (hi - start) / delta;
  return a < b ? [a, b] : [b, a];
}
