import { describe, it, expect } from "vitest";
import {
  bundleFor,
  diffGrants,
  effectivePermissions,
  expandBundleProperties,
  type MemberProperties,
  type PermissionModel,
} from "../../permissions/index.js";
import type { ServiceNamespace } from "../../services/tenancy-client.js";

const model: PermissionModel = {
  namespaces: [
    {
      namespace: "service_imports",
      label: "Imports",
      groups: { requests: "Requests", quotes: "Quotes" },
      permissionLabels: { requests_view: "View requests" },
      bundles: [
        {
          key: "admin",
          label: "Administrator",
          platformRole: "admin",
          permissions: [
            "requests_view",
            "requests_update",
            "assign",
            "team_manage",
          ],
        },
        {
          key: "operator",
          label: "Operator",
          platformRole: "operator",
          permissions: ["requests_view", "requests_update", "assign"],
        },
        {
          key: "viewer",
          label: "Viewer",
          platformRole: "viewer",
          permissions: ["requests_view"],
        },
        {
          key: "sales_agent",
          label: "Sales agent",
          platformRole: "member",
          permissions: ["requests_view", "requests_update", "quotes_create"],
          scoped: true,
        },
      ],
    },
    {
      namespace: "service_profile",
      label: "Profile",
      bundles: [
        {
          key: "profile_viewer",
          label: "Profile viewer",
          platformRole: "viewer",
          permissions: ["profile_view"],
        },
      ],
    },
  ],
};

const importsNs = model.namespaces[0];

const catalogue: ServiceNamespace = {
  namespace: "service_imports",
  permissions: [
    "requests_view",
    "requests_update",
    "quotes_create",
    "assign",
    "team_manage",
  ],
  roleBindings: {
    admin: {
      permissions: [
        "requests_view",
        "requests_update",
        "quotes_create",
        "assign",
        "team_manage",
      ],
    },
    operator: { permissions: ["requests_view", "requests_update", "assign"] },
    viewer: { permissions: ["requests_view"] },
  },
  registeredAt: "2026-01-01T00:00:00Z",
};

describe("bundleFor", () => {
  it("finds a bundle by namespace and key", () => {
    expect(bundleFor(model, "service_imports", "sales_agent")?.label).toBe(
      "Sales agent",
    );
  });

  it("returns undefined for an unknown namespace or key", () => {
    expect(bundleFor(model, "service_nope", "admin")).toBeUndefined();
    expect(bundleFor(model, "service_imports", "nope")).toBeUndefined();
  });
});

describe("expandBundleProperties", () => {
  it("expands the admin bundle to platform_role admin and its grants", () => {
    const next = expandBundleProperties(
      model,
      { service_imports: "admin" },
      {},
    );

    expect(next.platform_role).toBe("admin");
    expect(next.access_bundle).toEqual({ service_imports: "admin" });
    expect(next.permission_grants).toEqual({
      service_imports: [
        "requests_view",
        "requests_update",
        "assign",
        "team_manage",
      ],
    });
    expect(next.permission_revokes).toEqual({});
  });

  it("expands sales_agent to platform_role member with the bundle grants", () => {
    const next = expandBundleProperties(
      model,
      { service_imports: "sales_agent" },
      {},
    );

    expect(next.platform_role).toBe("member");
    expect(next.permission_grants).toEqual({
      service_imports: ["requests_view", "requests_update", "quotes_create"],
    });
  });

  it("takes the highest platform role across selected namespaces", () => {
    const next = expandBundleProperties(
      model,
      { service_imports: "sales_agent", service_profile: "profile_viewer" },
      {},
    );

    expect(next.platform_role).toBe("viewer");
  });

  it("keeps grants and revokes for namespaces outside the selection", () => {
    const existing: MemberProperties = {
      platform_role: "member",
      access_bundle: { service_profile: "profile_viewer" },
      permission_grants: {
        service_imports: ["assign"],
        service_profile: ["profile_view"],
      },
      permission_revokes: {
        service_imports: ["team_manage"],
        service_profile: ["profile_admin"],
      },
      display_hint: "keep me",
    };

    const next = expandBundleProperties(
      model,
      { service_imports: "viewer" },
      existing,
    );

    expect(next.permission_grants).toEqual({
      service_imports: ["requests_view"],
      service_profile: ["profile_view"],
    });
    expect(next.permission_revokes).toEqual({
      service_profile: ["profile_admin"],
    });
    expect(next.access_bundle).toEqual({
      service_imports: "viewer",
      service_profile: "profile_viewer",
    });
    expect(next.display_hint).toBe("keep me");
  });

  it("does not mutate the properties it was given", () => {
    const existing: MemberProperties = {
      permission_grants: { service_imports: ["assign"] },
      permission_revokes: { service_imports: ["team_manage"] },
    };

    expandBundleProperties(model, { service_imports: "viewer" }, existing);

    expect(existing.permission_grants).toEqual({ service_imports: ["assign"] });
    expect(existing.permission_revokes).toEqual({
      service_imports: ["team_manage"],
    });
  });

  it("ignores selections whose bundle is unknown and keeps the existing role", () => {
    const next = expandBundleProperties(
      model,
      { service_imports: "ghost" },
      { platform_role: "operator" },
    );

    expect(next.platform_role).toBe("operator");
    expect(next.access_bundle).toEqual({});
    expect(next.permission_grants).toEqual({});
  });
});

