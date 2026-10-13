import { describe, expect, it } from "vitest";

import { hashIdentityReference } from "@/modules/identity/services/identity-service";

import { maskPersonName, matchesPersonNationalId } from "./activation-identity";

describe("workforce activation masked name", () => {
  it("keeps at most two leading characters per name part and never the full name", () => {
    expect(maskPersonName("สมชาย", "ใจดี")).toBe("สม*** ใจ***");
    expect(maskPersonName("Somchai", "Jaidee")).toBe("So*** Ja***");
  });

  it("always hides at least one character of short names", () => {
    expect(maskPersonName("ก", "ขค")).toBe("*** ข***");
    expect(maskPersonName("สม", "ใจ")).toBe("ส*** ใ***");
  });

  it("never reveals a whole short or combining-mark name", () => {
    const masked = maskPersonName("เกื้อ", "กูล");

    expect(masked).not.toContain("เกื้อ");
    expect(masked).not.toContain("กูล");
    expect(masked.split(" ")).toHaveLength(2);
    expect(masked.split(" ").every((part) => part.endsWith("***"))).toBe(true);
  });

  it("falls back to a fully masked value for missing names", () => {
    expect(maskPersonName(null, undefined)).toBe("***");
    expect(maskPersonName("  ", "")).toBe("***");
  });
});

describe("workforce activation national ID match", () => {
  const nationalId = "1000000000009";
  const personHash = hashIdentityReference({ namespace: "thai-national-id", value: nationalId });

  it("accepts the national ID hashed with the identity service", () => {
    expect(matchesPersonNationalId(personHash, nationalId)).toBe(true);
  });

  it("rejects a different national ID and a malformed stored hash", () => {
    expect(matchesPersonNationalId(personHash, "1000000000017")).toBe(false);
    expect(matchesPersonNationalId("short", nationalId)).toBe(false);
    expect(matchesPersonNationalId("", nationalId)).toBe(false);
  });
});
