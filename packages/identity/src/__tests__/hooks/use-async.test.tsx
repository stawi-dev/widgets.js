import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useAsync } from "../../hooks/use-async.js";

function Probe({ fn, dep }: { fn: () => Promise<string>; dep: string }) {
  const { data, error, loading, reload } = useAsync(fn, [dep]);
  return (
    <div>
      <span data-testid="state">
        {loading ? "loading" : error ? `error:${String(error)}` : data}
      </span>
      <button type="button" onClick={reload}>
        reload
      </button>
    </div>
  );
}

describe("useAsync", () => {
  it("exposes loading, then the resolved value", async () => {
    render(<Probe dep="a" fn={async () => "done"} />);
    expect(screen.getByTestId("state").textContent).toBe("loading");
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("done"),
    );
  });

  it("exposes the rejection reason", async () => {
    render(
      <Probe
        dep="a"
        fn={async () => {
          throw new Error("nope");
        }}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toContain("nope"),
    );
  });

  it("re-runs on reload", async () => {
    let n = 0;
    const fn = vi.fn(async () => `run-${++n}`);
    render(<Probe dep="a" fn={fn} />);
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("run-1"),
    );

    fireEvent.click(screen.getByRole("button", { name: "reload" }));
    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("run-2"),
    );
  });

  it("re-runs when a dependency changes and drops the stale result", async () => {
    const slow = () =>
      new Promise<string>((r) => setTimeout(() => r("stale"), 20));
    const { rerender } = render(<Probe dep="a" fn={slow} />);
    rerender(<Probe dep="b" fn={async () => "fresh"} />);

    await waitFor(() =>
      expect(screen.getByTestId("state").textContent).toBe("fresh"),
    );
    await new Promise((r) => setTimeout(r, 40));
    expect(screen.getByTestId("state").textContent).toBe("fresh");
  });
});
