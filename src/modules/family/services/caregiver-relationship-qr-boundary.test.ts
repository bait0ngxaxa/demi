import { CaregiverInvitationStatus, type PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ audit: vi.fn() }));
vi.mock("@/modules/audit/services/audit-service", () => ({ recordAuditEvent: mocks.audit }));

import { acceptCaregiverInvitation, CAREGIVER_INVITATION_TTL_MS } from "./caregiver-relationship-service";

const actor = { userId: "caregiver", personId: "caregiver-person", roles: [], hospitalMemberships: [], osmHospitalRelationships: [] };
const token = "a".repeat(43);

function databaseFixture(status: CaregiverInvitationStatus = CaregiverInvitationStatus.PENDING) {
  const transaction = {
    user: { findFirst: vi.fn().mockResolvedValue({ id: actor.userId, personId: actor.personId, roles: [] }) },
    caregiverInvitation: { findUnique: vi.fn().mockResolvedValue({ id: "invitation", patientProfileId: "patient", caregiverUserId: actor.userId, caregiverPersonId: actor.personId, status }) },
    caregiverRelationship: { create: vi.fn().mockResolvedValue({ id: "relationship" }) },
    caregiverAppointmentGrant: { create: vi.fn(), updateMany: vi.fn() },
    appointment: { findMany: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([{ id: "invitation", acceptedAt: new Date("2026-10-02T00:00:00Z") }]),
  };
  const database = { $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) => operation(transaction)) } as unknown as PrismaClient;
  return { transaction, database };
}

describe("QR-equivalent existing invitation authority boundary (mock database)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts only the relationship, never creates/accepts a data grant or reads appointments", async () => {
    const { transaction, database } = databaseFixture();
    expect(CAREGIVER_INVITATION_TTL_MS).toBe(24 * 60 * 60 * 1000);
    expect(await acceptCaregiverInvitation(actor, token, { database })).toMatchObject({ relationshipId: "relationship", acceptanceContractVersion: "family-delegation-v1" });
    expect(transaction.caregiverRelationship.create).toHaveBeenCalledOnce();
    expect(transaction.caregiverAppointmentGrant.create).not.toHaveBeenCalled();
    expect(transaction.caregiverAppointmentGrant.updateMany).not.toHaveBeenCalled();
    expect(transaction.appointment.findMany).not.toHaveBeenCalled();
    expect(mocks.audit.mock.calls.map(([event]) => event.action)).toEqual(["caregiver_invitation.accepted", "caregiver_relationship.activated"]);
  });

  it.each(["user", "person"])("denies a forwarded token with mismatched intended %s", async (identity) => {
    const { transaction, database } = databaseFixture();
    transaction.user.findFirst.mockResolvedValue({ id: identity === "user" ? "other" : actor.userId, personId: identity === "person" ? "other-person" : actor.personId, roles: [] });
    await expect(acceptCaregiverInvitation(actor, token, { database })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(transaction.$queryRaw).not.toHaveBeenCalled();
    expect(transaction.caregiverRelationship.create).not.toHaveBeenCalled();
  });

  it.each([CaregiverInvitationStatus.ACCEPTED, CaregiverInvitationStatus.REJECTED, CaregiverInvitationStatus.REVOKED, CaregiverInvitationStatus.EXPIRED])("denies terminal %s replay", async (status) => {
    const { transaction, database } = databaseFixture(status);
    await expect(acceptCaregiverInvitation(actor, token, { database })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(transaction.caregiverRelationship.create).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("denies acceptance when the database expiry boundary prevents the conditional transition", async () => {
    const { transaction, database } = databaseFixture();
    transaction.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "invitation" }]);
    await expect(acceptCaregiverInvitation(actor, token, { database })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(transaction.caregiverRelationship.create).not.toHaveBeenCalled();
    expect(mocks.audit.mock.calls.map(([event]) => event.action)).toEqual(["caregiver_invitation.expired"]);
  });
});
