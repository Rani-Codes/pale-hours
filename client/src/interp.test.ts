import assert from "node:assert/strict";
import { test } from "node:test";
import { SnapshotBuffer } from "./interp.ts";

const tickMs = 10;
const snap = (tick: number, x: number) => ({ tick, players: [{ id: 2, role: 0, x, y: 0 }] });
const xAt = (b: SnapshotBuffer, now: number) => b.sample(now)[0]?.x;

test("draws remote players the configured delay behind the host clock", () => {
  // Snapshots arrive 20 ms after their tick; delay is 3 ticks.
  const b = new SnapshotBuffer(tickMs, 30, 1);
  b.push(snap(0, 0), 20);
  b.push(snap(2, 200), 40);
  b.push(snap(4, 400), 60);
  // At 70 ms the host clock reads tick 5, and 3 ticks of delay puts the render at tick 2.
  assert.equal(xAt(b, 70), 200);
  assert.equal(xAt(b, 80), 300);
});

test("interpolates across a lost snapshot", () => {
  const b = new SnapshotBuffer(tickMs, 30, 1);
  b.push(snap(0, 0), 0);
  b.push(snap(4, 400), 40);
  // Host clock reads tick 5 at 50 ms, so 3 ticks behind is tick 2: halfway from 0 to 4.
  assert.equal(xAt(b, 50), 200);
});

test("holds the newest snapshot when nothing later has arrived", () => {
  const b = new SnapshotBuffer(tickMs, 0, 1);
  b.push(snap(0, 0), 0);
  b.push(snap(2, 200), 20);
  assert.equal(xAt(b, 100), 200);
});

test("orders snapshots that arrive out of order", () => {
  const b = new SnapshotBuffer(tickMs, 0, 0);
  b.push(snap(0, 0), 0);
  b.push(snap(4, 400), 40);
  b.push(snap(2, 100), 41);
  assert.equal(xAt(b, 20), 100);
  assert.equal(xAt(b, 30), 250);
});

test("never draws backwards when the clock estimate slips", () => {
  const b = new SnapshotBuffer(tickMs, 0, 1);
  b.push(snap(0, 0), 0);
  b.push(snap(4, 400), 40);
  assert.equal(b.renderTick(40), 4);
  // A snapshot 3 ticks late pulls the clock back 3 ticks and widens the delay by twice that.
  b.push(snap(5, 500), 80);
  assert.equal(b.renderTick(80), 4);
  assert.equal(b.renderTick(160), 7);
});

test("draws nothing before the first snapshot", () => {
  const b = new SnapshotBuffer(tickMs, 30, 1);
  assert.deepEqual(b.sample(0), []);
});
