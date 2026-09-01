import { useCallback, useContext, useState } from "react";
import { useIdentity } from "../../context/identity-context.js";
import { HooksContext } from "../../context/hooks-context.js";
import { useT } from "../../hooks/use-t.js";
import { Dialog } from "../Dialog.js";
import { Field } from "../Field.js";
import { platformRoleOf } from "./labels.js";
import { expandBundleProperties, diffGrants } from "../../permissions/model.js";
import type {
  MemberProperties,
  PermissionModel,
} from "../../permissions/types.js";
import {
  applyGrantPlans,
  nonEmptyPlans,
  type GrantIssue,
} from "../../services/grant-applier.js";
import type { OrgUnit, State, WorkforceMember } from "../../types.js";

/** How a new member's profile is identified. */
type IdentifyMode = "contact" | "profileId";

/** States a member may be registered in. */
const INITIAL_STATES: State[] = ["CREATED", "ACTIVE"];

interface RegisterMemberDialogProps {
  /** The member being edited; null registers a new one. */
  member: WorkforceMember | null;
  /** Home unit options; empty unless the org-units feature is on. */
  units: OrgUnit[];
  onClose: () => void;
  /** Called after the record is written; `issues` lists grants that failed. */
  onSaved: (result: { member: WorkforceMember; issues: GrantIssue[] }) => void;
}

/**
 * The bundle keys a dialog opens with: the member's recorded bundles, or —
 * for a new member — the first bundle each namespace offers. An existing
 * member with no bundle keeps none until an admin picks one.
 */
function initialBundles(
  model: PermissionModel | undefined,
  member: WorkforceMember | null,
): Record<string, string> {
  const recorded =
    (member?.properties as MemberProperties | undefined)?.access_bundle ?? {};
  const out: Record<string, string> = {};
  for (const ns of model?.namespaces ?? []) {
    out[ns.namespace] =
      recorded[ns.namespace] ?? (member ? "" : (ns.bundles[0]?.key ?? ""));
  }
  return out;
}

/**
 * Applies the chosen bundles to a member's properties. A namespace left on
 * "no bundle" has its bundle, grants and revokes dropped; every other
 * property — including namespaces outside the model — is carried through.
 */
function withBundles(
  model: PermissionModel,
  selection: Record<string, string>,
  existing: MemberProperties,
): MemberProperties {
  const cleared: MemberProperties = {
    ...existing,
    access_bundle: { ...(existing.access_bundle ?? {}) },
    permission_grants: { ...(existing.permission_grants ?? {}) },
    permission_revokes: { ...(existing.permission_revokes ?? {}) },
  };
  const chosen: Record<string, string> = {};
  for (const [ns, key] of Object.entries(selection)) {
    if (key) {
      chosen[ns] = key;
      continue;
    }
    delete cleared.access_bundle?.[ns];
    delete cleared.permission_grants?.[ns];
    delete cleared.permission_revokes?.[ns];
  }
  return expandBundleProperties(model, chosen, cleared);
}

/**
 * Registers a workforce member (by contact or profile id) or edits one.
 * The profile of an existing member is fixed — only the engagement type,
 * home unit and platform role can change.
 */
