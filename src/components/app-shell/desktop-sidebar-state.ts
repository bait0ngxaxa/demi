export const DESKTOP_SIDEBAR_STORAGE_KEY = "demi:desktop-sidebar";

export type DesktopSidebarState = "expanded" | "collapsed";

export const DEFAULT_DESKTOP_SIDEBAR_STATE: DesktopSidebarState = "expanded";

type SidebarPreferenceStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

/** <html data-desktop-sidebar> drives the sidebar width in CSS (`.app-desktop-sidebar`). */
export const DESKTOP_SIDEBAR_ROOT_ATTRIBUTE = "data-desktop-sidebar";

/** Runs before paint; storage failures leave the default expanded width. */
export const DESKTOP_SIDEBAR_PREPAINT_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(DESKTOP_SIDEBAR_STORAGE_KEY)})==="collapsed")document.documentElement.setAttribute(${JSON.stringify(DESKTOP_SIDEBAR_ROOT_ATTRIBUTE)},"collapsed")}catch(e){}`;

export function applyDesktopSidebarRootState(root: Pick<Element, "setAttribute">, state: DesktopSidebarState): void {
  root.setAttribute(DESKTOP_SIDEBAR_ROOT_ATTRIBUTE, state);
}

export function parseDesktopSidebarPreference(value: string | null): DesktopSidebarState {
  return value === "collapsed" || value === "expanded"
    ? value
    : DEFAULT_DESKTOP_SIDEBAR_STATE;
}

export function readDesktopSidebarPreference(
  storage: Pick<SidebarPreferenceStorage, "getItem">,
): DesktopSidebarState {
  try {
    return parseDesktopSidebarPreference(storage.getItem(DESKTOP_SIDEBAR_STORAGE_KEY));
  } catch {
    return DEFAULT_DESKTOP_SIDEBAR_STATE;
  }
}

export function writeDesktopSidebarPreference(
  storage: Pick<SidebarPreferenceStorage, "setItem">,
  state: DesktopSidebarState,
): void {
  try {
    storage.setItem(DESKTOP_SIDEBAR_STORAGE_KEY, state);
  } catch {
    // The in-memory shell state remains usable when browser storage is unavailable.
  }
}

export function toggleDesktopSidebarState(state: DesktopSidebarState): DesktopSidebarState {
  return state === "expanded" ? "collapsed" : "expanded";
}

export function getDesktopSidebarToggleLabel(state: DesktopSidebarState): string {
  return state === "expanded" ? "ย่อเมนู" : "ขยายเมนู";
}
