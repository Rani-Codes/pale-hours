import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, parseAllowlist, parseForm } from "./intake.mjs";

// What GitHub writes into the body when someone submits the feedback form.
const formBody = ({ type = "Bug", details = "The gate would not open.", role = "Survivor" } = {}) =>
  `### Bug or idea\n\n${type}\n\n### What happened, or what you want\n\n${details}\n\n### Which role were you playing?\n\n${role}`;

const issue = (over = {}) => ({ title: "Gate stuck", body: formBody(), state: "open", labels: [], ...over });
const run = (over = {}) =>
  decide({ issue: issue(), author: "friend", owner: "Rani-Codes", invited: ["Friend"], openPending: 0, action: "opened", ...over });

test("parseForm reads each section and treats _No response_ as empty", () => {
  assert.deepEqual(parseForm(formBody({ role: "_No response_", details: "line one\n\nline two" })), {
    "Bug or idea": "Bug",
    "What happened, or what you want": "line one\n\nline two",
    "Which role were you playing?": "",
  });
  assert.deepEqual(parseForm(null), {});
});

test("an invited friend's complete bug gets needs-approval and bug", () => {
  assert.deepEqual(run(), { add: ["needs-approval", "bug"], remove: [] });
});

test("an idea gets the idea label, and the role is optional", () => {
  const body = formBody({ type: "Idea", role: "_No response_" });
  assert.deepEqual(run({ issue: issue({ body }) }), { add: ["needs-approval", "idea"], remove: [] });
});

test("someone not on the list is closed as not-invited, even with a perfect form", () => {
  const d = run({ author: "stranger" });
  assert.deepEqual(d.add, ["not-invited"]);
  assert.equal(d.close, true);
  assert.match(d.comment, /invite-only/);
});

test("the owner is always invited", () => {
  assert.deepEqual(run({ author: "rani-codes", invited: [] }), { add: ["needs-approval", "bug"], remove: [] });
});

test("the owner's issues that skip the form are left alone", () => {
  assert.deepEqual(run({ author: "Rani-Codes", issue: issue({ body: "TODO: tune grass" }) }), { add: [], remove: [] });
});

test("a malformed issue gets one comment naming every missing part", () => {
  const d = run({ issue: issue({ title: " ", body: formBody({ type: "_No response_", details: "_No response_" }) }) });
  assert.deepEqual(d.add, ["needs-info"]);
  assert.equal(d.close, undefined);
  assert.match(d.comment, /title is empty/);
  assert.match(d.comment, /Pick Bug or Idea/);
  assert.match(d.comment, /Fill in "What happened, or what you want"/);
});

test("a blank issue with no form is malformed", () => {
  assert.deepEqual(run({ issue: issue({ body: "" }) }).add, ["needs-info"]);
});

test("too long is malformed", () => {
  assert.match(run({ issue: issue({ body: formBody({ details: "x".repeat(5001) }) }) }).comment, /over 5000 characters/);
  assert.match(run({ issue: issue({ title: "t".repeat(121) }) }).comment, /over 120 characters/);
});

test("a still-malformed edit does not comment again", () => {
  const still = issue({ body: "", labels: ["needs-info"] });
  assert.deepEqual(run({ action: "edited", issue: still }), { add: [], remove: [] });
});

test("fixing a malformed issue by editing moves it to needs-approval", () => {
  assert.deepEqual(run({ action: "edited", issue: issue({ labels: ["needs-info"] }) }), {
    add: ["needs-approval", "bug"],
    remove: ["needs-info"],
  });
});

test("edits to an accepted issue change nothing", () => {
  assert.deepEqual(run({ action: "edited", issue: issue({ labels: ["needs-approval", "bug"], body: "" }) }), {
    add: [],
    remove: [],
  });
});

test("a sixth open suggestion is closed as over-limit", () => {
  assert.deepEqual(run({ openPending: 4 }).add, ["needs-approval", "bug"]);
  const d = run({ openPending: 5 });
  assert.deepEqual(d.add, ["over-limit"]);
  assert.equal(d.close, true);
  assert.match(d.comment, /5 open suggestions/);
});

test("closed issues are ignored", () => {
  assert.deepEqual(run({ author: "stranger", issue: issue({ state: "closed" }) }), { add: [], remove: [] });
});

test("parseAllowlist skips comments, blanks and @", () => {
  assert.deepEqual(parseAllowlist("# friends\n@alice\n\n bob  # from school\n"), ["alice", "bob"]);
});
