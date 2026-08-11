import { describe, it, expect } from "vitest";
import { sanitizePictureUrl } from "../../utils/sanitize-picture-url.js";

describe("sanitizePictureUrl", () => {
  it("accepts https URLs", () =>
    expect(sanitizePictureUrl("https://a/b.png")).toBe("https://a/b.png"));
  it("accepts durable mxc:// media refs", () =>
    expect(sanitizePictureUrl("mxc://files.example/media_abc123")).toBe(
      "mxc://files.example/media_abc123",
    ));
  it("rejects malformed mxc://", () =>
    expect(sanitizePictureUrl("mxc://no-media-id")).toBeUndefined());
  it("accepts data:image/*;base64 with size cap", () => {
    const small = `data:image/png;base64,${"A".repeat(100)}`;
    expect(sanitizePictureUrl(small)).toBe(small);
  });
  it("rejects javascript:", () =>
    expect(sanitizePictureUrl("javascript:alert(1)")).toBeUndefined());
  it("rejects http://", () =>
    expect(sanitizePictureUrl("http://a/b.png")).toBeUndefined());
  it("rejects blob: and file:", () => {
    expect(sanitizePictureUrl("blob:https://x/y")).toBeUndefined();
    expect(sanitizePictureUrl("file:///etc/passwd")).toBeUndefined();
  });
  it("rejects non-image data URIs", () => {
    expect(
      sanitizePictureUrl("data:text/html;base64,PHN2Zz4="),
    ).toBeUndefined();
  });
  it("rejects data URIs over size cap", () => {
    const big = `data:image/png;base64,${"A".repeat(600_000)}`;
    expect(sanitizePictureUrl(big)).toBeUndefined();
  });
});
