import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { badRequest } from "../utils/errors.js";
import { fromCents, normalizeMoney } from "../utils/money.js";

type TransactionType = "income" | "expense";

type AccountOption = {
  id: string;
  name: string;
  accountType: string;
};

type CategoryOption = {
  id: string;
  name: string;
  categoryType: TransactionType;
};

export type ParsedManualTransaction = {
  transactionType: TransactionType;
  transactionDate: string;
  amount: string;
  categoryId: string | null;
  categoryName: string | null;
  accountId: string | null;
  accountName: string | null;
  merchantName: string | null;
  paymentMethod: string | null;
  notes: string;
  confidenceScore: number;
  reviewFields: string[];
  interpretedText: string;
};

const incomeKeywords = [
  "gaji",
  "salary",
  "paycheck",
  "payroll",
  "wage",
  "wages",
  "bonus",
  "terima",
  "menerima",
  "received",
  "receive",
  "ditransfer",
  "transfer masuk",
  "incoming transfer",
  "masuk",
  "jualan",
  "penjualan",
  "jual",
  "sold",
  "sales",
  "income",
  "earning",
  "earnings",
  "pendapatan",
  "refund",
  "reimbursement",
  "cashback",
  "dividend",
  "dividen"
];

const expenseKeywords = [
  "beli",
  "buy",
  "bought",
  "purchase",
  "purchased",
  "bayar",
  "pay",
  "paid",
  "payment",
  "spend",
  "spent",
  "jajan",
  "makan",
  "eat",
  "ate",
  "lunch",
  "dinner",
  "breakfast",
  "ngopi",
  "topup",
  "top up",
  "isi",
  "belanja",
  "shopping",
  "groceries",
  "order",
  "pesan",
  "transfer ke",
  "transfer to"
];

const salaryPattern = /\b(gaji|gajian|salary|paycheck|payroll|upah|wage|wages|honor|honorarium|fee bulanan|monthly pay|monthly salary)\b/i;

const paymentPatterns: Array<[RegExp, string, string[]]> = [
  [/\b(cash|tunai|kontan)\b/i, "Tunai", ["cash", "tunai"]],
  [/\b(qris|qr)\b/i, "QRIS", ["qris", "qr"]],
  [/\b(e[-\s]?money|emoney|kartu e[-\s]?money|mandiri e[-\s]?money)\b/i, "E-Money", ["e-money", "emoney", "e money", "wallet", "mandiri"]],
  [/\b(flazz|bca flazz)\b/i, "Flazz", ["flazz", "bca", "wallet"]],
  [/\b(tapcash|tap cash|bni tapcash)\b/i, "TapCash", ["tapcash", "tap cash", "bni", "wallet"]],
  [/\b(brizzi|bri brizzi)\b/i, "BRIZZI", ["brizzi", "bri", "wallet"]],
  [/\b(kmt|kartu multi trip|multi trip)\b/i, "KMT", ["kmt", "multi trip", "wallet"]],
  [/\b(jakcard|jak card)\b/i, "JakCard", ["jakcard", "jak card", "wallet"]],
  [/\b(debit|kartu debit|debit card)\b/i, "Debit Card", ["debit", "bank"]],
  [/\b(kredit|credit card|kartu kredit|cc)\b/i, "Credit Card", ["kredit", "credit", "card"]],
  [/\b(bank transfer|transfer bank|virtual account|va)\b/i, "Bank Transfer", ["bank", "transfer"]],
  [/\b(gopay|go pay)\b/i, "GoPay", ["gopay"]],
  [/\b(ovo)\b/i, "OVO", ["ovo"]],
  [/\b(dana)\b/i, "DANA", ["dana"]],
  [/\b(shopeepay|spay)\b/i, "ShopeePay", ["shopee", "spay"]],
  [/\b(linkaja|link aja)\b/i, "LinkAja", ["linkaja", "link aja"]],
  [/\b(jenius)\b/i, "Jenius", ["jenius", "bank"]],
  [/\b(blu)\b/i, "Blu", ["blu", "bank"]],
  [/\b(bca)\b/i, "BCA", ["bca", "bank"]],
  [/\b(mandiri)\b/i, "Mandiri", ["mandiri", "bank"]],
  [/\b(bri)\b/i, "BRI", ["bri", "bank"]],
  [/\b(bni)\b/i, "BNI", ["bni", "bank"]],
  [/\b(permata)\b/i, "Permata", ["permata", "bank"]],
  [/\b(cimb|octo)\b/i, "CIMB", ["cimb", "octo", "bank"]]
];

