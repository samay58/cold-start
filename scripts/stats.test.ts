import assert from "node:assert/strict";
import { test } from "node:test";

import { distribution, percentile } from "./lib/stats";

test("percentile uses nearest rank and ignores non-finite values", () => {
  const values = [5, 1, 4, 2, 3, Number.NaN];
  assert.equal(percentile(values, 50), 3);
  assert.equal(percentile(values, 90), 5);
  assert.equal(percentile(values, 0), 1);
  assert.equal(percentile([], 50), null);
});

test("distribution reports count, p50, p90 and max, with p95 on request", () => {
  const values = Array.from({ length: 20 }, (_, index) => index + 1);
  assert.deepEqual(distribution(values), { n: 20, p50: 10, p90: 18, max: 20 });
  assert.deepEqual(distribution(values, { p95: true }), { n: 20, p50: 10, p90: 18, p95: 19, max: 20 });
  assert.deepEqual(distribution([]), { n: 0, p50: null, p90: null, max: null });
});
