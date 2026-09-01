import { useCallback, useContext, useEffect, useId, useState } from "react";
import { useIdentity } from "../../context/identity-context.js";
import { HooksContext } from "../../context/hooks-context.js";
import { useAsync } from "../../hooks/use-async.js";
import { useT } from "../../hooks/use-t.js";
import { EmptyState } from "../EmptyState.js";
import { LoadingRows } from "../LoadingRows.js";
import { optionLabel } from "../labels.js";
import { TeamDetail } from "./TeamDetail.js";
import { TeamForm } from "./TeamForm.js";
import type { InternalTeam } from "../../types.js";

/** Page size for the team and org-unit lookups. */
const SEARCH_LIMIT = 50;
/** Idle time before a typed query is sent to the service. */
const DEBOUNCE_MS = 250;

/** Team list with search, create/edit, and a membership detail panel. */
export function TeamsView() {
  const { client, vocabulary, features, organization } = useIdentity();
  const hooks = useContext(HooksContext);
  const t = useT();
  const searchId = useId();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<InternalTeam | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const organizationId = organization?.id ?? "";
  const { orgUnits } = features;

  useEffect(() => {
    if (query === debouncedQuery) return;
    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, debouncedQuery]);

  const teams = useAsync(
    () =>
      client.internalTeamSearch({
        organizationId,
        ...(debouncedQuery ? { query: debouncedQuery } : {}),
        cursor: { limit: SEARCH_LIMIT },
      }),
    [client, organizationId, debouncedQuery],
  );

  const units = useAsync(
    () =>
      orgUnits
        ? client.orgUnitSearch({
            organizationId,
            cursor: { limit: SEARCH_LIMIT },
          })
        : Promise.resolve([]),
    [client, organizationId, orgUnits],
  );

  const list = teams.data ?? [];
  const selected = list.find((team) => team.id === selectedId) ?? null;
  const reload = teams.reload;

  const openCreate = useCallback(() => {
    setEditing(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((team: InternalTeam) => {
    setEditing(team);
    setDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => setDialogOpen(false), []);

  const handleSaved = useCallback(() => {
    setDialogOpen(false);
    reload();
  }, [reload]);

  useEffect(() => {
    if (teams.error) hooks.onError?.(teams.error);
  }, [teams.error, hooks]);

  function createButton(labelKey: string) {
    return (
      <button type="button" className="aiw-button-primary" onClick={openCreate}>
        {t(labelKey)}
      </button>
    );
  }

  return (
    <div className="aiw-teams">
      <div className="aiw-teams-toolbar">
        <label className="aiw-visually-hidden" htmlFor={searchId}>
          {t("teams.search")}
        </label>
        <input
          id={searchId}
          type="search"
          className="aiw-input"
          placeholder={t("teams.search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {createButton("teams.create")}
      </div>

      {teams.error ? (
        <div className="aiw-teams-error">
          <div role="alert" className="aiw-error">
            {t("teams.loadFailed")}
          </div>
          <button type="button" className="aiw-button" onClick={reload}>
            {t("common.retry")}
          </button>
        </div>
      ) : teams.loading ? (
        <LoadingRows label={t("teams.loading")} />
      ) : list.length === 0 ? (
        <EmptyState
          title={t(debouncedQuery ? "teams.noMatches" : "teams.none")}
          description={t(
            debouncedQuery ? "teams.noMatchesHint" : "teams.noneHint",
          )}
          action={
            debouncedQuery ? undefined : createButton("teams.createFirst")
          }
        />
      ) : (
        <div className="aiw-teams-layout">
          <table className="aiw-table aiw-teams-table">
            <caption className="aiw-visually-hidden">
              {t("teams.caption")}
            </caption>
            <thead>
              <tr>
                <th scope="col">{t("teams.col.name")}</th>
                <th scope="col">{t("teams.col.type")}</th>
                <th scope="col">{t("teams.col.code")}</th>
                <th scope="col">{t("teams.col.objective")}</th>
                <th scope="col">{t("teams.col.state")}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((team) => (
                <tr
                  key={team.id}
                  className={
                    team.id === selectedId
                      ? "aiw-teams-row aiw-is-selected"
                      : "aiw-teams-row"
                  }
                >
                  <td>
                    <button
                      type="button"
                      className="aiw-link-button"
                      aria-pressed={team.id === selectedId}
                      onClick={() => setSelectedId(team.id)}
                    >
                      {team.name}
                    </button>
                  </td>
                  <td>{optionLabel(vocabulary.teamTypes, team.teamType)}</td>
                  <td>{team.code}</td>
                  <td>{team.objective ?? ""}</td>
                  <td>{t(`state.${team.state ?? "CREATED"}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="aiw-teams-detail">
            {selected ? (
              <TeamDetail team={selected} onEdit={openEdit} />
            ) : (
              <EmptyState title={t("teams.noneSelected")} />
            )}
          </div>
        </div>
      )}

      {dialogOpen && (
        <TeamForm
          team={editing}
          teams={list}
          units={units.data ?? []}
          onClose={closeDialog}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
