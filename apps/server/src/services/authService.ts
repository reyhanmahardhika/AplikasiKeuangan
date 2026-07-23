import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { pool, withDbTransaction } from "../db/pool.js";
import { signAccessToken } from "../middleware/auth.js";
import { badRequest, conflict, unauthorized } from "../utils/errors.js";
import { insertDefaultCategories } from "./categoryService.js";
import { writeAuditLog } from "./auditService.js";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function refreshExpiry() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  return expiresAt;
}

async function createRefreshToken(userId: string) {
  const token = crypto.randomBytes(48).toString("base64url");
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hashToken(token), refreshExpiry()]
  );
  return token;
}

export async function register(input: { fullName: string; email: string; password: string; currency?: string }) {
  const existing = await pool.query("SELECT id FROM users WHERE lower(email) = lower($1)", [input.email]);
  if (existing.rowCount) {
    throw conflict("Email sudah terdaftar");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await withDbTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO users (full_name, email, password_hash, currency)
       VALUES ($1, lower($2), $3, $4)
       RETURNING id, full_name AS "fullName", email, currency`,
      [input.fullName, input.email, passwordHash, input.currency ?? "IDR"]
    );
    const created = result.rows[0];
    await insertDefaultCategories(client, created.id);
    await client.query(
      `INSERT INTO accounts (user_id, name, account_type, initial_balance, current_balance, currency)
       VALUES ($1, 'Tunai', 'cash', 0, 0, $2)`,
      [created.id, created.currency]
    );
    await writeAuditLog(client, { userId: created.id, action: "REGISTER", entityName: "User", entityId: created.id });
    return created;
  });

  const accessToken = signAccessToken({ id: user.id, email: user.email, fullName: user.fullName });
  const refreshToken = await createRefreshToken(user.id);
  return { user, accessToken, refreshToken };
}

export async function login(input: { email: string; password: string }) {
  const result = await pool.query(
    "SELECT id, full_name AS \"fullName\", email, password_hash, currency FROM users WHERE lower(email) = lower($1)",
    [input.email]
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
    throw unauthorized("Email atau password salah");
  }

  const publicUser = { id: user.id, fullName: user.fullName, email: user.email, currency: user.currency };
  const accessToken = signAccessToken(publicUser);
  const refreshToken = await createRefreshToken(user.id);
  await writeAuditLog(pool, { userId: user.id, action: "LOGIN", entityName: "User", entityId: user.id });
  return { user: publicUser, accessToken, refreshToken };
}

export async function refreshAccessToken(refreshToken: string) {
  if (!refreshToken) throw badRequest("Refresh token diperlukan");
  const tokenHash = hashToken(refreshToken);
  const result = await pool.query(
    `SELECT rt.id, u.id AS user_id, u.full_name, u.email, u.currency
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1 AND rt.revoked_at IS NULL AND rt.expires_at > now()`,
    [tokenHash]
  );
  const row = result.rows[0];
  if (!row) throw unauthorized("Refresh token tidak valid");
  const user = { id: row.user_id, fullName: row.full_name, email: row.email, currency: row.currency };
  return { user, accessToken: signAccessToken(user) };
}

export async function revokeRefreshToken(refreshToken: string) {
  if (!refreshToken) return;
  await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1", [hashToken(refreshToken)]);
}

export async function getProfile(userId: string) {
  const result = await pool.query(
    `SELECT id, full_name AS "fullName", email, currency, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0];
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const result = await pool.query("SELECT password_hash FROM users WHERE id = $1", [userId]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
    throw unauthorized("Password saat ini salah");
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await pool.query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [passwordHash, userId]);
  await writeAuditLog(pool, { userId, action: "CHANGE_PASSWORD", entityName: "User", entityId: userId });
  return { changed: true };
}
