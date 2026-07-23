import dotenv from "dotenv";

dotenv.config();

const required = (key: string, fallback?: string) => {
  const value = process.env[key] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  databaseUrl: required("DATABASE_URL", "postgres://finance:finance@localhost:5432/finance_ai"),
  jwtAccessSecret: required("JWT_ACCESS_SECRET", "dev-access-secret-change-me"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET", "dev-refresh-secret-change-me"),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
  jwtRefreshDays: Number(process.env.JWT_REFRESH_DAYS ?? 7),
  uploadDir: process.env.UPLOAD_DIR ?? "uploads",
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 8),
  ocrProvider: process.env.OCR_PROVIDER ?? "tesseract",
  aiProvider: process.env.AI_PROVIDER ?? "heuristic",
  openAiApiKey: process.env.OPENAI_API_KEY,
  openAiModel: process.env.OPENAI_MODEL ?? "gpt-4.1-mini"
};
