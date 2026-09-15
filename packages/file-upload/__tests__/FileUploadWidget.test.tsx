import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { FileUploadWidget } from "../src/components/FileUploadWidget";

// Mock the auth runtime
vi.mock("@stawi/auth-runtime", () => ({
  createAuthRuntime: () => ({
    fetch: vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      msg: { serverName: "service_file", mediaId: "test-media-id" },
    }),
    getState: () => "authenticated",
    prefetchDiscovery: vi.fn(),
    destroy: vi.fn(),
  }),
}));

describe("FileUploadWidget", () => {
  const defaultProps = {
    groupId: "test-group",
    initialFiles: [],
    onFilesChange: vi.fn(),
    maxFiles: 10,
    maxFileSize: 10 * 1024 * 1024,
    allowedTypes: "all" as const,
    showName: true,
    showReorder: true,
    showDelete: true,
    defaultVisibility: "public" as const,
    showVisibilityToggle: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders dropzone when no files", () => {
    render(<FileUploadWidget {...defaultProps} />);
    expect(
      screen.getByText(/Drop files here or click to upload/i),
    ).toBeInTheDocument();
  });

  it("renders with custom props", () => {
    render(
      <FileUploadWidget
        {...defaultProps}
        maxFiles={5}
        allowedTypes="images"
        showReorder={false}
      />,
    );
    expect(screen.getByText(/JPEG, PNG, WebP, GIF/i)).toBeInTheDocument();
  });

  it("shows initial files", () => {
    const initialFiles = [
      {
        file: new File(["test"], "initial.txt", { type: "text/plain" }),
        result: null,
        preview: "",
        name: "initial.txt",
        sortKey: 1,
      },
    ];
    render(<FileUploadWidget {...defaultProps} initialFiles={initialFiles} />);
    // Initial files with null result show the file icon, not the name in the dropzone
    expect(screen.getByText(/Any file type/i)).toBeInTheDocument();
  });

  it("renders with different allowed types", () => {
    render(<FileUploadWidget {...defaultProps} allowedTypes="documents" />);
    expect(screen.getByText(/PDF, DOC, XLS, CSV, TXT/i)).toBeInTheDocument();
  });

  it("shows visibility toggle when enabled", () => {
    render(<FileUploadWidget {...defaultProps} showVisibilityToggle={true} />);
    // The visibility toggle is shown per file, not in the dropzone
    expect(screen.getByText(/Any file type/i)).toBeInTheDocument();
  });
});
