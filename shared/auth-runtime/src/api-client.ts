import type { ResolvedConfig } from "./types.js";
import { AuthError } from "./errors.js";
import { TokenManager } from "./token-manager.js";

export class ApiClient {
  private config: ResolvedConfig;
  private tokenManager: TokenManager;

  constructor(config: ResolvedConfig, tokenManager: TokenManager) {
    this.config = config;
    this.tokenManager = tokenManager;
  }

  async fetch<T = unknown>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const accessToken = await this.tokenManager.getValidAccessToken();
    const url = `${this.config.apiBaseUrl}${path}`;

    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    headers.set("Accept", "application/json");

    if (
      options.body &&
      typeof options.body === "string" &&
      !headers.has("Content-Type")
    ) {
      headers.set("Content-Type", "application/json");
    }

    try {
      const response = await fetch(url, { ...options, headers });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new AuthError(
          "NETWORK_ERROR",
          `API request failed: ${response.status} ${response.statusText} — ${body}`,
        );
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return response.json() as Promise<T>;
    } catch (err) {
      if (err instanceof AuthError) throw err;
      throw new AuthError("NETWORK_ERROR", "API request failed", err);
    }
  }

  async upload<T = unknown>(path: string, file: File | Blob): Promise<T> {
    const accessToken = await this.tokenManager.getValidAccessToken();
    const url = `${this.config.apiBaseUrl}${path}`;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new AuthError(
          "NETWORK_ERROR",
          `Upload failed: ${response.status} ${response.statusText} — ${body}`,
        );
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return response.json() as Promise<T>;
    } catch (err) {
      if (err instanceof AuthError) throw err;
      throw new AuthError("NETWORK_ERROR", "Upload failed", err);
    }
  }
}
