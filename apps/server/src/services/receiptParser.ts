import { normalizeNonNegativeMoney } from "../utils/money.js";
import { config } from "../config.js";

export type ParsedReceiptItem = {
  name: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
};

export type ParsedReceipt = {
  merchantName: string | null;
  transactionDate: string | null;
  transactionTime: string | null;
  receiptNumber: string | null;
  subtotal: string | null;
  discount: string | null;
  tax: string | null;
  fees: string | null;
  total: string | null;
  amountPaid: string | null;
  change: string | null;
  paymentMethod: string | null;
  suggestedCategory: string;
  confidenceScore: number;
  fieldConfidence: Record<string, number>;
  reviewFields: string[];
  items: ParsedReceiptItem[];
};

function parseDate(text: string) {
  const isoMatch = text.match(/\b(20\d{2})[/-](\d{1,2})[/-](\d{1,2})\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }
  const match = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (!match) return null;
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${month}-${day}`;
}

function parseTime(text: string) {
  const match = text.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}

function parseAmount(raw: string) {
  const matches = extractAmountTokens(raw);
  const match = matches.at(-1);
  if (!match) return null;
  try {
    return normalizeNonNegativeMoney(match);
  } catch {
    return null;
  }
}

function extractAmountTokens(raw: string) {
  return Array.from(raw.matchAll(/(?:rp\s*)?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d{4,})(?!\d)/gi)).map((match) => match[1]);
}

function findLineAmount(lines: string[], keywords: string[], excluded: string[] = []) {
  const line = lines.find((candidate) => {
    const lower = candidate.toLowerCase();
    return keywords.some((keyword) => lower.includes(keyword)) && !excluded.some((keyword) => lower.includes(keyword));
  });
  return line ? parseAmount(line) : null;
}

function inferMerchant(lines: string[]) {
  const ignored = ["struk", "receipt", "invoice", "tanggal", "total", "kasir", "telp", "alamat", "npwp", "nota", "copy", "customer"];
  return (
    lines.find((line) => {
      const lower = line.toLowerCase();
      return line.length > 2 && !extractAmountTokens(line).length && !ignored.some((word) => lower.includes(word));
    }) ??
    null
  );
}

function inferPaymentMethod(text: string) {
  const lower = text.toLowerCase();
  if (/(e[-\s]?money|emoney|flazz|brizzi|tapcash|mandiri e|kartu uang elektronik)/.test(lower)) return "E-Money";
  if (lower.includes("debit")) return "Debit Card";
  if (lower.includes("kredit") || lower.includes("credit")) return "Credit Card";
  if (lower.includes("qris")) return "QRIS";
  if (lower.includes("gopay")) return "GoPay";
  if (lower.includes("shopeepay")) return "ShopeePay";
  if (lower.includes("linkaja")) return "LinkAja";
  if (lower.includes("ovo")) return "OVO";
  if (lower.includes("dana")) return "DANA";
  if (lower.includes("cash") || lower.includes("tunai")) return "Tunai";
  return null;
}

function inferCategory(text: string) {
  const lower = text.toLowerCase();
  if (/(mrt|krl|commuter|transjakarta|kai|gojek|grab|taxi|bbm|parkir|tol)/.test(lower)) return "Transportasi";
  if (/(resto|restaurant|cafe|coffee|kopi|fore|kenangan|starbucks|ayam|bakmi|makan|food|burger|pizza)/.test(lower)) return "Makanan dan minuman";
  if (/(mart|supermarket|minimarket|alfamart|indomaret|grocery|pasar|toko|belanja)/.test(lower)) return "Belanja";
  if (/(apotek|klinik|obat|hospital)/.test(lower)) return "Kesehatan";
  return "Pengeluaran lainnya";
}

function inferItems(lines: string[]) {
  const items: ParsedReceiptItem[] = [];
  for (const line of lines) {
    if (
      /total|subtotal|sub total|pajak|tax|ppn|diskon|discount|bayar|payment|paid|tunai|cash|kembali|change|saldo|visa|master|debit|kredit|credit|qris|e[-\s]?money|emoney|gopay|ovo|dana|shopeepay|linkaja|struk|receipt|invoice|inv|nota/i.test(line)
    ) continue;
    if (/\b\d{1,2}[\/:-]\d{1,2}(?:[\/:-]\d{2,4})?\b/.test(line)) continue;
    const amountTokens = extractAmountTokens(line);
    const rawTotal = amountTokens.at(-1);
    if (!rawTotal) continue;
    const amountIndex = line.toLowerCase().lastIndexOf(rawTotal.toLowerCase());
    let namePart = line.slice(0, amountIndex).replace(/(?:rp|idr)\s*$/i, "").trim();
    let quantity = 1;
    const quantityMatch = namePart.match(/(.+?)\s+(\d+(?:[.,]\d+)?)\s*x?$/i) ?? namePart.match(/(.+?)\s+x\s*(\d+(?:[.,]\d+)?)$/i);
    if (quantityMatch) {
      namePart = quantityMatch[1].trim();
      quantity = Number(quantityMatch[2].replace(",", "."));
    }
    const name = namePart.trim();
    if (name.length < 2 || !/[a-z]/i.test(name)) continue;
    const totalPrice = parseAmount(rawTotal) ?? "0.00";
    const unitPrice = quantity > 0 ? (Number(totalPrice) / quantity).toFixed(2) : totalPrice;
    items.push({ name, quantity, unitPrice, totalPrice });
  }
  return items.slice(0, 50);
}

function inferFallbackTotal(lines: string[]) {
  const ignored = /(kembali|change|saldo|balance|telp|phone|tanggal|date|jam|time|struk|receipt|invoice|npwp|total item|item)/i;
  const values = lines
    .filter((line) => !ignored.test(line))
    .flatMap((line) => extractAmountTokens(line))
    .map((token) => parseAmount(token))
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
  const max = Math.max(0, ...values);
  return max > 0 ? max.toFixed(2) : null;
}

const receiptSchema = {
  type: "object",
  properties: {
    merchantName: { type: ["string", "null"] },
    transactionDate: { type: ["string", "null"], description: "YYYY-MM-DD" },
    transactionTime: { type: ["string", "null"], description: "HH:mm" },
    receiptNumber: { type: ["string", "null"] },
    subtotal: { type: ["string", "null"] },
    discount: { type: ["string", "null"] },
    tax: { type: ["string", "null"] },
    fees: { type: ["string", "null"] },
    total: { type: ["string", "null"] },
    amountPaid: { type: ["string", "null"] },
    change: { type: ["string", "null"] },
    paymentMethod: { type: ["string", "null"] },
    suggestedCategory: { type: "string" },
    confidenceScore: { type: "number" },
    fieldConfidence: { type: "object", additionalProperties: { type: "number" } },
    reviewFields: { type: "array", items: { type: "string" } },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          quantity: { type: "number" },
          unitPrice: { type: "string" },
          totalPrice: { type: "string" }
        },
        required: ["name", "quantity", "unitPrice", "totalPrice"]
      }
    }
  },
  required: [
    "merchantName",
    "transactionDate",
    "transactionTime",
    "receiptNumber",
    "subtotal",
    "discount",
    "tax",
    "fees",
    "total",
    "amountPaid",
    "change",
    "paymentMethod",
    "suggestedCategory",
    "confidenceScore",
    "fieldConfidence",
    "reviewFields",
    "items"
  ]
};

function getResponseText(data: any) {
  if (typeof data.output_text === "string") return data.output_text;
  for (const output of data.output ?? []) {
    for (const content of output.content ?? []) {
      if (typeof content.text === "string") return content.text;
    }
  }
  return null;
}

async function parseWithOpenAI(rawText: string): Promise<ParsedReceipt> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openAiApiKey}`
    },
    body: JSON.stringify({
      model: config.openAiModel,
      store: false,
      input: [
        {
          role: "system",
          content:
            "Ubah teks OCR struk Indonesia menjadi JSON valid. Ambil rincian item, subtotal, diskon, pajak, biaya tambahan, total tagihan, nominal yang dibayar pelanggan, dan kembalian sebagai field terpisah. Koreksi OCR yang jelas keliru, isi null bila tidak yakin, beri confidence 0-1, dan tandai field yang perlu dicek pengguna."
        },
        { role: "user", content: rawText }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "receipt_parse",
          schema: receiptSchema
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI parser failed: ${response.status}`);
  }

  const data = await response.json();
  const text = getResponseText(data);
  if (!text) throw new Error("OpenAI parser returned no text");
  const parsed = JSON.parse(text) as ParsedReceipt;
  return {
    ...parsed,
    suggestedCategory: parsed.suggestedCategory || "Pengeluaran lainnya",
    confidenceScore: Math.max(0, Math.min(1, Number(parsed.confidenceScore ?? 0.5))),
    reviewFields: parsed.reviewFields ?? [],
    fieldConfidence: parsed.fieldConfidence ?? {},
    items: parsed.items ?? []
  };
}

async function parseReceiptTextHeuristic(rawText: string): Promise<ParsedReceipt> {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  const text = lines.join("\n");
  const total =
    findLineAmount([...lines].reverse(), ["grand total", "total pembayaran", "total belanja", "total harga", "jumlah bayar", "total"], [
      "subtotal",
      "sub total",
      "total item",
      "kembali",
      "change"
    ]) ?? inferFallbackTotal(lines);
  const subtotal = findLineAmount(lines, ["subtotal", "sub total"]);
  const tax = findLineAmount(lines, ["pajak", "tax", "ppn", "pb1"]);
  const discount = findLineAmount(lines, ["diskon", "discount"]);
  const fees = findLineAmount(lines, ["biaya layanan", "service charge", "admin", "ongkos", "fee"]);
  const amountPaid = findLineAmount([...lines].reverse(), ["uang diterima", "jumlah dibayar", "dibayar", "bayar", "tunai", "cash"], [
    "total",
    "subtotal",
    "kembali",
    "change"
  ]);
  const change = findLineAmount([...lines].reverse(), ["kembalian", "kembali", "change"]);
  const receiptNumber = text.match(/(?:no\.?|nomor|invoice|inv|struk)\s*[:#-]?\s*([a-z0-9-]+)/i)?.[1] ?? null;
  const merchantName = inferMerchant(lines);
  const transactionDate = parseDate(text);
  const transactionTime = parseTime(text);
  const paymentMethod = inferPaymentMethod(text);
  const suggestedCategory = inferCategory(text);
  const items = inferItems(lines);

  const fieldConfidence = {
    merchantName: merchantName ? 0.82 : 0.25,
    transactionDate: transactionDate ? 0.86 : 0.2,
    total: total ? 0.9 : 0.15,
    paymentMethod: paymentMethod ? 0.72 : 0.35,
    items: items.length ? 0.65 : 0.25
  };
  const reviewFields = Object.entries(fieldConfidence)
    .filter(([, confidence]) => confidence < 0.7)
    .map(([field]) => field);
  const confidenceScore =
    Object.values(fieldConfidence).reduce((sum, value) => sum + value, 0) / Object.keys(fieldConfidence).length;

  return {
    merchantName,
    transactionDate,
    transactionTime,
    receiptNumber,
    subtotal,
    discount,
    tax,
    fees,
    total,
    amountPaid,
    change,
    paymentMethod,
    suggestedCategory,
    confidenceScore: Number(confidenceScore.toFixed(2)),
    fieldConfidence,
    reviewFields,
    items
  };
}

export async function parseReceiptText(rawText: string): Promise<ParsedReceipt> {
  if (config.aiProvider === "openai" && config.openAiApiKey) {
    try {
      return await parseWithOpenAI(rawText);
    } catch (error) {
      console.warn("AI parser fallback:", error);
    }
  }

  return parseReceiptTextHeuristic(rawText);
}
