import { useT } from "../../hooks/use-t.js";
import type { IdentityDirectory } from "../../hooks/use-identity-directory.js";

export interface TeamPickerProps {
  directory: IdentityDirectory;
  /** Selected team id. */
  value?: string;
  onChange(teamId: string | undefined): void;
  /** Label of the empty option. Empty by default. */
  placeholder?: string;
  className?: string;
  id?: string;
  /**
   * Accessible name. Defaults to the widget's own translation, so the
   * control always has one; pass your own when the surrounding form names
   * it differently.
   */
  "aria-label"?: string;
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
  id,
  "aria-label": ariaLabel,
}: TeamPickerProps) {
  const t = useT();
  return (
    <select
      id={id}
      aria-label={ariaLabel ?? t("picker.team")}
      className={classes("aiw-select", "aiw-picker", className)}
      value={value ?? ""}
      aria-busy={directory.loading || undefined}
      onChange={(e) =>
        onChange(e.target.value === "" ? undefined : e.target.value)
      }
    >
      <option value="">{placeholder}</option>
      {directory.teams.map((team) => (
        <option key={team.id} value={team.id}>
          {team.name}
        </option>
      ))}
    </select>
  );
}
