export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Which end of a pallet is hinged to a brick wall. axis is the pallet's long
 * side; hinge is -1 when its low end touches a wall (it stands against that
 * wall and falls toward the high end), 1 when only the high end does. A pallet
 * touching no wall has no hinge: the map never puts one in open ground.
 */
export function palletHinge(box: Box, walls: Box[]): { axis: "x" | "y"; hinge: -1 | 1 } | undefined {
  const axis = box.maxX - box.minX >= box.maxY - box.minY ? "x" : "y";
  const slop = 50_000;
  const touches = (end: Box) => walls.some((w) => end.minX <= w.maxX && w.minX <= end.maxX && end.minY <= w.maxY && w.minY <= end.maxY);
  const low = axis === "x" ? { ...box, maxX: box.minX + slop, minX: box.minX - slop } : { ...box, maxY: box.minY + slop, minY: box.minY - slop };
  const high = axis === "x" ? { ...box, minX: box.maxX - slop, maxX: box.maxX + slop } : { ...box, minY: box.maxY - slop, maxY: box.maxY + slop };
  if (touches(low)) return { axis, hinge: -1 };
  return touches(high) ? { axis, hinge: 1 } : undefined;
}
