import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemberPicker, TeamPicker } from "../../pickers.js";
import type { IdentityDirectory } from "../../hooks/use-identity-directory.js";

function directory(over: Partial<IdentityDirectory> = {}): IdentityDirectory {
  return {
    members: [
      {
        id: "m1",
        organizationId: "o1",
        profileId: "p1",
        state: "ACTIVE",
        name: "Ada",
      },
      { id: "m2", organizationId: "o1", profileId: "p2", state: "INACTIVE" },
    ],
    teams: [
      { id: "t1", organizationId: "o1", name: "Sourcing", code: "SRC" },
      { id: "t2", organizationId: "o1", name: "Finance", code: "FIN" },
    ],
    loading: false,
    truncated: false,
    resolveName: (id) => (id === "p1" ? "Ada" : id),
    refresh: vi.fn(),
    ...over,
  };
}

function optionLabels(): string[] {
  return screen
    .getAllByRole("option")
    .map((o) => o.textContent ?? "")
    .filter((label) => label !== "");
}

describe("MemberPicker", () => {
  it("lists active members only, labelled by name or profile id", () => {
    render(<MemberPicker directory={directory()} onChange={vi.fn()} />);

    expect(optionLabels()).toEqual(["Ada"]);
  });

  it("labels the empty option with the placeholder", () => {
    render(
      <MemberPicker
        directory={directory()}
        placeholder="Anyone"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("option", { name: "Anyone" })).toBeTruthy();
  });

  it("includes inactive members when activeOnly is off", () => {
    render(
      <MemberPicker
        directory={directory()}
        activeOnly={false}
        onChange={vi.fn()}
      />,
    );

    expect(optionLabels()).toEqual(["Ada", "p2"]);
  });

  it("reports the chosen profile id, and undefined for the empty option", () => {
    const onChange = vi.fn();
    render(
      <MemberPicker directory={directory()} value="p1" onChange={onChange} />,
    );

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("p1");

    fireEvent.change(select, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("names itself, and takes a host label and id", () => {
    const { rerender } = render(
      <MemberPicker directory={directory()} onChange={vi.fn()} />,
    );
    expect(screen.getByRole("combobox", { name: "Member" })).toBeTruthy();

    rerender(
      <MemberPicker
        directory={directory()}
        id="assignee"
        aria-label="Assignee"
        onChange={vi.fn()}
      />,
    );
    const select = screen.getByRole("combobox", { name: "Assignee" });
    expect(select.id).toBe("assignee");
  });

  it("marks itself busy while the directory loads", () => {
    render(
      <MemberPicker
        directory={directory({ members: [], loading: true })}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("combobox").getAttribute("aria-busy")).toBe("true");
  });
});

describe("TeamPicker", () => {
  it("lists teams by name and reports the chosen team id", () => {
    const onChange = vi.fn();
    render(
      <TeamPicker
        directory={directory()}
        className="mine"
        onChange={onChange}
      />,
    );

    expect(optionLabels()).toEqual(["Sourcing", "Finance"]);

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.className).toContain("mine");
    fireEvent.change(select, { target: { value: "t2" } });
    expect(onChange).toHaveBeenCalledWith("t2");
  });

  it("names itself Team by default", () => {
    render(<TeamPicker directory={directory()} onChange={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "Team" })).toBeTruthy();
  });

  it("reports undefined when the empty option is chosen", () => {
    const onChange = vi.fn();
    render(
      <TeamPicker directory={directory()} value="t1" onChange={onChange} />,
    );

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
