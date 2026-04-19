import { AuthError } from "@stawi/auth-runtime";

export interface AvatarValidateOptions {
  maxBytes: number;
  maxDimension?: number;
  skipDimensionsCheck?: boolean;
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const GIF87 = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61];
const GIF89 = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
const RIFF = [0x52, 0x49, 0x46, 0x46];

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[i] !== sig[i]) return false;
  }
  return true;
}

async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof (blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer === "function") {
    return blob.arrayBuffer();
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.readAsArrayBuffer(blob);
  });
}

export async function validateAvatar(
  file: File,
  opts: AvatarValidateOptions,
): Promise<void> {
  if (file.size > opts.maxBytes) {
    throw new AuthError(
      "AVATAR_TOO_LARGE",
      `avatar too large (${file.size} > ${opts.maxBytes})`,
    );
  }
  const slice = file.slice(0, 16);
  const head = new Uint8Array(await blobToArrayBuffer(slice));
  const isPng = startsWith(head, PNG);
  const isJpeg = startsWith(head, JPEG);
  const isGif = startsWith(head, GIF87) || startsWith(head, GIF89);
  const isWebp =
    startsWith(head, RIFF) &&
    head[8] === 0x57 &&
    head[9] === 0x45 &&
    head[10] === 0x42 &&
    head[11] === 0x50;
  if (!(isPng || isJpeg || isGif || isWebp)) {
    throw new AuthError("AVATAR_TYPE_UNSUPPORTED", "avatar type unsupported");
  }
  if (opts.skipDimensionsCheck) return;
  const max = opts.maxDimension ?? 4096;
  try {
    const bmp = await createImageBitmap(file);
    if (bmp.width > max || bmp.height > max) {
      throw new AuthError(
        "AVATAR_DIMENSIONS_EXCEEDED",
        `avatar dimensions exceed ${max}`,
      );
    }
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError(
      "AVATAR_DIMENSIONS_EXCEEDED",
      "avatar dimension check failed",
      err,
    );
  }
}
