import { describe, it, expect, vi, beforeEach } from "vitest";
import { commerceVocabulary, generalVocabulary } from "../vocabulary/index.js";
import type { MountHandle, MountOptions } from "../index.js";

const mockMount = vi.fn<(options: MountOptions) => MountHandle>(() => ({
  version: "test",
  getAuthState: () => "unauthenticated",
  unmount: vi.fn(),
}));
vi.mock("../index.js", async () => {
  const actual =
    await vi.importActual<typeof import("../index.js")>("../index.js");
  return { ...actual, mount: (options: MountOptions) => mockMount(options) };
});

const API = "https://api.stawi.org/identity";

function scriptWith(attrs: Record<string, string>): HTMLScriptElement {
  const script = document.createElement("script");
  for (const [k, v] of Object.entries(attrs)) script.setAttribute(k, v);
  Object.defineProperty(document, "currentScript", {
    value: script,
    writable: true,
    configurable: true,
  });
  return script;
}

async function boot(attrs: Record<string, string>) {
  scriptWith(attrs);
  await import("../bootstrap.js");
}

describe("bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    mockMount.mockClear();
  });

  it("requires data-api-base-url", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await boot({ "data-installation-id": "inst-1" });

    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("data-api-base-url"),
    );
    expect(mockMount).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("warns and skips when document.currentScript is null", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    Object.defineProperty(document, "currentScript", {
      value: null,
      writable: true,
      configurable: true,
    });

    await import("../bootstrap.js");

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("currentScript is null"),
    );
    expect(mockMount).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("forwards the identity attributes", async () => {
    await boot({
      "data-api-base-url": API,
      "data-installation-id": "inst-1",
      "data-client-id": "client-1",
      "data-idp-base-url": "https://accounts.stawi.org",
      "data-profile-api-base-url": "https://api.stawi.org/profile",
      "data-organization-id": "org-9",
      "data-theme": "dark",
      "data-locale": "sw",
      "data-initial-view": "teams",
    });

    expect(mockMount).toHaveBeenCalledWith(
      expect.objectContaining({
        apiBaseUrl: API,
        installationId: "inst-1",
        clientId: "client-1",
        idpBaseUrl: "https://accounts.stawi.org",
        profileApiBaseUrl: "https://api.stawi.org/profile",
        organizationId: "org-9",
        theme: "dark",
        locale: "sw",
        initialView: "teams",
      }),
    );
  });

  it('resolves data-vocabulary="commerce" to the commerce preset', async () => {
    await boot({ "data-api-base-url": API, "data-vocabulary": "commerce" });

    expect(mockMount).toHaveBeenCalledWith(
      expect.objectContaining({ vocabulary: commerceVocabulary }),
    );
  });

  it("merges a JSON data-vocabulary over the general preset", async () => {
    await boot({
      "data-api-base-url": API,
      "data-vocabulary": JSON.stringify({
        teamTypes: [{ value: "clearing", label: "Clearing" }],
        labels: { members: "Staff" },
      }),
    });

    const vocabulary = mockMount.mock.calls[0]![0].vocabulary!;
    expect(vocabulary.teamTypes).toEqual([
      { value: "clearing", label: "Clearing" },
    ]);
    // Everything not overridden still comes from the general preset.
    expect(vocabulary.engagementTypes).toEqual(
      generalVocabulary.engagementTypes,
    );
    expect(vocabulary.labels).toEqual(
      expect.objectContaining({ members: "Staff", teams: "Teams" }),
    );
  });

  it("logs and ignores an unknown data-vocabulary preset name", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await boot({ "data-api-base-url": API, "data-vocabulary": "nonsense" });

    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("data-vocabulary"),
      expect.anything(),
    );
    expect(mockMount).toHaveBeenCalledWith(
      expect.objectContaining({ vocabulary: undefined }),
    );
    errSpy.mockRestore();
  });

  it("parses data-features and data-tokens as JSON", async () => {
    await boot({
      "data-api-base-url": API,
      "data-features": JSON.stringify({ orgUnits: true }),
      "data-tokens": JSON.stringify({ colorPrimary: "#ff0000" }),
    });

    expect(mockMount).toHaveBeenCalledWith(
      expect.objectContaining({
        features: { orgUnits: true },
        tokens: { colorPrimary: "#ff0000" },
      }),
    );
  });

  it("passes data-css through verbatim", async () => {
    await boot({
      "data-api-base-url": API,
      "data-css": ".aiw-table td { padding: 2px }",
    });

    expect(mockMount).toHaveBeenCalledWith(
      expect.objectContaining({ css: ".aiw-table td { padding: 2px }" }),
    );
  });

  it("logs and ignores malformed JSON attributes", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await boot({ "data-api-base-url": API, "data-tokens": "{nope" });

    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("data-tokens"),
      expect.anything(),
    );
    expect(mockMount).toHaveBeenCalledWith(
      expect.objectContaining({ tokens: undefined }),
    );
    errSpy.mockRestore();
  });

  it("reads data-allow-create-organization as a boolean", async () => {
    await boot({
      "data-api-base-url": API,
      "data-allow-create-organization": "false",
    });
    expect(mockMount).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowCreateOrganization: false }),
    );

    vi.resetModules();
    mockMount.mockClear();

    await boot({
      "data-api-base-url": API,
      "data-allow-create-organization": "",
    });
    expect(mockMount).toHaveBeenLastCalledWith(
      expect.objectContaining({ allowCreateOrganization: true }),
    );
  });

  it("waits for DOMContentLoaded when the document is still loading", async () => {
    const readyState = Object.getOwnPropertyDescriptor(
      Document.prototype,
      "readyState",
    );
    Object.defineProperty(document, "readyState", {
      value: "loading",
      configurable: true,
    });

    await boot({ "data-api-base-url": API });
    expect(mockMount).not.toHaveBeenCalled();

    document.dispatchEvent(new Event("DOMContentLoaded"));
    expect(mockMount).toHaveBeenCalledTimes(1);

    if (readyState) {
      Object.defineProperty(Document.prototype, "readyState", readyState);
    }
    // Restore the instance-level override put in place above.
    Reflect.deleteProperty(document, "readyState");
  });
});
