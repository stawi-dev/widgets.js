import { describe, it, expect } from "vitest";
import type { VocabularyOption } from "../vocabulary/index.js";
import {
  generalVocabulary,
  fintechVocabulary,
  commerceVocabulary,
  manufacturingVocabulary,
  mergeVocabulary,
} from "../vocabulary/index.js";

const presets = {
  general: generalVocabulary,
  fintech: fintechVocabulary,
  commerce: commerceVocabulary,
  manufacturing: manufacturingVocabulary,
};

describe("vocabulary presets", () => {
  for (const [name, vocabulary] of Object.entries(presets)) {
    it(`${name} includes identity_administrator in roleKeys`, () => {
      expect(vocabulary.roleKeys.map((r) => r.key)).toContain(
        "identity_administrator",
      );
      const entry = vocabulary.roleKeys.find(
        (r) => r.key === "identity_administrator",
      );
      expect(entry?.label).toBe("Administrator");
    });
  }

  it("general organizationTypes contains the five new values", () => {
    const values = generalVocabulary.organizationTypes.map((o) => o.value);
    expect(values).toEqual(
      expect.arrayContaining([
        "ORGANIZATION_TYPE_TRADING",
        "ORGANIZATION_TYPE_RETAIL",
        "ORGANIZATION_TYPE_MANUFACTURING",
        "ORGANIZATION_TYPE_LOGISTICS",
        "ORGANIZATION_TYPE_SERVICES",
      ]),
    );
  });

  it("fintech labels SACCO and NGO as uppercase acronyms", () => {
    const byValue = Object.fromEntries(
      fintechVocabulary.organizationTypes.map((o) => [o.value, o.label]),
    );
    expect(byValue.ORGANIZATION_TYPE_SACCO).toBe("SACCO");
    expect(byValue.ORGANIZATION_TYPE_NGO).toBe("NGO");
  });

  it("presets and their nested collections are frozen", () => {
    for (const vocabulary of Object.values(presets)) {
      expect(Object.isFrozen(vocabulary)).toBe(true);
      expect(Object.isFrozen(vocabulary.organizationTypes)).toBe(true);
      expect(Object.isFrozen(vocabulary.organizationTypes[0])).toBe(true);
      expect(Object.isFrozen(vocabulary.teamTypes)).toBe(true);
      expect(Object.isFrozen(vocabulary.teamTypes[0])).toBe(true);
      expect(Object.isFrozen(vocabulary.membershipRoles)).toBe(true);
      expect(Object.isFrozen(vocabulary.membershipRoles[0])).toBe(true);
      expect(Object.isFrozen(vocabulary.engagementTypes)).toBe(true);
      expect(Object.isFrozen(vocabulary.roleKeys)).toBe(true);
      expect(Object.isFrozen(vocabulary.roleKeys[0])).toBe(true);
      expect(Object.isFrozen(vocabulary.platformRoles)).toBe(true);
      expect(Object.isFrozen(vocabulary.labels)).toBe(true);

      expect(() =>
        (vocabulary.membershipRoles as unknown as VocabularyOption[]).push({
          value: "intruder",
          label: "Intruder",
        }),
      ).toThrow(TypeError);
    }
  });

  it("fintech role keys retain the three fintech roles", () => {
    expect(fintechVocabulary.roleKeys.map((r) => r.key).sort()).toEqual(
      [
        "approval_approver",
        "approval_verifier",
        "identity_administrator",
      ].sort(),
    );
  });

  it("all presets share the same membership roles, engagement types, and platform roles", () => {
    for (const vocabulary of Object.values(presets)) {
      expect(vocabulary.membershipRoles.map((r) => r.value)).toEqual([
        "lead",
        "member",
        "supervisor",
        "coordinator",
      ]);
      expect(vocabulary.engagementTypes.map((r) => r.value)).toEqual([
        "employee",
        "contractor",
        "agent",
        "intern",
      ]);
      expect(vocabulary.platformRoles).toEqual([
        { value: "admin", label: "Administrator" },
        { value: "operator", label: "Operator" },
        { value: "viewer", label: "Viewer" },
        { value: "member", label: "Member" },
      ]);
    }
  });
});

describe("mergeVocabulary", () => {
  it("replaces arrays with the override", () => {
    const merged = mergeVocabulary(generalVocabulary, {
      teamTypes: [{ value: "sourcing", label: "Sourcing" }],
    });
    expect(merged.teamTypes).toEqual([
      { value: "sourcing", label: "Sourcing" },
    ]);
  });

  it("shallow-merges labels, keeping unspecified keys from the base", () => {
    const merged = mergeVocabulary(generalVocabulary, {
      labels: { members: "Employees" },
    });
    expect(merged.labels?.members).toBe("Employees");
    expect(merged.labels?.teams).toBe(generalVocabulary.labels?.teams);
    expect(merged.labels?.roles).toBe(generalVocabulary.labels?.roles);
    expect(merged.labels?.units).toBe(generalVocabulary.labels?.units);
    expect(merged.labels?.organization).toBe(
      generalVocabulary.labels?.organization,
    );
  });

  it("returns the base vocabulary unchanged when no override is given", () => {
    expect(mergeVocabulary(generalVocabulary)).toEqual(generalVocabulary);
  });

  it("leaves unrelated arrays untouched when only one array is overridden", () => {
    const merged = mergeVocabulary(generalVocabulary, {
      roleKeys: [{ key: "custom_role", label: "Custom" }],
    });
    expect(merged.roleKeys).toEqual([{ key: "custom_role", label: "Custom" }]);
    expect(merged.organizationTypes).toBe(generalVocabulary.organizationTypes);
    expect(merged.membershipRoles).toBe(generalVocabulary.membershipRoles);
  });

  it("returns a frozen merged vocabulary and a frozen merged labels object", () => {
    const merged = mergeVocabulary(generalVocabulary, {
      labels: { members: "Employees" },
    });
    expect(Object.isFrozen(merged)).toBe(true);
    expect(Object.isFrozen(merged.labels)).toBe(true);
  });

  it("never aliases a mutable override array back into the shared preset", () => {
    const override: VocabularyOption[] = [
      { value: "sourcing", label: "Sourcing" },
    ];
    const merged = mergeVocabulary(generalVocabulary, { teamTypes: override });

    // Mutating the host's own override array after the fact must not
    // reach back into the frozen preset constant.
    override.push({ value: "extra", label: "Extra" });

    expect(merged.teamTypes).not.toBe(generalVocabulary.teamTypes);
    expect(generalVocabulary.teamTypes.map((t) => t.value)).not.toContain(
      "sourcing",
    );
    expect(Object.isFrozen(generalVocabulary.teamTypes)).toBe(true);
  });
});
