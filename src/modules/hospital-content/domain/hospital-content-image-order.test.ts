import { describe, expect, it } from "vitest";

import { HOSPITAL_CONTENT_IMAGE_MAX_SORT_ORDER, planHospitalContentImageReorder } from "./hospital-content";

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]));
}

/** Replays the moves against a unique (sortOrder) index and returns the final order. */
function apply(current: readonly string[], desired: readonly string[]): string[] {
  const slots = new Map(current.map((id, index) => [id, index] as const));
  for (const move of planHospitalContentImageReorder(current, desired)) {
    expect(move.sortOrder).toBeGreaterThanOrEqual(0);
    expect(move.sortOrder).toBeLessThanOrEqual(HOSPITAL_CONTENT_IMAGE_MAX_SORT_ORDER);
    expect([...slots.entries()].some(([id, slot]) => id !== move.imageId && slot === move.sortOrder)).toBe(false);
    slots.set(move.imageId, move.sortOrder);
  }
  return [...slots.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
}

describe("planHospitalContentImageReorder", () => {
  it.each([1, 2, 3, 4])("reaches every permutation of %i images without a slot collision", (count) => {
    const current = Array.from({ length: count }, (_, index) => `img-${index}`);
    for (const desired of permutations(current)) expect(apply(current, desired)).toEqual(desired);
  });

  it("plans nothing for an unchanged order", () => {
    expect(planHospitalContentImageReorder(["a", "b", "c"], ["a", "b", "c"])).toEqual([]);
  });

  it("rejects a non-permutation and a full set of five images that has no spare slot", () => {
    expect(() => planHospitalContentImageReorder(["a", "b"], ["a", "c"])).toThrow(RangeError);
    expect(() => planHospitalContentImageReorder(["a", "b"], ["a", "a"])).toThrow(RangeError);
    const five = ["a", "b", "c", "d", "e"];
    expect(() => planHospitalContentImageReorder(five, [...five].reverse())).toThrow(RangeError);
  });
});
