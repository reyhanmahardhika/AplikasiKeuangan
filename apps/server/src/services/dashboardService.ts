import { pool } from "../db/pool.js";

function monthBounds(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  return { start, end, month: date.getMonth() + 1, year: date.getFullYear() };
}

export async function dashboardSummary(userId: string) {
  const { start, end, month, year } = monthBounds();
  const [balances, monthly, daily, categories, lastTransactions, budgetAlerts] = await Promise.all([
    pool.query(
      `SELECT COALESCE(sum(CASE WHEN account_type = 'credit_card' THEN -current_balance ELSE current_balance END), 0)::text AS balance
       FROM accounts WHERE user_id = $1 AND is_active = true`,
      [userId]
    ),
    pool.query(
      `SELECT
         COALESCE(sum(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0)::text AS income,
         COALESCE(sum(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0)::text AS expense
       FROM transactions
       WHERE user_id = $1 AND transaction_date >= $2 AND transaction_date < $3`,
      [userId, start, end]
    ),
    pool.query(
      `SELECT date_trunc('day', transaction_date)::date AS date,
              COALESCE(sum(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0)::text AS income,
              COALESCE(sum(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END), 0)::text AS expense
       FROM transactions
       WHERE user_id = $1 AND transaction_date >= $2 AND transaction_date < $3
       GROUP BY 1 ORDER BY 1`,
      [userId, start, end]
    ),
    pool.query(
      `SELECT c.name AS category, COALESCE(sum(t.amount), 0)::text AS total
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = $1 AND t.transaction_type = 'expense' AND t.transaction_date >= $2 AND t.transaction_date < $3
       GROUP BY c.name ORDER BY sum(t.amount) DESC LIMIT 8`,
      [userId, start, end]
    ),
    pool.query(
      `SELECT t.id, t.transaction_type AS "transactionType", t.transaction_date AS "transactionDate",
              t.amount::text, t.merchant_name AS "merchantName", c.name AS "categoryName", a.name AS "accountName"
       FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.user_id = $1
       ORDER BY t.transaction_date DESC, t.created_at DESC
       LIMIT 5`,
      [userId]
    ),
    pool.query(
      `WITH usage AS (
        SELECT b.id, b.budget_amount, c.name AS category,
               COALESCE(sum(t.amount), 0) AS used
        FROM budgets b
        JOIN categories c ON c.id = b.category_id
        LEFT JOIN transactions t ON t.category_id = b.category_id
          AND t.user_id = b.user_id
          AND t.transaction_type = 'expense'
          AND date_part('month', t.transaction_date) = b.month
          AND date_part('year', t.transaction_date) = b.year
        WHERE b.user_id = $1 AND b.month = $2 AND b.year = $3
        GROUP BY b.id, b.budget_amount, c.name
       )
       SELECT id, category, budget_amount::text AS "budgetAmount", used::text,
              round((used / nullif(budget_amount, 0)) * 100, 2)::text AS "usagePercent"
       FROM usage
       WHERE used >= budget_amount * 0.7
       ORDER BY used / budget_amount DESC`,
      [userId, month, year]
    )
  ]);

  return {
    balance: balances.rows[0].balance,
    incomeThisMonth: monthly.rows[0].income,
    expenseThisMonth: monthly.rows[0].expense,
    daily: daily.rows,
    expenseByCategory: categories.rows,
    lastTransactions: lastTransactions.rows,
    budgetAlerts: budgetAlerts.rows
  };
}
