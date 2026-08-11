import { useEffect, useState } from "react";
import type { AuthRuntime } from "@stawi/auth-runtime";
import {
  getSignedDownloadUrl,
  parseContentUri,
} from "../services/files-service.js";
import { useAuth } from "./use-auth.js";

/**
 * Turn a stored picture reference into something safe for <img src>.
 *
 * - https:// and data: — used as-is
 * - mxc:// or /v1/media/download/… — exchange for a short-lived signed HTTPS URL
 *   via the files service (private media cannot be loaded with a bare Bearer-less img)
 */
export function useResolvedAvatarUrl(
  picture: string | undefined | null,
): string | null {
  const { runtime } = useAuth();
  const [resolved, setResolved] = useState<string | null>(() =>
    immediateDisplayUrl(picture),
  );

  useEffect(() => {
    let cancelled = false;
    const immediate = immediateDisplayUrl(picture);
    if (immediate !== null && !needsSigning(picture)) {
      setResolved(immediate);
      return;
    }
    if (!picture || !runtime) {
      setResolved(null);
      return;
    }

    const parsed = parseContentUri(picture);
    if (!parsed) {
      setResolved(immediate);
      return;
    }

    setResolved(null);
    getSignedDownloadUrl(runtime as AuthRuntime, parsed.mediaId)
      .then((r) => {
        if (!cancelled) setResolved(r.downloadUrl);
      })
      .catch(() => {
        if (!cancelled) setResolved(null);
      });

    return () => {
      cancelled = true;
    };
  }, [picture, runtime]);

  return resolved;
}

function immediateDisplayUrl(
  picture: string | undefined | null,
): string | null {
  if (!picture) return null;
  if (picture.startsWith("https://") && !needsSigning(picture)) return picture;
  if (picture.startsWith("data:image/")) return picture;
  if (picture.startsWith("blob:")) return picture;
  return null;
}

function needsSigning(picture: string | undefined | null): boolean {
  if (!picture) return false;
  if (picture.startsWith("mxc://")) return true;
  return /\/(?:files\/)?v1\/media\/(?:download|thumbnail)\//.test(picture);
}
