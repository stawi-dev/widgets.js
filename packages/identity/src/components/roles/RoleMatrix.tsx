import { useT } from "../../hooks/use-t.js";
import { SCOPE_TYPES } from "./scopes.js";
import type { AccessScopeType } from "../../types.js";

export interface RoleMatrixRow {
  /** Role key the row counts. */
  key: string;
  /** Human label for the role key. */
  label: string;
  /** Active assignment count per scope type. */
  counts: Record<AccessScopeType, number>;
}

interface RoleMatrixProps {
  rows: RoleMatrixRow[];
}

/** Role keys × scope types, holding the count of active assignments. */
export function RoleMatrix({ rows }: RoleMatrixProps) {
  const t = useT();
  return (
    <table className="aiw-table aiw-role-matrix">
      <caption className="aiw-visually-hidden">{t("roles.matrix")}</caption>
      <thead>
        <tr>
          <th scope="col">{t("roles.col.role")}</th>
          {SCOPE_TYPES.map((scope) => (
            <th key={scope} scope="col">
              {t(`roles.scope.${scope}`)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <th scope="row">{row.label}</th>
            {SCOPE_TYPES.map((scope) => (
              <td
                key={scope}
                className={
                  row.counts[scope] > 0
                    ? "aiw-role-matrix-cell aiw-is-set"
                    : "aiw-role-matrix-cell"
                }
              >
                {row.counts[scope]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
