import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { unauthorized } from "../utils/errors.js";

type AccessPayload = {
  sub: string;
  email: string;
  fullName: string;
};

export function signAccessToken(user: Express.User) {
  const options: jwt.SignOptions = {
    subject: user.id,
    expiresIn: config.jwtAccessExpiresIn as jwt.SignOptions["expiresIn"]
  };

  return jwt.sign(
    {
      email: user.email,
      fullName: user.fullName
    },
    config.jwtAccessSecret,
    options
  );
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return next(unauthorized("Token akses diperlukan"));
  }

  try {
    const payload = jwt.verify(authHeader.slice(7), config.jwtAccessSecret) as AccessPayload;
    req.user = {
      id: payload.sub,
      email: payload.email,
      fullName: payload.fullName
    };
    return next();
  } catch {
    return next(unauthorized("Token akses tidak valid atau kedaluwarsa"));
  }
}
