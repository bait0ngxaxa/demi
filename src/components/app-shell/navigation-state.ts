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
    ["/app/admin", "/app/hospitals", "/app/patients", "/app/workforce"].some((basePath) =>
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

export function isNavigationItemActive(
  pathname: string,
  item: ApplicationNavigationItem,
): boolean {
  return item.match === "exact"
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
