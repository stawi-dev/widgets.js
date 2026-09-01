import type { OrgUnit, OrgUnitType } from "../../types.js";

/** Selectable org-unit types, broadest first. Labels come from i18n. */
export const ORG_UNIT_TYPES: readonly OrgUnitType[] = [
  "ORG_UNIT_TYPE_REGION",
  "ORG_UNIT_TYPE_ZONE",
  "ORG_UNIT_TYPE_AREA",
  "ORG_UNIT_TYPE_CLUSTER",
  "ORG_UNIT_TYPE_BRANCH",
  "ORG_UNIT_TYPE_OTHER",
] as const;

/** A unit paired with its depth in the org-unit tree. */
export interface UnitNode {
  unit: OrgUnit;
  depth: number;
}

/**
 * Flattens `units` into depth-first display order so a child always follows
 * its parent. Units whose parent is missing from the page (or absent) are
 * roots, which keeps a partial page renderable rather than dropping rows.
 */
export function flattenUnitTree(units: readonly OrgUnit[]): UnitNode[] {
  const byParent = new Map<string, OrgUnit[]>();
  const ids = new Set(units.map((u) => u.id));
  const roots: OrgUnit[] = [];

  for (const unit of units) {
    const parent = unit.parentId;
    if (!parent || !ids.has(parent)) {
      roots.push(unit);
      continue;
    }
    const siblings = byParent.get(parent);
    if (siblings) siblings.push(unit);
    else byParent.set(parent, [unit]);
  }

  const out: UnitNode[] = [];
  const seen = new Set<string>();

  function walk(unit: OrgUnit, depth: number) {
    // Guards against a cyclic parent chain returned by the service.
    if (seen.has(unit.id)) return;
    seen.add(unit.id);
    out.push({ unit, depth });
    for (const child of byParent.get(unit.id) ?? []) walk(child, depth + 1);
  }

  for (const root of roots) walk(root, 0);
  return out;
}
