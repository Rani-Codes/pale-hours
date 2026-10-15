import assert from "node:assert/strict";
import { test } from "node:test";
import { beatAt } from "./heartbeat.ts";

const h = { range: 30, minBpm: 50, maxBpm: 150, minGain: 0.1, maxGain: 1, lubHz: 100, dubHz: 80, attack: 0.02, decay: 0.1, lowpassHz: 280 };

test("silent at and beyond the range", () => {
  assert.deepEqual(beatAt(30, h), { bpm: 0, gain: 0 });
  assert.deepEqual(beatAt(100, h), { bpm: 0, gain: 0 });
});

test("fastest and loudest on top of the killer", () => {
  assert.deepEqual(beatAt(0, h), { bpm: 150, gain: 1 });
});

test("gets faster and louder as the killer closes in", () => {
  let last = beatAt(29, h);
  for (const d of [25, 20, 15, 10, 5, 1]) {
    const b = beatAt(d, h);
    assert.ok(b.bpm > last.bpm && b.gain > last.gain, `distance ${d}`);
    last = b;
  }
});

test("a negative distance is treated as zero", () => {
  assert.deepEqual(beatAt(-5, h), beatAt(0, h));
});