const categoryRules: Array<{ category: string; type: TransactionType; pattern: RegExp }> = [
  { category: "Gaji", type: "income", pattern: /\b(gaji|salary|paycheck|payroll|upah|wage|wages)\b/i },
  { category: "Bonus", type: "income", pattern: /\b(bonus|thr|insentif)\b/i },
  { category: "Penjualan", type: "income", pattern: /\b(jual|jualan|penjualan|sold|sales|selling)\b/i },
  { category: "Investasi", type: "income", pattern: /\b(dividen|dividend|capital gain|bunga deposito|interest)\b/i },
  { category: "Pendapatan usaha", type: "income", pattern: /\b(fee|komisi|commission|usaha|business|project|proyek|freelance|client)\b/i },
  { category: "Makanan dan minuman", type: "expense", pattern: /\b(kopi|coffee|fore|starbucks|janji jiwa|kenangan|makan|nasi|ayam|bakmi|mie|noodle|resto|restaurant|cafe|café|minum|drink|roti|bread|snack|jajan|gofood|grabfood|food|lunch|dinner|breakfast|brunch|tea|boba|pizza|burger)\b/i },
  { category: "Belanja", type: "expense", pattern: /\b(belanja|shopping|groceries|grocery|alfamart|indomaret|supermarket|minimarket|mart|tokopedia|shopee|lazada|zalora|baju|shirt|clothes|sepatu|shoes|tas|bag|barang|item|skincare|kosmetik|cosmetic|makeup|household)\b/i },
  { category: "Transportasi", type: "expense", pattern: /\b(gojek|go-?jek|grab|maxim|taxi|taksi|bluebird|blue bird|bensin|fuel|gas|bbm|pertalite|pertamax|parkir|parking|tol|toll|bus|transjakarta|tj|jaklingko|kereta|train|commuter line|commuterline|krl|mrt|lrt|subway|metro|ojek|ride|angkot|kai|damri|travel|e[-\s]?money|emoney|flazz|tapcash|tap cash|brizzi|kmt)\b/i },
  { category: "Tagihan", type: "expense", pattern: /\b(listrik|electricity|pln|air|water|pdam|wifi|internet|pulsa|phone credit|mobile data|data package|token|tagihan|bill|billing|iuran|subscription|sewa|rent|kontrakan|bpjs)\b/i },
  { category: "Kesehatan", type: "expense", pattern: /\b(dokter|doctor|apotek|pharmacy|obat|medicine|medication|klinik|clinic|rumah sakit|hospital|vitamin|medical|health|healthcare)\b/i },
  { category: "Pendidikan", type: "expense", pattern: /\b(sekolah|school|kuliah|college|university|kursus|course|kelas|class|buku|book|edukasi|education|ujian|exam|tuition)\b/i },
  { category: "Hiburan", type: "expense", pattern: /\b(nonton|movie|movies|bioskop|cinema|netflix|spotify|game|gaming|konser|concert|liburan|vacation|holiday|hotel|tiket|ticket|youtube|disney|hbo)\b/i },
  { category: "Cicilan", type: "expense", pattern: /\b(cicilan|installment|instalment|kredit|paylater|pinjaman|loan|angsuran|mortgage)\b/i },
  { category: "Investasi", type: "expense", pattern: /\b(saham|stock|stocks|reksadana|reksa dana|mutual fund|crypto|emas|gold|deposito|deposit|investasi|investment)\b/i }
];

