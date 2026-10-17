import { strict as assert } from "node:assert";
import { test } from "node:test";
import { zoomed } from "./zoom.ts";

test("scrolling down pulls the camera back, up brings it in", () => {
  assert.ok(zoomed(1, 100) > 1);
  assert.ok(zoomed(1, -100) < 1);
});

test("the camera stays within 20% of the default either way", () => {
  assert.equal(zoomed(1.19, 1000), 1.2);
  assert.equal(zoomed(0.81, -1000), 0.8);
  assert.equal(zoomed(1, 0), 1);
});

test("a gentle trackpad scroll moves it a little", () => {
  const z = zoomed(1, 4);
  assert.ok(z > 1 && z < 1.01);
});
