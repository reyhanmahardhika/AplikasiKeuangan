import type { DbClient } from "../db/pool.js";

const incomeCategories = [
  ["Gaji", "Wallet"],
  ["Bonus", "Sparkles"],
  ["Penjualan", "Store"],
  ["Investasi", "TrendingUp"],
  ["Pendapatan usaha", "Briefcase"],
  ["Pendapatan lainnya", "CirclePlus"]
] as const;

const expenseCategories = [
  ["Makanan dan minuman", "Utensils"],
  ["Belanja", "ShoppingBag"],
  ["Transportasi", "Bus"],
  ["Tagihan", "ReceiptText"],
  ["Kesehatan", "HeartPulse"],
  ["Pendidikan", "GraduationCap"],
  ["Hiburan", "Film"],
  ["Cicilan", "CreditCard"],
  ["Investasi", "TrendingUp"],
  ["Pengeluaran lainnya", "CircleMinus"]
] as const;

export async function insertDefaultCategories(db: DbClient, userId: string) {
  for (const [name, icon] of incomeCategories) {
    await db.query(
      `INSERT INTO categories (user_id, name, category_type, icon, is_default)
       VALUES ($1, $2, 'income', $3, true)
       ON CONFLICT (user_id, name, category_type) DO NOTHING`,
      [userId, name, icon]
    );
  }

  for (const [name, icon] of expenseCategories) {
    await db.query(
      `INSERT INTO categories (user_id, name, category_type, icon, is_default)
       VALUES ($1, $2, 'expense', $3, true)
       ON CONFLICT (user_id, name, category_type) DO NOTHING`,
      [userId, name, icon]
    );
  }
}

export async function findCategoryByName(db: DbClient, userId: string, name: string, type: "income" | "expense") {
  const result = await db.query(
    `SELECT * FROM categories
     WHERE user_id = $1 AND lower(name) = lower($2) AND category_type = $3 AND is_active = true
     LIMIT 1`,
    [userId, name, type]
  );
  return result.rows[0] ?? null;
}
