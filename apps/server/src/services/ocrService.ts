import fs from "node:fs/promises";
import path from "node:path";
import { createWorker } from "tesseract.js";
import { badRequest } from "../utils/errors.js";

export async function runOcr(filePath: string, mimeType: string) {
  if (mimeType === "application/pdf") {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(await fs.readFile(filePath));
    if (data.text?.trim()) {
      return data.text;
    }
    throw badRequest("PDF tidak memiliki teks yang dapat dibaca. Ubah halaman struk menjadi gambar lalu upload kembali.");
  }

  const extension = path.extname(filePath).toLowerCase();
  if (![".jpg", ".jpeg", ".png"].includes(extension)) {
    throw badRequest("Format file tidak didukung untuk OCR lokal");
  }

  const worker = await createWorker("ind+eng");
  try {
    const result = await worker.recognize(filePath);
    const text = result.data.text.trim();
    if (!text) {
      throw badRequest("OCR gagal membaca isi struk");
    }
    return text;
  } finally {
    await worker.terminate();
  }
}
