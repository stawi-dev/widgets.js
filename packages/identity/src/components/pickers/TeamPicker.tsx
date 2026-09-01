import type { IdentityDirectory } from "../../hooks/use-identity-directory.js";

export interface TeamPickerProps {
  directory: IdentityDirectory;
  /** Selected team id. */
  value?: string;
  onChange(teamId: string | undefined): void;
  /** Label of the empty option. Empty by default. */
  placeholder?: string;
  className?: string;
}

function classes(...names: (string | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

/** A team `<select>`, the team-side counterpart of {@link MemberPicker}. */
export function TeamPicker({
  directory,
  value,
  onChange,
  placeholder = "",
  className,
}: TeamPickerProps) {
  return (
    <select
      className={classes("aiw-select", "aiw-picker", className)}
      value={value ?? ""}
      aria-busy={directory.loading || undefined}
      onChange={(e) =>
        onChange(e.target.value === "" ? undefined : e.target.value)
      }
    >
      <option value="">{placeholder}</option>
      {directory.teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
