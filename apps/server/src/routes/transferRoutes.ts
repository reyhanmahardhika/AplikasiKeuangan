import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { transferSchema } from "../validators/schemas.js";
import { createTransfer } from "../services/accountService.js";

export const transferRoutes = Router();
transferRoutes.use(requireAuth);

transferRoutes.post(
  "/",
  asyncHandler(async (req, res) => {
    res.status(201).json(await createTransfer(req.user!.id, transferSchema.parse(req.body)));
  })
);
