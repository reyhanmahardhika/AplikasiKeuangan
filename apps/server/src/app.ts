import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config.js";
import { apiRateLimiter } from "./middleware/rateLimit.js";
import { errorMiddleware } from "./middleware/errorMiddleware.js";
import { authRoutes } from "./routes/authRoutes.js";
import { accountRoutes } from "./routes/accountRoutes.js";
import { assistantRoutes } from "./routes/assistantRoutes.js";
import { budgetRoutes } from "./routes/budgetRoutes.js";
import { categoryRoutes } from "./routes/categoryRoutes.js";
import { dashboardRoutes } from "./routes/dashboardRoutes.js";
import { receiptRoutes } from "./routes/receiptRoutes.js";
import { reportRoutes } from "./routes/reportRoutes.js";
import { transactionRoutes } from "./routes/transactionRoutes.js";
import { transferRoutes } from "./routes/transferRoutes.js";

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(
    cors({
      origin: config.clientUrl,
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(apiRateLimiter);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, name: "Aplikasi Keuangan AI" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/accounts", accountRoutes);
  app.use("/api/transactions", transactionRoutes);
  app.use("/api/receipts", receiptRoutes);
  app.use("/api/categories", categoryRoutes);
  app.use("/api/budgets", budgetRoutes);
  app.use("/api/transfers", transferRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/assistant", assistantRoutes);

  app.use(errorMiddleware);
  return app;
}
