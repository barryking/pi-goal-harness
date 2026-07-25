import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const repo = process.argv[2];
if (!repo) throw new Error("Usage: node window-hidden-check.mjs <repo>");
const { normalizeWindow } = await import(pathToFileURL(resolve(repo, "src/window.js")));

assert.equal(normalizeWindow(1), 1);
assert.equal(normalizeWindow(3600), 3600);
assert.equal(normalizeWindow("0060"), 60);
assert.equal(normalizeWindow(undefined, "120"), 120);

for (const value of [0, 3601, "0", "3601"]) {
  assert.throws(() => normalizeWindow(value), RangeError);
}
for (const value of [true, false, 1.5, " 30", "30 ", "+30", "-1", "1.5", "", null, {}, []]) {
  assert.throws(() => normalizeWindow(value), TypeError);
}
assert.throws(() => normalizeWindow(undefined, 0), RangeError);
assert.throws(() => normalizeWindow(undefined, " 30"), TypeError);

console.log("hidden checks: pass");