export function RegisterMemberDialog({
  member,
  units,
  onClose,
  onSaved,
}: RegisterMemberDialogProps) {
  const {
    client,
    tenancy,
    permissionModel,
    onMemberChange,
    vocabulary,
    features,
    organization,
    profileResolver,
  } = useIdentity();
  const hooks = useContext(HooksContext);
  const t = useT();
  const isEdit = member !== null;

  const [mode, setMode] = useState<IdentifyMode>("contact");
  const [contact, setContact] = useState("");
  const [profileId, setProfileId] = useState("");
  const [engagementType, setEngagementType] = useState(
    member?.engagementType ?? vocabulary.engagementTypes[0]?.value ?? "",
  );
  const [homeOrgUnitId, setHomeOrgUnitId] = useState(
    member?.homeOrgUnitId ?? "",
  );
  const [platformRole, setPlatformRole] = useState(
    platformRoleOf(member?.properties),
  );
  const [bundles, setBundles] = useState<Record<string, string>>(() =>
    initialBundles(permissionModel, member),
  );
  const [state, setState] = useState<State>(member?.state ?? "CREATED");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!organization) return;

      if (!isEdit) {
        const value = mode === "contact" ? contact : profileId;
        if (!value.trim()) {
          setErrors({ [mode]: t("field.required") });
          return;
        }
      }
      setErrors({});
      setSaving(true);
      setSubmitError(null);
      try {
        let resolvedProfileId = member?.profileId ?? profileId.trim();
        if (!isEdit && mode === "contact") {
          const found = await profileResolver.byContact(contact.trim());
          if (!found) {
            setErrors({ contact: t("members.contactNotFound") });
            return;
          }
          resolvedProfileId = found.id;
        }

        const existing = (member?.properties ?? {}) as MemberProperties;
        let properties: MemberProperties = { ...existing };
        if (permissionModel) {
          properties = withBundles(permissionModel, bundles, existing);
        } else if (features.platformRoles) {
          if (platformRole) properties.platform_role = platformRole;
          else delete properties.platform_role;
        }

        // An active member's tenancy grants must match the record, so the
        // difference is applied before it is persisted; a partial failure
        // still saves and is reported for retry.
        let issues: GrantIssue[] = [];
        if (permissionModel && state === "ACTIVE") {
          issues = await applyGrantPlans(
            tenancy,
            resolvedProfileId,
            nonEmptyPlans(
              permissionModel.namespaces.map((ns) => ({
                namespace: ns.namespace,
                diff: diffGrants(existing, properties, ns.namespace),
              })),
            ),
          );
        }

        const payload: Partial<WorkforceMember> = {
          ...(member ?? {}),
          organizationId: organization.id,
          profileId: resolvedProfileId,
          engagementType,
          state,
          properties,
        };
        if (features.orgUnits && (homeOrgUnitId || member?.homeOrgUnitId)) {
          payload.homeOrgUnitId = homeOrgUnitId;
        }

        const saved = await client.workforceMemberSave(payload);
        onMemberChange?.({
          member: saved,
          change: isEdit ? "updated" : "created",
        });
        onSaved({ member: saved, issues });
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : String(err));
        hooks.onError?.(err);
      } finally {
        setSaving(false);
      }
    },
    [
      bundles,
      client,
      contact,
      engagementType,
      features.orgUnits,
      features.platformRoles,
      homeOrgUnitId,
      hooks,
      isEdit,
      member,
      mode,
      onMemberChange,
      onSaved,
      organization,
      permissionModel,
      platformRole,
      profileId,
      profileResolver,
      state,
      t,
      tenancy,
    ],
  );

  return (
    <Dialog
      open
      title={t(isEdit ? "members.editTitle" : "members.registerTitle")}
      onClose={onClose}
    >
      <form
        className="aiw-member-form"
        noValidate
        onSubmit={(e) => void handleSubmit(e)}
      >
        {isEdit ? (
          <p className="aiw-member-profile">{member.profileId}</p>
        ) : (
          <>
            <fieldset className="aiw-fieldset">
              <legend className="aiw-fieldset-legend">
                {t("members.identifyBy")}
              </legend>
              {(["contact", "profileId"] as IdentifyMode[]).map((m) => (
                <label key={m} className="aiw-radio">
                  <input
                    type="radio"
                    name="aiw-member-identify"
                    value={m}
                    checked={mode === m}
                    onChange={() => setMode(m)}
                  />
                  {t(`members.identify.${m}`)}
                </label>
              ))}
            </fieldset>

            {mode === "contact" ? (
              <Field
                label={t("members.field.contact")}
                required
                error={errors.contact}
              >
                {(props) => (
                  <input
                    {...props}
                    className="aiw-input"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                  />
                )}
              </Field>
            ) : (
              <Field
                label={t("members.field.profileId")}
                required
                error={errors.profileId}
              >
                {(props) => (
                  <input
                    {...props}
                    className="aiw-input"
                    value={profileId}
                    onChange={(e) => setProfileId(e.target.value)}
                  />
                )}
              </Field>
            )}
          </>
        )}

        <Field label={t("members.field.engagement")}>
          {(props) => (
            <select
              {...props}
              className="aiw-select"
              value={engagementType}
              onChange={(e) => setEngagementType(e.target.value)}
            >
              {vocabulary.engagementTypes.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </Field>

        {features.orgUnits && (
          <Field label={t("members.field.homeUnit")}>
            {(props) => (
              <select
                {...props}
                className="aiw-select"
                value={homeOrgUnitId}
                onChange={(e) => setHomeOrgUnitId(e.target.value)}
              >
                <option value="">{t("members.none.option")}</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}

        {permissionModel?.namespaces.map((ns) => (
          <Field
            key={ns.namespace}
            label={
              permissionModel.namespaces.length > 1
                ? `${t("members.field.accessBundle")}: ${ns.label}`
                : t("members.field.accessBundle")
            }
          >
            {(props) => (
              <select
                {...props}
                className="aiw-select"
                value={bundles[ns.namespace] ?? ""}
                onChange={(e) =>
                  setBundles((prev) => ({
                    ...prev,
                    [ns.namespace]: e.target.value,
                  }))
                }
              >
                <option value="">{t("members.bundle.none")}</option>
                {ns.bundles.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ))}

        {!permissionModel && features.platformRoles && (
          <Field label={t("members.field.platformRole")}>
            {(props) => (
              <select
                {...props}
                className="aiw-select"
                value={platformRole}
                onChange={(e) => setPlatformRole(e.target.value)}
              >
                <option value="">{t("members.none.option")}</option>
                {vocabulary.platformRoles.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}

        {!isEdit && (
          <Field label={t("members.field.initialState")}>
            {(props) => (
              <select
                {...props}
                className="aiw-select"
                value={state}
                onChange={(e) => setState(e.target.value as State)}
              >
                {INITIAL_STATES.map((s) => (
                  <option key={s} value={s}>
                    {t(`state.${s}`)}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}

        {submitError && (
          <div role="alert" className="aiw-error">
            {submitError}
          </div>
        )}

        <div className="aiw-form-actions">
          <button type="button" className="aiw-button" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            className="aiw-button-primary"
            disabled={saving}
          >
            {t(isEdit ? "members.save" : "members.registerSubmit")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