const merchantAliases: Array<[RegExp, string]> = [
  [/\bfore\b/i, "Fore"],
  [/\bstarbucks\b/i, "Starbucks"],
  [/\bkopi kenangan\b/i, "Kopi Kenangan"],
  [/\bjanji jiwa\b/i, "Janji Jiwa"],
  [/\bindomaret\b/i, "Indomaret"],
  [/\balfamart\b/i, "Alfamart"],
  [/\bgojek|go-?jek\b/i, "Gojek"],
  [/\bgofood|go food\b/i, "GoFood"],
  [/\bgrab\b/i, "Grab"],
  [/\bgrabfood|grab food\b/i, "GrabFood"],
  [/\bmaxim\b/i, "Maxim"],
  [/\bbluebird|blue bird\b/i, "Bluebird"],
  [/\bmrt\b/i, "MRT Jakarta"],
  [/\blrt\b/i, "LRT"],
  [/\bkrl|commuter line|commuterline\b/i, "KRL Commuter Line"],
  [/\btransjakarta|tj\b/i, "TransJakarta"],
  [/\bjaklingko\b/i, "JakLingko"],
  [/\bkai\b/i, "KAI"],
  [/\bdamri\b/i, "DAMRI"],
  [/\bmypertamina|pertamina\b/i, "Pertamina"],
  [/\bpln\b/i, "PLN"],
  [/\bpdam\b/i, "PDAM"],
  [/\bnetflix\b/i, "Netflix"],
  [/\bspotify\b/i, "Spotify"],
  [/\byoutube\b/i, "YouTube"],
  [/\bshopee\b/i, "Shopee"],
  [/\btokopedia\b/i, "Tokopedia"]
];

const fillerWords = new Set([
  "aku",
  "saya",
  "gue",
  "gw",
  "i",
  "me",
  "my",
  "myself",
  "barusan",
  "tadi",
  "just",
  "justnow",
  "untuk",
  "buat",
  "for",
  "di",
  "at",
  "ke",
  "to",
  "dari",
  "from",
  "pakai",
  "pake",
  "using",
  "use",
  "via",
  "dengan",
  "with",
  "hari",
  "ini",
  "kemarin",
  "besok",
  "today",
  "yesterday",
  "tomorrow",
  "beli",
  "buy",
  "bought",
  "purchase",
  "bayar",
  "pay",
  "paid",
  "payment",
  "jajan",
  "ngopi",
  "makan",
  "eat",
  "ate",
  "order",
  "pesan",
  "sebesar",
  "senilai",
  "amount",
  "worth",
  "rp"
]);

const manualParseSchema = {
  type: "object",
  properties: {
    transactionType: { type: "string", enum: ["income", "expense"] },
    transactionDate: { type: "string", description: "ISO date string" },
    amount: { type: "string", description: "Decimal string, for example 15000.00" },
    categoryName: { type: ["string", "null"] },
    merchantName: { type: ["string", "null"] },
    paymentMethod: { type: ["string", "null"] },
    notes: { type: "string" },
    confidenceScore: { type: "number" },
    reviewFields: { type: "array", items: { type: "string" } }
  },
  required: [
    "transactionType",
    "transactionDate",
    "amount",
    "categoryName",
    "merchantName",
    "paymentMethod",
    "notes",
    "confidenceScore",
    "reviewFields"
  ],
  additionalProperties: false
};

function localIsoDate(date = new Date()) {
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
}

function parseDate(text: string) {
  const now = new Date();
  const lower = text.toLowerCase();
  if (/\b(kemarin|yesterday)\b/.test(lower)) {
    const date = new Date(now);
    date.setDate(date.getDate() - 1);
    return localIsoDate(date);
  }
  if (/\b(besok|tomorrow)\b/.test(lower)) {
    const date = new Date(now);
    date.setDate(date.getDate() + 1);
    return localIsoDate(date);
  }

  const numeric = lower.match(/\b(?:tgl|tanggal)?\s*(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]) - 1;
    const year = numeric[3] ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]) : now.getFullYear();
    return localIsoDate(new Date(year, month, day));
  }

  const monthNames = "jan|january|januari|feb|february|februari|mar|march|maret|apr|april|mei|may|jun|june|juni|jul|july|juli|agu|aug|august|agustus|sep|sept|september|okt|oct|october|oktober|nov|november|des|dec|december|desember";
  const named = lower.match(new RegExp(`\\b(\\d{1,2})\\s+(${monthNames})(?:\\s+(\\d{2,4}))?\\b`, "i"));
  if (named) {
    const monthAliases: Record<string, number> = {
      jan: 0, january: 0, januari: 0,
      feb: 1, february: 1, februari: 1,
      mar: 2, march: 2, maret: 2,
      apr: 3, april: 3,
      mei: 4, may: 4,
      jun: 5, june: 5, juni: 5,
      jul: 6, july: 6, juli: 6,
      agu: 7, aug: 7, august: 7, agustus: 7,
      sep: 8, sept: 8, september: 8,
      okt: 9, oct: 9, october: 9, oktober: 9,
      nov: 10, november: 10,
      des: 11, dec: 11, december: 11, desember: 11
    };
    const month = monthAliases[named[2]];
    const year = named[3] ? Number(named[3].length === 2 ? `20${named[3]}` : named[3]) : now.getFullYear();
    return localIsoDate(new Date(year, month, Number(named[1])));
  }

  return localIsoDate(now);
}

