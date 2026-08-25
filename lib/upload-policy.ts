import "server-only";
import path from "node:path";
import sharp, { type Metadata } from "sharp";

export const MAX_UPLOAD_FILES = 5;
export const MAX_UPLOAD_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_TOTAL_BYTES = 25 * 1024 * 1024;
export const MAX_STORED_UPLOAD_TOTAL_BYTES = 30 * 1024 * 1024;
export const MAX_UPLOAD_PIXELS = 40_000_000;
export const MAX_UPLOAD_DIMENSION = 10_000;

type AllowedImage = {
  extension: "jpg" | "png" | "webp";
  mimeType: "image/jpeg" | "image/png" | "image/webp";
};

export type PreparedDesignAsset = AllowedImage & {
  originalName: string;
  bytes: Buffer;
  width: number;
  height: number;
};

export class UploadValidationError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, options: { status?: number; code?: string } = {}) {
    super(message);
    this.name = "UploadValidationError";
    this.status = options.status ?? 400;
    this.code = options.code ?? "INVALID_FILE";
  }
}

function detectImage(buffer: Buffer): AllowedImage | null {
  if (
    buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { extension: "png", mimeType: "image/png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: "jpg", mimeType: "image/jpeg" };
  }
  if (
    buffer.length >= 12
    && buffer.toString("ascii", 0, 4) === "RIFF"
    && buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { extension: "webp", mimeType: "image/webp" };
  }
  return null;
}

function cleanOriginalName(name: string, extension: AllowedImage["extension"]) {
  const baseName = path.basename(name.replaceAll("\\", "/"))
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 180);
  return baseName || `image.${extension}`;
}

function extensionMatches(name: string, detected: AllowedImage) {
  const extension = path.extname(name).slice(1).toLowerCase();
  if (detected.extension === "jpg") return extension === "jpg" || extension === "jpeg";
  return extension === detected.extension;
}

export async function prepareDesignImage(file: File): Promise<PreparedDesignAsset> {
  if (file.size <= 0) throw new UploadValidationError("Файл изображения пуст.");
  if (file.size > MAX_UPLOAD_FILE_BYTES) {
    throw new UploadValidationError("Изображение превышает лимит 10 МБ.", { status: 413, code: "FILE_TOO_LARGE" });
  }

  const input = Buffer.from(await file.arrayBuffer());
  const detected = detectImage(input);
  if (!detected) {
    throw new UploadValidationError("Разрешены только настоящие PNG, JPEG и WebP. Видео, SVG и другие файлы отклонены.", {
      status: 415,
      code: "UNSUPPORTED_FILE_TYPE",
    });
  }
  if (!extensionMatches(file.name, detected)) {
    throw new UploadValidationError("Расширение файла не соответствует его содержимому.", { status: 415, code: "FILE_TYPE_MISMATCH" });
  }
  if (file.type && file.type !== detected.mimeType) {
    throw new UploadValidationError("Заявленный тип файла не соответствует его содержимому.", { status: 415, code: "FILE_TYPE_MISMATCH" });
  }

  let metadata: Metadata;
  try {
    metadata = await sharp(input, { failOn: "warning", limitInputPixels: MAX_UPLOAD_PIXELS }).metadata();
  } catch {
    throw new UploadValidationError("Изображение повреждено или имеет небезопасную структуру.", { status: 415 });
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height || width > MAX_UPLOAD_DIMENSION || height > MAX_UPLOAD_DIMENSION || width * height > MAX_UPLOAD_PIXELS) {
    throw new UploadValidationError("Разрешение изображения слишком большое. Максимум — 40 мегапикселей и 10 000 px по стороне.", {
      status: 413,
      code: "IMAGE_TOO_LARGE",
    });
  }
  if ((metadata.pages ?? 1) !== 1) {
    throw new UploadValidationError("Анимированные изображения не поддерживаются.", { status: 415 });
  }

  try {
    let pipeline = sharp(input, { failOn: "warning", limitInputPixels: MAX_UPLOAD_PIXELS }).rotate();
    if (detected.extension === "png") pipeline = pipeline.png({ compressionLevel: 9 });
    if (detected.extension === "jpg") pipeline = pipeline.jpeg({ quality: 98, chromaSubsampling: "4:4:4" });
    if (detected.extension === "webp") pipeline = pipeline.webp({ quality: 98, smartSubsample: true });
    const normalized = await pipeline.toBuffer({ resolveWithObject: true });
    if (normalized.data.byteLength > MAX_UPLOAD_FILE_BYTES * 2) {
      throw new UploadValidationError("После безопасной обработки изображение получилось слишком большим.", {
        status: 413,
        code: "FILE_TOO_LARGE",
      });
    }
    return {
      ...detected,
      originalName: cleanOriginalName(file.name, detected.extension),
      bytes: normalized.data,
      width: normalized.info.width,
      height: normalized.info.height,
    };
  } catch (error) {
    if (error instanceof UploadValidationError) throw error;
    throw new UploadValidationError("Не удалось безопасно обработать изображение.", { status: 415 });
  }
}

export async function prepareDesignImages(files: File[]) {
  if (files.length > MAX_UPLOAD_FILES) {
    throw new UploadValidationError(`К одному заказу можно приложить не более ${MAX_UPLOAD_FILES} изображений.`, {
      status: 413,
      code: "TOO_MANY_FILES",
    });
  }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_UPLOAD_TOTAL_BYTES) {
    throw new UploadValidationError("Общий размер изображений превышает 25 МБ.", { status: 413, code: "FILES_TOO_LARGE" });
  }
  const prepared: PreparedDesignAsset[] = [];
  let storedBytes = 0;
  for (const file of files) {
    const image = await prepareDesignImage(file);
    storedBytes += image.bytes.byteLength;
    if (storedBytes > MAX_STORED_UPLOAD_TOTAL_BYTES) {
      throw new UploadValidationError("Общий размер изображений после безопасной обработки превышает 30 МБ.", {
        status: 413,
        code: "FILES_TOO_LARGE",
      });
    }
    prepared.push(image);
  }
  return prepared;
}
