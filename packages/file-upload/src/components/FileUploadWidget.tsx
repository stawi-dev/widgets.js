import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload,
  FileText,
  Image,
  Loader2,
  Trash2,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { FileUploadService } from "../services/fileUploadService";
import { createAuthRuntime } from "@stawi/auth-runtime";
import type {
  FileUploadProgress,
  UploadedFile,
  FileUploadWidgetProps,
  FileVisibility,
} from "../types";

export function FileUploadWidget({
  groupId,
  initialFiles = [],
  onFilesChange,
  maxFiles = 50,
  maxFileSize = 100 * 1024 * 1024,
  acceptedTypes,
  allowedTypes = "all",
  disabled = false,
  showName = true,
  showReorder = true,
  showDelete = true,
  defaultVisibility = "public",
  showVisibilityToggle = true,
  className = "",
  onError,
  onProgress,
  runtime,
  apiBaseUrl,
  clientId,
  installationId,
  idpBaseUrl,
  logoutRedirectUri,
}: FileUploadWidgetProps) {
  const [files, setFiles] = useState<UploadedFile[]>(initialFiles);
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<
    Record<string, FileUploadProgress>
  >({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [visibilities, setVisibilities] = useState<
    Record<string, FileVisibility>
  >({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const serviceRef = useRef<FileUploadService | null>(null);
  const runtimeRef = useRef<ReturnType<typeof createAuthRuntime> | null>(null);

  // Initialize the upload service
  useEffect(() => {
    if (serviceRef.current) return;

    let rt = runtime;
    if (!rt && apiBaseUrl && installationId) {
      rt = createAuthRuntime({
        clientId: clientId ?? installationId,
        installationId,
        idpBaseUrl,
        apiBaseUrl,
        logoutRedirectUri,
        scopes: ["openid", "profile", "offline_access", "files"],
      });
      runtimeRef.current = rt;
    }
    if (rt) {
      serviceRef.current = FileUploadService.create(apiBaseUrl ?? "", rt);
    }
  }, [
    runtime,
    apiBaseUrl,
    clientId,
    installationId,
    idpBaseUrl,
    logoutRedirectUri,
  ]);

  const notifyChange = useCallback(() => {
    onFilesChange(files);
  }, [files, onFilesChange]);

  const getAcceptedTypes = useCallback(() => {
    if (acceptedTypes && acceptedTypes.length > 0)
      return acceptedTypes.join(",");
    if (allowedTypes === "images") return "image/*";
    if (allowedTypes === "documents")
      return ".pdf,.doc,.docx,.txt,.csv,.xls,.xlsx";
    return "*/*";
  }, [acceptedTypes, allowedTypes]);

  const getFileIcon = useCallback((file: File) => {
    if (file.type.startsWith("image/")) return <Image size={18} />;
    if (file.type === "application/pdf") return <FileText size={18} />;
    return <FileText size={18} />;
  }, []);

  const handleFilesSelected = useCallback(
    async (fileList: FileList) => {
      const newFiles = Array.from(fileList);
      const remainingSlots = maxFiles - files.length;
      const filesToUpload = newFiles.slice(0, remainingSlots);

      if (filesToUpload.length === 0) {
        setErrors((prev) => ({
          ...prev,
          general: `Maximum ${maxFiles} files allowed`,
        }));
        return;
      }

      for (const file of filesToUpload) {
        if (
          acceptedTypes &&
          acceptedTypes.length > 0 &&
          !acceptedTypes.includes(file.type)
        ) {
          setErrors((prev) => ({
            ...prev,
            [file.name]: `Unsupported file type: ${file.type}`,
          }));
          continue;
        }
        if (file.size > maxFileSize) {
          setErrors((prev) => ({
            ...prev,
            [file.name]: `File too large (max ${Math.round(maxFileSize / 1024 / 1024)}MB)`,
          }));
          continue;
        }

        const preview = file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : "";
        const tempFile: UploadedFile = {
          file,
          result: null,
          preview,
          name: file.name,
          sortKey: files.length + 1,
          metadata: { visibility: defaultVisibility },
        };

        setFiles((prev) => [...prev, tempFile]);
        setErrors((prev) => ({ ...prev, [file.name]: null }));
        setVisibilities((prev) => ({
          ...prev,
          [file.name]: defaultVisibility,
        }));
        setUploading(file.name);

        try {
          if (!serviceRef.current) {
            throw new Error("File upload service not initialized");
          }

          const result = await serviceRef.current.uploadFile(file, {
            groupId,
            visibility: defaultVisibility,
            accessorId: "", // Will be filled by auth runtime
            onProgress: (progress) => {
              setUploadProgress((prev) => ({ ...prev, [file.name]: progress }));
              onProgress?.(progress, file);
            },
          });

          setFiles((prev) =>
            prev.map((f) =>
              f.file.name === file.name
                ? {
                    ...f,
                    result,
                    name: result.url.split("/").pop() || file.name,
                  }
                : f,
            ),
          );
        } catch (err) {
          const error = err instanceof Error ? err.message : "Upload failed";
          setErrors((prev) => ({ ...prev, [file.name]: error }));
          setFiles((prev) => prev.filter((f) => f.file.name !== file.name));
          onError?.(err instanceof Error ? err : new Error(error), file);
        } finally {
          setUploading(null);
          setUploadProgress((prev) => {
            const next = { ...prev };
            delete next[file.name];
            return next;
          });
          notifyChange();
        }
      }
    },
    [
      files.length,
      maxFiles,
      acceptedTypes,
      maxFileSize,
      groupId,
      defaultVisibility,
      notifyChange,
      onError,
      onProgress,
    ],
  );

  const handleRemove = useCallback(
    async (index: number) => {
      const file = files[index];
      if (file.result?.mediaId && serviceRef.current) {
        try {
          await serviceRef.current.deleteFile(file.result.mediaId);
        } catch {
          // Ignore delete errors
        }
      }
      if (file.preview) URL.revokeObjectURL(file.preview);
      setFiles((prev) => prev.filter((_, i) => i !== index));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[file.name];
        return next;
      });
      setVisibilities((prev) => {
        const next = { ...prev };
        delete next[file.name];
        return next;
      });
      notifyChange();
    },
    [files, notifyChange],
  );

  const handleReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      setFiles((prev) => {
        const next = [...prev];
        const [removed] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, removed);
        return next.map((f, i) => ({ ...f, sortKey: i + 1 }));
      });
      notifyChange();
    },
    [notifyChange],
  );

  const handleNameChange = useCallback(
    (index: number, name: string) => {
      setFiles((prev) =>
        prev.map((f, i) => (i === index ? { ...f, name } : f)),
      );
      notifyChange();
    },
    [notifyChange],
  );

  const handleVisibilityChange = useCallback(
    (fileName: string, visibility: FileVisibility) => {
      setVisibilities((prev) => ({ ...prev, [fileName]: visibility }));
      // Note: Changing visibility would require re-upload or a separate API call
      // For now we just track it locally
    },
    [],
  );

  const triggerFileSelect = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.files.length)
        handleFilesSelected(e.dataTransfer.files);
    },
    [handleFilesSelected],
  );

  const maxReached = files.length >= maxFiles;

  return (
    <div
      className={`file-upload-widget ${className}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{
        border: maxReached
          ? "2px dashed var(--surface-container-high)"
          : "2px dashed var(--outline-variant)",
        borderRadius: 12,
        transition: "border-color 0.2s",
        background: "var(--surface)",
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={getAcceptedTypes()}
        multiple
        hidden
        aria-label="File upload"
        onChange={(e) => e.target.files && handleFilesSelected(e.target.files)}
        disabled={disabled || maxReached}
      />

      {files.length > 0 && (
        <div
          className="uploaded-files"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 12,
          }}
        >
          {files.map((file, index) => (
            <div
              key={`${file.file.name}-${file.file.size}-${index}`}
              className="file-item"
              style={{
                position: "relative",
                width: 140,
                height: file.file.type.startsWith("image/") ? 140 : 100,
                borderRadius: 8,
                overflow: "hidden",
                background: "var(--surface-container-high)",
                display: "flex",
                flexDirection: "column",
                border: "1px solid var(--outline-variant)",
              }}
            >
              {uploading === file.file.name ? (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(0,0,0,0.5)",
                    zIndex: 10,
                    color: "white",
                    gap: 8,
                  }}
                >
                  <Loader2 size={24} className="spin" />
                  <span>
                    {uploadProgress[file.file.name]?.percentage ?? 0}%
                  </span>
                </div>
              ) : (
                <>
                  {file.file.type.startsWith("image/") && file.preview ? (
                    <img
                      src={file.preview}
                      alt={file.name}
                      style={{
                        width: "100%",
                        height: "70%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "70%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "var(--surface-container)",
                      }}
                    >
                      {getFileIcon(file.file)}
                    </div>
                  )}

                  <div
                    style={{
                      padding: 8,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      flex: 1,
                      minHeight: 0,
                    }}
                  >
                    {showName && (
                      <input
                        type="text"
                        value={file.name}
                        onChange={(e) =>
                          handleNameChange(index, e.target.value)
                        }
                        placeholder="File name"
                        style={{
                          width: "100%",
                          padding: "4px 8px",
                          fontSize: 12,
                          border: "1px solid var(--outline-variant)",
                          borderRadius: 4,
                          background: "var(--surface)",
                          outline: "none",
                        }}
                      />
                    )}

                    {showVisibilityToggle && (
                      <select
                        value={visibilities[file.name] || defaultVisibility}
                        onChange={(e) =>
                          handleVisibilityChange(
                            file.name,
                            e.target.value as FileVisibility,
                          )
                        }
                        style={{
                          width: "100%",
                          padding: "4px 8px",
                          fontSize: 12,
                          border: "1px solid var(--outline-variant)",
                          borderRadius: 4,
                          background: "var(--surface)",
                          outline: "none",
                        }}
                      >
                        <option value="public">Public</option>
                        <option value="private">Private</option>
                      </select>
                    )}
                  </div>

                  {(showReorder || showDelete) && (
                    <div
                      className="file-actions"
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        opacity: 0,
                        transition: "opacity 0.2s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.opacity = "1")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.opacity = "0")
                      }
                    >
                      {showReorder && index > 0 && (
                        <button
                          type="button"
                          onClick={() => handleReorder(index, index - 1)}
                          disabled={uploading !== null}
                          className="icon-btn"
                          style={{
                            background: "rgba(0,0,0,0.6)",
                            color: "white",
                            borderRadius: 4,
                            padding: 4,
                          }}
                          title="Move up"
                          aria-label="Move up"
                        >
                          <ChevronUp size={14} />
                        </button>
                      )}
                      {showReorder && index < files.length - 1 && (
                        <button
                          type="button"
                          onClick={() => handleReorder(index, index + 1)}
                          disabled={uploading !== null}
                          className="icon-btn"
                          style={{
                            background: "rgba(0,0,0,0.6)",
                            color: "white",
                            borderRadius: 4,
                            padding: 4,
                          }}
                          title="Move down"
                          aria-label="Move down"
                        >
                          <ChevronDown size={14} />
                        </button>
                      )}
                      {showDelete && (
                        <button
                          type="button"
                          onClick={() => handleRemove(index)}
                          disabled={uploading !== null}
                          className="icon-btn"
                          style={{
                            background: "rgba(220,38,38,0.8)",
                            color: "white",
                            borderRadius: 4,
                            padding: 4,
                          }}
                          title="Remove"
                          aria-label="Remove"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
              {errors[file.file.name] && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background: "rgba(220,38,38,0.9)",
                    color: "white",
                    padding: "2px 4px",
                    fontSize: 10,
                    textAlign: "center",
                  }}
                >
                  {errors[file.file.name]}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!maxReached && (
        <button
          type="button"
          onClick={triggerFileSelect}
          disabled={disabled || uploading !== null}
          className="dropzone"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: 24,
            borderRadius: 8,
            border: "2px dashed var(--outline-variant)",
            background: "var(--surface-container-high)",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.6 : 1,
            transition: "border-color 0.2s, background 0.2s",
            minHeight: files.length === 0 ? 160 : 100,
            width: "100%",
          }}
          onMouseEnter={(e) => {
            if (!disabled) e.currentTarget.style.borderColor = "var(--primary)";
          }}
          onMouseLeave={(e) => {
            if (!disabled)
              e.currentTarget.style.borderColor = "var(--outline-variant)";
          }}
        >
          <Upload size={36} style={{ color: "var(--primary)" }} />
          <div style={{ textAlign: "center" }}>
            <p style={{ margin: 0, fontWeight: 500 }}>
              {files.length === 0
                ? "Drop files here or click to upload"
                : "Add more files"}
            </p>
            <p className="t-muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              {allowedTypes === "images"
                ? "JPEG, PNG, WebP, GIF"
                : allowedTypes === "documents"
                  ? "PDF, DOC, XLS, CSV, TXT"
                  : "Any file type"}{" "}
              · Up to {Math.round(maxFileSize / 1024 / 1024)}MB each · Max{" "}
              {maxFiles} files
            </p>
          </div>
        </button>
      )}

      {maxReached && files.length > 0 && (
        <p
          className="t-muted"
          style={{ textAlign: "center", marginTop: 8, fontSize: 13 }}
        >
          Maximum {maxFiles} files reached. Remove a file to add more.
        </p>
      )}

      {errors.general && (
        <div
          style={{
            color: "var(--error)",
            fontSize: 13,
            textAlign: "center",
            marginTop: 8,
          }}
        >
          {errors.general}
        </div>
      )}
    </div>
  );
}