function compactText(text: string) {
  return text
    .normalize("NFKC")
    .replace(/[“”]/g, "\"")
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseHumanAmount(text: string) {
  const monthNames = "jan|january|januari|feb|february|februari|mar|march|maret|apr|april|mei|may|jun|june|juni|jul|july|juli|agu|aug|august|agustus|sep|sept|september|okt|oct|october|oktober|nov|november|des|dec|december|desember";
  const lower = text
    .toLowerCase()
    .replace(/\b(?:tgl|tanggal)?\s*\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, " ")
    .replace(new RegExp(`\\b\\d{1,2}\\s+(${monthNames})(?:\\s+\\d{2,4})?\\b`, "gi"), " ")
    .replace(/\b(?:jam|pukul)\s*\d{1,2}[:.]\d{2}\b/g, " ");
  const matches: Array<{ raw: string; amount: string; cents: bigint }> = [];
  const amountRegex = /(?:rp\s*)?(\d+(?:[.,]\d{1,3})*)(?:\s*(rb|ribu|k|jt|juta|mio|m|ratus|puluh))?/gi;

  for (const match of lower.matchAll(amountRegex)) {
    const raw = match[0];
    const previous = lower[Math.max((match.index ?? 0) - 1, 0)];
    const next = lower[(match.index ?? 0) + raw.length] ?? "";
    if (previous === "/" || next === "/" || previous === "-" || next === "-" || previous === ":" || next === ":") continue;
    if (/^\d{1,2}[:.]\d{2}$/.test(raw)) continue;

    const unit = match[2];
    const normalizedNumber = match[1].replace(/\s/g, "");
    const hasSeparator = /[.,]/.test(normalizedNumber);
    let numeric = Number(normalizedNumber.replace(/\./g, "").replace(",", "."));

    if (unit) {
      const decimalNumber = Number(normalizedNumber.replace(",", "."));
      if (["rb", "ribu", "k"].includes(unit)) numeric = decimalNumber * 1000;
      if (["jt", "juta", "mio", "m"].includes(unit)) numeric = decimalNumber * 1000000;
      if (unit === "ratus") numeric = decimalNumber * 100000;
      if (unit === "puluh") numeric = decimalNumber * 10000;
    } else if (!hasSeparator && numeric > 0 && numeric < 1000 && !raw.toLowerCase().includes("rp")) {
      numeric *= 1000;
    }

    if (Number.isFinite(numeric) && numeric > 0) {
      const cents = BigInt(Math.round(numeric * 100));
      matches.push({ raw, amount: fromCents(cents), cents });
    }
  }

  if (!matches.length) return null;
  return matches.sort((a, b) => Number(b.cents - a.cents))[0];
}

function inferTransactionType(text: string): TransactionType {
  const lower = text.toLowerCase();
  if (incomeKeywords.some((keyword) => lower.includes(keyword))) return "income";
  if (expenseKeywords.some((keyword) => lower.includes(keyword))) return "expense";
  return "expense";
}

function inferPayment(text: string) {
  for (const [pattern, method, accountHints] of paymentPatterns) {
    if (pattern.test(text)) return { method, accountHints };
  }
  return { method: null, accountHints: [] as string[] };
}

function findCategoryName(text: string, transactionType: TransactionType) {
  if (transactionType === "income" && salaryPattern.test(text)) return "Gaji";
  const rule = categoryRules.find((candidate) => candidate.type === transactionType && candidate.pattern.test(text));
  if (rule) return rule.category;
  return transactionType === "income" ? "Pendapatan lainnya" : "Pengeluaran lainnya";
}

function pickCategory(categories: CategoryOption[], categoryName: string, transactionType: TransactionType) {
  return (
    categories.find((category) => category.categoryType === transactionType && category.name.toLowerCase() === categoryName.toLowerCase()) ??
    categories.find((category) => category.categoryType === transactionType && category.name.toLowerCase().includes(categoryName.toLowerCase())) ??
    null
  );
}

function pickAccount(accounts: AccountOption[], text: string, defaultAccountId?: string | null, accountHints: string[] = []) {
  const lower = text.toLowerCase();
  const exactByName = accounts.find((account) => lower.includes(account.name.toLowerCase()));
  if (exactByName) return exactByName;

  const hinted = accounts.find((account) => {
    const name = account.name.toLowerCase();
    const type = account.accountType.toLowerCase();
    return accountHints.some((hint) => name.includes(hint) || type.includes(hint));
  });
  if (hinted) return hinted;

  const defaultAccount = defaultAccountId ? accounts.find((account) => account.id === defaultAccountId) : null;
  return defaultAccount ?? accounts[0] ?? null;
}

function inferMerchant(text: string, amountRaw?: string, paymentMethod?: string | null) {
  for (const [pattern, merchant] of merchantAliases) {
    if (pattern.test(text)) return merchant;
  }

  const cleaned = text
    .toLowerCase()
    .replace(amountRaw?.toLowerCase() ?? "", " ")
    .replace(/\b(rp|cash|tunai|kontan|qris|qr|e[-\s]?money|emoney|flazz|tapcash|tap cash|brizzi|kmt|kartu multi trip|jakcard|jak card|debit|debit card|kredit|credit card|cc|bank transfer|transfer bank|virtual account|va|gopay|go pay|ovo|dana|shopeepay|spay|linkaja|link aja|bca|mandiri|bri|bni|permata|cimb|octo|jenius|blu)\b/gi, " ")
    .replace(/\b(kemarin|besok|hari ini|today|yesterday|tomorrow|tgl|tanggal)\b/gi, " ")
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = cleaned
    .split(" ")
    .map((token) => token.replace(/[^a-z0-9-]/gi, ""))
    .filter((token) => token && !fillerWords.has(token));

  if (!tokens.length) return null;
  const merchantTokens = tokens.length > 1 ? tokens.slice(1) : tokens;
  const merchant = merchantTokens.join(" ").trim();
  if (!merchant || merchant.toLowerCase() === paymentMethod?.toLowerCase()) return null;
  return merchant
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .slice(0, 180);
}

function reviewFieldsFor(parsed: {
  amount: string;
  merchantName: string | null;
  categoryId: string | null;
  accountId: string | null;
  paymentMethod: string | null;
}) {
  const reviewFields: string[] = [];
  if (!parsed.amount) reviewFields.push("amount");
  if (!parsed.merchantName) reviewFields.push("merchantName");
  if (!parsed.categoryId) reviewFields.push("category");
  if (!parsed.accountId) reviewFields.push("account");
  if (!parsed.paymentMethod) reviewFields.push("paymentMethod");
  return reviewFields;
}

function confidenceFrom(reviewFields: string[]) {
  return Number(Math.max(0.45, 0.96 - reviewFields.length * 0.11).toFixed(2));
}

function getResponseText(data: any) {
  if (typeof data.output_text === "string") return data.output_text;
  for (const output of data.output ?? []) {
    for (const content of output.content ?? []) {
      if (typeof content.text === "string") return content.text;
    }
  }
  return null;
}

async function parseWithOpenAI(text: string, categories: CategoryOption[]): Promise<Partial<ParsedManualTransaction>> {
  if (!config.openAiApiKey) throw new Error("OPENAI_API_KEY is not configured");

  const categoryNames = categories.map((category) => `${category.name} (${category.categoryType})`).join(", ");
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
            `Terjemahkan catatan transaksi informal bahasa Indonesia, Inggris, atau campuran menjadi field transaksi. ` +
            `Gunakan kategori yang paling cocok dari daftar ini: ${categoryNames}. ` +
            `Pahami istilah lokal Indonesia seperti e-money/emoney, flazz, tapcash, brizzi, kmt, mrt, krl, gojek, grab, qris. ` +
            `Nominal gaji, gajian, salary, payroll, upah, atau wage wajib menjadi transactionType income dan categoryName Gaji. ` +
            `Jika nominal seperti 15k/15rb/15.000 artikan sebagai 15000.00. Isi null bila tidak yakin.`
        },
        { role: "user", content: text }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "manual_transaction_parse",
          schema: manualParseSchema
        }
      }
    })
  });

  if (!response.ok) throw new Error(`OpenAI parser failed: ${response.status}`);
  const outputText = getResponseText(await response.json());
  if (!outputText) throw new Error("OpenAI parser returned no text");
  return JSON.parse(outputText);
}

