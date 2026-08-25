import { Prisma } from "../app/generated/prisma/client";
import { database } from "./db";
import { hasTrustedOrigin, requireAdminApi } from "./admin-auth";

export function adminError(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function authorizeAdminRequest(request?: Request, mutation = false) {
  const identity = await requireAdminApi();
  if (!identity) return { response: adminError("UNAUTHORIZED", "Требуется вход в админку.", 401) } as const;
  if (mutation && request && !hasTrustedOrigin(request)) {
    return { response: adminError("INVALID_ORIGIN", "Запрос отклонён.", 403) } as const;
  }
  return { identity } as const;
}

export async function readAdminJson(request: Request, maxBytes = 32_000) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new Error("INVALID_JSON");
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maxBytes) throw new Error("REQUEST_TOO_LARGE");
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error("INVALID_JSON");
  }
}

export async function writeAuditLog(args: {
  actor: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: unknown;
}, transaction: Prisma.TransactionClient = database) {
  await transaction.adminAuditLog.create({
    data: {
      actor: args.actor,
      action: args.action,
      entity: args.entity,
      entityId: args.entityId,
      ...(args.details === undefined ? {} : { details: args.details as Prisma.InputJsonValue }),
    },
  });
}
