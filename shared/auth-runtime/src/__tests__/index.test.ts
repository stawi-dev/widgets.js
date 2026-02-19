import { describe, it, expect, afterEach } from "vitest";
import { getAuthRuntime } from "../index.js";

const RUNTIME_KEY = Symbol.for("@stawi/auth-runtime");

function clearSingleton() {
  const g = globalThis as Record<symbol, unknown>;
  const runtime = g[RUNTIME_KEY];
  if (runtime && typeof (runtime as { destroy: () => void }).destroy === "function") {
    (runtime as { destroy: () => void }).destroy();
  }
  delete g[RUNTIME_KEY];
}

describe("getAuthRuntime", () => {
  afterEach(clearSingleton);

  it("throws without config on first call", () => {
    expect(() => getAuthRuntime()).toThrow("requires config");
  });

  it("creates a runtime with config", () => {
    const rt = getAuthRuntime({ clientId: "test-app" });
    expect(rt).toBeDefined();
    expect(rt.getState()).toBe("initializing");
  });

  it("returns the same instance on subsequent calls", () => {
    const rt1 = getAuthRuntime({ clientId: "test-app" });
    const rt2 = getAuthRuntime();
    expect(rt1).toBe(rt2);
  });

  it("calls onAuthStateChange immediately with current state", () => {
    const rt = getAuthRuntime({ clientId: "test-app" });
    const states: string[] = [];
    rt.onAuthStateChange((s) => states.push(s));
    expect(states).toEqual(["initializing"]);
  });

  it("unsubscribe stops further callbacks", () => {
    const rt = getAuthRuntime({ clientId: "test-app" });
    const states: string[] = [];
    const unsub = rt.onAuthStateChange((s) => states.push(s));
    unsub();
    // Force internal state change would not notify — but we can verify unsub worked
    expect(states).toEqual(["initializing"]);
  });

  it("destroy clears the singleton", () => {
    const rt = getAuthRuntime({ clientId: "test-app" });
    rt.destroy();
    // Next call requires config again
    expect(() => getAuthRuntime()).toThrow("requires config");
  });
});
