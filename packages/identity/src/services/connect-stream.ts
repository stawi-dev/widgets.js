import { fromConnectError, identityError } from "./errors.js";

/** Connect envelope flag bit marking a compressed payload. */
const COMPRESSED_FLAG = 0x01;
/** Connect envelope flag bit marking the end-of-stream trailer. */
const TRAILER_FLAG = 0x02;
const HEADER_BYTES = 5;

interface Trailer {
  error?: unknown;
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
      throw identityError(
        "invalid_response",
        "Truncated Connect stream: incomplete envelope header",
      );
    }
    const flags = view.getUint8(offset);
    const length = view.getUint32(offset + 1);
    const start = offset + HEADER_BYTES;
    const end = start + length;
    if (end > bytes.length) {
      throw identityError(
        "invalid_response",
        "Truncated Connect stream: envelope payload shorter than declared length",
      );
    }
    if (flags & COMPRESSED_FLAG) {
      // The client never advertises an encoding, so a compressed
      // envelope means the server ignored that — say so instead of
      // failing later with a misleading JSON parse error.
      throw identityError(
        "unsupported",
        "Compressed Connect stream envelopes are not supported",
      );
    }
    const json = new TextDecoder().decode(bytes.subarray(start, end));
    offset = end;

    if (flags & TRAILER_FLAG) {
      const trailer = parse<Trailer>(json);
      if (trailer.error) {
        throw (
          fromConnectError(trailer.error) ??
          identityError("unknown", describe(trailer.error))
        );
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
    throw identityError(
      "invalid_response",
      "Invalid JSON in Connect stream envelope",
    );
  }
}

/** Best-effort text for a trailer error that carries no `code`. */
function describe(error: unknown): string | undefined {
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}

/**
 * Wraps a JSON request body in a single Connect envelope, which is what a
 * server-streaming RPC expects as its request payload: one flag byte (0 —
 * uncompressed, not a trailer), a 4-byte big-endian payload length, then
 * the UTF-8 JSON itself. A raw JSON body is rejected with HTTP 415.
 */
export function encodeConnectEnvelope(json: string): ArrayBuffer {
  const payload = new TextEncoder().encode(json);
  const out = new Uint8Array(HEADER_BYTES + payload.length);
  new DataView(out.buffer).setUint32(1, payload.length);
  out.set(payload, HEADER_BYTES);
  return out.buffer;
}
