import type { ApplicationNavigationItem } from "./navigation-types";

export function isNavigationItemActive(
  pathname: string,
  item: ApplicationNavigationItem,
): boolean {
  return item.match === "exact"
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
