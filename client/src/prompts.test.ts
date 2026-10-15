import { strict as assert } from "node:assert";
import { test } from "node:test";
import { healthPips, killerPrompts, status, survivorPrompts } from "./prompts.ts";
import { newPlayer } from "./sim.ts";

const rules = {
  health: { healthy: 0, injured: 1, downed: 2 },
  roles: { survivor: 0, killer: 1 },
  tickRate: 30,
  hookTicks: 1800,
  hookSites: [{ x: 0, y: 0 }],
  hookRange: 2_000_000,
  rescueTicks: 30,
  rescueRange: 1_500_000,
  reviveRange: 1_500_000,
  pickupRange: 1_500_000,
  recoverTicks: 1800,
};
const survivor = (id: number, x: number, extra = {}) => ({ ...newPlayer(id, 0, x, 0, 1), ...extra });

test("health bar: two squares healthy, one injured, none down, carried or hooked", () => {
  assert.equal(healthPips(survivor(2, 0), rules), 2);
  assert.equal(healthPips(survivor(2, 0, { health: 1 }), rules), 1);
  assert.equal(healthPips(survivor(2, 0, { health: 2 }), rules), 0);
  assert.equal(healthPips(survivor(2, 0, { health: 2, carried: true }), rules), 0);
  assert.equal(healthPips(survivor(2, 0, { health: 2, onHook: 1 }), rules), 0);
});

test("status names the hook time left", () => {
  assert.equal(status(survivor(2, 0, { health: 2, onHook: 1, hookUsed: 1800 - 45 }), rules), "on hook, 2 s left");
});

test("a survivor beside a downed teammate is told to help, beside a hooked one to unhook", () => {
  const me = survivor(2, 1_000_000);
  assert.deepEqual(survivorPrompts(me, [me, survivor(3, 0, { health: 2 })], rules), ["hold E to help them up"]);
  assert.deepEqual(survivorPrompts(me, [me, survivor(3, 0, { health: 2, onHook: 1 })], rules), ["hold E to unhook them"]);
  assert.deepEqual(survivorPrompts(me, [me, survivor(3, 5_000_000, { health: 2 })], rules), []);
});

test("the killer is prompted to pick up, then to hang by a free hook", () => {
  const killer = { ...newPlayer(1, 1, 1_000_000, 0, 1) };
  assert.deepEqual(killerPrompts(killer, [killer, survivor(2, 0, { health: 2 })], rules), ["press E to pick them up"]);
  const carrying = { ...killer, carrying: 2 };
  assert.deepEqual(killerPrompts(carrying, [carrying], rules), ["press E to hang them on the hook"]);
  assert.deepEqual(killerPrompts(carrying, [carrying, survivor(3, 0, { onHook: 1 })], rules), ["carrying: find a hook, or press E to drop them"]);
});
