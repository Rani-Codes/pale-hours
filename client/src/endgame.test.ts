import { strict as assert } from "node:assert";
import { test } from "node:test";
import { hearsHeartbeat, results, spectateTarget } from "./endgame.ts";
import { newPlayer } from "./sim.ts";

const rules = { roles: { survivor: 0, killer: 1 } };
const killer = newPlayer(1, 1, 0, 0, 1);
const surv = (id: number, extra = {}) => ({ ...newPlayer(id, 0, 0, 0, 1), ...extra });

test("spectating cycles through survivors in play, then the killer", () => {
  const players = [killer, surv(2, { escaped: true }), surv(3), surv(4, { onHook: 1, health: 2 })];
  assert.deepEqual([0, 1, 2, 3, -1].map((i) => spectateTarget(players, i, rules)?.id), [3, 4, 1, 3, 1]);
  assert.equal(spectateTarget([surv(2, { eliminated: true })], 0, rules), undefined);
});

test("no heartbeat while carried, hooked, or out", () => {
  assert.equal(hearsHeartbeat(surv(2)), true);
  assert.equal(hearsHeartbeat(surv(2, { health: 2 })), true);
  assert.equal(hearsHeartbeat(surv(2, { carried: true })), false);
  assert.equal(hearsHeartbeat(surv(2, { onHook: 3 })), false);
  assert.equal(hearsHeartbeat(surv(2, { escaped: true })), false);
  assert.equal(hearsHeartbeat(surv(2, { eliminated: true })), false);
});

test("the end screen speaks to each player", () => {
  const a = surv(2, { escaped: true });
  const b = surv(3, { eliminated: true });
  const players = [killer, a, b];
  assert.deepEqual(results(a, players, rules), { headline: "You escaped", lines: ["survivor 2: escaped", "survivor 3: killed"] });
  assert.equal(results(b, players, rules).headline, "You died");
  assert.equal(results(killer, players, rules).headline, "You killed 1 of 2");
  assert.equal(results(killer, [killer, b], rules).headline, "You killed them all");
  assert.equal(results(killer, [killer, a], rules).headline, "They all escaped");
});
