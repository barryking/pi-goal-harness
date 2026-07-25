import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWindow } from "../src/window.js";

test("normalizes integer numbers and digit strings", () => {
  assert.equal(normalizeWindow(45), 45);
  assert.equal(normalizeWindow("90"), 90);
});

test("uses the default for an omitted value", () => {
  assert.equal(normalizeWindow(undefined), 30);
});
