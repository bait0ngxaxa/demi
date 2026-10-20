export type ApplicationWorkspaceContext = "personal" | "work";

/** UI-4 task categories; `navigation-sections.ts` owns their fixed order and Thai labels. */
export type NavigationSectionId =
  | "home"
  | "care"
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
};

export type ApplicationNavigationGroup = {
  id: NavigationSectionId;
  label: string | null;
  items: readonly ApplicationNavigationItem[];
  workspace?: ApplicationWorkspaceContext | "all";
};
