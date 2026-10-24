import type { CustomerMenuId } from "./customer-navigation";

export type ApplicationWorkspaceContext = "personal" | "work";

/**
 * UI-4 task categories; `navigation-sections.ts` owns their fixed order and Thai labels.
 * UI-01: `primary` (bottom menu) and `top-menu` hold the customer menus (`customer-navigation.ts`).
 */
export type NavigationSectionId =
  | "primary"
  | "top-menu"
  | "home"
  | "care"
  | "care-tasks"
  | "health-records"
  | "registration"
  | "review-queue"
  | "reports-info"
  | "administration"
  | "account";

export type ApplicationNavigationItem = {
  href: string;
  label: string;
  match: "exact" | "prefix";
  prefetch?: boolean;
  badgeCount?: number;
  /** UI-01: set on customer menu items only; their icon and mobile tab follow the menu entry, not the href. */
  menuId?: CustomerMenuId;
};

export type ApplicationNavigationGroup = {
  id: NavigationSectionId;
  label: string | null;
  items: readonly ApplicationNavigationItem[];
  workspace?: ApplicationWorkspaceContext | "all";
};
