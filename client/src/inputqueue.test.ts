import assert from "node:assert/strict";
import { test } from "node:test";
import { InputQueue } from "./inputqueue.ts";

const limits = { backlogWindowTicks: 4, backlogSpare: 1, maxQueued: 6 };
const frames = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ seq: from + i, moveX: from + i, moveY: 0 }));
const takeX = (q: InputQueue, n: number) => Array.from({ length: n }, () => q.take().moveX);

test("applies inputs one per tick in seq order", () => {
  const q = new InputQueue(limits);
  q.push(frames(1, 3));
  assert.deepEqual(takeX(q, 3), [1, 2, 3]);
  assert.equal(q.ack, 3);
});

test("stands still while the next input is missing, then applies it late", () => {
  const q = new InputQueue(limits);
  assert.deepEqual(takeX(q, 2), [0, 0]);
  assert.equal(q.ack, 0);
  q.push(frames(1, 2));
  assert.deepEqual(takeX(q, 3), [1, 2, 0]);
  assert.equal(q.ack, 2);
});

test("ignores resent inputs it already applied", () => {
  const q = new InputQueue(limits);
  q.push(frames(1, 2));
  takeX(q, 2);
  q.push(frames(1, 3));
  assert.deepEqual(takeX(q, 2), [3, 0]);
});

test("skips to the oldest queued input when the guest gave up on earlier ones", () => {
  const q = new InputQueue(limits);
  q.push(frames(5, 6));
  assert.deepEqual(takeX(q, 2), [5, 6]);
  assert.equal(q.ack, 6);
});

test("drops one input after holding spare inputs for a whole window", () => {
  const q = new InputQueue(limits);
  q.push(frames(1, 6));
  assert.deepEqual(takeX(q, 3), [1, 2, 3]);
  q.push(frames(7, 7));
  // The fourth take ends the window with at least 3 spares throughout, so seq 4 is dropped.
  assert.deepEqual(takeX(q, 1), [5]);
  assert.equal(q.dropped, 1);
  assert.equal(q.ack, 5);
});

test("keeps a backlog that ran dry inside the window", () => {
  const q = new InputQueue(limits);
  q.push(frames(1, 1));
  takeX(q, 1);
  q.push(frames(2, 5));
  assert.deepEqual(takeX(q, 3), [2, 3, 4]);
  assert.equal(q.dropped, 0);
});

test("caps the queue and ignores seqs far ahead", () => {
  const q = new InputQueue(limits);
  q.push(frames(1, 8));
  assert.equal(q.depth, 6);
  assert.equal(q.dropped, 2);
  q.push([{ seq: 1000, moveX: 1, moveY: 0 }]);
  assert.equal(q.depth, 6);
  assert.deepEqual(takeX(q, 1), [3]);
});
