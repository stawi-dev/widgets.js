import { mount } from "../src/index";
import "./style.css";

const files: any[] = [];

const handle = mount({
  target: document.getElementById("app"),
  groupId: "playground-group-123",
  initialFiles: [],
  onFilesChange: (newFiles) => {
    console.log("Files changed:", newFiles);
    files.push(...newFiles);
  },
  maxFiles: 10,
  maxFileSize: 50 * 1024 * 1024,
  allowedTypes: "all",
  showName: true,
  showReorder: true,
  showDelete: true,
  defaultVisibility: "public",
  showVisibilityToggle: true,
  clientId: "test-client",
  installationId: "test-installation",
  apiBaseUrl: "https://api.stawi.org",
  idpBaseUrl: "https://oauth2.stawi.org",
});

console.log("File upload widget mounted:", handle);

(window as any).fileUploadHandle = handle;
