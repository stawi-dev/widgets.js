import { describe, it, expect } from "vitest";
import { validateAvatar } from "../../utils/validate-avatar.js";

function file(
  bytes: number[],
  { type = "image/png", name = "a.png" }: { type?: string; name?: string } = {},
) {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("validateAvatar", () => {
  it("rejects over-sized", async () => {
    const big = file(Array(1024).fill(0));
    await expect(validateAvatar(big, { maxBytes: 100 })).rejects.toMatchObject(
      { code: "AVATAR_TOO_LARGE" },
    );
  });
  it("rejects unknown magic bytes", async () => {
    const txt = file([0x48, 0x69]);
    await expect(
      validateAvatar(txt, { maxBytes: 1024 }),
    ).rejects.toMatchObject({ code: "AVATAR_TYPE_UNSUPPORTED" });
  });
  it("accepts PNG magic", async () => {
    const png = file([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // dimensions-check will fail in jsdom without an ImageBitmap polyfill;
    // skip that branch via the skipDimensionsCheck option in tests
    await expect(
      validateAvatar(png, { maxBytes: 1024, skipDimensionsCheck: true }),
    ).resolves.toBeUndefined();
  });
});
