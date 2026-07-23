import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { dashboardSummary } from "../services/dashboardService.js";

export const dashboardRoutes = Router();
dashboardRoutes.use(requireAuth);

dashboardRoutes.get(
  "/summary",
  asyncHandler(async (req, res) => {
    res.json(await dashboardSummary(req.user!.id));
  })
);
