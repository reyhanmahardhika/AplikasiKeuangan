import assert from "node:assert/strict";
import test from "node:test";
import { fromCents } from "../utils/money.js";

test("keeps parser money conversion expectations explicit", () => {
  assert.equal(fromCents(1500000n), "15000.00");
  assert.equal(fromCents(20000000n), "200000.00");
});
