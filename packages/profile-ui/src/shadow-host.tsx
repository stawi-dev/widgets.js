import { useEffect, useRef, type ReactNode } from "react";
import { widgetStyles } from "./styles/styles.js";

interface ShadowStyleProviderProps {
  shadowRoot: ShadowRoot;
  children: ReactNode;
}

export function ShadowStyleProvider({
  shadowRoot,
  children,
}: ShadowStyleProviderProps) {
  const injectedRef = useRef(false);

  useEffect(() => {
    if (injectedRef.current) return;
    injectedRef.current = true;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Lora:wght@400;500&display=swap";
    shadowRoot.prepend(link);

    const style = document.createElement("style");
    style.textContent = widgetStyles;
    shadowRoot.prepend(style);
  }, [shadowRoot]);

  return <>{children}</>;
}
