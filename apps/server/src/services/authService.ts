import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { pool, withDbTransaction } from "../db/pool.js";
import { config } from "../config.js";
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

const googleClient = new OAuth2Client();
const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

function publicUser(row: any) {
  return {
    id: row.id ?? row.user_id,
    fullName: row.fullName ?? row.full_name,
    email: row.email,
    currency: row.currency,
    nickname: row.nickname ?? null,
    title: row.title ?? row.profile_title ?? null,
    avatarUrl: row.avatarUrl ?? row.avatar_url ?? null
  };
}

async function createSession(row: any) {
  const user = publicUser(row);
  return {
    user,
    accessToken: signAccessToken(user),
    refreshToken: await createRefreshToken(user.id)
  };
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
       RETURNING id, full_name AS "fullName", email, currency, nickname,
                 profile_title AS title, avatar_url AS "avatarUrl"`,
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

  return createSession(user);
}

export async function login(input: { email: string; password: string }) {
  const result = await pool.query(
    `SELECT id, full_name AS "fullName", email, password_hash, currency, nickname,
            profile_title AS title, avatar_url AS "avatarUrl"
     FROM users WHERE lower(email) = lower($1)`,
    [input.email]
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(input.password, user.password_hash))) {
    throw unauthorized("Email atau password salah");
  }

  await writeAuditLog(pool, { userId: user.id, action: "LOGIN", entityName: "User", entityId: user.id });
  return createSession(user);
}

export async function socialLogin(input: { provider: "google" | "apple"; idToken: string; fullName?: string | null }) {
  let identity: { email: string; fullName: string; avatarUrl?: string | null };
  if (input.provider === "google") {
    if (!config.googleClientId) throw badRequest("Login Google belum dikonfigurasi");
    const ticket = await googleClient.verifyIdToken({ idToken: input.idToken, audience: config.googleClientId });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified) throw unauthorized("Akun Google tidak valid");
    identity = {
      email: payload.email,
      fullName: payload.name || input.fullName || payload.email.split("@")[0],
      avatarUrl: payload.picture ?? null
    };
  } else {
    if (!config.appleClientId) throw badRequest("Login Apple belum dikonfigurasi");
    const verified = await jwtVerify(input.idToken, appleJwks, {
      issuer: "https://appleid.apple.com",
      audience: config.appleClientId
    });
    const email = typeof verified.payload.email === "string" ? verified.payload.email : null;
    if (!email) throw unauthorized("Email akun Apple tidak tersedia");
    identity = {
      email,
      fullName: input.fullName || email.split("@")[0],
      avatarUrl: null
    };
  }

  let result = await pool.query(
    `SELECT id, full_name AS "fullName", email, currency, nickname,
            profile_title AS title, avatar_url AS "avatarUrl"
     FROM users WHERE lower(email) = lower($1)`,
    [identity.email]
  );
  if (!result.rowCount) {
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);
    const created = await withDbTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO users (full_name, email, password_hash, currency, avatar_url)
         VALUES ($1, lower($2), $3, 'IDR', $4)
         RETURNING id, full_name AS "fullName", email, currency, nickname,
                   profile_title AS title, avatar_url AS "avatarUrl"`,
        [identity.fullName, identity.email, passwordHash, identity.avatarUrl ?? null]
      );
      await insertDefaultCategories(client, inserted.rows[0].id);
      await client.query(
        `INSERT INTO accounts (user_id, name, account_type, initial_balance, current_balance, currency)
         VALUES ($1, 'Tunai', 'cash', 0, 0, 'IDR')`,
        [inserted.rows[0].id]
      );
      return inserted.rows[0];
    });
    result = { ...result, rows: [created], rowCount: 1 } as typeof result;
  }
  await writeAuditLog(pool, { userId: result.rows[0].id, action: "SOCIAL_LOGIN", entityName: "User", entityId: result.rows[0].id });
  return createSession(result.rows[0]);
}

export async function refreshAccessToken(refreshToken: string) {
  if (!refreshToken) throw badRequest("Refresh token diperlukan");
  const tokenHash = hashToken(refreshToken);
  const result = await pool.query(
    `SELECT rt.id, u.id AS user_id, u.full_name, u.email, u.currency, u.nickname,
            u.profile_title, u.avatar_url
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1 AND rt.revoked_at IS NULL AND rt.expires_at > now()`,
    [tokenHash]
  );
  const row = result.rows[0];
  if (!row) throw unauthorized("Refresh token tidak valid");
  const user = publicUser(row);
  return { user, accessToken: signAccessToken(user) };
}

export async function revokeRefreshToken(refreshToken: string) {
  if (!refreshToken) return;
  await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1", [hashToken(refreshToken)]);
}

export async function getProfile(userId: string) {
  const result = await pool.query(
    `SELECT id, full_name AS "fullName", email, currency, nickname,
            profile_title AS title, avatar_url AS "avatarUrl",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0];
}

export async function updateProfile(userId: string, input: {
  fullName: string;
  nickname?: string | null;
  title?: string | null;
  avatarUrl?: string | null;
}) {
  const result = await pool.query(
    `UPDATE users
     SET full_name = $1, nickname = $2, profile_title = $3, avatar_url = $4, updated_at = now()
     WHERE id = $5
     RETURNING id, full_name AS "fullName", email, currency, nickname,
               profile_title AS title, avatar_url AS "avatarUrl"`,
    [input.fullName, input.nickname || null, input.title || null, input.avatarUrl || null, userId]
  );
  await writeAuditLog(pool, { userId, action: "UPDATE", entityName: "User", entityId: userId, newValue: publicUser(result.rows[0]) });
  return publicUser(result.rows[0]);
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
