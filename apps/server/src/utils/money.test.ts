import assert from "node:assert/strict";
import test from "node:test";
import { fromCents, normalizeMoney, normalizeNonNegativeMoney, toCents } from "./money.js";
import { transactionDelta } from "../services/accountService.js";

test("normalizes Indonesian money input without using floating point storage", () => {
  assert.equal(normalizeMoney("150.000"), "150000.00");
  assert.equal(normalizeMoney("150000,50"), "150000.50");
  assert.equal(normalizeMoney("15000.00"), "15000.00");
  assert.equal(normalizeMoney("15,000.00"), "15000.00");
  assert.equal(normalizeMoney("15,000"), "15000.00");
  assert.equal(normalizeNonNegativeMoney("0"), "0.00");
  assert.equal(fromCents(toCents("1234.56")), "1234.56");
});

test("calculates account deltas for normal and credit card accounts", () => {
  assert.equal(transactionDelta("bank", "income", "100000.00"), "100000.00");
  assert.equal(transactionDelta("bank", "expense", "100000.00"), "-100000.00");
  assert.equal(transactionDelta("credit_card", "expense", "100000.00"), "100000.00");
  assert.equal(transactionDelta("credit_card", "income", "100000.00"), "-100000.00");
});
