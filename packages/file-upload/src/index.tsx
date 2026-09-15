// Injected by tsup `define`. Falls back to "dev" when running from source.
declare const __STAWI_FILE_UPLOAD_VERSION__: string | undefined;

export type {
  FileUploadWidgetProps,
  FileUploadResult,
  FileUploadProgress,
  UploadedFile,
  FileVisibility,
  MountOptions,
  MountHandle,
} from "./types";

export { FileUploadWidget } from "./components/FileUploadWidget";
export { mount } from "./mount";

export const FILE_UPLOAD_VERSION =
  typeof __STAWI_FILE_UPLOAD_VERSION__ === "string"
    ? __STAWI_FILE_UPLOAD_VERSION__
    : "dev";
