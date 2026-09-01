import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useIdentityDirectory } from "../../hooks/use-identity-directory.js";
import { concat, envelope } from "../services/envelope-fixture.js";

const MEMBERS = envelope(
  0,
  JSON.stringify({
    data: [
      { id: "m1", organizationId: "o1", profileId: "p1", state: "ACTIVE" },
      { id: "m2", organizationId: "o1", profileId: "p2", state: "INACTIVE" },
    ],
  }),
);
const TEAMS = envelope(
  0,
  JSON.stringify({
    data: [{ id: "t1", organizationId: "o1", name: "Sourcing", code: "SRC" }],
  }),
);
const END = envelope(2, "{}");

/** A runtime whose answers depend only on the RPC in the URL. */
function fakeRuntime() {
  const calls: string[] = [];
  const runtime = {
    fetch: async (url: string, init?: any) => {
      calls.push(url);
      if (url.endsWith("/WorkforceMemberSearch"))
        return concat(MEMBERS, END) as never;
      if (url.endsWith("/InternalTeamSearch"))
        return concat(TEAMS, END) as never;
      if (url.endsWith("/GetById")) {
        const id = JSON.parse(init.body).id;
        // Only p1 has a profile the caller can read; p2 falls back to its id.
        return {
          data:
            id === "p1"
              ? {
                  id,
                  properties: { au_name: "Ada" },
                  contacts: [{ type: "EMAIL", detail: "ada@example.com" }],
                }
              : { id },
        } as never;
      }
      throw new Error(`unexpected ${url}`);
    },
  };
  return { calls, runtime };
}

function Probe({
  runtime,
  org,
  ttlMs,
}: {
  runtime: { fetch: (url: string) => Promise<unknown> };
  org: string;
  ttlMs?: number;
}) {
  const directory = useIdentityDirectory({
    runtime: runtime as never,
    apiBaseUrl: "https://api.stawi.org/identity",
    organizationId: org,
    ...(ttlMs === undefined ? {} : { ttlMs }),
  });
  return (
    <div>
      <span data-testid="loading">{directory.loading ? "yes" : "no"}</span>
      <span data-testid="error">{directory.error ?? ""}</span>
      <span data-testid="members">
        {directory.members.map((m) => m.profileId).join(",")}
      </span>
      <span data-testid="emails">
        {directory.members.map((m) => m.email ?? "-").join(",")}
      </span>
      <span data-testid="truncated">{directory.truncated ? "yes" : "no"}</span>
      <span data-testid="teams">
        {directory.teams.map((t) => t.name).join(",")}
      </span>
      <span data-testid="p1">{directory.resolveName("p1")}</span>
      <span data-testid="p9">{directory.resolveName("p9")}</span>
      <button type="button" onClick={directory.refresh}>
        refresh
      </button>
    </div>
  );
}

function searchCalls(calls: string[]): number {
  return calls.filter((c) => c.endsWith("/WorkforceMemberSearch")).length;
}

describe("useIdentityDirectory", () => {
  it("loads members with resolved names, and teams", async () => {
    const { runtime } = fakeRuntime();
    render(<Probe org="o-load" runtime={runtime} />);

    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("no"),
    );
    expect(screen.getByTestId("members").textContent).toBe("p1,p2");
    expect(screen.getByTestId("emails").textContent).toBe("ada@example.com,-");
    expect(screen.getByTestId("teams").textContent).toBe("Sourcing");
    expect(screen.getByTestId("truncated").textContent).toBe("no");
    expect(screen.getByTestId("error").textContent).toBe("");
  });

  it("resolves a known name and falls back to the profile id", async () => {
    const { runtime } = fakeRuntime();
    render(<Probe org="o-names" runtime={runtime} />);

    await waitFor(() =>
      expect(screen.getByTestId("p1").textContent).toBe("Ada"),
    );
    expect(screen.getByTestId("p9").textContent).toBe("p9");
  });

  it("shares one fetch between hook instances inside the ttl", async () => {
    const { calls, runtime } = fakeRuntime();
    render(
      <>
        <Probe org="o-share" runtime={runtime} />
        <Probe org="o-share" runtime={runtime} />
      </>,
    );

    await waitFor(() =>
      expect(
        screen.getAllByTestId("loading").every((n) => n.textContent === "no"),
      ).toBe(true),
    );
    expect(searchCalls(calls)).toBe(1);
  });

  it("re-fetches once the ttl has passed", async () => {
    const { calls, runtime } = fakeRuntime();
    const { unmount } = render(
      <Probe org="o-ttl" runtime={runtime} ttlMs={0} />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("no"),
    );
    unmount();

    render(<Probe org="o-ttl" runtime={runtime} ttlMs={0} />);
    await waitFor(() => expect(searchCalls(calls)).toBe(2));
  });

  it("refresh() bypasses the cache", async () => {
    const { calls, runtime } = fakeRuntime();
    render(<Probe org="o-refresh" runtime={runtime} />);
    await waitFor(() =>
      expect(screen.getByTestId("loading").textContent).toBe("no"),
    );
    expect(searchCalls(calls)).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "refresh" }));
    await waitFor(() => expect(searchCalls(calls)).toBe(2));
  });

  it("flags a truncated directory when paging hits its cap", async () => {
    // A server that always answers a full page keeps fetchAllPages going
    // until its safety cap, which is exactly the partial-view case.
    const full = envelope(
      0,
      JSON.stringify({
        data: Array.from({ length: 50 }, (_, i) => ({
          id: `m${i}`,
          organizationId: "o-cap",
          profileId: `p${i}`,
          state: "ACTIVE",
        })),
      }),
    );
    const fetch = async (url: string) =>
      url.endsWith("/WorkforceMemberSearch")
        ? (concat(full) as never)
        : url.endsWith("/InternalTeamSearch")
          ? (concat(TEAMS, END) as never)
          : ({ data: { id: "p0" } } as never);

    render(<Probe org="o-cap" runtime={{ fetch } as never} />);

    await waitFor(() =>
      expect(screen.getByTestId("truncated").textContent).toBe("yes"),
    );
  });

  it("reports a load failure and does not cache it", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockImplementation(async (url: string) =>
        url.endsWith("/InternalTeamSearch")
          ? (concat(TEAMS, END) as never)
          : (concat(MEMBERS, END) as never),
      );
    render(<Probe org="o-error" runtime={{ fetch } as never} />);

    await waitFor(() =>
      expect(screen.getByTestId("error").textContent).toContain("boom"),
    );
    expect(screen.getByTestId("loading").textContent).toBe("no");

    fireEvent.click(screen.getByRole("button", { name: "refresh" }));
    await waitFor(() =>
      expect(screen.getByTestId("error").textContent).toBe(""),
    );
  });
});
