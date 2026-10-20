import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { getWorkspaceContextForPathname } from "./navigation-state";

/*
 * Guard: every top-level route folder under app/app must be classified on
 * purpose. "shared" routes resolve to null and keep the current workspace
 * selection; a new folder fails here until it is added to this table and,
 * for personal/work, to getWorkspaceContextForPathname.
 */
const ROUTE_FOLDER_WORKSPACES: Readonly<Record<string, "personal" | "work" | "shared">> = {
  admin: "work",
  family: "shared",
  hospitals: "work",
  more: "shared",
  patients: "work",
  personal: "personal",
  settings: "shared",
  support: "shared",
  workforce: "work",
};

const appRouteFolders = readdirSync(resolve(process.cwd(), "app/app"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe("app route workspace classification", () => {
  it("classifies every top-level app/app route folder explicitly", () => {
    expect(appRouteFolders).toEqual(Object.keys(ROUTE_FOLDER_WORKSPACES).sort());
  });

  it.each(Object.entries(ROUTE_FOLDER_WORKSPACES))(
    "/app/%s resolves to its declared workspace (%s)",
    (folder, workspace) => {
      const expected = workspace === "shared" ? null : workspace;
      expect(getWorkspaceContextForPathname(`/app/${folder}`)).toBe(expected);
      expect(getWorkspaceContextForPathname(`/app/${folder}/nested/route`)).toBe(expected);
    },
  );
});
