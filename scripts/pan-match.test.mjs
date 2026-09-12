import { test } from "node:test";
import assert from "node:assert/strict";
import { nameMatchScore, maskPan } from "../apps/api/src/lib/pan.ts";

const THRESHOLD = 0.7;

test("short public name against full legal name passes", () => {
  assert.ok(nameMatchScore("Goonj", "GOONJ FOUNDATION") >= THRESHOLD);
  assert.ok(nameMatchScore("Pratham", "PRATHAM EDUCATION FOUNDATION") >= THRESHOLD);
  assert.ok(nameMatchScore("Arghyam", "ARGHYAM TRUST") >= THRESHOLD);
});

test("spacing and punctuation differences pass", () => {
  assert.ok(nameMatchScore("Shri Ram Educational Trust", "SHRI RAM EDUCATIONAL TRUST") >= THRESHOLD);
  assert.ok(nameMatchScore("Wildlife Trust of India", "WILDLIFE TRUST OF INDIA") >= THRESHOLD);
});

test("unrelated organisations score zero", () => {
  assert.equal(nameMatchScore("Goonj Foundation", "PRATHAM EDUCATION FOUNDATION"), 0);
  assert.equal(nameMatchScore("Foundation Trust", "Society India"), 0);
});

test("single short shared token routes to review", () => {
  assert.ok(nameMatchScore("Ram Trust", "RAM SEVA SANGH") < THRESHOLD);
});

test("maskPan hides the middle", () => {
  assert.equal(maskPan("AAATG5678B"), "AAA****8B");
});
