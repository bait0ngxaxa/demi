import type {
  ApplicationNavigationItem,
  ApplicationWorkspaceContext,
} from "./navigation-types";

function normalizePathname(pathname: string): string {
  const path = pathname.split("?")[0] ?? "";
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function isPathWithin(pathname: string, basePath: string): boolean {
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

export function getWorkspaceContextForPathname(
  pathname: string,
  search = "",
): ApplicationWorkspaceContext | null {
  const pathnameSearch = pathname.includes("?") ? pathname.slice(pathname.indexOf("?")) : "";
  const normalizedPathname = normalizePathname(pathname);

  if (isPathWithin(normalizedPathname, "/app/personal")) {
    return "personal";
  }

  if (
    normalizedPathname === "/app" ||
    ["/app/admin", "/app/appointments", "/app/hospitals", "/app/patients", "/app/services", "/app/users", "/app/workforce"].some((basePath) =>
      isPathWithin(normalizedPathname, basePath),
    )
  ) {
    return "work";
  }

  if (normalizedPathname === "/app/more") {
    const params = new URLSearchParams(search || pathnameSearch);
    const requestedWorkspaces = params.getAll("workspace");
    const requestedWorkspace = requestedWorkspaces.length === 1 ? requestedWorkspaces[0] : null;
    return requestedWorkspace === "personal" || requestedWorkspace === "work"
      ? requestedWorkspace
      : null;
  }

  return null;
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

export function resolveWorkspaceContextForPathname(
  pathname: string,
  availableContexts: readonly ApplicationWorkspaceContext[],
  previouslySelectedContext: ApplicationWorkspaceContext | null,
  search = "",
): ApplicationWorkspaceContext | null {
  const routeContext = getWorkspaceContextForPathname(pathname, search);
  return resolveSelectedWorkspaceContext(
    availableContexts,
    routeContext ?? previouslySelectedContext,
  );
}

/** An item's own query (e.g. `?task=screening`) must match the current URL; other current params are ignored. */
export function isNavigationItemActive(
  pathname: string,
  item: ApplicationNavigationItem,
  search = "",
): boolean {
  const [path = "", query = ""] = item.href.split("?");
  const current = new URLSearchParams(search);
  if (![...new URLSearchParams(query)].every(([key, value]) => current.get(key) === value)) {
    return false;
  }

  return item.match === "exact"
    ? pathname === path
    : pathname === path || pathname.startsWith(`${path}/`);
}

/** The active hrefs, preferring the item with the more specific query when several share one path. */
export function resolveActiveNavigationHrefs(
  pathname: string,
  search: string,
  items: readonly ApplicationNavigationItem[],
): ReadonlySet<string> {
  const active = items.filter((item) => isNavigationItemActive(pathname, item, search));
  const specificity = (href: string): number => [...new URLSearchParams(href.split("?")[1] ?? "")].length;
  const pathOf = (href: string): string => href.split("?")[0] ?? href;

  return new Set(active
    .filter((item) => !active.some((other) =>
      pathOf(other.href) === pathOf(item.href) && specificity(other.href) > specificity(item.href)))
    .map(({ href }) => href));
}
