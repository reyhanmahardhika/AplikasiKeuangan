import type { PoolClient } from "pg";
import { pool, withDbTransaction, type DbClient } from "../db/pool.js";
import { badRequest, notFound } from "../utils/errors.js";
import { negate, normalizeMoney, normalizeNonNegativeMoney } from "../utils/money.js";
import { applyAccountDelta, lockAccount, transactionDelta } from "./accountService.js";
import { writeAuditLog } from "./auditService.js";

type TransactionType = "income" | "expense";

export type TransactionInput = {
  accountId: string;
  transactionType: TransactionType;
  transactionDate: string;
  amount: unknown;
  categoryId?: string | null;
  merchantName?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  sourceType?: "manual" | "receipt";
  receiptId?: string | null;
  attachmentUrl?: string | null;
  status?: string;
  items?: Array<{
    itemName: string;
    quantity?: string | number;
    unitPrice?: string | number;
    totalPrice?: string | number;
  }>;
};

function toListQuery(filters: Record<string, unknown>, userId: string) {
  const where = ["t.user_id = $1"];
  const values: unknown[] = [userId];

  const add = (sql: string, value: unknown) => {
    values.push(value);
    where.push(sql.replace("?", `$${values.length}`));
  };

  if (filters.search) {
    values.push(`%${filters.search}%`);
    const index = values.length;
    where.push(`(lower(coalesce(t.merchant_name, '')) LIKE lower($${index}) OR lower(coalesce(t.notes, '')) LIKE lower($${index}))`);
  }
  if (filters.type) add("t.transaction_type = ?", filters.type);
  if (filters.categoryId) add("t.category_id = ?", filters.categoryId);
  if (filters.accountId) add("t.account_id = ?", filters.accountId);
  if (filters.paymentMethod) add("t.payment_method = ?", filters.paymentMethod);
  if (filters.sourceType) add("t.source_type = ?", filters.sourceType);
  if (filters.from) add("t.transaction_date >= ?", filters.from);
  if (filters.to) add("t.transaction_date <= ?", filters.to);

  const sort = filters.sort === "amount" ? "t.amount" : "t.transaction_date";
  const direction = filters.direction === "asc" ? "ASC" : "DESC";

  return { where: where.join(" AND "), values, sort, direction };
}

function normalizeItems(items: TransactionInput["items"] = []) {
  return items.map((item) => ({
    itemName: item.itemName,
    quantity: String(item.quantity ?? 1).replace(",", "."),
    unitPrice: normalizeNonNegativeMoney(item.unitPrice ?? 0),
    totalPrice: normalizeNonNegativeMoney(item.totalPrice ?? 0)
  }));
}

async function ensureCategoryOwned(client: PoolClient, userId: string, categoryId?: string | null) {
  if (!categoryId) return;
  const category = await client.query(
    "SELECT id FROM categories WHERE id = $1 AND user_id = $2 AND is_active = true",
    [categoryId, userId]
  );
  if (!category.rowCount) {
    throw badRequest("Kategori tidak valid");
  }
}

async function ensureReceiptOwned(client: PoolClient, userId: string, receiptId?: string | null) {
  if (!receiptId) return;
  const receipt = await client.query(
    "SELECT id FROM receipts WHERE id = $1 AND user_id = $2",
    [receiptId, userId]
  );
  if (!receipt.rowCount) {
    throw badRequest("Struk tidak valid");
  }
}

async function insertItems(client: PoolClient, transactionId: string, items: ReturnType<typeof normalizeItems>) {
  for (const item of items) {
    await client.query(
      `INSERT INTO transaction_items (transaction_id, item_name, quantity, unit_price, total_price)
       VALUES ($1, $2, $3, $4, $5)`,
      [transactionId, item.itemName, item.quantity, item.unitPrice, item.totalPrice]
    );
  }
}

async function fetchTransactionForUpdate(client: PoolClient, userId: string, transactionId: string) {
  const result = await client.query(
    `SELECT t.*, a.account_type, a.allow_negative
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     WHERE t.id = $1 AND t.user_id = $2
     FOR UPDATE OF t`,
    [transactionId, userId]
  );
  const transaction = result.rows[0];
  if (!transaction) throw notFound("Transaksi tidak ditemukan");
  return transaction;
}

export async function listTransactions(userId: string, query: Record<string, unknown>) {
  const page = Math.max(Number(query.page ?? 1), 1);
  const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
  const offset = (page - 1) * limit;
  const { where, values, sort, direction } = toListQuery(query, userId);

  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT t.id, t.transaction_type AS "transactionType", t.transaction_date AS "transactionDate",
              t.amount::text, t.merchant_name AS "merchantName", t.payment_method AS "paymentMethod",
              t.notes, t.source_type AS "sourceType", t.status,
              a.name AS "accountName", c.name AS "categoryName"
       FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE ${where}
       ORDER BY ${sort} ${direction}, t.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    ),
    pool.query(`SELECT count(*)::int AS total FROM transactions t WHERE ${where}`, values)
  ]);

  return {
    data: rows.rows,
    pagination: {
      page,
      limit,
      total: count.rows[0].total
    }
  };
}