describe("effectivePermissions", () => {
  it("marks bundle, granted, revoked and role sources against the catalogue", () => {
    const props: MemberProperties = {
      platform_role: "operator",
      access_bundle: { service_imports: "sales_agent" },
      permission_grants: {
        service_imports: ["requests_view", "requests_update", "quotes_create"],
      },
      permission_revokes: { service_imports: ["requests_update"] },
    };

    const rows = effectivePermissions(importsNs, props, catalogue);

    expect(rows).toEqual([
      { permission: "requests_view", on: true, source: "bundle" },
      { permission: "requests_update", on: false, source: "revoked" },
      { permission: "quotes_create", on: true, source: "bundle" },
      { permission: "assign", on: true, source: "role" },
      { permission: "team_manage", on: false, source: "none" },
    ]);
  });

  it("marks an override outside the bundle as granted", () => {
    const props: MemberProperties = {
      access_bundle: { service_imports: "viewer" },
      permission_grants: { service_imports: ["requests_view", "assign"] },
    };

    const rows = effectivePermissions(importsNs, props, catalogue);

    expect(rows.find((r) => r.permission === "assign")).toEqual({
      permission: "assign",
      on: true,
      source: "granted",
    });
  });

  it("falls back to the union of bundle, grants and revokes, sorted", () => {
    const props: MemberProperties = {
      access_bundle: { service_imports: "viewer" },
      permission_grants: { service_imports: ["requests_view", "assign"] },
      permission_revokes: { service_imports: ["team_manage"] },
    };

    expect(
      effectivePermissions(importsNs, props).map((r) => r.permission),
    ).toEqual(["assign", "requests_view", "team_manage"]);
  });

  it("returns every catalogue permission as none for a member with no access", () => {
    const rows = effectivePermissions(importsNs, {}, catalogue);

    expect(rows.every((r) => !r.on && r.source === "none")).toBe(true);
    expect(rows).toHaveLength(catalogue.permissions.length);
  });

  it("ignores a catalogue for a different namespace", () => {
    const rows = effectivePermissions(
      model.namespaces[1],
      { permission_grants: { service_profile: ["profile_view"] } },
      catalogue,
    );

    expect(rows).toEqual([
      { permission: "profile_view", on: true, source: "granted" },
    ]);
  });
});

describe("diffGrants", () => {
  it("returns the exact grant and revoke sets for the namespace", () => {
    const prev: MemberProperties = {
      permission_grants: {
        service_imports: ["requests_view", "requests_update", "assign"],
        service_profile: ["profile_view"],
      },
    };
    const next: MemberProperties = {
      permission_grants: {
        service_imports: ["requests_view", "quotes_create"],
        service_profile: [],
      },
    };

    expect(diffGrants(prev, next, "service_imports")).toEqual({
      grant: ["quotes_create"],
      revoke: ["assign", "requests_update"],
    });
  });

  it("is empty when nothing changed", () => {
    const props: MemberProperties = {
      permission_grants: { service_imports: ["assign"] },
    };

    expect(diffGrants(props, props, "service_imports")).toEqual({
      grant: [],
      revoke: [],
    });
  });

  it("treats missing grants as an empty set", () => {
    expect(
      diffGrants(
        {},
        { permission_grants: { service_imports: ["assign"] } },
        "service_imports",
      ),
    ).toEqual({ grant: ["assign"], revoke: [] });
    expect(
      diffGrants(
        { permission_grants: { service_imports: ["assign"] } },
        {},
        "service_imports",
      ),
    ).toEqual({ grant: [], revoke: ["assign"] });
  });
});
