import { useT } from "../../hooks/use-t.js";
import type { IdentityDirectory } from "../../hooks/use-identity-directory.js";

export interface MemberPickerProps {
  directory: IdentityDirectory;
  /** Selected profile id. */
  value?: string;
  onChange(profileId: string | undefined): void;
  /** Offer only members in the ACTIVE state. Default `true`. */
  activeOnly?: boolean;
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

/**
 * A member `<select>` for hosts building their own assignment controls.
 *
 * It renders into the light DOM with the widget's own `aiw-` classes, so a
 * host that already injected `widgetStylesFor()` gets the shipped look, and
 * one that did not gets a plain select it can style itself.
 */
export function MemberPicker({
  directory,
  value,
  onChange,
  activeOnly = true,
  placeholder = "",
  className,
  id,
  "aria-label": ariaLabel,
}: MemberPickerProps) {
  const t = useT();
  const members = activeOnly
    ? directory.members.filter((m) => m.state === "ACTIVE")
    : directory.members;

  return (
    <select
      id={id}
      aria-label={ariaLabel ?? t("picker.member")}
      className={classes("aiw-select", "aiw-picker", className)}
      value={value ?? ""}
      aria-busy={directory.loading || undefined}
      onChange={(e) =>
        onChange(e.target.value === "" ? undefined : e.target.value)
      }
    >
      <option value="">{placeholder}</option>
      {members.map((m) => (
        <option key={m.id} value={m.profileId}>
          {m.name ?? m.profileId}
        </option>
      ))}
    </select>
  );
}
