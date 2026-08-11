import { describe, it, expect } from "vitest";
import {
  parseContentUri,
  stableAvatarProperty,
} from "../../services/files-service.js";

describe("parseContentUri", () => {
  it("parses mxc://server/mediaId", () => {
    expect(parseContentUri("mxc://files.example/media_abc")).toEqual({
      serverName: "files.example",
      mediaId: "media_abc",
    });
  });

  it("parses gateway download paths", () => {
    expect(
      parseContentUri(
        "https://api.stawi.org/files/v1/media/download/cdn.example/mid123",
      ),
    ).toEqual({ serverName: "cdn.example", mediaId: "mid123" });
  });

  it("returns null for unrelated URLs", () => {
    expect(parseContentUri("https://cdn.example/avatar.png")).toBeNull();
    expect(parseContentUri("")).toBeNull();
  });
});

describe("stableAvatarProperty", () => {
  it("prefers mxc content_uri", () => {
    expect(
      stableAvatarProperty({
        contentUri: "mxc://s/m1",
        mediaId: "m1",
        serverName: "s",
      }),
    ).toBe("mxc://s/m1");
  });

  it("builds mxc when content_uri is https", () => {
    expect(
      stableAvatarProperty({
        contentUri: "https://api.example/v1/media/download/s/m1",
        mediaId: "m1",
        serverName: "s",
      }),
    ).toBe("mxc://s/m1");
  });
});
