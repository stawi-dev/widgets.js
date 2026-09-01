import { useEffect, useRef, type ReactNode } from "react";
import { widgetStyles } from "./styles/styles.js";
import type { IdentityWidgetThemedTokens } from "./themes/types.js";
import { themedTokenSheet } from "./themes/apply.js";

interface ShadowStyleProviderProps {
  shadowRoot: ShadowRoot;
  tokens?: IdentityWidgetThemedTokens;
  css?: string;
  children: ReactNode;
}

/** `:host` selectors for each token scope of the shadow build. */
function hostSelector(scope: "base" | "dark" | "light" | "auto"): string {
  return scope === "base" ? ":host" : `:host([data-theme="${scope}"])`;
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
      // `themedTokenSheet` runs every value through `tokenDeclarations`, so a
      // host token can never break out of its declaration and inject rules.
      const text = themedTokenSheet(tokens, hostSelector);
      if (text) {
        const s2 = document.createElement("style");
        s2.textContent = text;
        shadowRoot.appendChild(s2);
      }
    }

    if (css) {
      const s3 = document.createElement("style");
      s3.textContent = css;
      shadowRoot.appendChild(s3);
    }
  }, [shadowRoot, tokens, css]);

  return <>{children}</>;
}
