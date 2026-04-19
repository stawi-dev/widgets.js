import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ShadowStyleProvider } from "../../shadow-host.js";

describe("ShadowStyleProvider", () => {
  it("injects styles into shadow root", () => {
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });

    render(
      <ShadowStyleProvider
        shadowRoot={shadowRoot}
        hostElement={host}
        externalFonts={false}
      >
        <div>child content</div>
      </ShadowStyleProvider>,
    );

    const styleEl = shadowRoot.querySelector("style");
    expect(styleEl).toBeTruthy();
    expect(styleEl!.textContent).toBeTruthy();
  });

  it("injects a Google Fonts <link> only when externalFonts=true", () => {
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });

    render(
      <ShadowStyleProvider
        shadowRoot={shadowRoot}
        hostElement={host}
        externalFonts={true}
      >
        <div>child content</div>
      </ShadowStyleProvider>,
    );

    const linkEl = shadowRoot.querySelector("link");
    expect(linkEl).toBeTruthy();
    expect(linkEl!.href).toContain("fonts.googleapis.com");
  });

  it("omits Google Fonts <link> when externalFonts=false", () => {
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });

    render(
      <ShadowStyleProvider
        shadowRoot={shadowRoot}
        hostElement={host}
        externalFonts={false}
      >
        <div>child content</div>
      </ShadowStyleProvider>,
    );

    expect(shadowRoot.querySelector("link")).toBeNull();
  });

  it("appends token block and raw css when provided", () => {
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });

    render(
      <ShadowStyleProvider
        shadowRoot={shadowRoot}
        hostElement={host}
        externalFonts={false}
        tokens={{
          colorPrimary: "#0f0",
          dark: { colorBg: "#000" },
          light: { colorBg: "#fff" },
        }}
        css={".aiw-extra{color:red}"}
      >
        <div>x</div>
      </ShadowStyleProvider>,
    );

    const styles = Array.from(shadowRoot.querySelectorAll("style")).map(
      (s) => s.textContent ?? "",
    );
    const all = styles.join("\n");
    expect(all).toContain("--aiw-primary: #0f0");
    expect(all).toContain('[data-theme="dark"]');
    expect(all).toContain('[data-theme="light"]');
    expect(all).toContain(".aiw-extra{color:red}");
  });

  it("only injects styles once on re-render", () => {
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });

    const { rerender } = render(
      <ShadowStyleProvider
        shadowRoot={shadowRoot}
        hostElement={host}
        externalFonts={false}
      >
        <div>first</div>
      </ShadowStyleProvider>,
    );

    rerender(
      <ShadowStyleProvider
        shadowRoot={shadowRoot}
        hostElement={host}
        externalFonts={false}
      >
        <div>second</div>
      </ShadowStyleProvider>,
    );

    const styles = shadowRoot.querySelectorAll("style");
    expect(styles.length).toBe(1);
  });

  it("renders children", () => {
    const host = document.createElement("div");
    const shadowRoot = host.attachShadow({ mode: "open" });

    const { getByText } = render(
      <ShadowStyleProvider
        shadowRoot={shadowRoot}
        hostElement={host}
        externalFonts={false}
      >
        <span>Hello</span>
      </ShadowStyleProvider>,
    );

    expect(getByText("Hello")).toBeTruthy();
  });
});