export async function getTransaction(userId: string, transactionId: string, db: DbClient = pool) {
  const transaction = await db.query(
    `SELECT t.id, t.account_id AS "accountId", t.transaction_type AS "transactionType",
            t.transaction_date AS "transactionDate", t.amount::text, t.category_id AS "categoryId",
            t.merchant_name AS "merchantName", t.payment_method AS "paymentMethod", t.notes,
            t.source_type AS "sourceType", t.receipt_id AS "receiptId", t.attachment_url AS "attachmentUrl",
            t.status, a.name AS "accountName", c.name AS "categoryName"
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.id = $1 AND t.user_id = $2`,
    [transactionId, userId]
  );
  if (!transaction.rowCount) throw notFound("Transaksi tidak ditemukan");

  const items = await db.query(
    `SELECT id, item_name AS "itemName", quantity::text, unit_price::text AS "unitPrice", total_price::text AS "totalPrice"
     FROM transaction_items WHERE transaction_id = $1 ORDER BY item_name`,
    [transactionId]
  );

  return { ...transaction.rows[0], items: items.rows };
}

export async function createTransaction(userId: string, input: TransactionInput, externalClient?: PoolClient) {
  const work = async (client: PoolClient) => {
    const amount = normalizeMoney(input.amount);
    await ensureCategoryOwned(client, userId, input.categoryId);
    await ensureReceiptOwned(client, userId, input.receiptId);
    const account = await lockAccount(client, userId, input.accountId);
    await applyAccountDelta(client, account, transactionDelta(account.account_type, input.transactionType, amount));

    const result = await client.query(
      `INSERT INTO transactions
       (user_id, account_id, transaction_type, transaction_date, amount, category_id, merchant_name,
        payment_method, notes, source_type, receipt_id, attachment_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, transaction_type AS "transactionType", transaction_date AS "transactionDate", amount::text`,
      [
        userId,
        input.accountId,
        input.transactionType,
        input.transactionDate,
        amount,
        input.categoryId ?? null,
        input.merchantName ?? null,
        input.paymentMethod ?? null,
        input.notes ?? null,
        input.sourceType ?? "manual",
        input.receiptId ?? null,
        input.attachmentUrl ?? null,
        input.status ?? "posted"
      ]
    );

    const transactionId = result.rows[0].id;
    await insertItems(client, transactionId, normalizeItems(input.items));
    await writeAuditLog(client, { userId, action: "CREATE", entityName: "Transaction", entityId: transactionId, newValue: input });
    return getTransaction(userId, transactionId, client);
  };

  return externalClient ? work(externalClient) : withDbTransaction(work);
}

export async function updateTransaction(userId: string, transactionId: string, input: TransactionInput) {
  return withDbTransaction(async (client) => {
    const previous = await fetchTransactionForUpdate(client, userId, transactionId);
    const previousAccount = await lockAccount(client, userId, previous.account_id);
    await applyAccountDelta(
      client,
      previousAccount,
      negate(transactionDelta(previousAccount.account_type, previous.transaction_type, previous.amount))
    );

    const amount = normalizeMoney(input.amount);
    await ensureCategoryOwned(client, userId, input.categoryId);
    await ensureReceiptOwned(client, userId, input.receiptId);
    const account = await lockAccount(client, userId, input.accountId);
    await applyAccountDelta(client, account, transactionDelta(account.account_type, input.transactionType, amount));

    await client.query(
      `UPDATE transactions
       SET account_id = $1, transaction_type = $2, transaction_date = $3, amount = $4,
           category_id = $5, merchant_name = $6, payment_method = $7, notes = $8,
           source_type = $9, receipt_id = $10, attachment_url = $11, status = $12, updated_at = now()
       WHERE id = $13 AND user_id = $14`,
      [
        input.accountId,
        input.transactionType,
        input.transactionDate,
        amount,
        input.categoryId ?? null,
        input.merchantName ?? null,
        input.paymentMethod ?? null,
        input.notes ?? null,
        input.sourceType ?? "manual",
        input.receiptId ?? null,
        input.attachmentUrl ?? null,
        input.status ?? "posted",
        transactionId,
        userId
      ]
    );

    await client.query("DELETE FROM transaction_items WHERE transaction_id = $1", [transactionId]);
    await insertItems(client, transactionId, normalizeItems(input.items));
    await writeAuditLog(client, { userId, action: "UPDATE", entityName: "Transaction", entityId: transactionId, previousValue: previous, newValue: input });
    return getTransaction(userId, transactionId, client);
  });
}

export async function deleteTransaction(userId: string, transactionId: string) {
  return withDbTransaction(async (client) => {
    const previous = await fetchTransactionForUpdate(client, userId, transactionId);
    const previousAccount = await lockAccount(client, userId, previous.account_id);
    await applyAccountDelta(
      client,
      previousAccount,
      negate(transactionDelta(previousAccount.account_type, previous.transaction_type, previous.amount))
    );
    await client.query("DELETE FROM transactions WHERE id = $1 AND user_id = $2", [transactionId, userId]);
    await writeAuditLog(client, { userId, action: "DELETE", entityName: "Transaction", entityId: transactionId, previousValue: previous });
    return { deleted: true };
  });
}
