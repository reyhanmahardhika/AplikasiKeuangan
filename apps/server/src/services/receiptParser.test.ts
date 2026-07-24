import test from "node:test";
import assert from "node:assert/strict";
import { parseReceiptText } from "./receiptParser.js";

test("parses common Indonesian receipt fields without taking total item as total", async () => {
  const parsed = await parseReceiptText(`
TOKO MAJU
Jl. Merdeka No. 123
Struk #124567
10/05/2025 12:34
Air Mineral 1 5.000
Roti Tawar 15.000
Telur Ayam 10 23.000
Susu UHT 11.000
Total Item 4
TOTAL 61.000
E-Money 61.000
Terima kasih
`);

  assert.equal(parsed.merchantName, "TOKO MAJU");
  assert.equal(parsed.transactionDate, "2025-05-10");
  assert.equal(parsed.total, "61000.00");
  assert.equal(parsed.paymentMethod, "E-Money");
  assert.equal(parsed.items.length, 4);
  assert.equal(parsed.items[0].totalPrice, "5000.00");
});

test("separates tax, amount paid, and change from receipt total", async () => {
  const parsed = await parseReceiptText(`
INDOMARET
Air Mineral 10.000
Roti 40.000
SUBTOTAL 50.000
PPN 5.000
TOTAL 55.000
TUNAI 60.000
KEMBALI 5.000
`);

  assert.equal(parsed.subtotal, "50000.00");
  assert.equal(parsed.tax, "5000.00");
  assert.equal(parsed.total, "55000.00");
  assert.equal(parsed.amountPaid, "60000.00");
  assert.equal(parsed.change, "5000.00");
});
