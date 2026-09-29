import type {
  ApplicationNavigationItem,
  ApplicationWorkspaceContext,
} from "./navigation-types";

export function getWorkspaceContextForPathname(pathname: string): ApplicationWorkspaceContext {
  return pathname === "/app/personal" || pathname.startsWith("/app/personal/")
    ? "personal"
    : "work";
}

export function resolveSelectedWorkspaceContext(
  availableContexts: readonly ApplicationWorkspaceContext[],
  requestedContext: ApplicationWorkspaceContext | null,
): ApplicationWorkspaceContext | null {
  if (requestedContext && availableContexts.includes(requestedContext)) {
    return requestedContext;
  }

  if (availableContexts.includes("work")) {
    return "work";
  }

  return availableContexts[0] ?? null;
}

export function isNavigationItemActive(
  pathname: string,
  item: ApplicationNavigationItem,
): boolean {
  return item.match === "exact"
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
