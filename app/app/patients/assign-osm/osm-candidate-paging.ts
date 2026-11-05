import type { PatientOsmCandidate } from "@/modules/patient-assignment/services/patient-osm-assignment-query-service";
import type { PatientOsmBulkCandidateSearchResult } from "@/modules/patient-assignment/transport/action-state";

export const OSM_SEARCH_ERROR = "ไม่สามารถค้นหา อสม. ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง";

/** What one picker request asks for; a response is shown only while it still answers this. */
export type OsmCandidateRequest = {
  /** Hospital and search term; a list for another key is never shown. */
  key: string;
  requestedPage: number;
  /** Retry counter, so a retry of the same page is a new request. */
  attempt: number;
};

/** One page of OSM candidates, replaced (never appended) by the next page's response. */
export type OsmCandidateList = OsmCandidateRequest & {
  candidates: PatientOsmCandidate[];
  /** The page the server answered, clamped to the last page. */
  page: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  error: string | null;
};

export function osmCandidateListKey(hospitalId: string, trimmedQuery: string): string {
  return `${hospitalId}\n${trimmedQuery}`;
}

export function answersRequest(list: OsmCandidateList | null, request: OsmCandidateRequest): boolean {
  return (
    list !== null &&
    list.key === request.key &&
    list.requestedPage === request.requestedPage &&
    list.attempt === request.attempt
  );
}

/**
 * The page a response shows. A failed page of the same search keeps the page already shown so the
 * owner can retry; a failure for a new search shows no candidates.
 */
export function listFromPageResult(
  previous: OsmCandidateList | null,
  request: OsmCandidateRequest,
  result: PatientOsmBulkCandidateSearchResult,
): OsmCandidateList {
  if (result.status === "OK") {
    return {
      ...request,
      candidates: result.candidates,
      page: result.page,
      totalPages: result.totalPages,
      hasPreviousPage: result.hasPreviousPage,
      hasNextPage: result.hasNextPage,
      error: null,
    };
  }

  if (previous && previous.key === request.key) {
    return { ...previous, ...request, error: result.message };
  }

  return {
    ...request,
    candidates: [],
    page: 1,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
    error: result.message,
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
