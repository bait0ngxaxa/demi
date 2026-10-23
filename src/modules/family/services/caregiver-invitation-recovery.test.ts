import { CaregiverInvitationStatus, Role, UserStatus, type Prisma, type PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
}));

vi.mock("@/modules/audit/services/audit-service", () => ({ recordAuditEvent: mocks.audit }));
vi.mock("@/lib/db/serializable-transaction", () => ({
  runSerializableTransaction: async <T>(
    database: { transaction: Prisma.TransactionClient },
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> => operation(database.transaction),
}));

import { createCaregiverInvitation } from "./caregiver-relationship-service";

const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  personId: "22222222-2222-4222-8222-222222222222",
  roles: [Role.PATIENT],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};
const plaintextToken = "a".repeat(43);
const tokenHash = "f".repeat(64);
const issuedAt = new Date("2026-10-16T00:00:00.000Z");
const expiresAt = new Date("2026-10-17T00:00:00.000Z");

function databaseFixture(pendingInvitation: { id: string } | null) {
  const transaction = {
    user: {
      findFirst: vi.fn().mockResolvedValue({
        id: actor.userId,
        personId: actor.personId,
        roles: [{ role: Role.PATIENT }],
        person: { identityKeyHash: "a".repeat(64) },
      }),
    },
    patientProfile: {
      findUnique: vi.fn().mockResolvedValue({ id: "patient-profile", personId: actor.personId }),
    },
    person: {
      findUnique: vi.fn().mockResolvedValue({
        id: "caregiver-person",
        user: {
          id: "caregiver-user",
          personId: "caregiver-person",
          status: UserStatus.ACTIVE,
          authSubject: "auth-subject",
        },
      }),
    },
    caregiverRelationship: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    caregiverInvitation: {
      findFirst: vi.fn().mockResolvedValue(pendingInvitation),
      create: vi.fn().mockResolvedValue({ id: "invitation-1", issuedAt, expiresAt }),
    },
    $queryRaw: vi.fn().mockResolvedValueOnce([]),
  };
  const database = { transaction } as unknown as PrismaClient & { transaction: Prisma.TransactionClient };
  return { transaction, database };
}

describe("Caregiver invitation lost-response boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("detects an existing pending invitation and never creates a duplicate", async () => {
    const { transaction, database } = databaseFixture({ id: "existing-invitation" });

    await expect(
      createCaregiverInvitation(
        actor,
        { nationalId: "1000000000009" },
        { database, generateCredential: () => ({ plaintextToken, tokenHash }) },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(transaction.caregiverInvitation.findFirst).toHaveBeenCalledWith({
      where: {
        patientProfileId: "patient-profile",
        caregiverUserId: "caregiver-user",
        status: CaregiverInvitationStatus.PENDING,
      },
      select: { id: true },
    });
    expect(transaction.caregiverInvitation.create).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("persists only the one-way token hash and returns plaintext only in the issuing response", async () => {
    const { transaction, database } = databaseFixture(null);
    transaction.$queryRaw.mockResolvedValueOnce([{ issuedAt, expiresAt }]);

    const result = await createCaregiverInvitation(
      actor,
      { nationalId: "1000000000009" },
      { database, generateCredential: () => ({ plaintextToken, tokenHash }) },
    );

    expect(result).toEqual({ invitationId: "invitation-1", issuedAt, expiresAt, plaintextToken });
    expect(transaction.caregiverInvitation.create).toHaveBeenCalledWith({
      data: {
        patientProfileId: "patient-profile",
        caregiverUserId: "caregiver-user",
        caregiverPersonId: "caregiver-person",
        issuedByUserId: actor.userId,
        tokenHash,
        status: CaregiverInvitationStatus.PENDING,
        issuedAt,
        expiresAt,
        requestedRelationshipLabel: null,
        requestedRelationshipLabelOther: null,
        requestedScopes: { appointmentRelationshipIds: [], resources: [] },
      },
      select: { id: true, issuedAt: true, expiresAt: true },
    });
    expect(JSON.stringify(transaction.caregiverInvitation.create.mock.calls)).not.toContain(plaintextToken);
    expect(transaction.caregiverInvitation.create.mock.calls[0]?.[0].data).not.toHaveProperty("plaintextToken");
  });
});
