import crypto from "node:crypto";
import fs from "node:fs/promises";
import type { Express } from "express";
import { pool, withDbTransaction } from "../db/pool.js";
import { badRequest, conflict, notFound } from "../utils/errors.js";
import { findCategoryByName } from "./categoryService.js";
import { createTransaction } from "./transactionService.js";
import { parseReceiptText } from "./receiptParser.js";
import { runOcr } from "./ocrService.js";
import { writeAuditLog } from "./auditService.js";

async function hashFile(path: string) {
  const buffer = await fs.readFile(path);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function uploadReceipt(userId: string, file?: Express.Multer.File) {
  if (!file) throw badRequest("File struk diperlukan");
  const fileHash = await hashFile(file.path);
  const duplicate = await pool.query(
    "SELECT id FROM receipts WHERE user_id = $1 AND file_hash = $2",
    [userId, fileHash]
  );
  if (duplicate.rowCount) {
    await fs.rm(file.path, { force: true });
    throw conflict("File duplikat. Struk ini sudah pernah diupload.", { receiptId: duplicate.rows[0].id });
  }

  const result = await pool.query(
    `INSERT INTO receipts (user_id, file_name, file_url, file_hash, processing_status)
     VALUES ($1, $2, $3, $4, 'uploaded')
     RETURNING id, file_name AS "fileName", processing_status AS "processingStatus", created_at AS "createdAt"`,
    [userId, file.originalname, file.path, fileHash]
  );
  await writeAuditLog(pool, { userId, action: "UPLOAD", entityName: "Receipt", entityId: result.rows[0].id });
  return {
    ...result.rows[0],
    fileUrl: `/api/receipts/${result.rows[0].id}/file`
  };
}

export async function processReceipt(userId: string, receiptId: string) {
  const receipt = await pool.query("SELECT * FROM receipts WHERE id = $1 AND user_id = $2", [receiptId, userId]);
  const row = receipt.rows[0];
  if (!row) throw notFound("Struk tidak ditemukan");
  if (row.processing_status === "confirmed") throw conflict("Struk sudah dikonfirmasi");

  await pool.query("UPDATE receipts SET processing_status = 'processing' WHERE id = $1", [receiptId]);
  try {
    const rawText = await runOcr(row.file_url, row.file_name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image");
    const parsed = await parseReceiptText(rawText);
    const status = parsed.confidenceScore < 0.7 ? "needs_review" : "processed";
    await pool.query(
      `UPDATE receipts
       SET raw_ocr_text = $1, parsed_json = $2, confidence_score = $3, processing_status = $4
       WHERE id = $5`,
      [rawText, JSON.stringify(parsed), parsed.confidenceScore, status, receiptId]
    );
    return {
      receiptId,
      rawOcrText: rawText,
      parsed,
      processingStatus: status,
      message:
        parsed.confidenceScore < 0.7
          ? "Beberapa informasi pada struk tidak terbaca dengan jelas. Silakan periksa kembali data sebelum menyimpan transaksi."
          : null
    };
  } catch (error) {
    await pool.query("UPDATE receipts SET processing_status = 'failed' WHERE id = $1", [receiptId]);
    throw error;
  }
}

export async function getReceiptResult(userId: string, receiptId: string) {
  const result = await pool.query(
    `SELECT id, file_name AS "fileName", raw_ocr_text AS "rawOcrText", parsed_json AS parsed,
            processing_status AS "processingStatus", confidence_score AS "confidenceScore", created_at AS "createdAt"
     FROM receipts WHERE id = $1 AND user_id = $2`,
    [receiptId, userId]
  );
  if (!result.rowCount) throw notFound("Struk tidak ditemukan");
  return {
    ...result.rows[0],
    fileUrl: `/api/receipts/${receiptId}/file`
  };
}

export async function getReceiptFile(userId: string, receiptId: string) {
  const result = await pool.query("SELECT file_url, file_name FROM receipts WHERE id = $1 AND user_id = $2", [receiptId, userId]);
  if (!result.rowCount) throw notFound("Struk tidak ditemukan");
  return result.rows[0] as { file_url: string; file_name: string };
}

export async function confirmReceipt(userId: string, receiptId: string, input: {
  accountId: string;
  categoryId?: string | null;
  merchantName: string;
  transactionDate: string;
  amount: unknown;
  paymentMethod?: string | null;
  notes?: string | null;
  items: Array<{ itemName: string; quantity?: string | number; unitPrice?: string | number; totalPrice?: string | number }>;
}) {
  return withDbTransaction(async (client) => {
    const receipt = await client.query("SELECT * FROM receipts WHERE id = $1 AND user_id = $2 FOR UPDATE", [receiptId, userId]);
    const row = receipt.rows[0];
    if (!row) throw notFound("Struk tidak ditemukan");
    if (!["processed", "needs_review"].includes(row.processing_status)) {
      throw badRequest("Struk harus diproses sebelum dikonfirmasi");
    }
    const existing = await client.query("SELECT id FROM transactions WHERE receipt_id = $1 AND user_id = $2", [receiptId, userId]);
    if (existing.rowCount) {
      throw conflict("Transaksi dari struk ini sudah tersimpan");
    }

    let categoryId = input.categoryId ?? null;
    if (!categoryId && row.parsed_json?.suggestedCategory) {
      const suggested = await findCategoryByName(client, userId, row.parsed_json.suggestedCategory, "expense");
      categoryId = suggested?.id ?? null;
    }

    const transaction = await createTransaction(
      userId,
      {
        accountId: input.accountId,
        transactionType: "expense",
        transactionDate: input.transactionDate,
        amount: input.amount,
        categoryId,
        merchantName: input.merchantName,
        paymentMethod: input.paymentMethod,
        notes: input.notes,
        sourceType: "receipt",
        receiptId,
        items: input.items
      },
      client
    );

    await client.query("UPDATE receipts SET processing_status = 'confirmed' WHERE id = $1", [receiptId]);
    await writeAuditLog(client, { userId, action: "CONFIRM", entityName: "Receipt", entityId: receiptId, newValue: transaction });
    return transaction;
  });
}
