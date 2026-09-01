import { useEffect, useRef, type ReactNode } from "react";
import { widgetStyles } from "./styles/styles.js";
import type { IdentityWidgetThemedTokens } from "./themes/types.js";
import { tokenDeclarations } from "./themes/apply.js";

interface ShadowStyleProviderProps {
  shadowRoot: ShadowRoot;
  hostElement: HTMLElement;
  tokens?: IdentityWidgetThemedTokens;
  css?: string;
  children: ReactNode;
}

/**
 * Renders a `selector{...}` block for the tokens it recognises. Values go
 * through `tokenDeclarations`, so a host token can never break out of its
 * declaration and inject rules of its own.
 */
function block(selector: string, tokens: Record<string, unknown>): string {
  const decls = tokenDeclarations(tokens);
  return decls ? `${selector}{${decls}}` : "";
}

/**
 * Injects the widget stylesheet, the host's token overrides and the host's
 * raw `css` into the shadow root — in that order, so each layer can win over
 * the previous one. Unlike `@stawi/profile` there is no external-font branch:
 * the identity widget never reaches out to a font CDN.
 */
export function ShadowStyleProvider({
  shadowRoot,
  tokens,
  css,
  children,
}: ShadowStyleProviderProps) {
  const injectedRef = useRef(false);

  useEffect(() => {
    if (injectedRef.current) return;
    injectedRef.current = true;

    const style = document.createElement("style");
    style.textContent = widgetStyles;
    shadowRoot.prepend(style);

    if (tokens) {
      const s2 = document.createElement("style");
      const { dark, light, ...base } = tokens;
      const parts: string[] = [block(":host", base as Record<string, unknown>)];
      // `auto` follows the OS, so each themed block is emitted twice: once
      // for the explicit choice, once behind the matching media query.
      if (dark) {
        parts.push(
          block(':host([data-theme="dark"])', dark as Record<string, unknown>),
        );
        const inner = block(
          ':host([data-theme="auto"])',
          dark as Record<string, unknown>,
        );
        if (inner) parts.push(`@media (prefers-color-scheme: dark){${inner}}`);
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
        if (inner) parts.push(`@media (prefers-color-scheme: light){${inner}}`);
      }
      s2.textContent = parts.filter(Boolean).join("");
      if (s2.textContent) shadowRoot.appendChild(s2);
    }

    if (css) {
      const s3 = document.createElement("style");
      s3.textContent = css;
      shadowRoot.appendChild(s3);
    }
  }, [shadowRoot, tokens, css]);

  return <>{children}</>;
}
