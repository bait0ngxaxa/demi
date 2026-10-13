import type { PatientOsmCandidate } from "@/modules/patient-assignment/services/patient-osm-assignment-query-service";
import type { PatientOsmBulkCandidateSearchResult } from "@/modules/patient-assignment/transport/action-state";

export const OSM_SEARCH_ERROR = "ไม่สามารถค้นหา อสม. ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง";

export type OsmCandidateList = {
  /** Hospital and search term this list answers; a list for another key is never shown. */
  key: string;
  candidates: PatientOsmCandidate[];
  nextCursor: string | null;
  hasMore: boolean;
  error: string | null;
};

export function osmCandidateListKey(hospitalId: string, trimmedQuery: string): string {
  return `${hospitalId}\n${trimmedQuery}`;
}

/** The first page replaces everything: a new hospital or search starts with no cursor. */
export function listFromFirstPage(
  key: string,
  result: PatientOsmBulkCandidateSearchResult,
): OsmCandidateList {
  return result.status === "OK"
    ? {
        key,
        candidates: result.candidates,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
        error: null,
      }
    : { key, candidates: [], nextCursor: null, hasMore: false, error: result.message };
}

/**
 * Appends a later page without duplicates. A page for another key (the user searched
 * again meanwhile) or for no list at all is dropped; a failed page keeps what is shown.
 */
export function appendPage(
  previous: OsmCandidateList | null,
  key: string,
  result: PatientOsmBulkCandidateSearchResult,
): OsmCandidateList | null {
  if (!previous || previous.key !== key) {
    return previous;
  }

  if (result.status !== "OK") {
    return { ...previous, error: result.message };
  }

  const seen = new Set(previous.candidates.map(({ userId }) => userId));

  return {
    ...previous,
    candidates: [
      ...previous.candidates,
      ...result.candidates.filter(({ userId }) => !seen.has(userId)),
    ],
    nextCursor: result.nextCursor,
    hasMore: result.hasMore,
    error: null,
  };
}

/** Only the most recently started request may apply its response. */
export function createLatestRequestGate(): { start: () => number; isCurrent: (token: number) => boolean } {
  let latest = 0;

  return {
    start: () => {
      latest += 1;
      return latest;
    },
    isCurrent: (token) => token === latest,
  };
}
