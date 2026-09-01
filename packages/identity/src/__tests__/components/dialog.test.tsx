import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Dialog } from "../../components/Dialog.js";

function renderDialog(open = true, onClose = vi.fn()) {
  render(
    <Dialog open={open} title="Add member" onClose={onClose}>
      <button type="button">first</button>
      <button type="button">last</button>
    </Dialog>,
  );
  return onClose;
}

describe("Dialog", () => {
  it("renders nothing when closed", () => {
    renderDialog(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("is a modal dialog labelled by its title", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Add member");
  });

  it("moves focus inside and cycles it with Tab", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");
    const last = screen.getByRole("button", { name: "last" });
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Cancel");

    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Cancel");

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement?.textContent).toBe("last");
  });

  it("closes on Escape, the backdrop and the close button", () => {
    const onClose = renderDialog();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(document.querySelector(".aiw-dialog-backdrop")!);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("ignores clicks inside the dialog body", () => {
    const onClose = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "first" }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
