export type ApplicationNavigationItem = {
  href: string;
  label: string;
  match: "exact" | "prefix";
};

export type ApplicationNavigationGroup = {
  label: string | null;
  items: readonly ApplicationNavigationItem[];
};
