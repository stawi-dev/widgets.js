import type { AuthRuntime, AuthState } from "@stawi/auth-runtime";

export type FileVisibility = "public" | "private";

export interface FileUploadResult {
  mediaId: string;
  serverName: string;
  checksum: string;
  sizeBytes: number;
  contentType: string;
  url: string;
  variants?: Record<string, string>;
}

export interface FileUploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadedFile {
  file: File;
  result: FileUploadResult | null;
  preview: string;
  name: string;
  sortKey: number;
  metadata?: Record<string, string>;
}

export interface FileUploadWidgetProps {
  groupId: string;
  initialFiles?: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  maxFiles?: number;
  maxFileSize?: number;
  acceptedTypes?: string[];
  allowedTypes?: "images" | "documents" | "all" | string[];
  disabled?: boolean;
  showName?: boolean;
  showReorder?: boolean;
  showDelete?: boolean;
  defaultVisibility?: FileVisibility;
  showVisibilityToggle?: boolean;
  className?: string;
  onError?: (error: Error, file: File) => void;
  onProgress?: (progress: FileUploadProgress, file: File) => void;
  // Auth/runtime config for direct uploads
  runtime?: AuthRuntime;
  apiBaseUrl?: string;
  clientId?: string;
  installationId?: string;
  idpBaseUrl?: string;
  logoutRedirectUri?: string;
}

export interface MountOptions extends FileUploadWidgetProps {
  target?: HTMLElement;
  runtime?: AuthRuntime;
  clientId?: string;
  installationId: string;
  idpBaseUrl?: string;
  apiBaseUrl?: string;
  logoutRedirectUri?: string;
}

export interface MountHandle {
  readonly version: string;
  getAuthState(): AuthState;
  prefetchDiscovery(): Promise<void>;
  unmount(): void;
}

export interface FileUploadServiceConfig {
  platformApiBaseUrl: string;
}
