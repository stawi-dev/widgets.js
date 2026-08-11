import type { AuthRuntime } from "@stawi/auth-runtime";

/**
 * Files service via the unified gateway (`/files` path prefix).
 *
 * Upload: REST POST /files/v1/media/upload (raw body or multipart).
 * Signed download: Connect RPC GetSignedDownloadUrl for <img> display
 * (downloads are auth-gated; signed URLs are public HTTPS for the TTL).
 */
const FILES_REST = "/files/v1/media";
const FILES_SVC = "/files/files.v1.FilesService";

export interface MediaUploadResult {
  contentUri: string;
  mediaId: string;
  serverName: string;
}

export interface SignedDownloadResult {
  downloadUrl: string;
}

/**
 * Upload avatar bytes to the files service.
 * Uses raw POST body (auth-runtime fetch accepts ArrayBuffer).
 */
export async function uploadMedia(
  rt: AuthRuntime,
  file: File,
): Promise<MediaUploadResult> {
  const filename = file.name?.trim() || "avatar.bin";
  const bytes = await file.arrayBuffer();
  const contentType = file.type || "application/octet-stream";

  const resp = await rt.fetch<{ content_uri?: string; contentUri?: string }>(
    `${FILES_REST}/upload?filename=${encodeURIComponent(filename)}`,
    {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: bytes,
      timeoutMs: 60_000,
    },
  );

  const contentUri = resp.content_uri ?? resp.contentUri ?? "";
  if (!contentUri) {
    throw new Error("files upload: empty content_uri");
  }

  const parsed = parseContentUri(contentUri);
  if (!parsed) {
    throw new Error(`files upload: unparseable content_uri ${contentUri}`);
  }

  return {
    contentUri,
    mediaId: parsed.mediaId,
    serverName: parsed.serverName,
  };
}

/**
 * Get a short-lived HTTPS URL suitable for <img src>.
 * Max TTL on the server is 86400s (24h).
 */
export async function getSignedDownloadUrl(
  rt: AuthRuntime,
  mediaId: string,
  expiresSeconds = 86_400,
): Promise<SignedDownloadResult> {
  const resp = await rt.fetch<{ download_url?: string; downloadUrl?: string }>(
    `${FILES_SVC}/GetSignedDownloadUrl`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_id: mediaId,
        expires_seconds: expiresSeconds,
      }),
    },
  );
  const downloadUrl = resp.download_url ?? resp.downloadUrl ?? "";
  if (!downloadUrl) {
    throw new Error("files: empty signed download_url");
  }
  return { downloadUrl };
}

/**
 * Parse mxc://server/mediaId or https://…/v1/media/download/server/mediaId
 */
export function parseContentUri(
  uri: string,
): { serverName: string; mediaId: string } | null {
  const trimmed = uri.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("mxc://")) {
    const rest = trimmed.slice("mxc://".length);
    const slash = rest.indexOf("/");
    if (slash <= 0 || slash === rest.length - 1) return null;
    return {
      serverName: rest.slice(0, slash),
      mediaId: rest.slice(slash + 1).split(/[?#]/)[0]!,
    };
  }

  // https://host/files/v1/media/download/{server}/{mediaId}
  // https://host/v1/media/download/{server}/{mediaId}
  const m = trimmed.match(
    /\/(?:files\/)?v1\/media\/(?:download|thumbnail)\/([^/]+)\/([^/?#]+)/,
  );
  if (m) {
    return { serverName: m[1]!, mediaId: m[2]! };
  }

  return null;
}

/** Stable property value to store on the profile (not the signed URL). */
export function stableAvatarProperty(upload: MediaUploadResult): string {
  // Prefer mxc — durable identifier independent of gateway host.
  if (upload.contentUri.startsWith("mxc://")) return upload.contentUri;
  return `mxc://${upload.serverName}/${upload.mediaId}`;
}
