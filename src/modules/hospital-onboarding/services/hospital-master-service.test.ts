import fixture from "../../../../prisma/seed/hospital-master-v2.json";
import { describe, expect, it } from "vitest";

describe("approved Hospital Master fixture", () => {
  it("contains exactly the approved 78 records with valid parent references", () => {
    const codes = new Set(fixture.map((record) => record.canonicalCode));

    expect(fixture).toHaveLength(78);
    expect(codes.size).toBe(78);
    expect(fixture.filter((record) => record.parentCanonicalCode)).toHaveLength(35);
    expect(fixture.filter((record) => !record.parentCanonicalCode)).toHaveLength(43);
    expect(codes.has("HH")).toBe(false);
    expect(fixture.find((record) => record.canonicalCode === "KANG")?.nameTh).toBe(
      "โรงพยาบาลแก่งคอย",
    );
    expect(fixture.find((record) => record.canonicalCode === "KHON")?.nameTh).toBe(
      "โรงพยาบาลขอนแก่น",
    );
    expect(
      fixture
        .filter((record) => record.parentCanonicalCode)
        .every((record) => codes.has(record.parentCanonicalCode ?? "")),
    ).toBe(true);
  });
});
