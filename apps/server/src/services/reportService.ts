import { pool } from "../db/pool.js";

function rangeForPreset(preset?: string, from?: string, to?: string) {
  const now = new Date();
  if (from && to) return { start: new Date(from), end: new Date(to) };

  const start = new Date(now);
  let end = new Date(now);
  if (preset === "today") {
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setDate(end.getDate() + 1);
  } else if (preset === "week") {
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setDate(end.getDate() + 7);
  } else if (preset === "year") {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setFullYear(end.getFullYear() + 1);
  } else {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setMonth(end.getMonth() + 1);
  }
  return { start, end };
}

export async function cashFlowReport(userId: string, query: Record<string, string | undefined>) {
  const { start, end } = rangeForPreset(query.preset, query.from, query.to);
  const result = await pool.query(
    `SELECT date_trunc('day', transaction_date)::date AS date,
            COALESCE(sum(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0)::text AS income,
            COALESCE(sum(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0)::text AS expense,
            (COALESCE(sum(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0)
             - COALESCE(sum(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0))::text AS net
     FROM transactions
     WHERE user_id = $1 AND transaction_date >= $2 AND transaction_date < $3
     GROUP BY 1 ORDER BY 1`,
    [userId, start, end]
  );
  return result.rows;
}

export async function categorySummaryReport(userId: string, query: Record<string, string | undefined>) {
  const { start, end } = rangeForPreset(query.preset, query.from, query.to);
  const result = await pool.query(
    `SELECT c.name AS category, t.transaction_type AS "transactionType", COALESCE(sum(t.amount), 0)::text AS total,
            count(*)::int AS count
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.user_id = $1 AND t.transaction_date >= $2 AND t.transaction_date < $3
     GROUP BY c.name, t.transaction_type
     ORDER BY t.transaction_type, sum(t.amount) DESC`,
    [userId, start, end]
  );
  return result.rows;
}

export async function monthlyComparisonReport(userId: string) {
  const result = await pool.query(
    `SELECT date_trunc('month', transaction_date)::date AS month,
            COALESCE(sum(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0)::text AS income,
            COALESCE(sum(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0)::text AS expense
     FROM transactions
     WHERE user_id = $1 AND transaction_date >= date_trunc('month', now()) - interval '11 months'
     GROUP BY 1 ORDER BY 1`,
    [userId]
  );
  return result.rows;
}

export async function merchantExpenseReport(userId: string, query: Record<string, string | undefined>) {
  const { start, end } = rangeForPreset(query.preset, query.from, query.to);
  const result = await pool.query(
    `SELECT COALESCE(merchant_name, 'Tanpa merchant') AS merchant, COALESCE(sum(amount), 0)::text AS total,
            count(*)::int AS count
     FROM transactions
     WHERE user_id = $1 AND transaction_type = 'expense' AND transaction_date >= $2 AND transaction_date < $3
     GROUP BY merchant_name ORDER BY sum(amount) DESC LIMIT 20`,
    [userId, start, end]
  );
  return result.rows;
}
