import { strict as assert } from "node:assert";
import { test } from "node:test";
import { cleanName, lineup, nameOf, pick, randomName, rename, startProblem, type Seat } from "./room.ts";

const seats = (...roles: (Seat["role"] | undefined)[]): Seat[] => roles.map((role, i) => ({ id: i + 1, role }));

test("one killer slot", () => {
  const s = pick(seats("killer", undefined), 2, "killer");
  assert.deepEqual(s, seats("killer", undefined), "a second killer is refused");
  assert.deepEqual(pick(seats("killer", undefined), 1, "survivor"), seats("survivor", undefined), "the killer can switch away");
  assert.deepEqual(pick(seats("survivor", "killer"), 2, "killer"), seats("survivor", "killer"), "re-picking your own role is fine");
});

test("at most four survivors", () => {
  const full = seats("survivor", "survivor", "survivor", "survivor", undefined);
  assert.deepEqual(pick(full, 5, "survivor"), full);
  assert.deepEqual(pick(full, 5, "killer")[4].role, "killer");
});

test("start needs two players, all picked, one killer and a survivor", () => {
  assert.equal(startProblem(seats("killer")), "waiting for at least one more player");
  assert.equal(startProblem(seats("killer", undefined)), "everyone has to pick a role");
  assert.equal(startProblem(seats("survivor", "survivor")), "someone has to play the killer");
  assert.equal(startProblem(seats("killer", "survivor")), undefined);
  assert.equal(startProblem(seats("survivor", "killer", "survivor")), undefined);
});

test("lineup puts survivors in ID order", () => {
  assert.deepEqual(lineup([{ id: 4, role: "survivor" }, { id: 1, role: "survivor" }, { id: 2, role: "killer" }]), { killer: 2, survivors: [1, 4] });
});

test("names are cleaned and capped", () => {
  assert.equal(cleanName("  Ada \n  Lovelace\u0007 "), "Ada Lovelace");
  assert.equal(cleanName("x".repeat(40)).length, 16);
  assert.equal(cleanName(" \t "), "");
});

test("a name another player has gets a number", () => {
  let s: Seat[] = [{ id: 1, name: "Crow" }, { id: 2 }, { id: 3 }];
  s = rename(s, 2, "crow");
  assert.equal(nameOf(s, 2), "crow 2");
  s = rename(s, 3, "Crow");
  assert.equal(nameOf(s, 3), "Crow 3");
  assert.equal(nameOf(rename(s, 1, "Crow"), 1), "Crow", "keeping your own name is fine");
  assert.equal(nameOf(rename(s, 1, "  "), 1), "Crow", "an empty name changes nothing");
  assert.equal(nameOf(s, 9), "player 9");
});

test("a random name is a valid name", () => {
  for (const r of [0, 0.5, 0.999]) assert.equal(cleanName(randomName(() => r)), randomName(() => r));
  assert.ok(randomName().length <= 16);
});
