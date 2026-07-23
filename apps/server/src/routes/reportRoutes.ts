import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { cashFlowReport, categorySummaryReport, merchantExpenseReport, monthlyComparisonReport } from "../services/reportService.js";

export const reportRoutes = Router();
reportRoutes.use(requireAuth);

reportRoutes.get(
  "/cash-flow",
  asyncHandler(async (req, res) => {
    res.json(await cashFlowReport(req.user!.id, req.query as Record<string, string | undefined>));
  })
);

reportRoutes.get(
  "/category-summary",
  asyncHandler(async (req, res) => {
    res.json(await categorySummaryReport(req.user!.id, req.query as Record<string, string | undefined>));
  })
);

reportRoutes.get(
  "/monthly-comparison",
  asyncHandler(async (req, res) => {
    res.json(await monthlyComparisonReport(req.user!.id));
  })
);

reportRoutes.get(
  "/merchant-summary",
  asyncHandler(async (req, res) => {
    res.json(await merchantExpenseReport(req.user!.id, req.query as Record<string, string | undefined>));
  })
);
