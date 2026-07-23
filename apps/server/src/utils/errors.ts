export class AppError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, message, details);
export const unauthorized = (message = "Sesi tidak valid") => new AppError(401, message);
export const forbidden = (message = "Akses ditolak") => new AppError(403, message);
export const notFound = (message = "Data tidak ditemukan") => new AppError(404, message);
export const conflict = (message: string, details?: unknown) => new AppError(409, message, details);
