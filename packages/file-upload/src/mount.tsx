import { createRoot, type Root } from "react-dom/client";
import { createAuthRuntime } from "@stawi/auth-runtime";
import { FileUploadWidget } from "./components/FileUploadWidget";
import type { MountOptions, MountHandle } from "./types";

// Injected by tsup `define`. Falls back to "dev" when running from source.
declare const __STAWI_FILE_UPLOAD_VERSION__: string | undefined;

const FILE_UPLOAD_VERSION =
  typeof __STAWI_FILE_UPLOAD_VERSION__ === "string"
    ? __STAWI_FILE_UPLOAD_VERSION__
    : "dev";

export function mount(options: MountOptions): MountHandle {
  const target = options.target ?? document.body;

  const host = document.createElement("div");
  host.setAttribute("data-stawi-file-upload", "");
  target.appendChild(host);

  // Pre-construct the runtime at mount() scope so the MountHandle can call
  // into it (getAuthState / prefetchDiscovery) without needing to reach
  // through React internals. Callers may supply their own runtime —
  // useful when an embedder (a host page with multiple widgets or a
  // dedicated singleton for API calls) wants shared token state.
  const ownsRuntime = options.runtime === undefined;
  const runtime =
    options.runtime ??
    createAuthRuntime({
      clientId: options.clientId ?? options.installationId,
      installationId: options.installationId,
      idpBaseUrl: options.idpBaseUrl,
      apiBaseUrl: options.apiBaseUrl,
      logoutRedirectUri: options.logoutRedirectUri,
      scopes: ["openid", "profile", "offline_access", "files"],
    });

  const root: Root = createRoot(host);
  root.render(
    <FileUploadWidget
      groupId={options.groupId}
      initialFiles={options.initialFiles}
      onFilesChange={options.onFilesChange}
      maxFiles={options.maxFiles}
      maxFileSize={options.maxFileSize}
      acceptedTypes={options.acceptedTypes}
      allowedTypes={options.allowedTypes}
      disabled={options.disabled}
      showName={options.showName}
      showReorder={options.showReorder}
      showDelete={options.showDelete}
      defaultVisibility={options.defaultVisibility}
      showVisibilityToggle={options.showVisibilityToggle}
      className={options.className}
      onError={options.onError}
      onProgress={options.onProgress}
    />,
  );

  return {
    version: FILE_UPLOAD_VERSION,
    getAuthState() {
      return runtime.getState();
    },
    prefetchDiscovery() {
      return runtime.prefetchDiscovery();
    },
    unmount() {
      root.unmount();
      host.remove();
      if (ownsRuntime) runtime.destroy();
    },
  };
}
