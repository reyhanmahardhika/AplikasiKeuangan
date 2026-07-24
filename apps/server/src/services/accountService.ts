import type { PoolClient } from "pg";
import { pool, withDbTransaction, type DbClient } from "../db/pool.js";
import { badRequest, forbidden, notFound } from "../utils/errors.js";
import { isNegative, normalizeMoney, normalizeNonNegativeMoney } from "../utils/money.js";
import { writeAuditLog } from "./auditService.js";

export type AccountRow = {
  id: string;
  user_id: string;
  name: string;
  account_type: string;
  initial_balance: string;
  current_balance: string;
  currency: string;
  allow_negative: boolean;
  is_active: boolean;
};

function isDebtAccount(accountType: string) {
  return accountType === "credit_card";
}

export function transactionDelta(accountType: string, transactionType: "income" | "expense", amount: string) {
  if (isDebtAccount(accountType)) {
    return transactionType === "expense" ? amount : `-${amount}`;
  }
  return transactionType === "income" ? amount : `-${amount}`;
}

export async function listAccounts(userId: string) {
  const result = await pool.query(
    `SELECT id, name, account_type AS "accountType", initial_balance AS "initialBalance",
            current_balance AS "currentBalance", currency, allow_negative AS "allowNegative",
            is_active AS "isActive", created_at AS "createdAt", updated_at AS "updatedAt"
     FROM accounts
     WHERE user_id = $1
     ORDER BY is_active DESC, name ASC`,
    [userId]
  );
  return result.rows;
}

export async function createAccount(userId: string, payload: {
  name: string;
  accountType: string;
  initialBalance: unknown;
  currency?: string;
  allowNegative?: boolean;
  isActive?: boolean;
}) {
  const initialBalance = normalizeNonNegativeMoney(payload.initialBalance);
  const result = await pool.query(
    `INSERT INTO accounts (user_id, name, account_type, initial_balance, current_balance, currency, allow_negative, is_active)
     VALUES ($1, $2, $3, $4, $4, $5, $6, $7)
     RETURNING id, name, account_type AS "accountType", initial_balance AS "initialBalance",
               current_balance AS "currentBalance", currency, allow_negative AS "allowNegative",
               is_active AS "isActive"`,
    [
      userId,
      payload.name,
      payload.accountType,
      initialBalance,
      payload.currency ?? "IDR",
      payload.allowNegative ?? false,
      payload.isActive ?? true
    ]
  );
  await writeAuditLog(pool, { userId, action: "CREATE", entityName: "Account", entityId: result.rows[0].id, newValue: result.rows[0] });
  return result.rows[0];
}

export async function updateAccount(userId: string, accountId: string, payload: Record<string, unknown>) {
  const current = await pool.query("SELECT * FROM accounts WHERE id = $1 AND user_id = $2", [accountId, userId]);
  if (!current.rowCount) {
    throw notFound("Akun tidak ditemukan");
  }

  const account = current.rows[0];
  const next = {
    name: payload.name ?? account.name,
    accountType: payload.accountType ?? account.account_type,
    currency: payload.currency ?? account.currency,
    allowNegative: payload.allowNegative ?? account.allow_negative,
    isActive: payload.isActive ?? account.is_active
  };

  const result = await pool.query(
    `UPDATE accounts
     SET name = $1, account_type = $2, currency = $3, allow_negative = $4, is_active = $5, updated_at = now()
     WHERE id = $6 AND user_id = $7
     RETURNING id, name, account_type AS "accountType", initial_balance AS "initialBalance",
               current_balance AS "currentBalance", currency, allow_negative AS "allowNegative",
               is_active AS "isActive"`,
    [next.name, next.accountType, next.currency, next.allowNegative, next.isActive, accountId, userId]
  );

  await writeAuditLog(pool, { userId, action: "UPDATE", entityName: "Account", entityId: accountId, previousValue: account, newValue: result.rows[0] });
  return result.rows[0];
}

