export type ApplicationWorkspaceContext = "personal" | "work";

export type ApplicationNavigationItem = {
  href: string;
  label: string;
  match: "exact" | "prefix";
  prefetch?: boolean;
  workspaceContext?: ApplicationWorkspaceContext;
};

export type ApplicationNavigationGroup = {
  label: string | null;
  items: readonly ApplicationNavigationItem[];
  workspace?: ApplicationWorkspaceContext | "all";
};
