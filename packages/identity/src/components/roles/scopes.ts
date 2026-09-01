import type { AccessScopeType } from "../../types.js";
import type { RoleKeyOption } from "../../vocabulary/index.js";
import { titleCase } from "../labels.js";

/** Scope types in the order they are offered and columned. */
export const SCOPE_TYPES: readonly AccessScopeType[] = [
  "ACCESS_SCOPE_TYPE_GLOBAL",
  "ACCESS_SCOPE_TYPE_ORGANIZATION",
  "ACCESS_SCOPE_TYPE_ORG_UNIT",
  "ACCESS_SCOPE_TYPE_TEAM",
];

/** Label for a role key from the vocabulary, falling back to Title Case. */
export function roleKeyLabel(
  options: ReadonlyArray<RoleKeyOption>,
  key: string,
): string {
  return options.find((o) => o.key === key)?.label ?? titleCase(key);
}
