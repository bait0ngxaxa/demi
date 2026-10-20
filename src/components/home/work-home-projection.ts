import { HospitalStatus, MembershipStatus, Role } from "@prisma/client";

import type {
  ApplicationHospitalWorkspace,
  ApplicationWorkAreaGroup,
  ApplicationWorkspaceAction,
  ApplicationWorkspaceProjection,
} from "@/components/app-shell/application-workspace";
import { getMoreNavigationIcon } from "@/components/app-shell/mobile-navigation-glyph";
import { compareNavigationSections } from "@/components/app-shell/navigation-sections";
import type { ApplicationNavigationGroup } from "@/components/app-shell/navigation-types";
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
  /** Actions that resolve the actor's full permitted scope, so they never belong to one Hospital's grid. */
  sharedActions: readonly ApplicationWorkspaceAction[];
  /** Projected Hospitals that are not selectable work areas; shown with their status and no actions. */
  unavailableHospitals: readonly ApplicationHospitalWorkspace[];
};

type WorkHomeLink = Pick<ApplicationWorkspaceAction, "href" | "label" | "prefetch"> & { description?: string };

function tileKey(href: string): string {
  const [pathname = "", query = ""] = href.split("?");
  const task = new URLSearchParams(query).get("task");
  return task === null ? pathname : `${pathname}?task=${task}`;
}

/**
 * UI-4: the tile order is the Work navigation order (NAVIGATION_SECTION_ORDER, then item order), keyed by pathname
 * plus the OSM `task` query. It only orders what the server projection already allowed; it never adds a destination.
 */
export function projectWorkNavigationOrder(navigation: readonly ApplicationNavigationGroup[]): string[] {
  return navigation
    .filter(({ workspace }) => workspace === undefined || workspace === "all" || workspace === "work")
    .sort((left, right) => compareNavigationSections(left.id, right.id))
    .flatMap(({ items }) => items.map(({ href }) => tileKey(href)));
}

export function projectWorkHomeTiles(links: readonly WorkHomeLink[], navigationOrder: readonly string[]): HomeShortcut[] {
  const tileRank = (href: string): number => {
    const rank = navigationOrder.indexOf(tileKey(href));
    return rank === -1 ? navigationOrder.length : rank;
  };
  const tiles = links
    .map((link, index) => ({ link, index, rank: tileRank(link.href) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ link }): HomeShortcut => ({
      href: link.href,
      icon: getMoreNavigationIcon(link.href),
      label: link.label,
      ...(link.description === undefined ? {} : { description: link.description }),
      ...(link.prefetch === undefined ? {} : { prefetch: link.prefetch }),
    }));

  return tiles.length > WORK_HOME_MAX_TILES
    ? [...tiles.slice(0, WORK_HOME_MAX_TILES - 1), overflowTile]
    : tiles;
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

  if (selected) {
    return {
      scope: { kind: "hospital", hospital: selected, groups: projection.areaGroups },
      hero: selected.actions.find(({ category }) => category === "care") ?? projection.assignedPatientsAction,
      tiles: projectWorkHomeTiles([...selected.actions, ...scopeOsmTaskLinks(osmTaskLinks, selected.hospitalId, activeOsmHospitalIds)], navigationOrder),
      sharedActions: [...requestAndSupporting, ...projection.governanceActions],
      unavailableHospitals,
    };
  }

  if (projection.governanceActions.length > 0) {
    return {
      scope: { kind: "system" },
      hero: projection.governanceActions[0] ?? null,
      tiles: projectWorkHomeTiles(projection.governanceActions, navigationOrder),
      sharedActions: requestAndSupporting,
      unavailableHospitals,
    };
  }

  return {
    scope: { kind: "none" },
    hero: projection.assignedPatientsAction,
    tiles: projectWorkHomeTiles(osmTaskLinks, navigationOrder),
    sharedActions: requestAndSupporting,
    unavailableHospitals,
  };
}
