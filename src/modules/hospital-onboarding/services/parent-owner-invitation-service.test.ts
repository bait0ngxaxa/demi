import { HospitalStatus, Role, UserStatus, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import { getParentOwnerInvitationState, listParentOnboardingPaths } from "./parent-owner-invitation-service";

const hospitalId = "44444444-4444-4444-8444-444444444444";
const admin: ActorContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  personId: "22222222-2222-4222-8222-222222222222",
  roles: [Role.ADMIN],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};

/** A client without `$transaction`: the ADMIN page and directory reads must not open a serializable transaction. */
function readOnlyDatabase(): { database: PrismaClient; transaction: ReturnType<typeof vi.fn> } {
  const transaction = vi.fn();
  const database = {
    $transaction: transaction,
    user: { findUnique: vi.fn().mockResolvedValue({ status: UserStatus.ACTIVE, roles: [{ role: Role.ADMIN }] }) },
    hospital: {
      findUnique: vi.fn().mockResolvedValue({ id: hospitalId, hospitalCode: "H-ABCDEF", name: "โรงพยาบาลชุมชนใหม่", status: HospitalStatus.PENDING_VERIFICATION }),
      findFirst: vi.fn().mockResolvedValue({ id: hospitalId }),
    },
    hospitalOnboardingApplication: { findFirst: vi.fn().mockResolvedValue(null), findMany: vi.fn().mockResolvedValue([]) },
    hospitalMembership: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([{ hospitalId }]),
    },
    workforceActivation: { findFirst: vi.fn().mockResolvedValue(null) },
  } as unknown as PrismaClient;
  return { database, transaction };
}

describe("ADMIN Parent OWNER invitation reads (ADR-0024 PO-3)", () => {
  it("projects the invitation state as a plain read", async () => {
    const { database, transaction } = readOnlyDatabase();

    await expect(getParentOwnerInvitationState(admin, { hospitalId }, { database })).resolves.toMatchObject({
      availability: "FIRST_OWNER",
      invitation: null,
      pendingApplication: null,
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("lists the open onboarding paths as a plain read", async () => {
    const { database, transaction } = readOnlyDatabase();

    await expect(listParentOnboardingPaths(admin, [hospitalId], { database })).resolves.toEqual(new Map([[hospitalId, "OPEN_INVITATION"]]));
    expect(transaction).not.toHaveBeenCalled();
  });

  it("still requires a persisted ACTIVE platform ADMIN", async () => {
    const { database } = readOnlyDatabase();
    vi.mocked(database.user.findUnique).mockResolvedValueOnce(null);

    await expect(getParentOwnerInvitationState(admin, { hospitalId }, { database })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
