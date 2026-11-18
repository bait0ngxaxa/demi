import { HospitalStatus, MembershipStatus, Role } from "@prisma/client";

import type {
  ApplicationHospitalWorkspace,
  ApplicationWorkAreaGroup,
  ApplicationWorkspaceAction,
  ApplicationWorkspaceProjection,
} from "@/components/app-shell/application-workspace";
import { getMoreNavigationIcon } from "@/components/app-shell/mobile-navigation-glyph";
import { compareNavigationSections } from "@/components/app-shell/navigation-sections";
import type { ApplicationNavigationGroup, NavigationSectionId } from "@/components/app-shell/navigation-types";
import type { ActorContext } from "@/modules/auth/types/actor-context";

import type { HomeShortcut } from "./home-shortcut-grid";

export const WORK_HOME_MAX_TILES = 8;

const overflowTile: HomeShortcut = { href: "/app/more", icon: "more", label: "ทั้งหมด" };

export type WorkHomeScope =
  | { kind: "hospital"; hospital: ApplicationHospitalWorkspace; groups: readonly ApplicationWorkAreaGroup[] }
  | { kind: "system" }
  | { kind: "none" };

export type WorkHomeProjection = {
  scope: WorkHomeScope;
  /** Primary action for the selected scope: a link only, never a count. */
  hero: ApplicationWorkspaceAction | null;
  tiles: readonly HomeShortcut[];
  toolGroups: readonly WorkHomeToolGroup[];
  /** Actions that resolve the actor's full permitted scope, so they never belong to one Hospital's grid. */
  sharedActions: readonly ApplicationWorkspaceAction[];
  /** Projected Hospitals that are not selectable work areas; shown with their status and no actions. */
  unavailableHospitals: readonly ApplicationHospitalWorkspace[];
};

type WorkHomeLink = Pick<ApplicationWorkspaceAction, "href" | "label" | "prefetch"> & { description?: string };
type WorkHomeToolGroup = { id: NavigationSectionId; label: string; tools: HomeShortcut[] };

