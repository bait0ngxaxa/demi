import { describe, expect, it } from "vitest";

import {
  getWorkspaceContextForPathname,
  resolveSelectedWorkspaceContext,
} from "./navigation-state";

describe("workspace context presentation", () => {
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
