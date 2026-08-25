import "server-only";
import { constants } from "node:fs";
import { access, mkdir, readFile, rename, rm, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const STORAGE_KEY_PATTERN = /^orders\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/;
const DEFAULT_MINIMUM_FREE_BYTES = 1024 * 1024 * 1024;

export class UploadStorageFullError extends Error {
  constructor() {
    super("На сервере временно недостаточно места для загрузки файла.");
    this.name = "UploadStorageFullError";
  }
}

export function getUploadRoot() {
  const configured = process.env.UPLOAD_DIR?.trim();
  const root = path.resolve(configured || path.join(process.cwd(), ".data", "uploads"));
  if (root === path.parse(root).root) throw new Error("UPLOAD_DIR must not point to the filesystem root.");
  return root;
}

export function createStorageKey(orderId: string, assetId: string, extension: "jpg" | "png" | "webp") {
  return `orders/${orderId}/${assetId}.${extension}`;
}

function resolveStorageKey(storageKey: string) {
  if (!STORAGE_KEY_PATTERN.test(storageKey)) throw new Error("Invalid storage key.");
  const root = getUploadRoot();
  const target = path.resolve(root, storageKey);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Storage path escaped the upload directory.");
  return target;
}

export async function ensureUploadStorage() {
  const root = getUploadRoot();
  await mkdir(root, { recursive: true, mode: 0o750 });
  await access(root, constants.R_OK | constants.W_OK);
  return root;
}

export async function ensureUploadCapacity(requiredBytes = 0) {
  const root = await ensureUploadStorage();
  const configuredReserve = Number(process.env.UPLOAD_MIN_FREE_BYTES ?? DEFAULT_MINIMUM_FREE_BYTES);
  const reserve = Number.isFinite(configuredReserve) && configuredReserve >= 0
    ? configuredReserve
    : DEFAULT_MINIMUM_FREE_BYTES;
  const filesystem = await statfs(root);
  const availableBytes = filesystem.bavail * filesystem.bsize;
  if (availableBytes - requiredBytes < reserve) throw new UploadStorageFullError();
}

export async function writeStoredAsset(storageKey: string, bytes: Buffer) {
  const target = resolveStorageKey(storageKey);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o750 });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, { flag: "wx", mode: 0o640 });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function readStoredAsset(storageKey: string) {
  return readFile(resolveStorageKey(storageKey));
}

export async function removeStoredAsset(storageKey: string) {
  await rm(resolveStorageKey(storageKey), { force: true });
}
