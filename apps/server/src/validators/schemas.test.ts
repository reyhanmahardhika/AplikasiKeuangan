import test from "node:test";
import assert from "node:assert/strict";
import { accountSchema } from "./schemas.js";

test("allows creating an account with zero initial balance", () => {
  const parsed = accountSchema.parse({
    name: "Kas kosong",
    accountType: "cash",
    initialBalance: "0"
  });

  assert.equal(parsed.initialBalance, "0");
});
