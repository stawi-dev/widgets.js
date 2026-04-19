import { useEffect, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getFocusable(root: HTMLElement): HTMLElement[] {
  const list = root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  const result: HTMLElement[] = [];
  list.forEach((el) => {
    // Skip hidden/disabled elements.
    if (el.hasAttribute("disabled")) return;
    if (el.getAttribute("aria-hidden") === "true") return;
    result.push(el);
  });
  return result;
}

/**
 * Focus trap: when `active`, Tab/Shift-Tab cycles within the container.
 * When mounted while active, focus moves to the first focusable child.
 * When deactivated, the previously focused element is restored.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
): void {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move initial focus inside the container if it isn't already.
    const focusables = getFocusable(container);
    if (focusables.length > 0 && !container.contains(document.activeElement)) {
      focusables[0]?.focus();
    }

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== "Tab") return;
      const items = getFocusable(container);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const current = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (current === first || !container.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (current === last || !container.contains(current)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener("keydown", handleKeyDown);
    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        try {
          previouslyFocused.focus();
        } catch {
          /* ignore */
        }
      }
    };
  }, [ref, active]);
}