export async function deleteAccount(userId: string, accountId: string) {
  const usage = await pool.query(
    `SELECT
       (SELECT count(*) FROM transactions WHERE account_id = $1) AS transaction_count,
       (SELECT count(*) FROM transfers WHERE source_account_id = $1 OR destination_account_id = $1) AS transfer_count`,
    [accountId]
  );
  const hasLedger = Number(usage.rows[0].transaction_count) + Number(usage.rows[0].transfer_count) > 0;
  if (hasLedger) {
    const result = await pool.query(
      `UPDATE accounts SET is_active = false, updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [accountId, userId]
    );
    if (!result.rowCount) throw notFound("Akun tidak ditemukan");
    await writeAuditLog(pool, { userId, action: "DEACTIVATE", entityName: "Account", entityId: accountId });
    return { deactivated: true };
  }

  const result = await pool.query("DELETE FROM accounts WHERE id = $1 AND user_id = $2 RETURNING id", [accountId, userId]);
  if (!result.rowCount) throw notFound("Akun tidak ditemukan");
  await writeAuditLog(pool, { userId, action: "DELETE", entityName: "Account", entityId: accountId });
  return { deleted: true };
}

export async function lockAccount(client: PoolClient, userId: string, accountId: string) {
  const result = await client.query<AccountRow>(
    `SELECT * FROM accounts WHERE id = $1 AND user_id = $2 FOR UPDATE`,
    [accountId, userId]
  );
  const account = result.rows[0];
  if (!account) throw notFound("Akun tidak ditemukan");
  if (!account.is_active) throw badRequest("Akun tidak aktif");
  return account;
}

export async function applyAccountDelta(
  client: PoolClient,
  account: AccountRow,
  delta: string,
  options: { allowDebtAccountZeroFloor?: boolean } = {}
) {
  const updated = await client.query<{ current_balance: string; is_negative: boolean }>(
    `UPDATE accounts
     SET current_balance = current_balance + ($1::numeric), updated_at = now()
     WHERE id = $2
     RETURNING current_balance::text, (current_balance < 0) AS is_negative`,
    [delta, account.id]
  );

  const currentBalance = updated.rows[0].current_balance;
  const negativeNotAllowed = updated.rows[0].is_negative && !account.allow_negative;
  const debtBelowZero = isDebtAccount(account.account_type) && isNegative(currentBalance) && !options.allowDebtAccountZeroFloor;

  if (negativeNotAllowed || debtBelowZero) {
    throw forbidden("Saldo akun tidak mencukupi");
  }

  return currentBalance;
}

export async function createTransfer(userId: string, payload: {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: unknown;
  feeAmount?: unknown;
  transferDate: string;
  notes?: string | null;
  receiptId?: string | null;
}) {
  const amount = normalizeMoney(payload.amount);
  const feeAmount = normalizeNonNegativeMoney(payload.feeAmount ?? 0);
  if (payload.sourceAccountId === payload.destinationAccountId) {
    throw badRequest("Akun asal dan tujuan harus berbeda");
  }

  return withDbTransaction(async (client) => {
    const source = await lockAccount(client, userId, payload.sourceAccountId);
    const destination = await lockAccount(client, userId, payload.destinationAccountId);
    if (payload.receiptId) {
      const attachment = await client.query(
        "SELECT id FROM receipts WHERE id = $1 AND user_id = $2",
        [payload.receiptId, userId]
      );
      if (!attachment.rowCount) throw badRequest("Attachment tidak ditemukan");
    }

    const sourceDelta = isDebtAccount(source.account_type) ? amount : `-${amount}`;
    const destinationDelta = isDebtAccount(destination.account_type) ? `-${amount}` : amount;
    await applyAccountDelta(client, source, sourceDelta, { allowDebtAccountZeroFloor: false });
    if (Number(feeAmount) > 0) {
      await applyAccountDelta(client, source, isDebtAccount(source.account_type) ? feeAmount : `-${feeAmount}`, { allowDebtAccountZeroFloor: false });
    }
    await applyAccountDelta(client, destination, destinationDelta, { allowDebtAccountZeroFloor: false });

    const result = await client.query(
      `INSERT INTO transfers (user_id, source_account_id, destination_account_id, amount, transfer_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, amount::text, transfer_date AS "transferDate", notes`,
      [userId, source.id, destination.id, amount, payload.transferDate, payload.notes ?? null]
    );

    const transferId = result.rows[0].id;
    const sourceTransaction = await client.query(
      `INSERT INTO transactions
       (user_id, account_id, transaction_type, transaction_date, amount, merchant_name, payment_method, notes, source_type, status, receipt_id)
       VALUES ($1, $2, 'expense', $3, $4, $5, 'Transfer', $6, 'manual', 'transfer', $7)
       RETURNING id`,
      [userId, source.id, payload.transferDate, amount, `Transfer ke ${destination.name}`, payload.notes ?? null, payload.receiptId ?? null]
    );
    const destinationTransaction = await client.query(
      `INSERT INTO transactions
       (user_id, account_id, transaction_type, transaction_date, amount, merchant_name, payment_method, notes, source_type, status, receipt_id)
       VALUES ($1, $2, 'income', $3, $4, $5, 'Transfer', $6, 'manual', 'transfer', $7)
       RETURNING id`,
      [userId, destination.id, payload.transferDate, amount, `Transfer dari ${source.name}`, payload.notes ?? null, payload.receiptId ?? null]
    );
    let feeTransactionId: string | null = null;
    if (Number(feeAmount) > 0) {
      const feeTransaction = await client.query(
        `INSERT INTO transactions
         (user_id, account_id, transaction_type, transaction_date, amount, merchant_name, payment_method, notes, source_type, status)
         VALUES ($1, $2, 'expense', $3, $4, 'Biaya admin transfer', 'Transfer', $5, 'manual', 'transfer')
         RETURNING id`,
        [userId, source.id, payload.transferDate, feeAmount, payload.notes ?? null]
      );
      feeTransactionId = feeTransaction.rows[0].id;
    }

    await writeAuditLog(client, {
      userId,
      action: "CREATE",
      entityName: "Transfer",
      entityId: transferId,
      newValue: {
        ...result.rows[0],
        feeAmount,
        receiptId: payload.receiptId ?? null,
        sourceTransactionId: sourceTransaction.rows[0].id,
        destinationTransactionId: destinationTransaction.rows[0].id,
        feeTransactionId
      }
    });
    return { ...result.rows[0], feeAmount };
  });
}
