import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { assistantChatSchema, transactionTextParseSchema } from "../validators/schemas.js";
import { answerFinancialQuestion } from "../services/assistantService.js";
import { parseNaturalTransaction } from "../services/manualTransactionParser.js";

export const assistantRoutes = Router();
assistantRoutes.use(requireAuth);

assistantRoutes.post(
  "/chat",
  asyncHandler(async (req, res) => {
    const payload = assistantChatSchema.parse(req.body);
    res.json(await answerFinancialQuestion(req.user!.id, payload.message));
  })
);

assistantRoutes.post(
  "/parse-transaction",
  asyncHandler(async (req, res) => {
    const payload = transactionTextParseSchema.parse(req.body);
    res.json(await parseNaturalTransaction(req.user!.id, payload.text, payload.defaultAccountId));
  })
);
