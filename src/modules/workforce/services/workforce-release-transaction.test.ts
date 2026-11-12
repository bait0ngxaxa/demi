import { HospitalStatus, MembershipStatus, MembershipType, Prisma, Role } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ConflictError } from "@/shared/errors/application-error";

import {
  releaseWorkforceRelationship,
  WORKFORCE_RELEASE_TRANSACTION_TIMEOUT_MS,
  type WorkforceDatabase,
} from "./workforce-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const owner: ActorContext = {
  userId: "22222222-2222-4222-8222-222222222222",
  personId: "33333333-3333-4333-8333-333333333333",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [{ hospitalId, membershipType: MembershipType.OWNER, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }],
  osmHospitalRelationships: [],
};

describe("releaseWorkforceRelationship transaction budget", () => {
  it.each(["osm", "staff"] as const)("runs a %s release in one Serializable transaction with the explicit release timeout", async (kind) => {
    const stop = new ConflictError("stop after the transaction options are observed");
    const transaction = vi.fn().mockRejectedValue(stop);
    const database = { $transaction: transaction } as unknown as WorkforceDatabase;

    await expect(releaseWorkforceRelationship(owner, {
      kind,
      relationshipId: "44444444-4444-4444-8444-444444444444",
      targetHospitalId: hospitalId,
      expectedUpdatedAt: "2026-10-14T05:00:00.000Z",
      confirmation: "นำออกจากโรงพยาบาลนี้อย่างถาวร",
    }, { database, transactionRetries: 0 })).rejects.toBe(stop);

    expect(WORKFORCE_RELEASE_TRANSACTION_TIMEOUT_MS).toBe(20_000);
    expect(transaction).toHaveBeenCalledExactlyOnceWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: WORKFORCE_RELEASE_TRANSACTION_TIMEOUT_MS,
    });
  });
});
