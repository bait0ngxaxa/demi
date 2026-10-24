import { describe, expect, it } from "vitest";

import {
  appendPage,
  createLatestRequestGate,
  listFromFirstPage,
  osmCandidateListKey,
  OSM_SEARCH_ERROR,
} from "./osm-candidate-paging";

const candidate = (index: number) => ({
  userId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  contactPhone: null, displayName: "อสม. ชื่อเดียวกัน",
});
const page = (from: number, to: number, nextCursor: string | null) => ({
  status: "OK" as const,
  candidates: Array.from({ length: to - from + 1 }, (_, index) => candidate(from + index)),
  hasMore: nextCursor !== null,
  nextCursor,
});
const key = osmCandidateListKey("hospital-a", "");

describe("OSM candidate paging", () => {
  it("builds a key per hospital and search term", () => {
    expect(osmCandidateListKey("a", "x")).not.toBe(osmCandidateListKey("a", "y"));
    expect(osmCandidateListKey("a", "x")).not.toBe(osmCandidateListKey("b", "x"));
  });

  it("appends later pages in order without duplicates and ends without a cursor", () => {
    const first = listFromFirstPage(key, page(1, 25, candidate(25).userId));
    const second = appendPage(first, key, page(25, 40, null));

    expect(second?.candidates.map(({ userId }) => userId)).toEqual(
      Array.from({ length: 40 }, (_, index) => candidate(index + 1).userId),
    );
    expect(second).toMatchObject({ hasMore: false, nextCursor: null, error: null });
  });

  it("drops a page that belongs to an earlier search or hospital", () => {
    const current = listFromFirstPage(osmCandidateListKey("hospital-a", "สม"), page(1, 3, null));

    expect(appendPage(current, key, page(4, 6, null))).toBe(current);
    expect(appendPage(null, key, page(4, 6, null))).toBeNull();
  });

  it("keeps the shown candidates and offers a retry when a later page fails", () => {
    const first = listFromFirstPage(key, page(1, 25, candidate(25).userId));
    const failed = appendPage(first, key, { status: "ERROR", message: OSM_SEARCH_ERROR });

    expect(failed?.candidates).toHaveLength(25);
    expect(failed).toMatchObject({ error: OSM_SEARCH_ERROR, hasMore: true, nextCursor: candidate(25).userId });
  });

  it("starts a new search with no candidates and no cursor when the first page fails", () => {
    expect(listFromFirstPage(key, { status: "ERROR", message: OSM_SEARCH_ERROR })).toEqual({
      key,
      candidates: [],
      nextCursor: null,
      hasMore: false,
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
