import { strict as assert } from "node:assert";
import { test } from "node:test";
import { palletHinge } from "./pallet.ts";

const m = 1_000_000;
const wall = (minX: number, minY: number, maxX: number, maxY: number) => ({ minX: minX * m, minY: minY * m, maxX: maxX * m, maxY: maxY * m });
const east = wall(-24, 19.75, -19, 20.25); // building wall ending at x = -19
const west = wall(-17, 19.75, -12, 20.25); // and one starting at x = -17

test("a pallet in a doorway is hinged at its low end, falling toward the high one", () => {
  const door = wall(-19, 19.75, -17, 20.25);
  assert.deepEqual(palletHinge(door, [east, west]), { axis: "x", hinge: -1 });
});

test("a pallet hinged only at its high end falls the other way", () => {
  const stub = wall(16, 7.75, 18, 8.25);
  assert.deepEqual(palletHinge(stub, [wall(18, 7.75, 26, 8.25)]), { axis: "x", hinge: 1 });
});

test("a pallet along y is measured on y", () => {
  const post = wall(5.75, 0, 6.25, 2);
  assert.deepEqual(palletHinge(post, [wall(5.75, -8, 6.25, 0)]), { axis: "y", hinge: -1 });
});

test("a pallet touching no wall has no hinge", () => {
  assert.equal(palletHinge(wall(40, 40, 42, 40.5), [east, west]), undefined);
});
