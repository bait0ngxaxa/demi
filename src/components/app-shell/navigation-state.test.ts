import { describe, expect, it } from "vitest";

import {
  getWorkspaceContextForPathname,
  isNavigationItemActive,
  resolveSelectedWorkspaceContext,
  resolveWorkspaceContextForPathname,
} from "./navigation-state";

describe("workspace context presentation", () => {
  it("matches nested routes on segment boundaries and keeps Work Home exact", () => {
    const item = { href: "/app/admin/hospitals", label: "โรงพยาบาล", match: "prefix" as const };
    expect(isNavigationItemActive("/app/admin/hospitals/H", item)).toBe(true);
    expect(isNavigationItemActive("/app/admin/hospitals-other", item)).toBe(false);
    expect(isNavigationItemActive("/app/personal", { href: "/app", label: "งาน", match: "exact" })).toBe(false);
    expect(getWorkspaceContextForPathname("/app/personal-other")).toBeNull();
  });
  it("derives workspace context only from workspace-specific route segments", () => {
    expect(getWorkspaceContextForPathname("/app/personal/profile")).toBe("personal");
    expect(getWorkspaceContextForPathname("/app/personal-other")).toBeNull();
    expect(getWorkspaceContextForPathname("/app")).toBe("work");
    expect(getWorkspaceContextForPathname("/app/patients/assigned")).toBe("work");
    expect(getWorkspaceContextForPathname("/app/admin/reporting")).toBe("work");
    expect(getWorkspaceContextForPathname("/app/hospitals/reporting")).toBe("work");
    expect(getWorkspaceContextForPathname("/app/workforce")).toBe("work");
    expect(getWorkspaceContextForPathname("/app/family")).toBeNull();
    expect(getWorkspaceContextForPathname("/app/settings/contact")).toBeNull();
    expect(getWorkspaceContextForPathname("/app/support")).toBeNull();
    expect(getWorkspaceContextForPathname("/app/more?workspace=personal")).toBe("personal");
    expect(getWorkspaceContextForPathname("/app/more", "workspace=work")).toBe("work");
    expect(getWorkspaceContextForPathname("/app/more?workspace=admin")).toBeNull();
    expect(getWorkspaceContextForPathname("/app/more?workspace=personal&workspace=work")).toBeNull();
  });

  it("falls back to an available context when the selected route is stale", () => {
    expect(resolveSelectedWorkspaceContext(["work"], "personal")).toBe("work");
    expect(resolveSelectedWorkspaceContext(["personal"], "work")).toBe("personal");
    expect(resolveSelectedWorkspaceContext([], "personal")).toBeNull();
  });

  it("defaults multi-context users to Work when no context is selected", () => {
    expect(resolveSelectedWorkspaceContext(["personal", "work"], null)).toBe("work");
  });

  it("preserves the selected workspace on shared routes and resolves direct links deterministically", () => {
    const bothContexts = ["personal", "work"] as const;

    expect(
      resolveWorkspaceContextForPathname("/app/family", bothContexts, "personal"),
    ).toBe("personal");
    expect(
      resolveWorkspaceContextForPathname("/app/settings", bothContexts, "work"),
    ).toBe("work");
    expect(
      resolveWorkspaceContextForPathname("/app/family", bothContexts, null),
    ).toBe("work");
    expect(
      resolveWorkspaceContextForPathname("/app/family", ["personal"], null),
    ).toBe("personal");
    expect(
      resolveWorkspaceContextForPathname("/app/patients/assigned", bothContexts, "personal"),
    ).toBe("work");
    expect(
      resolveWorkspaceContextForPathname("/app/more?workspace=personal", bothContexts, "work"),
    ).toBe("personal");
    expect(
      resolveWorkspaceContextForPathname("/app/more?workspace=personal", ["work"], "work"),
    ).toBe("work");
  });
});
