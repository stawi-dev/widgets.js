import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../../components/ErrorBoundary.js";

function ThrowingChild({ message }: { message: string }) {
  throw new Error(message);
}

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <div>All good</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("All good")).toBeTruthy();
  });

  it("renders error message when child throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ThrowingChild message="Boom!" />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/Something went wrong: Boom!/)).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("logs error to console", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ThrowingChild message="test error" />
      </ErrorBoundary>,
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "[profile] Error:",
      expect.any(Error),
      expect.any(String),
    );
    vi.restoreAllMocks();
  });
});
