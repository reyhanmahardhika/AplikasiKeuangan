import { pool } from "../db/pool.js";
import { badRequest, notFound } from "../utils/errors.js";
import { normalizeMoney } from "../utils/money.js";
import { writeAuditLog } from "./auditService.js";

export async function listBudgets(userId: string, query: { month?: number; year?: number }) {
  const month = Number(query.month || new Date().getMonth() + 1);
  const year = Number(query.year || new Date().getFullYear());
  const result = await pool.query(
    `WITH usage AS (
      SELECT b.id, b.category_id, c.name AS category, b.month, b.year, b.budget_amount,
             COALESCE(sum(t.amount), 0) AS used
      FROM budgets b
      JOIN categories c ON c.id = b.category_id
      LEFT JOIN transactions t ON t.category_id = b.category_id
        AND t.user_id = b.user_id
        AND t.transaction_type = 'expense'
        AND date_part('month', t.transaction_date) = b.month
        AND date_part('year', t.transaction_date) = b.year
      WHERE b.user_id = $1 AND b.month = $2 AND b.year = $3
      GROUP BY b.id, b.category_id, c.name, b.month, b.year, b.budget_amount
    )
    SELECT id, category_id AS "categoryId", category, month, year,
           budget_amount::text AS "budgetAmount", used::text,
           (budget_amount - used)::text AS remaining,
           round((used / nullif(budget_amount, 0)) * 100, 2)::text AS "usagePercent",
           CASE
             WHEN used / budget_amount < 0.7 THEN 'Aman'
             WHEN used / budget_amount <= 0.9 THEN 'Peringatan'
             ELSE 'Kritis'
           END AS status
    FROM usage ORDER BY category`,
    [userId, month, year]
  );
  return result.rows;
}

export async function upsertBudget(userId: string, input: { categoryId: string; month: number; year: number; budgetAmount: unknown }) {
  const category = await pool.query("SELECT id FROM categories WHERE id = $1 AND user_id = $2 AND category_type = 'expense'", [
    input.categoryId,
    userId
  ]);
  if (!category.rowCount) throw badRequest("Kategori anggaran harus kategori pengeluaran");

  const budgetAmount = normalizeMoney(input.budgetAmount);
  const result = await pool.query(
    `INSERT INTO budgets (user_id, category_id, month, year, budget_amount)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, category_id, month, year)
     DO UPDATE SET budget_amount = EXCLUDED.budget_amount, updated_at = now()
     RETURNING id, category_id AS "categoryId", month, year, budget_amount::text AS "budgetAmount"`,
    [userId, input.categoryId, input.month, input.year, budgetAmount]
  );
  await writeAuditLog(pool, { userId, action: "UPSERT", entityName: "Budget", entityId: result.rows[0].id, newValue: result.rows[0] });
  return result.rows[0];
}

export async function updateBudget(
  userId: string,
  budgetId: string,
  input: Partial<{ categoryId: string; budgetAmount: unknown; month: number; year: number }>
) {
  const current = await pool.query("SELECT * FROM budgets WHERE id = $1 AND user_id = $2", [budgetId, userId]);
  if (!current.rowCount) throw notFound("Anggaran tidak ditemukan");
  const row = current.rows[0];
  const categoryId = input.categoryId ?? row.category_id;
  const category = await pool.query("SELECT id FROM categories WHERE id = $1 AND user_id = $2 AND category_type = 'expense'", [
    categoryId,
    userId
  ]);
  if (!category.rowCount) throw badRequest("Kategori anggaran harus kategori pengeluaran");

  let result;
  try {
    result = await pool.query(
      `UPDATE budgets SET category_id = $1, budget_amount = $2, month = $3, year = $4, updated_at = now()
       WHERE id = $5 AND user_id = $6
       RETURNING id, category_id AS "categoryId", month, year, budget_amount::text AS "budgetAmount"`,
      [
        categoryId,
        input.budgetAmount ? normalizeMoney(input.budgetAmount) : row.budget_amount,
        input.month ?? row.month,
        input.year ?? row.year,
        budgetId,
        userId
      ]
    );
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "23505") {
      throw badRequest("Budget untuk kategori dan periode ini sudah ada");
    }
    throw err;
  }
  await writeAuditLog(pool, { userId, action: "UPDATE", entityName: "Budget", entityId: budgetId, previousValue: row, newValue: result.rows[0] });
  return result.rows[0];
}
