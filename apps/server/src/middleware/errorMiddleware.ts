import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../utils/errors.js";

export const errorMiddleware: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    return res.status(422).json({
      message: "Data tidak valid",
      details: error.flatten()
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      message: error.message,
      details: error.details
    });
  }

  if (error?.code === "23505") {
    return res.status(409).json({ message: "Data duplikat" });
  }

  console.error(error);
  return res.status(500).json({
    message: "Terjadi kesalahan pada server"
  });
};
