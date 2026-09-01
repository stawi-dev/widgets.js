import { Field } from "../Field.js";
import { useT } from "../../hooks/use-t.js";
import { expandBundleProperties } from "../../permissions/model.js";
import type {
  MemberProperties,
  PermissionModel,
} from "../../permissions/types.js";
import type { WorkforceMember } from "../../types.js";

/**
 * The bundle keys a dialog opens with: the member's recorded bundles, or —
 * for a new member — the first bundle each namespace offers. An existing
 * member with no bundle keeps none until an admin picks one.
 */
export function initialBundles(
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
export function withBundles(
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

interface BundleSelectProps {
  model: PermissionModel;
  /** Namespace → chosen bundle key; `""` means no bundle. */
  value: Record<string, string>;
  onChange: (namespace: string, key: string) => void;
}

/** One access-bundle select per namespace the host's model declares. */
export function BundleSelect({ model, value, onChange }: BundleSelectProps) {
  const t = useT();
  return (
    <>
      {model.namespaces.map((ns) => (
        <Field
          key={ns.namespace}
          label={
            // Several namespaces need telling apart; one speaks for itself.
            model.namespaces.length > 1
              ? `${t("members.field.accessBundle")}: ${ns.label}`
              : t("members.field.accessBundle")
          }
        >
          {(props) => (
            <select
              {...props}
              className="aiw-select"
              value={value[ns.namespace] ?? ""}
              onChange={(e) => onChange(ns.namespace, e.target.value)}
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
    </>
  );
}
