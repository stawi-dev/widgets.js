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

    // d=identicon: always return an image when the email has no Gravatar
    // account, so the avatar never breaks to a blank/broken img.
    sha256Hex(normalized).then((hex) => {
      if (!cancelled) {
        setUrl(`https://www.gravatar.com/avatar/${hex}?s=${size}&d=identicon`);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [hooks.gravatar, email, size]);

  return url;
}
