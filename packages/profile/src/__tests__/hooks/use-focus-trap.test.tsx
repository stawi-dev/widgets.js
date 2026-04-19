import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useRef } from "react";
import { useFocusTrap } from "../../hooks/use-focus-trap.js";

function Harness({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, active);
  return (
    <div>
      <button data-testid="outside-before">outside-before</button>
      <div ref={ref} data-testid="trap">
        <button data-testid="first">first</button>
        <button data-testid="middle">middle</button>
        <button data-testid="last">last</button>
      </div>
      <button data-testid="outside-after">outside-after</button>
    </div>
  );
}

describe("useFocusTrap", () => {
  it("moves focus into the container when activated", () => {
    const { getByTestId } = render(<Harness active={true} />);
    expect(document.activeElement).toBe(getByTestId("first"));
  });

  it("wraps Tab from last element to first", () => {
    const { getByTestId } = render(<Harness active={true} />);
    const last = getByTestId("last");
    last.focus();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(getByTestId("trap"), { key: "Tab" });
    expect(document.activeElement).toBe(getByTestId("first"));
  });

  it("wraps Shift+Tab from first element to last", () => {
    const { getByTestId } = render(<Harness active={true} />);
    const first = getByTestId("first");
    first.focus();
    fireEvent.keyDown(getByTestId("trap"), { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(getByTestId("last"));
  });

  it("pulls focus back inside when currently outside", () => {
    const { getByTestId } = render(<Harness active={true} />);
    // Simulate focus being outside and pressing Tab inside the container.
    const outside = getByTestId("outside-before");
    outside.focus();
    expect(document.activeElement).toBe(outside);
    fireEvent.keyDown(getByTestId("trap"), { key: "Tab" });
    expect(document.activeElement).toBe(getByTestId("first"));
  });

  it("does not trap when inactive", () => {
    const { getByTestId } = render(<Harness active={false} />);
    const outside = getByTestId("outside-before");
    outside.focus();
    expect(document.activeElement).toBe(outside);
    // No auto-focus movement when inactive.
  });

  it("restores previous focus when deactivated", () => {
    const { getByTestId, rerender } = render(<Harness active={false} />);
    const outside = getByTestId("outside-before");
    outside.focus();
    expect(document.activeElement).toBe(outside);
    rerender(<Harness active={true} />);
    expect(document.activeElement).toBe(getByTestId("first"));
    rerender(<Harness active={false} />);
    expect(document.activeElement).toBe(outside);
  });
});
