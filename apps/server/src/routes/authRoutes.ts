import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { authRateLimiter } from "../middleware/rateLimit.js";
import { requireAuth } from "../middleware/auth.js";
import { changePasswordSchema, loginSchema, registerSchema } from "../validators/schemas.js";
import { changePassword, getProfile, login, refreshAccessToken, register, revokeRefreshToken } from "../services/authService.js";

export const authRoutes = Router();

authRoutes.post(
  "/register",
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const payload = registerSchema.parse(req.body);
    res.status(201).json(await register(payload));
  })
);

authRoutes.post(
  "/login",
  authRateLimiter,
  asyncHandler(async (req, res) => {
    const payload = loginSchema.parse(req.body);
    res.json(await login(payload));
  })
);

authRoutes.post(
  "/refresh-token",
  asyncHandler(async (req, res) => {
    res.json(await refreshAccessToken(req.body.refreshToken));
  })
);

authRoutes.post(
  "/logout",
  asyncHandler(async (req, res) => {
    await revokeRefreshToken(req.body.refreshToken);
    res.json({ loggedOut: true });
  })
);

authRoutes.post(
  "/forgot-password",
  authRateLimiter,
  asyncHandler(async (_req, res) => {
    res.json({ message: "Jika email terdaftar, instruksi reset password akan dikirim." });
  })
);

authRoutes.get(
  "/profile",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await getProfile(req.user!.id));
  })
);

authRoutes.post(
  "/change-password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = changePasswordSchema.parse(req.body);
    res.json(await changePassword(req.user!.id, payload.currentPassword, payload.newPassword));
  })
);
