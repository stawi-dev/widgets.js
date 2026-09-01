import { describe, it, expect } from "vitest";
import { decodeConnectStream } from "../../services/connect-stream.js";
import { IdentityError } from "../../services/errors.js";
import { concat, envelope } from "./envelope-fixture.js";

describe("decodeConnectStream", () => {
  it("decodes messages and ignores an empty trailer", () => {
    const buf = concat(
      envelope(0, '{"data":{"id":"a"}}'),
      envelope(0, '{"data":{"id":"b"}}'),
      envelope(2, "{}"),
    );
    expect(
      decodeConnectStream<{ data: { id: string } }>(buf).map((m) => m.data.id),
    ).toEqual(["a", "b"]);
  });

  it("returns an empty list for an empty body", () => {
    expect(decodeConnectStream(new ArrayBuffer(0))).toEqual([]);
  });

  it("throws IdentityError with the trailer error code", () => {
    const buf = concat(
      envelope(2, '{"error":{"code":"permission_denied","message":"nope"}}'),
    );
    expect(() => decodeConnectStream(buf)).toThrow(IdentityError);
    expect(() => decodeConnectStream(buf)).toThrow(/permission_denied/);
    try {
      decodeConnectStream(buf);
    } catch (err) {
      expect((err as IdentityError).code).toBe("permission_denied");
      expect((err as IdentityError).message).toBe("permission_denied: nope");
    }
  });

  it("throws on a trailer error without a message", () => {
    const buf = concat(envelope(2, '{"error":{"code":"unavailable"}}'));
    expect(() => decodeConnectStream(buf)).toThrow(/unavailable/);
  });

  it("falls back to a generic code when the trailer error has none", () => {
    const buf = concat(envelope(2, '{"error":{"message":"boom"}}'));
    expect(() => decodeConnectStream(buf)).toThrow(/unknown: boom/);
  });

  it("throws a generic error for a trailer error with neither code nor message", () => {
    const buf = concat(envelope(2, '{"error":{"details":[]}}'));
    expect(() => decodeConnectStream(buf)).toThrow(/unknown/);
  });

  it("rejects compressed envelopes explicitly", () => {
    const buf = concat(envelope(0x01, '{"data":{"id":"a"}}'));
    expect(() => decodeConnectStream(buf)).toThrow(/compressed/i);
    try {
      decodeConnectStream(buf);
    } catch (err) {
      expect((err as IdentityError).code).toBe("unsupported");
    }
  });

  it("throws on a truncated envelope", () => {
    const full = new Uint8Array(concat(envelope(0, '{"data":{"id":"a"}}')));
    const buf = full.slice(0, full.length - 3).buffer;
    expect(() => decodeConnectStream(buf)).toThrow(IdentityError);
    expect(() => decodeConnectStream(buf)).toThrow(/truncated/i);
  });

  it("throws on a truncated envelope header", () => {
    expect(() => decodeConnectStream(new Uint8Array([0, 0, 1]).buffer)).toThrow(
      /truncated/i,
    );
  });

  it("throws on an unparseable payload", () => {
    expect(() => decodeConnectStream(concat(envelope(0, "not-json")))).toThrow(
      /invalid/i,
    );
  });
});
