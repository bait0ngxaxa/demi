import type { ApplicationWorkspaceContext, NavigationSectionId } from "./navigation-types";

/**
 * UI-4 single source of truth for navigation task categories. Every surface (desktop sidebar, mobile More,
 * Work Home grid) renders sections in this order; `account` is last and the sidebar pins it to the bottom.
 */
export const NAVIGATION_SECTION_ORDER: readonly NavigationSectionId[] = [
  "home",
  "care",
  "health-records",
  "registration",
  "review-queue",
  "reports-info",
  "administration",
  "account",
];

/** Who the administration section serves; an actor may hold both Hospital and platform governance tools. */
export type NavigationAdministrationScope = "hospital" | "platform" | "both";

export function getNavigationSectionLabel(
  id: NavigationSectionId,
  workspace: ApplicationWorkspaceContext,
  administrationScope: NavigationAdministrationScope = "hospital",
): string | null {
  switch (id) {
    case "home":
      return null;
    case "care":
      return workspace === "personal" ? "การดูแลของฉัน" : "ดูแลผู้ป่วย";
    case "health-records":
      return "บันทึกสุขภาพ";
    case "registration":
      return "ลงทะเบียนผู้ป่วย";
    case "review-queue":
      return "คำขอรอตรวจ";
    case "reports-info":
      return workspace === "personal" ? "ข่าวสารและความรู้" : "รายงานและข้อมูล";
    case "administration":
      return administrationScope === "platform"
        ? "กำกับดูแล"
        : administrationScope === "both"
          ? "บริหารโรงพยาบาลและกำกับดูแล"
          : "บริหารโรงพยาบาล";
    case "account":
      return "บัญชีและช่วยเหลือ";
  }
}

export function compareNavigationSections(left: NavigationSectionId, right: NavigationSectionId): number {
  return NAVIGATION_SECTION_ORDER.indexOf(left) - NAVIGATION_SECTION_ORDER.indexOf(right);
}
