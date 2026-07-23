import { pool } from "../db/pool.js";
import { formatRupiah } from "../utils/money.js";

type AssistantReply = {
  answer: string;
  disclaimer: string | null;
  suggestions?: string[];
};

const defaultSuggestions = [
  "Apakah Anda ingin mengetahui sisa saldo Anda sekarang?",
  "Apakah Anda ingin tahu pengeluaran terbesar Anda pada bulan apa?",
  "Apakah Anda ingin melihat kategori paling boros bulan ini?"
];

function startOfMonth(offset = 0) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, 1);
}

function startOfWeek() {
  const now = new Date();
  const day = now.getDay() || 7;
  const start = new Date(now);
  start.setDate(now.getDate() - day + 1);
  start.setHours(0, 0, 0, 0);
  return start;
}

function normalizeQuestion(question: string) {
  return question
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function monthLabel(value: string | Date) {
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date(value));
}

function compactList(rows: Array<{ name?: string | null; total: string }>) {
  return rows.map((row) => `${row.name ?? "Tanpa kategori"} (${formatRupiah(row.total)})`).join(", ");
}

export async function answerFinancialQuestion(userId: string, question: string): Promise<AssistantReply> {
  const normalized = normalizeQuestion(question);
  const thisMonth = startOfMonth();
  const nextMonth = startOfMonth(1);
  const previousMonth = startOfMonth(-1);
  const week = startOfWeek();

  const [
    balance,
    thisMonthTotals,
    prevMonthTotals,
    topCategory,
    topCategories,
    foodWeek,
    topMerchant,
    highestExpenseMonth,
    budgetRisk
  ] = await Promise.all([
    pool.query(
      `SELECT COALESCE(sum(CASE WHEN account_type = 'credit_card' THEN -current_balance ELSE current_balance END), 0)::text AS balance
       FROM accounts WHERE user_id = $1 AND is_active = true`,
      [userId]
    ),
    pool.query(
      `SELECT COALESCE(sum(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0)::text AS income,
              COALESCE(sum(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0)::text AS expense
       FROM transactions WHERE user_id = $1 AND transaction_date >= $2 AND transaction_date < $3`,
      [userId, thisMonth, nextMonth]
    ),
    pool.query(
      `SELECT COALESCE(sum(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0)::text AS expense
       FROM transactions WHERE user_id = $1 AND transaction_date >= $2 AND transaction_date < $3`,
      [userId, previousMonth, thisMonth]
    ),
    pool.query(
      `SELECT c.name, COALESCE(sum(t.amount), 0)::text AS total
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = $1 AND t.transaction_type = 'expense' AND t.transaction_date >= $2 AND t.transaction_date < $3
       GROUP BY c.name ORDER BY sum(t.amount) DESC LIMIT 1`,
      [userId, thisMonth, nextMonth]
    ),
    pool.query<{ name: string | null; total: string }>(
      `SELECT c.name, COALESCE(sum(t.amount), 0)::text AS total
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = $1 AND t.transaction_type = 'expense'
         AND t.transaction_date >= $2 AND t.transaction_date < $3
       GROUP BY c.name ORDER BY sum(t.amount) DESC LIMIT 3`,
      [userId, thisMonth, nextMonth]
    ),
    pool.query(
      `SELECT COALESCE(sum(t.amount), 0)::text AS total
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = $1 AND t.transaction_type = 'expense'
         AND t.transaction_date >= $2
         AND (lower(c.name) LIKE '%makanan%' OR lower(c.name) LIKE '%food%')`,
      [userId, week]
    ),
    pool.query(
      `SELECT COALESCE(merchant_name, 'Tanpa merchant') AS merchant, COALESCE(sum(amount), 0)::text AS total
       FROM transactions
       WHERE user_id = $1 AND transaction_type = 'expense'
         AND transaction_date >= $2 AND transaction_date < $3
       GROUP BY merchant_name ORDER BY sum(amount) DESC LIMIT 1`,
      [userId, thisMonth, nextMonth]
    ),
    pool.query(
      `SELECT date_trunc('month', transaction_date)::date AS month, COALESCE(sum(amount), 0)::text AS total
       FROM transactions
       WHERE user_id = $1 AND transaction_type = 'expense'
       GROUP BY 1 ORDER BY sum(amount) DESC LIMIT 1`,
      [userId]
    ),
    pool.query(
      `SELECT c.name, b.budget_amount::text AS budget,
              COALESCE(sum(t.amount), 0)::text AS used,
              CASE WHEN b.budget_amount > 0 THEN (COALESCE(sum(t.amount), 0) / b.budget_amount * 100) ELSE 0 END::numeric(8,2)::text AS percent
       FROM budgets b
       JOIN categories c ON c.id = b.category_id
       LEFT JOIN transactions t ON t.category_id = b.category_id
         AND t.user_id = b.user_id
         AND t.transaction_type = 'expense'
         AND t.transaction_date >= $2 AND t.transaction_date < $3
       WHERE b.user_id = $1 AND b.month = $4 AND b.year = $5
       GROUP BY c.name, b.budget_amount
       ORDER BY (COALESCE(sum(t.amount), 0) / b.budget_amount) DESC LIMIT 1`,
      [userId, thisMonth, nextMonth, thisMonth.getMonth() + 1, thisMonth.getFullYear()]
    )
  ]);

  const income = Number(thisMonthTotals.rows[0].income);
  const expense = Number(thisMonthTotals.rows[0].expense);
  const prevExpense = Number(prevMonthTotals.rows[0].expense);
  const balanceValue = Number(balance.rows[0].balance);
  const top = topCategory.rows[0];
  const biggestMonth = highestExpenseMonth.rows[0];
  const merchant = topMerchant.rows[0];
  const riskyBudget = budgetRisk.rows[0];

  const wantsHelp = hasAny(normalized, ["bisa apa", "help", "bantuan", "menu", "contoh", "what can you"]);
  const wantsBalance = hasAny(normalized, ["saldo", "balance", "sisa uang", "uang tersisa", "cash left", "remaining money"]);
  const wantsIncome = hasAny(normalized, ["pemasukan", "income", "uang masuk", "gaji masuk", "earning", "salary"]);
  const wantsExpense = hasAny(normalized, ["pengeluaran", "expense", "spending", "spent", "keluar", "belanja", "jajan"]);
  const wantsComparison = hasAny(normalized, ["bulan lalu", "last month", "dibanding", "compare", "lebih besar", "lebih kecil"]);
  const wantsTopMonth =
    hasAny(normalized, ["bulan apa", "bulan mana", "month"]) &&
    hasAny(normalized, ["terbesar", "terbanyak", "paling besar", "paling banyak", "boros", "biggest", "highest"]);
  const wantsTopCategory = hasAny(normalized, ["kategori", "category", "paling banyak", "terbesar", "top", "boros"]);
  const wantsMerchant = hasAny(normalized, ["merchant", "toko", "tempat", "vendor", "where", "dimana", "di mana"]);
  const wantsFoodWeek =
    hasAny(normalized, ["makan", "makanan", "food", "coffee", "kopi"]) &&
    hasAny(normalized, ["minggu", "week", "pekan"]);
  const wantsBudget = hasAny(normalized, ["budget", "anggaran", "limit", "sisa budget", "sisa anggaran"]);
  const wantsSavingAdvice = hasAny(normalized, ["hemat", "save", "saving", "kurangi", "dikurangi", "rekomendasi", "tips", "saran"]);
  const wantsPrediction = hasAny(normalized, ["prediksi", "estimasi", "forecast", "akhir bulan", "end month"]);

  if (wantsHelp) {
    return {
      answer: "Aku bisa bantu baca kondisi keuanganmu dari data transaksi. Coba tanya pakai kata pendek seperti saldo, pengeluaran, pemasukan, budget, kategori, merchant, hemat, atau prediksi.",
      disclaimer: null,
      suggestions: defaultSuggestions
    };
  }

  if (wantsTopMonth) {
    return {
      answer: biggestMonth
        ? `Pengeluaran terbesar sejauh ini ada di ${monthLabel(biggestMonth.month)} sebesar ${formatRupiah(biggestMonth.total)}.`
        : "Belum ada data pengeluaran untuk dibandingkan antarbulan.",
      disclaimer: null,
      suggestions: ["Kategori apa yang paling boros bulan ini?", "Bagaimana cara mengurangi pengeluaran?", "Berapa pengeluaran bulan ini?"]
    };
  }

  if (wantsBalance) {
    return {
      answer: `Saldo saat ini adalah ${formatRupiah(balanceValue)}.`,
      disclaimer: null,
      suggestions: ["Berapa pengeluaran bulan ini?", "Prediksi saldo akhir bulan", "Budget mana yang hampir habis?"]
    };
  }

  if (wantsFoodWeek) {
    return {
      answer: `Total pengeluaran makanan minggu ini adalah ${formatRupiah(foodWeek.rows[0].total)}.`,
      disclaimer: null,
      suggestions: ["Kategori paling boros bulan ini", "Pengeluaran bulan ini dibanding bulan lalu"]
    };
  }

  if (wantsBudget) {
    if (!riskyBudget) {
      return {
        answer: "Belum ada anggaran bulan ini. Anda bisa membuat budget di menu Kelola agar aku bisa bantu memantau batas pengeluaran.",
        disclaimer: null,
        suggestions: ["Kategori paling boros bulan ini", "Berapa pengeluaran bulan ini?"]
      };
    }
    return {
      answer: `Budget yang paling perlu dipantau adalah ${riskyBudget.name}: sudah terpakai ${formatRupiah(riskyBudget.used)} dari ${formatRupiah(riskyBudget.budget)} (${Number(riskyBudget.percent).toFixed(0)}%).`,
      disclaimer: null,
      suggestions: ["Bagaimana cara mengurangi pengeluaran?", "Kategori paling boros bulan ini"]
    };
  }

  if (wantsMerchant) {
    return {
      answer: merchant
        ? `Merchant/tempat pengeluaran terbesar bulan ini adalah ${merchant.merchant} sebesar ${formatRupiah(merchant.total)}.`
        : "Belum ada data merchant pengeluaran bulan ini.",
      disclaimer: null,
      suggestions: ["Kategori paling boros bulan ini", "Pengeluaran terbesar bulan apa?"]
    };
  }

  if (wantsExpense) {
    if (wantsComparison) {
      const difference = expense - prevExpense;
      const direction = difference > 0 ? "lebih besar" : difference < 0 ? "lebih kecil" : "sama";
      return {
        answer: `Pengeluaran bulan ini ${formatRupiah(expense)} dan bulan lalu ${formatRupiah(prevExpense)}. Bulan ini ${direction} ${formatRupiah(Math.abs(difference))}.`,
        disclaimer: null,
        suggestions: ["Pengeluaran terbesar bulan apa?", "Kategori paling boros bulan ini"]
      };
    }
    return {
      answer: `Total pengeluaran bulan ini adalah ${formatRupiah(expense)}.`,
      disclaimer: null,
      suggestions: ["Bandingkan dengan bulan lalu", "Kategori paling boros bulan ini", "Bagaimana cara hemat?"]
    };
  }

  if (wantsIncome) {
    return {
      answer: `Total pemasukan bulan ini adalah ${formatRupiah(income)}.`,
      disclaimer: null,
      suggestions: ["Berapa saldo sekarang?", "Berapa net bulan ini?"]
    };
  }

  if (wantsTopCategory) {
    return {
      answer: top ? `Kategori pengeluaran terbesar bulan ini adalah ${top.name ?? "Tanpa kategori"} sebesar ${formatRupiah(top.total)}.` : "Belum ada pengeluaran bulan ini.",
      disclaimer: null,
      suggestions: ["Bagaimana cara mengurangi pengeluaran?", "Merchant terbesar bulan ini"]
    };
  }

  if (wantsSavingAdvice) {
    const items = compactList(topCategories.rows);
    return {
      answer: items ? `Area yang paling masuk akal untuk dievaluasi: ${items}. Mulai dari kategori terbesar, lalu cek transaksi yang sifatnya tidak wajib.` : "Belum ada data pengeluaran yang cukup untuk rekomendasi.",
      disclaimer: "Ini estimasi berbasis data transaksi, bukan nasihat keuangan profesional.",
      suggestions: ["Budget mana yang hampir habis?", "Pengeluaran bulan ini dibanding bulan lalu"]
    };
  }

  if (wantsPrediction) {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const elapsed = Math.max(now.getDate(), 1);
    const projectedExpense = (expense / elapsed) * daysInMonth;
    const projectedBalance = balanceValue + income - projectedExpense;
    return {
      answer: `Dengan pola bulan ini, estimasi saldo akhir bulan sekitar ${formatRupiah(projectedBalance)}.`,
      disclaimer: "Ini estimasi berbasis pola transaksi saat ini, bukan nasihat keuangan profesional.",
      suggestions: ["Bagaimana cara hemat?", "Kategori paling boros bulan ini"]
    };
  }

  if (hasAny(normalized, ["ringkasan", "summary", "overview", "net", "bulan ini"])) {
    const net = income - expense;
    return {
      answer: `Bulan ini pemasukan ${formatRupiah(income)}, pengeluaran ${formatRupiah(expense)}, net ${formatRupiah(net)}, dan saldo saat ini ${formatRupiah(balanceValue)}.`,
      disclaimer: null,
      suggestions: ["Kategori paling boros bulan ini", "Prediksi saldo akhir bulan"]
    };
  }

  return {
    answer: "Aku belum menangkap maksud pertanyaannya. Anda bisa tanya dengan kata pendek seperti saldo, pengeluaran, pemasukan, budget, kategori, merchant, hemat, atau prediksi.",
    disclaimer: null,
    suggestions: defaultSuggestions
  };
}
