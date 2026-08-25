import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE_NAME = "printopus_admin_session";
export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;

type AdminSessionPayload = {
  username: string;
  expiresAt: number;
};

function safeEqual(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function getAdminConfiguration() {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  const sessionSecret = process.env.ADMIN_SESSION_SECRET;

  if (!username || !password || !sessionSecret || sessionSecret.length < 32) {
    throw new Error("Admin authentication is not configured.");
  }
  return { username, password, sessionSecret };
}

export function verifyAdminCredentials(username: string, password: string) {
  const config = getAdminConfiguration();
  const usernameMatches = safeEqual(username.trim(), config.username);
  const passwordMatches = safeEqual(password, config.password);
  return usernameMatches && passwordMatches;
}

export function createAdminSessionToken(username: string, secret: string, now = Date.now()) {
  const payload: AdminSessionPayload = {
    username,
    expiresAt: Math.floor(now / 1000) + ADMIN_SESSION_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function readAdminSessionToken(token: string | undefined, secret: string, now = Date.now()) {
  if (!token) return null;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra || !safeEqual(signature, sign(encoded, secret))) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AdminSessionPayload;
    if (!payload.username || !Number.isFinite(payload.expiresAt)) return null;
    if (payload.expiresAt <= Math.floor(now / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
