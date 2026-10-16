import { strict as assert } from "node:assert";
import { test } from "node:test";
import { HookAlerts } from "./hookalert.ts";
import { newPlayer, type SimPlayer } from "./sim.ts";

const roles = { survivor: 0 };
const killer = newPlayer(1, 1, 0, 0, 1);
const a = newPlayer(2, 0, 0, 0, 2);
const b = newPlayer(3, 0, 0, 0, 3);
const hung = (p: SimPlayer, hook: number): SimPlayer => ({ ...p, onHook: hook, health: 2 });

test("other survivors see a fresh hook for the show time", () => {
  const alerts = new HookAlerts(3000, roles);
  assert.deepEqual(alerts.update([killer, a, b], 3, 0), []);
  assert.deepEqual(alerts.update([killer, hung(a, 4), b], 3, 1000), [{ id: 2, hook: 3, left: 1 }]);
  assert.deepEqual(alerts.update([killer, hung(a, 4), b], 3, 2500), [{ id: 2, hook: 3, left: 0.5 }]);
  assert.deepEqual(alerts.update([killer, hung(a, 4), b], 3, 4000), [], "gone after three seconds");
});

test("not the hooked survivor, not the killer", () => {
  const alerts = new HookAlerts(3000, roles);
  assert.deepEqual(alerts.update([killer, hung(a, 1), b], 2, 0), []);
  assert.deepEqual(alerts.update([killer, hung(a, 1), b], 1, 0), []);
  assert.equal(alerts.update([killer, hung(a, 1), b], 3, 0).length, 1, "the same hook still shows to a teammate");
});

test("a second hooking shows again", () => {
  const alerts = new HookAlerts(3000, roles);
  alerts.update([killer, hung(a, 1), b], 3, 0);
  alerts.update([killer, a, b], 3, 5000);
  assert.deepEqual(alerts.update([killer, hung(a, 1), b], 3, 9000), [{ id: 2, hook: 0, left: 1 }]);
  assert.deepEqual(alerts.update([killer, hung(a, 2), b], 3, 9500), [{ id: 2, hook: 1, left: 1 }], "a different hook straight away counts too");
});
