import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { ShadowStyleProvider } from "../../shadow-host.js";

describe("ShadowStyleProvider", () => {
  it("injects styles and font link into shadow root", () => {
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });

    render(
      <ShadowStyleProvider shadowRoot={shadowRoot}>
        <div>child content</div>
      </ShadowStyleProvider>,
    );

    const styleEl = shadowRoot.querySelector("style");
    expect(styleEl).toBeTruthy();
    expect(styleEl!.textContent).toBeTruthy();

    const linkEl = shadowRoot.querySelector("link");
    expect(linkEl).toBeTruthy();
    expect(linkEl!.href).toContain("fonts.googleapis.com");
  });

  it("only injects styles once on re-render", () => {
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });

    const { rerender } = render(
      <ShadowStyleProvider shadowRoot={shadowRoot}>
        <div>first</div>
      </ShadowStyleProvider>,
    );

    rerender(
      <ShadowStyleProvider shadowRoot={shadowRoot}>
        <div>second</div>
      </ShadowStyleProvider>,
    );

    // Should still have only one style element
    const styles = shadowRoot.querySelectorAll("style");
    expect(styles.length).toBe(1);
  });

  it("renders children", () => {
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });

    const { getByText } = render(
      <ShadowStyleProvider shadowRoot={shadowRoot}>
        <span>Hello</span>
      </ShadowStyleProvider>,
    );

    expect(getByText("Hello")).toBeTruthy();
  });
});
