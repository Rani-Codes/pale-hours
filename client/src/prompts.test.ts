import { strict as assert } from "node:assert";
import { test } from "node:test";
import { carryBanner, healthPips, killerPrompts, palletPrompt, repairLine, status, survivorPrompts } from "./prompts.ts";
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
  hookCheckPenalty: 150,
  hookEscapeChance: 10,
  hookEscapeTries: 2,
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
  const held = survivor(2, 1_000_000, { health: 2, carried: true, recover: 1800 - 90 });
  assert.deepEqual(killerPrompts(carrying, [carrying, held], rules), ["press E to hang them on the hook. They break free in 3 s."]);
  assert.deepEqual(killerPrompts(carrying, [carrying, held, survivor(3, 0, { onHook: 1 })], rules), ["carrying: find a hook, or press E to drop them. They break free in 3 s."]);
  assert.deepEqual(killerPrompts({ ...killer, stun: 10 }, [killer], rules), ["STUNNED"]);
});

test("a downed survivor is told how many seconds until they get up on their own", () => {
  const me = survivor(2, 0, { health: 2, recover: 0 });
  assert.deepEqual(survivorPrompts(me, [me], rules), ["you are down: crawl away and hide. Getting up on your own in 60 s"]);
  const later = { ...me, recover: 1800 - 45 };
  assert.deepEqual(survivorPrompts(later, [later], rules), ["you are down: crawl away and hide. Getting up on your own in 2 s"]);
});

test("a carried survivor is told to alternate E and Q, and how many seconds until they break free", () => {
  const me = survivor(2, 0, { health: 2, carried: true, recover: 1800 - 45 });
  assert.deepEqual(survivorPrompts(me, [me], rules), ["you are being carried: press E then Q, again and again, to wriggle free. 2 s left"]);
});

test("the killer gets a banner naming who is on his shoulder", () => {
  const killer = { ...newPlayer(1, 1, 0, 0, 1), carrying: 2 };
  assert.equal(carryBanner(killer, (id) => `Wren${id}`), "Wren2 is on your shoulder");
  assert.equal(carryBanner({ ...killer, carrying: 0 }, (id) => `Wren${id}`), "");
});

test("a repairing survivor sees the progress of the generator beside them", () => {
  const sites = [{ x: 20_000_000, y: 0 }, { x: 0, y: 0 }];
  const world = { genSites: sites, repairRange: 1_800_000, genTicks: 2400 };
  const me = survivor(2, 500_000, { repairing: true });
  assert.equal(repairLine(me, [2400, 600], world), "generator 25%");
  assert.equal(repairLine({ ...me, repairing: false }, [2400, 600], world), "");
  assert.equal(repairLine({ ...me, opening: 1 }, [2400, 600], world), "");
  assert.equal(repairLine(survivor(2, 10_000_000, { repairing: true }), [2400, 600], world), "");
});

const palletWorld = { palletSites: [{ minX: -1_000_000, minY: -250_000, maxX: 1_000_000, maxY: 250_000 }], palletReach: 3_000_000, palletBreakReach: 1_800_000, palletBreakTicks: 90, playerRadius: 400_000, tickRate: 30, roles: { survivor: 0, killer: 1 }, health: { healthy: 0, injured: 1, downed: 2 } };
const at = (x: number, y: number, extra = {}) => ({ ...newPlayer(2, 0, x, y, 1), ...extra });

test("a survivor beside a standing pallet is told to throw it down", () => {
  const w = palletWorld;
  assert.equal(palletPrompt(at(0, -1_000_000), [0], [0], w), "Space to throw down the pallet");
  assert.equal(palletPrompt(at(0, -3_000_000), [0], [0], w), "Space to throw down the pallet", "a generous reach");
  assert.equal(palletPrompt(at(0, -4_500_000), [0], [0], w), "");
  assert.equal(palletPrompt(at(0, -300_000), [0], [0], w), "Space to throw down the pallet", "even standing in its footprint");
  assert.equal(palletPrompt(at(0, -1_000_000, { health: 2 }), [0], [0], w), "");
  assert.equal(palletPrompt(at(0, -1_000_000), [1], [0], w), "", "already thrown");
});

test("the killer beside a dropped pallet is told to break it, then how long is left", () => {
  const w = palletWorld;
  const k = { ...newPlayer(1, 1, 0, -1_000_000, 1) };
  assert.equal(palletPrompt(k, [1], [0], w), "hold E to break the pallet");
  assert.equal(palletPrompt(k, [1], [30], w), "breaking the pallet: 2 s");
  assert.equal(palletPrompt(k, [0], [0], w), "", "a standing pallet is not his to break");
  assert.equal(palletPrompt({ ...k, carrying: 2 }, [1], [0], w), "");
  assert.equal(palletPrompt({ ...k, stun: 10 }, [1], [0], w), "");
  assert.equal(palletPrompt(k, [2], [0], w), "", "broken");
});

test("a hooked survivor is told they can try to wriggle off, and how many tries are left", () => {
  const me = survivor(2, 0, { health: 2, onHook: 1, hookTries: 0 });
  assert.ok(survivorPrompts(me, [me], rules).includes("press E to wriggle off the hook: 10% a try, 2 tries left"));
  const one = { ...me, hookTries: 1 };
  assert.ok(survivorPrompts(one, [one], rules).includes("press E to wriggle off the hook: 10% a try, 1 try left"));
  const none = { ...me, hookTries: 2 };
  assert.ok(survivorPrompts(none, [none], rules).includes("no tries left to wriggle off the hook"));
});

test("the killer is told when the hunt begins, in seconds", () => {
  const killer = { ...newPlayer(1, 1, 0, 0, 1), freeze: 150 };
  assert.deepEqual(killerPrompts(killer, [killer], rules), ["the hunt begins in 5 s"]);
  assert.deepEqual(killerPrompts({ ...killer, freeze: 31 }, [killer], rules), ["the hunt begins in 2 s"]);
  assert.deepEqual(killerPrompts({ ...killer, freeze: 0 }, [killer], rules), []);
});
