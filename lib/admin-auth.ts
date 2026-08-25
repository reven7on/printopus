import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_COOKIE_NAME,
  getAdminConfiguration,
  readAdminSessionToken,
} from "./admin-session";

export type AdminIdentity = { username: string };

export async function getAdminIdentity(): Promise<AdminIdentity | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    const session = readAdminSessionToken(token, getAdminConfiguration().sessionSecret);
    return session ? { username: session.username } : null;
  } catch {
    return null;
  }
}

export async function requireAdminPage() {
  const identity = await getAdminIdentity();
  if (!identity) redirect("/admin/login");
  return identity;
}

export async function requireAdminApi() {
  return getAdminIdentity();
}

export function hasTrustedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const requestHost = forwardedHost || request.headers.get("host") || requestUrl.host;
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const requestProtocol = forwardedProtocol ? `${forwardedProtocol}:` : requestUrl.protocol;
    return originUrl.host === requestHost && originUrl.protocol === requestProtocol;
  } catch {
    return false;
  }
}
