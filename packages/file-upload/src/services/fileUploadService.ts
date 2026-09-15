import { createAuthRuntime, type AuthRuntime } from "@stawi/auth-runtime";
import type {
  FileUploadResult,
  FileUploadProgress,
  FileVisibility,
} from "../types";

interface UploadResponse {
  ok: boolean;
  status: number;
  serverName?: string;
  mediaId?: string;
  checksumSha256?: string;
  fileSizeBytes?: number;
  contentType?: string;
  msg?: {
    serverName?: string;
    mediaId?: string;
    checksumSha256?: string;
    fileSizeBytes?: number;
    contentType?: string;
  };
}

const FILE_SERVICE_BASE = "/files";

async function generateChecksum(data: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function getVisibilityValue(visibility: FileVisibility): string {
  return visibility === "public" ? "VISIBILITY_PUBLIC" : "VISIBILITY_PRIVATE";
}

export class FileUploadService {
  private runtime: AuthRuntime;
  private platformApiBaseUrl: string;

  constructor(runtime: AuthRuntime, platformApiBaseUrl: string) {
    this.runtime = runtime;
    this.platformApiBaseUrl = platformApiBaseUrl.replace(/\/$/, "");
  }

  static create(
    platformApiBaseUrl: string,
    runtime?: AuthRuntime,
  ): FileUploadService {
    const rt =
      runtime ??
      createAuthRuntime({
        apiBaseUrl: platformApiBaseUrl,
      });
    return new FileUploadService(rt, platformApiBaseUrl);
  }

  async uploadFile(
    file: File,
    options: {
      groupId: string;
      visibility: FileVisibility;
      accessorId: string;
      labels?: Record<string, string>;
      onProgress?: (progress: FileUploadProgress) => void;
    },
  ): Promise<FileUploadResult> {
    const checksum = await generateChecksum(await file.arrayBuffer());
    const idempotencyKey = `widget-upload-${checksum.slice(0, 16)}`;

    const labels = {
      app: "widgets",
      group: options.groupId,
      ...options.labels,
    };

    const metadata = {
      contentType: file.type || "application/octet-stream",
      filename: file.name,
      totalSize: file.size,
      visibility: getVisibilityValue(options.visibility),
      checksumSha256: checksum,
      labels,
      accessorId: [options.accessorId],
    };

    const streamUrl = `${this.platformApiBaseUrl}${FILE_SERVICE_BASE}/v1/files.FilesService/UploadContent`;

    const metadataResponse = await this.runtime.fetch<UploadResponse>(
      streamUrl,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Connect-Protocol-Version": "1",
        },
        body: JSON.stringify({ metadata, idempotencyKey }),
        responseType: "json",
      },
    );

    if (!metadataResponse.ok) {
      throw new Error(`Upload metadata failed: ${metadataResponse.status}`);
    }

    let uploaded = 0;
    const reader = file.stream().getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      uploaded += value.length;
      options.onProgress?.({
        loaded: uploaded,
        total: file.size,
        percentage: Math.round((uploaded / file.size) * 100),
      });
    }

    const allData = new Uint8Array(file.size);
    let offset = 0;
    for (const chunk of chunks) {
      allData.set(chunk, offset);
      offset += chunk.length;
    }

    const uploadResponse = await this.runtime.fetch<UploadResponse>(streamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Connect-Protocol-Version": "1",
      },
      body: JSON.stringify({ chunk: Array.from(allData) }),
      responseType: "json",
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload chunks failed: ${uploadResponse.status}`);
    }

    const msg = uploadResponse.msg || uploadResponse;
    const serverName = msg.serverName || "service_file";
    const mediaId = msg.mediaId;

    if (!mediaId) {
      throw new Error("Upload succeeded but no mediaId returned");
    }

    const isImage = file.type.startsWith("image/");
    const variants: Record<string, string> = {};

    if (isImage) {
      variants.thumb = `${this.platformApiBaseUrl}${FILE_SERVICE_BASE}/v1/public/media/${serverName}/${mediaId}/thumbnail?width=96&height=96&method=crop`;
      variants.card = `${this.platformApiBaseUrl}${FILE_SERVICE_BASE}/v1/public/media/${serverName}/${mediaId}/thumbnail?width=480&height=360&method=scale`;
      variants.hero = `${this.platformApiBaseUrl}${FILE_SERVICE_BASE}/v1/public/media/${serverName}/${mediaId}/thumbnail?width=1200&height=1200&method=scale`;
      variants.og = `${this.platformApiBaseUrl}${FILE_SERVICE_BASE}/v1/public/media/${serverName}/${mediaId}/thumbnail?width=1200&height=630&method=crop`;
    }

    return {
      mediaId,
      serverName,
      checksum,
      sizeBytes: file.size,
      contentType: file.type,
      url: `${this.platformApiBaseUrl}${FILE_SERVICE_BASE}/v1/public/media/${serverName}/${mediaId}`,
      variants: Object.keys(variants).length > 0 ? variants : undefined,
    };
  }

  async deleteFile(mediaId: string): Promise<void> {
    const response = await this.runtime.fetch<UploadResponse>(
      `${this.platformApiBaseUrl}${FILE_SERVICE_BASE}/v1/files.FilesService/DeleteContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Connect-Protocol-Version": "1",
        },
        body: JSON.stringify({
          mediaId,
          idempotencyKey: `widget-del-${mediaId}`,
        }),
        responseType: "json",
      },
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(`Delete failed: ${response.status}`);
    }
  }

  getRuntime(): AuthRuntime {
    return this.runtime;
  }
}

export function getVariantUrl(
  platformApiBaseUrl: string,
  serverName: string,
  mediaId: string,
  variant: "thumb" | "card" | "hero" | "og",
): string {
  const sizes: Record<
    string,
    { width: number; height: number; method: string }
  > = {
    thumb: { width: 96, height: 96, method: "crop" },
    card: { width: 480, height: 360, method: "scale" },
    hero: { width: 1200, height: 1200, method: "scale" },
    og: { width: 1200, height: 630, method: "crop" },
  };
  const { width, height, method } = sizes[variant];
  return `${platformApiBaseUrl.replace(/\/$/, "")}/files/v1/public/media/${serverName}/${mediaId}/thumbnail?width=${width}&height=${height}&method=${method}`;
}

export function getOriginalUrl(
  platformApiBaseUrl: string,
  serverName: string,
  mediaId: string,
): string {
  return `${platformApiBaseUrl.replace(/\/$/, "")}/files/v1/public/media/${serverName}/${mediaId}`;
}
