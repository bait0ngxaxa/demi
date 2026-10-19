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
): ApplicationWorkspaceContext | null {
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
): ApplicationWorkspaceContext | null {
  const routeContext = getWorkspaceContextForPathname(pathname);
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
