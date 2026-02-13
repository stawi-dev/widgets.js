import { useEffect, useState } from "react";
import { useAuth } from "./use-auth.js";

export function useRoles(): string[] {
  const { runtime, authState } = useAuth();
  const [roles, setRoles] = useState<string[]>([]);

  useEffect(() => {
    if (authState !== "authenticated") {
      setRoles([]);
      return;
    }

    let cancelled = false;
    runtime.getRoles().then((r) => {
      if (!cancelled) setRoles(r);
    });

    return () => {
      cancelled = true;
    };
  }, [runtime, authState]);

  return roles;
}
