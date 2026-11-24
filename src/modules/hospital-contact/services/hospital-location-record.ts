import "server-only";

import type { Prisma } from "@prisma/client";

import type { HospitalLocation } from "../domain/hospital-location";

/**
 * PostgreSQL DECIMAL(9,6) → number at the service boundary. The pair CHECK keeps both columns
 * set or both NULL, so a half-set row cannot be read; it is still mapped to "no location".
 */
export function toHospitalLocation(
  latitude: Prisma.Decimal | null,
  longitude: Prisma.Decimal | null,
): HospitalLocation | null {
  if (latitude === null || longitude === null) {
    return null;
  }

  return { latitude: latitude.toNumber(), longitude: longitude.toNumber() };
}