async function getOptions(userId: string) {
  const [accounts, categories] = await Promise.all([
    pool.query<AccountOption>(
      `SELECT id, name, account_type AS "accountType"
       FROM accounts
       WHERE user_id = $1 AND is_active = true
       ORDER BY name`,
      [userId]
    ),
    pool.query<CategoryOption>(
      `SELECT id, name, category_type AS "categoryType"
       FROM categories
       WHERE user_id = $1 AND is_active = true
       ORDER BY category_type, name`,
      [userId]
    )
  ]);
  return { accounts: accounts.rows, categories: categories.rows };
}

export async function parseNaturalTransaction(userId: string, textInput: string, defaultAccountId?: string | null) {
  const text = compactText(textInput);
  if (text.length < 3) throw badRequest("Teks transaksi terlalu pendek");

  const { accounts, categories } = await getOptions(userId);
  let aiParsed: Partial<ParsedManualTransaction> | null = null;
  if (config.aiProvider === "openai" && config.openAiApiKey) {
    try {
      aiParsed = await parseWithOpenAI(text, categories);
    } catch (error) {
      console.warn("Manual transaction AI parser fallback:", error);
    }
  }

  const isSalary = salaryPattern.test(text);
  const transactionType = isSalary ? "income" : aiParsed?.transactionType ?? inferTransactionType(text);
  const amountCandidate = parseHumanAmount(text);
  const amount = aiParsed?.amount ? normalizeMoney(aiParsed.amount) : amountCandidate?.amount ?? "";
  const { method, accountHints } = inferPayment(text);
  const paymentMethod = aiParsed?.paymentMethod ?? method;
  const categoryName = isSalary ? "Gaji" : aiParsed?.categoryName ?? findCategoryName(text, transactionType);
  const category = pickCategory(categories, categoryName, transactionType);
  const account = pickAccount(accounts, text, defaultAccountId, accountHints);
  const merchantName = aiParsed?.merchantName ?? inferMerchant(text, amountCandidate?.raw, paymentMethod);
  const transactionDate = aiParsed?.transactionDate ? localIsoDate(new Date(aiParsed.transactionDate)) : parseDate(text);

  const reviewFields = Array.from(
    new Set([
      ...(aiParsed?.reviewFields ?? []),
      ...reviewFieldsFor({
        amount,
        merchantName,
        categoryId: category?.id ?? null,
        accountId: account?.id ?? null,
        paymentMethod
      })
    ])
  );

  return {
    transactionType,
    transactionDate,
    amount,
    categoryId: category?.id ?? null,
    categoryName: category?.name ?? categoryName ?? null,
    accountId: account?.id ?? null,
    accountName: account?.name ?? null,
    merchantName,
    paymentMethod,
    notes: aiParsed?.notes || text,
    confidenceScore: aiParsed?.confidenceScore ?? confidenceFrom(reviewFields),
    reviewFields,
    interpretedText: text
  } satisfies ParsedManualTransaction;
}
