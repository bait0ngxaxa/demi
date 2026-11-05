import type { ServerSearchPageResult } from "@/shared/search/server-search-result";

export type { ServerSearchPageResult };

/** What one search request asks for; a response is shown only while it still answers this. */
export type ServerSearchRequest = {
  /** Scope and search term; a list for another key is never shown. */
  key: string;
  requestedPage: number;
  /** Retry counter, so a retry of the same page is a new request. */
  attempt: number;
};

/** One page of results, replaced (never appended) by the next page's response. */
export type ServerSearchList<T> = ServerSearchRequest & {
  items: T[];
  page: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  error: string | null;
};

export function serverSearchKey(scope: string, trimmedQuery: string): string {
  return `${scope}\n${trimmedQuery}`;
}

export function answersRequest<T>(list: ServerSearchList<T> | null, request: ServerSearchRequest): boolean {
  return (
    list !== null &&
    list.key === request.key &&
    list.requestedPage === request.requestedPage &&
    list.attempt === request.attempt
  );
}

/**
 * The page a response shows. A failed page of the same search keeps the page already shown so the
 * user can retry; a failure for a new search shows no results.
 */
export function listFromPageResult<T>(
  previous: ServerSearchList<T> | null,
  request: ServerSearchRequest,
  result: ServerSearchPageResult<T>,
): ServerSearchList<T> {
  if (result.status === "OK") {
    return {
      ...request,
      items: result.items,
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
    items: [],
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
