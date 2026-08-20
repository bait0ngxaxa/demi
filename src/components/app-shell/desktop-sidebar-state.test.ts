import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_DESKTOP_SIDEBAR_STATE,
  DESKTOP_SIDEBAR_STORAGE_KEY,
  getDesktopSidebarToggleLabel,
  parseDesktopSidebarPreference,
  readDesktopSidebarPreference,
  toggleDesktopSidebarState,
  writeDesktopSidebarPreference,
} from "./desktop-sidebar-state";

describe("desktop sidebar state", () => {
  it("defaults to expanded when no valid preference exists", () => {
    expect(DEFAULT_DESKTOP_SIDEBAR_STATE).toBe("expanded");
    expect(parseDesktopSidebarPreference(null)).toBe("expanded");
    expect(parseDesktopSidebarPreference("invalid")).toBe("expanded");
    expect(readDesktopSidebarPreference({ getItem: () => "invalid" })).toBe("expanded");
  });

  it("toggles from expanded to collapsed and back", () => {
    const collapsed = toggleDesktopSidebarState("expanded");

    expect(collapsed).toBe("collapsed");
    expect(toggleDesktopSidebarState(collapsed)).toBe("expanded");
  });

  it("provides Thai action labels for both accessibility states", () => {
    expect(getDesktopSidebarToggleLabel("expanded")).toBe("ย่อเมนู");
    expect(getDesktopSidebarToggleLabel("collapsed")).toBe("ขยายเมนู");
  });

  it("reads and writes the stable DEMI preference key", () => {
    const getItem = vi.fn(() => "collapsed");
    const setItem = vi.fn();

    expect(readDesktopSidebarPreference({ getItem })).toBe("collapsed");
    expect(getItem).toHaveBeenCalledWith(DESKTOP_SIDEBAR_STORAGE_KEY);

    writeDesktopSidebarPreference({ setItem }, "expanded");
    expect(setItem).toHaveBeenCalledWith(DESKTOP_SIDEBAR_STORAGE_KEY, "expanded");
  });

  it("fails safely when browser storage is unavailable", () => {
    const getItem = vi.fn(() => {
      throw new Error("storage unavailable");
    });
    const setItem = vi.fn(() => {
      throw new Error("storage unavailable");
    });

    expect(readDesktopSidebarPreference({ getItem })).toBe("expanded");
    expect(() => writeDesktopSidebarPreference({ setItem }, "collapsed")).not.toThrow();
  });
});
