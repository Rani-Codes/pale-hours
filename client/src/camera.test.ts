import { strict as assert } from "node:assert";
import { test } from "node:test";
import { clipCamera, rectsFrom } from "./camera.ts";

const origin = { x: 0, z: 0 };
const behind = { x: 0, z: 3.6 }; // where the camera wants to be, 3.6 m back
const wallAt = (z: number) => ({ minX: -5, maxX: 5, minZ: z - 0.25, maxZ: z + 0.25 }); // a 0.5 m thick wall across the path

test("with nothing in the way the camera sits where it wanted", () => {
  assert.deepEqual(clipCamera(origin, behind, [], 0.25, 0.8), behind);
});

test("a wall behind the player stops the camera in front of it", () => {
  const at = clipCamera(origin, behind, [wallAt(2)], 0.25, 0.8);
  assert.equal(at.x, 0);
  // the wall's near face is at z = 1.75 and the camera keeps its own radius off it
  assert.ok(Math.abs(at.z - 1.5) < 1e-9, `camera at ${at.z}`);
});

test("a wall farther than the camera wants to go changes nothing", () => {
  assert.deepEqual(clipCamera(origin, behind, [wallAt(6)], 0.25, 0.8), behind);
});

test("a wall beside the path is not in the way", () => {
  const side = { minX: 2, maxX: 3, minZ: 0, maxZ: 5 };
  assert.deepEqual(clipCamera(origin, behind, [side], 0.25, 0.8), behind);
});

test("the camera never comes closer than the minimum, however near the wall", () => {
  const at = clipCamera(origin, behind, [wallAt(0.6)], 0.25, 0.8);
  assert.ok(Math.abs(at.z - 0.8) < 1e-9, `camera at ${at.z}`);
});

test("the nearest of several walls wins", () => {
  const at = clipCamera(origin, behind, [wallAt(3), wallAt(2)], 0.25, 0.8);
  assert.ok(Math.abs(at.z - 1.5) < 1e-9, `camera at ${at.z}`);
});

test("sim boxes turn into rectangles on the ground plane: x stays, y flips to -z", () => {
  const [r] = rectsFrom([{ minX: 1_000_000, minY: 2_000_000, maxX: 3_000_000, maxY: 2_500_000 }]);
  assert.deepEqual(r, { minX: 1, maxX: 3, minZ: -2.5, maxZ: -2 });
});
