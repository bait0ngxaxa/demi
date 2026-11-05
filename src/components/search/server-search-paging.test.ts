import { describe, expect, it } from "vitest";

import {
  answersRequest,
  createLatestRequestGate,
  listFromPageResult,
  serverSearchKey,
} from "./server-search-paging";

const OSM_SEARCH_ERROR = "ไม่สามารถค้นหา อสม. ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง";

const candidate = (index: number) => ({
  userId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  contactPhone: null, displayName: "อสม. ชื่อเดียวกัน",
});
const okPage = (page: number, totalPages: number, from: number, to: number) => ({
  status: "OK" as const,
  items: Array.from({ length: to - from + 1 }, (_, index) => candidate(from + index)),
  page,
  totalPages,
  hasPreviousPage: page > 1,
  hasNextPage: page < totalPages,
});
const key = serverSearchKey("hospital-a", "");

describe("Server search paging", () => {
  it("builds a key per hospital and search term", () => {
    expect(serverSearchKey("a", "x")).not.toBe(serverSearchKey("a", "y"));
    expect(serverSearchKey("a", "x")).not.toBe(serverSearchKey("b", "x"));
  });

  it("replaces the shown page with the next one instead of appending", () => {
    const first = listFromPageResult(null, { key, requestedPage: 1, attempt: 0 }, okPage(1, 3, 1, 10));
    const second = listFromPageResult(first, { key, requestedPage: 2, attempt: 0 }, okPage(2, 3, 11, 20));

    expect(second.items.map(({ userId }) => userId)).toEqual(
      Array.from({ length: 10 }, (_, index) => candidate(index + 11).userId),
    );
    expect(second).toMatchObject({ page: 2, totalPages: 3, hasPreviousPage: true, hasNextPage: true, error: null });
  });

  it("shows the page the server clamped to while still answering the requested page", () => {
    const request = { key, requestedPage: 9, attempt: 0 };
    const clamped = listFromPageResult(null, request, okPage(3, 3, 21, 23));

    expect(clamped).toMatchObject({ page: 3, requestedPage: 9, hasNextPage: false });
    expect(answersRequest(clamped, request)).toBe(true);
  });

  it("answers only the exact search, page and attempt it was requested for", () => {
    const list = listFromPageResult(null, { key, requestedPage: 1, attempt: 0 }, okPage(1, 2, 1, 10));

    expect(answersRequest(list, { key, requestedPage: 2, attempt: 0 })).toBe(false);
    expect(answersRequest(list, { key, requestedPage: 1, attempt: 1 })).toBe(false);
    expect(answersRequest(list, { key: serverSearchKey("hospital-a", "สม"), requestedPage: 1, attempt: 0 })).toBe(false);
    expect(answersRequest(null, { key, requestedPage: 1, attempt: 0 })).toBe(false);
  });

  it("keeps the shown page and offers a retry when a later page of the same search fails", () => {
    const first = listFromPageResult(null, { key, requestedPage: 1, attempt: 0 }, okPage(1, 3, 1, 10));
    const failed = listFromPageResult(first, { key, requestedPage: 2, attempt: 0 }, { status: "ERROR", message: OSM_SEARCH_ERROR });

    expect(failed.items).toHaveLength(10);
    expect(failed).toMatchObject({ page: 1, requestedPage: 2, hasNextPage: true, error: OSM_SEARCH_ERROR });
  });

  it("starts a new search with no candidates when its first page fails", () => {
    const shown = listFromPageResult(null, { key, requestedPage: 1, attempt: 0 }, okPage(1, 3, 1, 10));
    const otherKey = serverSearchKey("hospital-a", "สม");

    expect(
      listFromPageResult(shown, { key: otherKey, requestedPage: 1, attempt: 0 }, { status: "ERROR", message: OSM_SEARCH_ERROR }),
    ).toEqual({
      key: otherKey,
      requestedPage: 1,
      attempt: 0,
      items: [],
      page: 1,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false,
      error: OSM_SEARCH_ERROR,
    });
  });

  it("lets only the latest request apply its response", () => {
    const gate = createLatestRequestGate();
    const stale = gate.start();
    const latest = gate.start();

    expect(gate.isCurrent(stale)).toBe(false);
    expect(gate.isCurrent(latest)).toBe(true);
  });
});
