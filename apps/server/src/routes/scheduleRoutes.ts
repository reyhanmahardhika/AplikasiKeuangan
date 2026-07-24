import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { scheduleSchema, scheduleUpdateSchema } from "../validators/schemas.js";
import { createSchedule, deleteSchedule, listSchedules, updateSchedule } from "../services/scheduleService.js";

export const scheduleRoutes = Router();
scheduleRoutes.use(requireAuth);

scheduleRoutes.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await listSchedules(req.user!.id));
  })
);

scheduleRoutes.post(
  "/",
  asyncHandler(async (req, res) => {
    res.status(201).json(await createSchedule(req.user!.id, scheduleSchema.parse(req.body)));
  })
);

scheduleRoutes.put(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await updateSchedule(req.user!.id, req.params.id as string, scheduleUpdateSchema.parse(req.body)));
  })
);

scheduleRoutes.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await deleteSchedule(req.user!.id, req.params.id as string));
  })
);
