import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSessionToken,
  getAdminConfiguration,
  verifyAdminCredentials,
} from "../../../../lib/admin-session";
import { getAdminIdentity, hasTrustedOrigin } from "../../../../lib/admin-auth";

export const runtime = "nodejs";

type Attempt = { count: number; resetAt: number };
const globalAttempts = globalThis as unknown as { adminLoginAttempts?: Map<string, Attempt> };
const attempts = globalAttempts.adminLoginAttempts ?? new Map<string, Attempt>();
globalAttempts.adminLoginAttempts = attempts;

function clientKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

function isRateLimited(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 0, resetAt: now + 15 * 60_000 });
    return false;
  }
  return current.count >= 5;
}

function recordFailure(key: string) {
  const current = attempts.get(key) ?? { count: 0, resetAt: Date.now() + 15 * 60_000 };
  attempts.set(key, { ...current, count: current.count + 1 });
}

export async function GET() {
  const identity = await getAdminIdentity();
  return NextResponse.json({ authenticated: Boolean(identity), user: identity }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: { message: "Запрос отклонён." } }, { status: 403 });
  const key = clientKey(request);
  if (isRateLimited(key)) {
    return NextResponse.json({ error: { message: "Слишком много попыток. Повторите позже." } }, { status: 429 });
  }

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 4096) throw new Error();
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: { message: "Неверный формат запроса." } }, { status: 400 });
  }

  const username = typeof body === "object" && body !== null && "username" in body ? String(body.username) : "";
  const password = typeof body === "object" && body !== null && "password" in body ? String(body.password) : "";

  try {
    if (!verifyAdminCredentials(username, password)) {
      recordFailure(key);
      return NextResponse.json({ error: { message: "Неверный логин или пароль." } }, { status: 401 });
    }

    attempts.delete(key);
    const config = getAdminConfiguration();
    const response = NextResponse.json({ authenticated: true, user: { username: config.username } });
    response.cookies.set(ADMIN_COOKIE_NAME, createAdminSessionToken(config.username, config.sessionSecret), {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ADMIN_SESSION_TTL_SECONDS,
    });
    return response;
  } catch (error) {
    console.error("Admin login failed", error);
    return NextResponse.json({ error: { message: "Вход временно недоступен." } }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: { message: "Запрос отклонён." } }, { status: 403 });
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
