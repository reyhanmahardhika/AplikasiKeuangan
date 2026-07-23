import { Router } from "express";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { transactionSchema } from "../validators/schemas.js";
import { createTransaction, deleteTransaction, getTransaction, listTransactions, updateTransaction } from "../services/transactionService.js";

export const transactionRoutes = Router();
transactionRoutes.use(requireAuth);

transactionRoutes.get(
  "/export",
  asyncHandler(async (req, res) => {
    const format = String(req.query.format ?? "csv");
    const result = await listTransactions(req.user!.id, { ...req.query, page: 1, limit: 5000 });
    const rows = result.data;

    if (format === "excel") {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Transaksi");
      sheet.columns = [
        { header: "Tanggal", key: "transactionDate", width: 20 },
        { header: "Tipe", key: "transactionType", width: 12 },
        { header: "Nominal", key: "amount", width: 18 },
        { header: "Kategori", key: "categoryName", width: 24 },
        { header: "Merchant", key: "merchantName", width: 28 },
        { header: "Akun", key: "accountName", width: 20 },
        { header: "Catatan", key: "notes", width: 40 }
      ];
      rows.forEach((row) => sheet.addRow(row));
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=transaksi.xlsx");
      await workbook.xlsx.write(res);
      res.end();
      return;
    }

    if (format === "pdf") {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=transaksi.pdf");
      const doc = new PDFDocument({ margin: 40 });
      doc.pipe(res);
      doc.fontSize(16).text("Riwayat Transaksi", { underline: true });
      doc.moveDown();
      rows.forEach((row) => {
        doc.fontSize(9).text(`${row.transactionDate} | ${row.transactionType} | Rp${row.amount} | ${row.categoryName ?? "-"} | ${row.merchantName ?? "-"}`);
      });
      doc.end();
      return;
    }

    const headers = ["Tanggal", "Tipe", "Nominal", "Kategori", "Merchant", "Akun", "Catatan"];
    const csvRows = [
      headers.join(","),
      ...rows.map((row) =>
        [
          row.transactionDate,
          row.transactionType,
          row.amount,
          row.categoryName ?? "",
          row.merchantName ?? "",
          row.accountName ?? "",
          row.notes ?? ""
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(",")
      )
    ];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=transaksi.csv");
    res.send(csvRows.join("\n"));
  })
);

transactionRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await listTransactions(req.user!.id, req.query));
  })
);

transactionRoutes.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await getTransaction(req.user!.id, req.params.id as string));
  })
);

transactionRoutes.post(
  "/",
  asyncHandler(async (req, res) => {
    const payload = transactionSchema.parse(req.body);
    res.status(201).json(await createTransaction(req.user!.id, payload));
  })
);

transactionRoutes.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const payload = transactionSchema.parse(req.body);
    res.json(await updateTransaction(req.user!.id, req.params.id as string, payload));
  })
);

transactionRoutes.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await deleteTransaction(req.user!.id, req.params.id as string));
  })
);
