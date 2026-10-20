import { HospitalStatus, MembershipStatus, Role } from "@prisma/client";

import type {
  ApplicationHospitalWorkspace,
  ApplicationWorkAreaGroup,
  ApplicationWorkspaceAction,
  ApplicationWorkspaceProjection,
} from "@/components/app-shell/application-workspace";
import { getMoreNavigationIcon } from "@/components/app-shell/mobile-navigation-glyph";
import type { MobileNavigationTab } from "@/components/app-shell/mobile-tab-projection";
import type { ActorContext } from "@/modules/auth/types/actor-context";

import type { HomeShortcut } from "./home-shortcut-grid";

export const WORK_HOME_MAX_TILES = 8;

/**
 * The single tile order for every work role. Keys are pathnames (plus the OSM `task` query); a projected
 * action whose key is not listed keeps its projection order after the listed ones. The table only orders
 * what the server projection already allowed; it never adds a destination.
 */
const WORK_HOME_TILE_ORDER: readonly string[] = [
  "/app/patients",
  "/app/patients/assigned?task=screening",
  "/app/patients/assigned?task=followup",
  "/app/patients/provision",
  "/app/patients/activation",
  "/app/workforce",
  "/app/hospitals/reporting",
  "/app/hospitals/reporting/export",
  "/app/hospitals/areas",
  "/app/hospitals/knowledge",
  "/app/hospitals/contact",
  "/app/admin/hospitals",
  "/app/admin/reporting",
  "/app/admin/hospital-onboarding",
];

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

type WorkHomeLink = Pick<ApplicationWorkspaceAction, "href" | "label" | "prefetch">;

function tileKey(href: string): string {
  const [pathname = "", query = ""] = href.split("?");
  const task = new URLSearchParams(query).get("task");
  return task === null ? pathname : `${pathname}?task=${task}`;
}

function tileRank(href: string): number {
  const rank = WORK_HOME_TILE_ORDER.indexOf(tileKey(href));
  return rank === -1 ? WORK_HOME_TILE_ORDER.length : rank;
}

export function projectWorkHomeTiles(links: readonly WorkHomeLink[]): HomeShortcut[] {
  const tiles = links
    .map((link, index) => ({ link, index, rank: tileRank(link.href) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ link }): HomeShortcut => ({
      href: link.href,
      icon: getMoreNavigationIcon(link.href),
      label: link.label,
      ...(link.prefetch === undefined ? {} : { prefetch: link.prefetch }),
    }));

  return tiles.length > WORK_HOME_MAX_TILES
    ? [...tiles.slice(0, WORK_HOME_MAX_TILES - 1), overflowTile]
    : tiles;
}

/** OSM task links reuse the bottom-tab projection instead of restating their destinations. */
export function projectOsmTaskLinks(workTabs: readonly MobileNavigationTab[]): WorkHomeLink[] {
  return workTabs.flatMap(({ activeRoute, accessibleLabel, href }) =>
    href && (activeRoute === "osm-screening" || activeRoute === "osm-followup")
      ? [{ href, label: accessibleLabel }]
      : [],
  );
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
  osmTaskLinks: readonly WorkHomeLink[],
  activeOsmHospitalIds: readonly string[],
  requestedHospitalId: unknown,
): WorkHomeProjection {
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
      tiles: projectWorkHomeTiles([...selected.actions, ...scopeOsmTaskLinks(osmTaskLinks, selected.hospitalId, activeOsmHospitalIds)]),
      sharedActions: [...requestAndSupporting, ...projection.governanceActions],
      unavailableHospitals,
    };
  }

  if (projection.governanceActions.length > 0) {
    return {
      scope: { kind: "system" },
      hero: projection.governanceActions[0] ?? null,
      tiles: projectWorkHomeTiles(projection.governanceActions),
      sharedActions: requestAndSupporting,
      unavailableHospitals,
    };
  }

  return {
    scope: { kind: "none" },
    hero: projection.assignedPatientsAction,
    tiles: projectWorkHomeTiles(osmTaskLinks),
    sharedActions: requestAndSupporting,
    unavailableHospitals,
  };
}
