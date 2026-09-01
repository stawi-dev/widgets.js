import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useFocusTrap } from "../hooks/use-focus-trap.js";
import { useT } from "../hooks/use-t.js";

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Modal dialog: focus-trapped, `aria-modal`, Escape and backdrop close. */
export function Dialog({ open, title, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();
  useFocusTrap(ref, open);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="aiw-dialog-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className="aiw-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="aiw-dialog-header">
          <div className="aiw-dialog-title">{title}</div>
          <button
            type="button"
            className="aiw-dialog-close"
            aria-label={t("common.close")}
            onClick={onClose}
          >
            &times;
          </button>
        </div>
        <div className="aiw-dialog-body">{children}</div>
      </div>
    </div>
  );
}
