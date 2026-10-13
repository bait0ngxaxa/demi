import "server-only";

import { timingSafeEqual } from "node:crypto";

import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";

export const WORKFORCE_MAX_FAILED_VERIFICATIONS = 5;

const MASK = "***";
const segmenter = new Intl.Segmenter("th", { granularity: "grapheme" });

function maskNamePart(value: string | null | undefined): string {
  const graphemes = Array.from(segmenter.segment((value ?? "").trim()), ({ segment }) => segment);

  if (graphemes.length === 0) {
    return "";
  }

  // Always hide at least one character and never reveal more than two.
  const visible = Math.min(2, graphemes.length - 1);

  return `${graphemes.slice(0, visible).join("")}${MASK}`;
}

export function maskPersonName(
  givenName: string | null | undefined,
  familyName: string | null | undefined,
): string {
  return [maskNamePart(givenName), maskNamePart(familyName)].filter(Boolean).join(" ") || MASK;
}

export function matchesPersonNationalId(
  personIdentityKeyHash: string,
  nationalId: string,
): boolean {
  const expected = Buffer.from(personIdentityKeyHash, "utf8");
  const actual = Buffer.from(
    hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: nationalId }),
    "utf8",
  );

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
