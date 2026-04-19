import { useEffect, useRef, type ReactNode } from "react";
import { widgetStyles } from "./styles/styles.js";
import type { ProfileWidgetThemedTokens } from "./themes/types.js";
import { tokenToCssVar } from "./themes/apply.js";

interface ShadowStyleProviderProps {
  shadowRoot: ShadowRoot;
  hostElement: HTMLElement;
  externalFonts: boolean;
  tokens?: ProfileWidgetThemedTokens;
  css?: string;
  children: ReactNode;
}

function block(selector: string, tokens: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(tokens)) {
    if (v === undefined || v === null) continue;
    const cv = tokenToCssVar(k);
    if (!cv) continue;
    lines.push(`${cv}: ${String(v)};`);
  }
  return lines.length ? `${selector}{${lines.join("")}}` : "";
}

export function ShadowStyleProvider({
  shadowRoot,
  externalFonts,
  tokens,
  css,
  children,
}: ShadowStyleProviderProps) {
  const injectedRef = useRef(false);

  useEffect(() => {
    if (injectedRef.current) return;
    injectedRef.current = true;

    if (externalFonts) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Lora:wght@400;500&display=swap";
      shadowRoot.prepend(link);
    }

    const style = document.createElement("style");
    style.textContent = widgetStyles;
    shadowRoot.prepend(style);

    if (tokens) {
      const s2 = document.createElement("style");
      const parts: string[] = [];
      const { dark, light, ...base } = tokens;
      parts.push(block(":host", base as Record<string, unknown>));
      if (dark) {
        parts.push(
          block(
            ':host([data-theme="dark"])',
            dark as Record<string, unknown>,
          ),
        );
        const inner = block(
          ':host([data-theme="auto"])',
          dark as Record<string, unknown>,
        );
        if (inner) {
          parts.push(`@media (prefers-color-scheme: dark){${inner}}`);
        }
      }
      if (light) {
        parts.push(
          block(
            ':host([data-theme="light"])',
            light as Record<string, unknown>,
          ),
        );
        const inner = block(
          ':host([data-theme="auto"])',
          light as Record<string, unknown>,
        );
        if (inner) {
          parts.push(`@media (prefers-color-scheme: light){${inner}}`);
        }
      }
      s2.textContent = parts.filter(Boolean).join("");
      if (s2.textContent) shadowRoot.appendChild(s2);
    }

    if (css) {
      const s3 = document.createElement("style");
      s3.textContent = css;
      shadowRoot.appendChild(s3);
    }
  }, [shadowRoot, externalFonts, tokens, css]);

  return <>{children}</>;
}
