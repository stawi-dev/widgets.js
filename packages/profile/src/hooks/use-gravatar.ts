import { useContext, useEffect, useState } from "react";
import { HooksContext } from "../context/hooks-context.js";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function useGravatarUrl(
  email: string | undefined,
  size: number,
): string | null {
  const hooks = useContext(HooksContext);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!hooks.gravatar || !email) {
      setUrl(null);
      return;
    }

    let cancelled = false;
    const normalized = email.trim().toLowerCase();

    sha256Hex(normalized).then((hex) => {
      if (!cancelled) {
        setUrl(`https://www.gravatar.com/avatar/${hex}?s=${size}&d=404`);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [hooks.gravatar, email, size]);

  return url;
}
