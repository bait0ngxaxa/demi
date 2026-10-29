import type { MobileNavigationTab } from "./mobile-tab-projection";

const assignedPatientPath = "/app/patients/assigned";
const patientDirectoryPath = "/app/patients";
const patientDetailStaticSegments = new Set([
  "assigned",
  "activation",
  "provision",
  "service-catalog",
  "service-requests",
]);

function normalizePathname(pathname: string): string {
  if (pathname === "/") {
    return pathname;
  }

  return pathname.replace(/\/+$/, "");
}

function isPathWithin(pathname: string, basePath: string): boolean {
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

function findTabById(
  tabs: readonly MobileNavigationTab[],
  id: string,
): MobileNavigationTab | undefined {
  return tabs.find((tab) => tab.id === id && tab.href !== null);
}

function resolveAssignedTaskTab(
  search: string,
  tabs: readonly MobileNavigationTab[],
): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const taskModes = params.getAll("task");

  if (taskModes.length !== 1) {
    return null;
  }

  if (taskModes[0] === "screening" && findTabById(tabs, "screening")) {
    return "screening";
  }

  if (taskModes[0] === "followup" && findTabById(tabs, "followup")) {
    return "followup";
  }

  return null;
}

function isPatientDetailPath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);

  return (
    segments[0] === "app" &&
    segments[1] === "patients" &&
    segments.length >= 3 &&
    !patientDetailStaticSegments.has(segments[2])
  );
}

function resolvePatientDetailTab(
  pathname: string,
  tabs: readonly MobileNavigationTab[],
): string | null {
  if (!isPatientDetailPath(pathname)) {
    return null;
  }

  const segments = pathname.split("/").filter(Boolean);
  if (segments.includes("appointments") && findTabById(tabs, "appointments")) {
    return "appointments";
  }
  if (segments.includes("screenings") && findTabById(tabs, "screening")) {
    return "screening";
  }

  if (segments.includes("followups") && findTabById(tabs, "followup")) {
    return "followup";
  }

  return findTabById(tabs, "patients")?.id ?? null;
}

function resolveNavigationItemTab(
  pathname: string,
  tabs: readonly MobileNavigationTab[],
): string | null {
  const matchingTabs = tabs.filter(
    (tab) =>
      tab.href !== null &&
      tab.activeRoute === "navigation-item" &&
      (tab.match === "exact"
        ? pathname === tab.href
        : isPathWithin(pathname, tab.href)),
  );
  matchingTabs.sort((left, right) => (right.href?.length ?? 0) - (left.href?.length ?? 0));

  return matchingTabs[0]?.id ?? null;
}

export function resolveActiveMobileTabId(
  requestedPathname: string,
  search: string,
  tabs: readonly MobileNavigationTab[],
): string | null {
  const pathname = normalizePathname(requestedPathname);
  const moreTab = tabs.find((tab) => tab.id === "more");
  if (moreTab?.href && isPathWithin(pathname, moreTab.href)) {
    return moreTab.id;
  }

  if (pathname === assignedPatientPath) {
    return resolveAssignedTaskTab(search, tabs) ?? findTabById(tabs, "patients")?.id ?? null;
  }

  const personalHome = tabs.find(
    (tab) => tab.href === "/app/personal" && tab.activeRoute === "personal-home",
  );
  if (pathname === "/app/personal" && personalHome) {
    return personalHome.id;
  }

  const patientDirectoryTab = findTabById(tabs, "patients");
  if (pathname === patientDirectoryPath) {
    return patientDirectoryTab?.activeRoute === "patient-detail" ? patientDirectoryTab.id : null;
  }

  const patientDetailTab = resolvePatientDetailTab(pathname, tabs);
  if (patientDetailTab) {
    return patientDetailTab;
  }

  return resolveNavigationItemTab(pathname, tabs);
}
