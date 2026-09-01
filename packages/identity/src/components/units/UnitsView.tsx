import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useIdentity } from "../../context/identity-context.js";
import { HooksContext } from "../../context/hooks-context.js";
import { useAsync } from "../../hooks/use-async.js";
import { useT } from "../../hooks/use-t.js";
import { EmptyState } from "../EmptyState.js";
import { LoadingRows } from "../LoadingRows.js";
import { flattenUnitTree } from "./unit-types.js";
import { UnitForm } from "./UnitForm.js";
import type { OrgUnit } from "../../types.js";

/** Page size for the org-unit lookup. */
const SEARCH_LIMIT = 50;
/** Horizontal indent applied per tree level, in pixels. */
const INDENT_PX = 16;

/** Org-unit tree with create and edit. Rendered only when `features.orgUnits`. */
export function UnitsView() {
  const { client, organization } = useIdentity();
  const hooks = useContext(HooksContext);
  const t = useT();

  const [editing, setEditing] = useState<OrgUnit | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const organizationId = organization?.id ?? "";

  const units = useAsync(
    () =>
      client.orgUnitSearch({
        organizationId,
        cursor: { limit: SEARCH_LIMIT },
      }),
    [client, organizationId],
  );

  const list = useMemo(() => units.data ?? [], [units.data]);
  const nodes = useMemo(() => flattenUnitTree(list), [list]);
  const reload = units.reload;

  const openCreate = useCallback(() => {
    setEditing(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((unit: OrgUnit) => {
    setEditing(unit);
    setDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => setDialogOpen(false), []);

  const handleSaved = useCallback(() => {
    setDialogOpen(false);
    reload();
  }, [reload]);

  useEffect(() => {
    if (units.error) hooks.onError?.(units.error);
  }, [units.error, hooks]);

  function createButton(labelKey: string) {
    return (
      <button type="button" className="aiw-button-primary" onClick={openCreate}>
        {t(labelKey)}
      </button>
    );
  }

  return (
    <div className="aiw-units">
      <div className="aiw-units-toolbar">{createButton("units.create")}</div>

      {units.error ? (
        <div className="aiw-units-error">
          <div role="alert" className="aiw-error">
            {t("units.loadFailed")}
          </div>
          <button type="button" className="aiw-button" onClick={reload}>
            {t("common.retry")}
          </button>
        </div>
      ) : units.loading ? (
        <LoadingRows label={t("units.loading")} />
      ) : nodes.length === 0 ? (
        <EmptyState
          title={t("units.none")}
          description={t("units.noneHint")}
          action={createButton("units.createFirst")}
        />
      ) : (
        <table className="aiw-table aiw-units-table">
          <caption className="aiw-visually-hidden">
            {t("units.caption")}
          </caption>
          <thead>
            <tr>
              <th scope="col">{t("units.col.name")}</th>
              <th scope="col">{t("units.col.code")}</th>
              <th scope="col">{t("units.col.type")}</th>
              <th scope="col">{t("units.col.state")}</th>
              <th scope="col">{t("units.col.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map(({ unit, depth }) => (
              <tr key={unit.id}>
                <td>
                  <span
                    className="aiw-units-name"
                    data-depth={depth}
                    style={{ paddingInlineStart: `${depth * INDENT_PX}px` }}
                  >
                    {unit.name}
                  </span>
                </td>
                <td>{unit.code}</td>
                <td>{unit.type ? t(`unitType.${unit.type}`) : ""}</td>
                <td>{t(`state.${unit.state ?? "CREATED"}`)}</td>
                <td className="aiw-units-actions">
                  <button
                    type="button"
                    className="aiw-button"
                    onClick={() => openEdit(unit)}
                  >
                    {t("units.edit")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {dialogOpen && (
        <UnitForm
          unit={editing}
          units={list}
          onClose={closeDialog}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
