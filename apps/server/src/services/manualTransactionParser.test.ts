import test from "node:test";
import assert from "node:assert/strict";
import { inferMerchant } from "./manualTransactionParser.js";

test("keeps the full merchant name after an Indonesian location preposition", () => {
  assert.equal(inferMerchant("makan di sarune cafe 230rb cash", "230rb", "Tunai"), "Sarune Cafe");
});

test("keeps the salary period as the complete income source", () => {
  assert.equal(inferMerchant("Gaji bulan juli 10jt bca", "10jt", "BCA"), "Gaji Bulan Juli");
});
