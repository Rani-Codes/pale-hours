import { strict as assert } from "node:assert";
import { test } from "node:test";
import { lineup, pick, startProblem, type Seat } from "./room.ts";

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