function tileKey(href: string): string {
  const [pathname = "", query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  // Network reporting is a separate action; it must not inherit the own-report tile's pinned priority.
  if (pathname === "/app/hospitals/reporting" && params.get("scope") === "network") return `${pathname}?scope=network`;
  const task = params.get("task");
  return task === null ? pathname : `${pathname}?task=${task}`;
}

/**
 * Home prioritizes core care and OWNER reporting/user administration/publishing before remaining navigation items.
 * The order only ranks links already allowed by the projection; it never adds a destination.
 */
export function projectWorkNavigationOrder(navigation: readonly ApplicationNavigationGroup[]): string[] {
  const navigationOrder = navigation
    .filter(({ workspace }) => workspace === undefined || workspace === "all" || workspace === "work")
    .sort((left, right) => compareNavigationSections(left.id, right.id))
    .flatMap(({ items }) => items.map(({ href }) => tileKey(href)));
  const priority = [
    "/app/appointments",
    "/app/patients",
    "/app/hospitals/reporting",
    "/app/users",
    "/app/hospitals/knowledge",
    "/app/services",
    "/app/appointments/new",
  ];
  return [
    ...priority.filter((href) => navigationOrder.includes(href)),
    ...navigationOrder.filter((href) => !priority.includes(href)),
  ];
}

function rankWorkHomeTiles(links: readonly WorkHomeLink[], navigationOrder: readonly string[]): HomeShortcut[] {
  const tileRank = (href: string): number => {
    const rank = navigationOrder.indexOf(tileKey(href));
    return rank === -1 ? navigationOrder.length : rank;
  };
  return links
    .map((link, index) => ({ link, index, rank: tileRank(link.href) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ link }): HomeShortcut => ({
      href: link.href,
      icon: getMoreNavigationIcon(link.href),
      label: link.label,
      ...(link.description === undefined ? {} : { description: link.description }),
      ...(link.prefetch === undefined ? {} : { prefetch: link.prefetch }),
    }));
}

function capWorkHomeTiles(tiles: HomeShortcut[]): HomeShortcut[] {
  return tiles.length > WORK_HOME_MAX_TILES
    ? [...tiles.slice(0, WORK_HOME_MAX_TILES - 1), overflowTile]
    : tiles;
}

export function projectWorkHomeTiles(links: readonly WorkHomeLink[], navigationOrder: readonly string[]): HomeShortcut[] {
  return capWorkHomeTiles(rankWorkHomeTiles(links, navigationOrder));
}

export function projectWorkHomeToolGroups(
  tiles: readonly HomeShortcut[],
  navigation: readonly ApplicationNavigationGroup[],
): WorkHomeToolGroup[] {
  const sectionByTile = new Map<string, ApplicationNavigationGroup>();
  for (const group of navigation) {
    if (group.workspace !== "work" && group.workspace !== "all") continue;
    for (const item of group.items) {
      const key = tileKey(item.href);
      if (!sectionByTile.has(key)) sectionByTile.set(key, group);
    }
  }

  const groups = new Map<NavigationSectionId, WorkHomeToolGroup>();
  // The primary navigation section has no heading and is never rendered as a tool group.
  const other: WorkHomeToolGroup = { id: "primary", label: "อื่น ๆ", tools: [] };
  for (const tile of tiles) {
    const key = tileKey(tile.href);
    if (key === overflowTile.href) continue;
    const section = sectionByTile.get(key);
    if (!section) {
      other.tools.push(tile);
      continue;
    }
    if (section.id === "home" || section.label === null) continue;
    const group = groups.get(section.id) ?? { id: section.id, label: section.label, tools: [] };
    group.tools.push(tile);
    groups.set(section.id, group);
  }

  const ordered = [...groups.values()].sort((left, right) => compareNavigationSections(left.id, right.id));
  return other.tools.length > 0 ? [...ordered, other] : ordered;
}

/** OSM task links are the navigation's own task items instead of restated destinations. */
export function projectOsmTaskLinks(navigation: readonly ApplicationNavigationGroup[]): WorkHomeLink[] {
  return navigation
    .filter(({ workspace }) => workspace === "work")
    .flatMap(({ items }) => items)
    .filter(({ href }) => tileKey(href).startsWith("/app/patients/assigned?task="))
    .map(({ href, label, prefetch }) => ({ href, label, ...(prefetch === undefined ? {} : { prefetch }) }));
}

/** Hospitals where the actor currently works as an OSM; OSM task tiles belong only to these. */
export function projectActiveOsmHospitalIds(actor: ActorContext): string[] {
  if (!actor.roles.includes(Role.OSM)) return [];
  return actor.osmHospitalRelationships
    .filter(({ status, hospitalStatus }) => status === MembershipStatus.ACTIVE && hospitalStatus === HospitalStatus.ACTIVE)
    .map(({ hospitalId }) => hospitalId);
}

/**
 * The grid holds only actions scoped to the selected Hospital, so OSM task links appear only where the actor
 * is an active OSM and carry that Hospital as a narrowing locator for the assigned directory.
 */
function scopeOsmTaskLinks(
  osmTaskLinks: readonly WorkHomeLink[],
  hospitalId: string,
  activeOsmHospitalIds: readonly string[],
): WorkHomeLink[] {
  if (!activeOsmHospitalIds.includes(hospitalId)) return [];
  return osmTaskLinks.map((link) => ({ ...link, href: `${link.href}${link.href.includes("?") ? "&" : "?"}hospitalId=${encodeURIComponent(hospitalId)}` }));
}

/**
 * ADR-0013 §2: the requested `hospitalId` is only a locator among the actor's active direct work areas
 * (`areaGroups`). Anything else falls back to the first candidate in the projection's sort order.
 * Selecting a Hospital never adds rights; every destination re-checks access on the server.
 */
export function projectWorkHome(
  projection: ApplicationWorkspaceProjection,
  navigation: readonly ApplicationNavigationGroup[],
  activeOsmHospitalIds: readonly string[],
  requestedHospitalId: unknown,
): WorkHomeProjection {
  const osmTaskLinks = projectOsmTaskLinks(navigation);
  const navigationOrder = projectWorkNavigationOrder(navigation);
  const candidateIds = projection.areaGroups.flatMap(({ hospitals }) => hospitals.map(({ hospitalId }) => hospitalId));
  const requested = typeof requestedHospitalId === "string" ? requestedHospitalId.toLowerCase() : null;
  const selectedId = candidateIds.find((hospitalId) => hospitalId === requested) ?? candidateIds[0];
  const selected = projection.hospitals.find(({ hospitalId }) => hospitalId === selectedId);
  const unavailableHospitals = projection.hospitals.filter(({ hospitalId }) => !candidateIds.includes(hospitalId));
  const requestAndSupporting = [...projection.requestActions, ...projection.supportingActions];
  const links = selected
    ? [...selected.actions, ...scopeOsmTaskLinks(osmTaskLinks, selected.hospitalId, activeOsmHospitalIds)]
    : projection.governanceActions.length > 0 ? projection.governanceActions : osmTaskLinks;
  const rankedTiles = rankWorkHomeTiles(links, navigationOrder);
  const tiles = capWorkHomeTiles(rankedTiles);
  const toolGroups = projectWorkHomeToolGroups(rankedTiles, navigation);

  if (selected) {
    const patientDirectoryAction = selected.actions.find(({ href }) => {
      const [pathname = "", query = ""] = href.split("?", 2);
      return pathname === "/app/patients" && !new URLSearchParams(query).has("task");
    });

    return {
      scope: { kind: "hospital", hospital: selected, groups: projection.areaGroups },
      hero: patientDirectoryAction ?? selected.actions.find(({ category }) => category === "care") ?? projection.assignedPatientsAction,
      tiles,
      toolGroups,
      sharedActions: [...requestAndSupporting, ...projection.governanceActions],
      unavailableHospitals,
    };
  }

  if (projection.governanceActions.length > 0) {
    return {
      scope: { kind: "system" },
      hero: projection.governanceActions[0] ?? null,
      tiles,
      toolGroups,
      sharedActions: requestAndSupporting,
      unavailableHospitals,
    };
  }

  return {
    scope: { kind: "none" },
    hero: projection.assignedPatientsAction,
    tiles,
    toolGroups,
    sharedActions: requestAndSupporting,
    unavailableHospitals,
  };
}
