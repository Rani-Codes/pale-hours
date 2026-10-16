import { strict as assert } from "node:assert";
import { test } from "node:test";
import { hearsHeartbeat, newExits, results, spectateTarget, survivorsWin } from "./endgame.ts";
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

const name = (id: number) => `P${id}`;

test("the end screen says who won, then speaks to each player", () => {
  const a = surv(2, { escaped: true });
  const b = surv(3, { eliminated: true });
  const players = [killer, a, b];
  assert.deepEqual(results(a, players, rules, name), { headline: "Game over: the survivors win", you: "You escaped", lines: ["P2: escaped", "P3: killed"] });
  assert.equal(results(b, players, rules, name).you, "You died");
  assert.equal(results(killer, players, rules, name).you, "You killed 1 of 2");
  assert.equal(results(killer, [killer, b], rules, name).you, "You killed them all");
  assert.equal(results(killer, [killer, b], rules, name).headline, "Game over: the killer wins");
  assert.equal(results(killer, [killer, a], rules, name).you, "They all escaped");
});

test("survivors win when half or more get out", () => {
  const e = (id: number) => surv(id, { escaped: true });
  const d = (id: number) => surv(id, { eliminated: true });
  assert.equal(survivorsWin([killer, e(2)], rules), true);
  assert.equal(survivorsWin([killer, d(2)], rules), false);
  assert.equal(survivorsWin([killer, e(2), d(3)], rules), true, "1 of 2 is half");
  assert.equal(survivorsWin([killer, e(2), d(3), d(4)], rules), false);
  assert.equal(survivorsWin([killer, e(2), e(3), d(4)], rules), true);
  assert.equal(survivorsWin([killer, e(2), d(3), d(4), d(5)], rules), false);
  assert.equal(survivorsWin([killer], rules), false);
});

test("an exit is announced once, and not for a player first seen already out", () => {
  const known = new Map<number, "in" | "escaped" | "died">();
  const live = [killer, surv(2), surv(3)];
  assert.deepEqual(newExits(known, live, rules), []);
  const next = [killer, surv(2, { escaped: true }), surv(3, { eliminated: true })];
  assert.deepEqual(newExits(known, next, rules), [{ id: 2, how: "escaped" }, { id: 3, how: "died" }]);
  assert.deepEqual(newExits(known, next, rules), []);
  assert.deepEqual(newExits(known, live, rules), [], "a rematch puts them back quietly");
  assert.deepEqual(newExits(new Map(), next, rules), []);
});
