const MAX_DATA_LEN = 512 * 1024; // chars ~= 384KB decoded
const DATA_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

export function sanitizePictureUrl(
  raw: string | undefined | null,
): string | undefined {
  if (!raw) return undefined;
  if (raw.startsWith("https://")) return raw;
  if (raw.startsWith("data:")) {
    if (raw.length > MAX_DATA_LEN) return undefined;
    return DATA_RE.test(raw) ? raw : undefined;
  }
  return undefined;
}
