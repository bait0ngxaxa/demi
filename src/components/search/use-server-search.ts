"use client";

import { useEffect, useRef, useState } from "react";

import {
  answersRequest,
  createLatestRequestGate,
  listFromPageResult,
  serverSearchKey,
  type ServerSearchList,
  type ServerSearchPageResult,
  type ServerSearchRequest,
} from "./server-search-paging";

export const SERVER_SEARCH_DEBOUNCE_MS = 300;

export type ServerSearchState<T> = {
  query: string;
  trimmedQuery: string;
  /** A new term starts again on page 1. */
  setQuery: (value: string) => void;
  setPage: (page: number) => void;
  retry: () => void;
  /** The current request has its answer (or its failure). */
  answered: boolean;
  /** The page already shown for this search; it stays visible while the next one loads. */
  shown: ServerSearchList<T> | null;
  /** The term is shorter than `minLength`, so nothing was asked. */
  belowMinimum: boolean;
};

/**
 * Server-side search, one page at a time. Only typing is debounced (paging and retrying answer at once), and a
 * response that is no longer current is ignored, so a slow answer for an older term never replaces a newer one.
 */
export function useServerSearch<T>({
  scope,
  search,
  errorMessage,
  minLength = 0,
}: {
  /** What the results belong to (e.g. the Hospital); part of the cache key. */
  scope: string;
  search: (query: string, page: number) => Promise<ServerSearchPageResult<T>>;
  /** Shown when the request itself fails (network, server). */
  errorMessage: string;
  minLength?: number;
}): ServerSearchState<T> {
  const [query, setQueryValue] = useState("");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [list, setList] = useState<ServerSearchList<T> | null>(null);
  const [requestGate] = useState(createLatestRequestGate);
  const lastRequestedKey = useRef<string | null>(null);
  // The latest search function without restarting the effect when a caller passes a new closure each render.
  const searchRef = useRef(search);
  const trimmedQuery = query.trim();
  const belowMinimum = trimmedQuery.length < minLength;
  const key = serverSearchKey(scope, trimmedQuery);
  const request: ServerSearchRequest = { key, requestedPage: page, attempt };
  const answered = !belowMinimum && answersRequest(list, request);
  const shown = !belowMinimum && list !== null && list.key === key ? list : null;

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  useEffect(() => {
    if (belowMinimum) {
      // Invalidate any request still in flight for an earlier term.
      requestGate.start();
      lastRequestedKey.current = null;
      return;
    }

    const requestId = requestGate.start();
    const current: ServerSearchRequest = { key, requestedPage: page, attempt };
    const typing = lastRequestedKey.current !== key && trimmedQuery !== "";
    lastRequestedKey.current = key;
    const timer = setTimeout(
      () => {
        searchRef.current(trimmedQuery, page)
          .catch((): ServerSearchPageResult<T> => ({ status: "ERROR", message: errorMessage }))
          .then((result) => {
            if (!requestGate.isCurrent(requestId)) {
              return;
            }

            setList((previous) => listFromPageResult(previous, current, result));
          });
      },
      typing ? SERVER_SEARCH_DEBOUNCE_MS : 0,
    );

    return () => clearTimeout(timer);
  }, [attempt, belowMinimum, errorMessage, key, page, requestGate, trimmedQuery]);

  return {
    query,
    trimmedQuery,
    setQuery: (value) => {
      setQueryValue(value);
      setPage(1);
    },
    setPage,
    retry: () => setAttempt((value) => value + 1),
    answered,
    shown,
    belowMinimum,
  };
}
