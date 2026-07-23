import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { config } from "../config.js";
import { badRequest } from "../utils/errors.js";

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf"
]);

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const userId = req.user?.id ?? "anonymous";
    const dir = path.resolve(config.uploadDir, "receipts", userId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  }
});

export const receiptUpload = multer({
  storage,
  limits: {
    fileSize: config.maxUploadMb * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      cb(badRequest("Format file tidak didukung. Gunakan JPG, JPEG, PNG, atau PDF."));
      return;
    }
    cb(null, true);
  }
});
