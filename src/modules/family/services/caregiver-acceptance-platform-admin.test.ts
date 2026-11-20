import { Role, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";

import { acceptAppointmentGrant } from "./appointment-grant-service";
import { acceptResourceGrant } from "./caregiver-resource-grant-service";
import { acceptCaregiverInvitation } from "./caregiver-relationship-service";

/** Any database access fails the test: the ADMIN refusal must come before a lookup. */
const untouchableDatabase = new Proxy({}, {
  get(): never {
    throw new Error("database must not be touched");
  },
}) as PrismaClient;

function actor(roles: Role[]): ActorContext {
  return {
    userId: "11111111-1111-4111-8111-111111111111",
    personId: "22222222-2222-4222-8222-222222222222",
    roles,
    hospitalMemberships: [],
    osmHospitalRelationships: [],
  };
}

const grantId = "33333333-3333-4333-8333-333333333333";
const now = (): Date => new Date("2026-11-20T00:00:00.000Z");

describe("owner decision 2026-11-19: a platform ADMIN never accepts caregiver authority", () => {
  it.each([[[Role.ADMIN]], [[Role.ADMIN, Role.PATIENT]], [[Role.ADMIN, Role.CAREGIVER]]])("refuses %j before reading anything", async (roles) => {
    const dependencies = { database: untouchableDatabase, now };

    await expect(acceptCaregiverInvitation(actor(roles), "any-token", dependencies)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(acceptResourceGrant(actor(roles), grantId, dependencies)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(acceptAppointmentGrant(actor(roles), grantId, dependencies)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets a non-ADMIN caregiver reach the normal lookup", async () => {
    const dependencies = { database: untouchableDatabase, now };

    await expect(acceptResourceGrant(actor([Role.CAREGIVER]), grantId, dependencies)).rejects.toThrow();
    await expect(acceptResourceGrant(actor([Role.CAREGIVER]), grantId, dependencies)).rejects.not.toBeInstanceOf(ForbiddenError);
  });
});
