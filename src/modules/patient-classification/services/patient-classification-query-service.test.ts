import { HospitalStatus, MembershipStatus, MembershipType, Prisma, Role } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";

import {
  getPatientClassificationCounts,
  patientClassificationQueryInternals,
} from "./patient-classification-query-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const actor: ActorContext = {
  userId: "22222222-2222-4222-8222-222222222222",
  personId: "33333333-3333-4333-8333-333333333333",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [
    {
      hospitalId,
      membershipType: MembershipType.MEMBER,
      profession: null,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: HospitalStatus.ACTIVE,
    },
  ],
  osmHospitalRelationships: [],
};

function createDatabase(input: { hospital?: { id: string } | null; counts: number[] }): {
  database: Prisma.TransactionClient;
  hospitalFindFirst: ReturnType<typeof vi.fn>;
  count: ReturnType<typeof vi.fn>;
} {
  const hospitalFindFirst = vi
    .fn()
    .mockResolvedValue(input.hospital === undefined ? { id: hospitalId } : input.hospital);
  const count = vi.fn();

  for (const value of input.counts) {
    count.mockResolvedValueOnce(value);
  }

  return {
    database: {
      hospital: { findFirst: hospitalFindFirst },
      patientHospitalRelationship: { count },
    } as unknown as Prisma.TransactionClient,
    hospitalFindFirst,
    count,
  };
}

describe("Patient classification query service", () => {
  it("counts current classification rows within the authorized Hospital scope", async () => {
    const { database, count } = createDatabase({ counts: [4, 1, 2] });

    await expect(getPatientClassificationCounts(actor, hospitalId, database)).resolves.toEqual({
      total: 4,
      risk: 1,
      diabetes: 2,
      unclassified: 1,
    });
    expect(count).toHaveBeenCalledTimes(3);
    expect(count.mock.calls.map(([input]) => input.where)).toEqual([
      patientClassificationQueryInternals.buildClassificationCountWhere(actor.userId, hospitalId),
      patientClassificationQueryInternals.buildClassificationCountWhere(actor.userId, hospitalId, "RISK"),
      patientClassificationQueryInternals.buildClassificationCountWhere(actor.userId, hospitalId, "DIABETES"),
    ]);
  });

  it("filters through the patient-global current row and does not use history", () => {
    const where = patientClassificationQueryInternals.buildClassificationCountWhere(
      actor.userId,
      hospitalId,
      "RISK",
    );

    expect(where).toMatchObject({
      hospitalId,
      patientProfile: {
        patientClassification: { is: { classification: "RISK" } },
      },
    });
    expect(JSON.stringify(where)).not.toContain("History");
  });

  it("rejects a Hospital outside the actor's active direct scope", async () => {
    const { database } = createDatabase({ hospital: null, counts: [] });

    await expect(getPatientClassificationCounts(actor, hospitalId, database)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("rejects an invalid Hospital identifier", async () => {
    const { database, hospitalFindFirst } = createDatabase({ counts: [] });

    await expect(getPatientClassificationCounts(actor, "not-a-uuid", database)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(hospitalFindFirst).not.toHaveBeenCalled();
  });
});
