import { IdentityError } from "./errors.js";

/** Connect envelope flag bit marking the end-of-stream trailer. */
const TRAILER_FLAG = 0x02;
const HEADER_BYTES = 5;

interface Trailer {
  error?: { code?: string; message?: string };
}

/**
 * Decodes a Connect server-streaming response body into its messages.
 *
 * The body is a sequence of envelopes: 1 flag byte, a 4-byte big-endian
 * payload length, then that many bytes of JSON. The final envelope has
 * the trailer flag set and carries `{ error?, metadata? }` — an `error`
 * there is thrown as an `IdentityError`.
 */
export function decodeConnectStream<T>(buf: ArrayBuffer): T[] {
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  const messages: T[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    if (offset + HEADER_BYTES > bytes.length) {
      throw new IdentityError(
        "invalid_response",
        "Truncated Connect stream: incomplete envelope header",
      );
    }
    const flags = view.getUint8(offset);
    const length = view.getUint32(offset + 1);
    const start = offset + HEADER_BYTES;
    const end = start + length;
    if (end > bytes.length) {
      throw new IdentityError(
        "invalid_response",
        "Truncated Connect stream: envelope payload shorter than declared length",
      );
    }
    const json = new TextDecoder().decode(bytes.subarray(start, end));
    offset = end;

    if (flags & TRAILER_FLAG) {
      const trailer = parse<Trailer>(json);
      if (trailer.error) {
        const code = trailer.error.code ?? "unknown";
        // The code is folded into the message so the raw Error string
        // carries it too (logs, toasts, `expect(...).toThrow(/code/)`).
        const detail = trailer.error.message;
        throw new IdentityError(code, detail ? `${code}: ${detail}` : code);
      }
      continue;
    }
    messages.push(parse<T>(json));
  }

  return messages;
}

function parse<T>(json: string): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    throw new IdentityError(
      "invalid_response",
      "Invalid JSON in Connect stream envelope",
    );
  }
}
