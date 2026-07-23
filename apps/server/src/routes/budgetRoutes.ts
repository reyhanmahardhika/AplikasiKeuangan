import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { budgetSchema, budgetUpdateSchema } from "../validators/schemas.js";
import { listBudgets, updateBudget, upsertBudget } from "../services/budgetService.js";

export const budgetRoutes = Router();
budgetRoutes.use(requireAuth);

budgetRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await listBudgets(req.user!.id, { month: Number(req.query.month), year: Number(req.query.year) }));
  })
);

budgetRoutes.post(
  "/",
  asyncHandler(async (req, res) => {
    res.status(201).json(await upsertBudget(req.user!.id, budgetSchema.parse(req.body)));
  })
);

budgetRoutes.put(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await updateBudget(req.user!.id, req.params.id as string, budgetUpdateSchema.parse(req.body)));
  })
);
