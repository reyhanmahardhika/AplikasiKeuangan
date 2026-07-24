import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { config } from "../config.js";
import { badRequest } from "../utils/errors.js";

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
    const extension = path.extname(file.originalname).toLowerCase();
    const isHeic = extension === ".heic" || extension === ".heif";
    if (!file.mimetype.startsWith("image/") && !file.mimetype.startsWith("video/") && !isHeic) {
      cb(badRequest("Format file tidak didukung. Gunakan file gambar atau video."));
      return;
    }
    cb(null, true);
  }
});
