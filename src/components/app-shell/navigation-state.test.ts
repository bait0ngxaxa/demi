import { describe, expect, it } from "vitest";

import {
  getWorkspaceContextForPathname,
  isNavigationItemActive,
  resolveSelectedWorkspaceContext,
} from "./navigation-state";

describe("workspace context presentation", () => {
  it("matches nested routes on segment boundaries and keeps Work Home exact", () => {
    const item = { href: "/app/admin/hospitals", label: "โรงพยาบาล", match: "prefix" as const };
    expect(isNavigationItemActive("/app/admin/hospitals/H", item)).toBe(true);
    expect(isNavigationItemActive("/app/admin/hospitals-other", item)).toBe(false);
    expect(isNavigationItemActive("/app/personal", { href: "/app", label: "งาน", match: "exact" })).toBe(false);
    expect(getWorkspaceContextForPathname("/app/personal-other")).toBe("work");
  });
  it("derives Personal or Work context from the route for navigation only", () => {
    expect(getWorkspaceContextForPathname("/app/personal/profile")).toBe("personal");
    expect(getWorkspaceContextForPathname("/app/patients/assigned")).toBe("work");
  });

  it("falls back to an available context when the selected route is stale", () => {
    expect(resolveSelectedWorkspaceContext(["work"], "personal")).toBe("work");
    expect(resolveSelectedWorkspaceContext(["personal"], "work")).toBe("personal");
    expect(resolveSelectedWorkspaceContext([], "personal")).toBeNull();
  });

  it("defaults multi-context users to Work when no context is selected", () => {
    expect(resolveSelectedWorkspaceContext(["personal", "work"], null)).toBe("work");
  });
});
