import { useCallback, useContext, useState } from "react";
import { useIdentity } from "../../context/identity-context.js";
import { HooksContext } from "../../context/hooks-context.js";
import { useT } from "../../hooks/use-t.js";
import { Dialog } from "../Dialog.js";
import { Field } from "../Field.js";
import { platformRoleOf } from "./labels.js";
import { BundleSelect, initialBundles, withBundles } from "./BundleSelect.js";
import { diffGrants } from "../../permissions/model.js";
import type { MemberProperties } from "../../permissions/types.js";
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

        // The tenancy grants an active member's record asks for.
        const plans =
          permissionModel && state === "ACTIVE"
            ? nonEmptyPlans(
                permissionModel.namespaces.map((ns) => ({
                  namespace: ns.namespace,
                  diff: diffGrants(existing, properties, ns.namespace),
                })),
              )
            : [];

        // Editing applies the difference before persisting: the record
        // already exists, so a save that fails afterwards leaves an active
        // member whose grants merely ran ahead. Registering must save
        // first — granting before the record exists would leave live
        // permissions attached to a member nobody created. Either way a
        // partial failure is reported for retry rather than thrown.
        let issues: GrantIssue[] = [];
        if (isEdit && plans.length > 0) {
          issues = await applyGrantPlans(tenancy, resolvedProfileId, plans);
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
        if (!isEdit && plans.length > 0) {
          issues = await applyGrantPlans(tenancy, resolvedProfileId, plans);
        }
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

        {permissionModel && (
          <BundleSelect
            model={permissionModel}
            value={bundles}
            onChange={(namespace, key) =>
              setBundles((prev) => ({ ...prev, [namespace]: key }))
            }
          />
        )}

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
