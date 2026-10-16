import { strict as assert } from "node:assert";
import { test } from "node:test";
import { newlyDone } from "./genflash.ts";

test("a generator flashes once, when it reaches its last tick", () => {
  const known: number[] = [];
  assert.deepEqual(newlyDone(known, [0, 90, 100], 100), [], "first sight flashes nothing");
  assert.deepEqual(newlyDone(known, [10, 100, 100], 100), [1]);
  assert.deepEqual(newlyDone(known, [10, 100, 100], 100), []);
  assert.deepEqual(newlyDone(known, [100, 100, 100], 100), [0]);
});

test("a rematch resets quietly", () => {
  const known = [100, 100];
  assert.deepEqual(newlyDone(known, [0, 0], 100), []);
  assert.deepEqual(newlyDone(known, [100, 50], 100), [0]);
});
