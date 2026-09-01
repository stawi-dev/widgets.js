import { useId } from "react";
import { useT } from "../../hooks/use-t.js";
import { titleCase } from "../labels.js";
import type { EffectivePermission } from "../../permissions/types.js";

interface PermissionRowProps {
  row: EffectivePermission;
  /** Host label for the permission; Title Case of the key when absent. */
  label?: string;
  /**
   * True when the platform role still carries a permission the admin
   * revoked. The revoke is recorded, but tenancy cannot enforce it.
   */
  roleOverrides: boolean;
  disabled: boolean;
  onToggle: (next: boolean) => void;
}

/** One permission: a checkbox, its label, and why it is on or off. */
export function PermissionRow({
  row,
  label,
  roleOverrides,
  disabled,
  onToggle,
}: PermissionRowProps) {
  const t = useT();
  const id = useId();

  return (
    <div className="aiw-perm-row">
      <input
        id={id}
        type="checkbox"
        className="aiw-perm-check"
        checked={row.on}
        disabled={disabled}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <label className="aiw-perm-label" htmlFor={id}>
        {label ?? titleCase(row.permission)}
      </label>
      <span className={`aiw-perm-tag aiw-perm-tag-${row.source}`}>
        {t(`permissions.source.${row.source}`)}
      </span>
      {roleOverrides && (
        <span
          className="aiw-perm-tag aiw-perm-tag-warn"
          title={t("permissions.roleWarningHint")}
        >
          {t("permissions.roleWarning")}
        </span>
      )}
    </div>
  );
}
