import { CaregiverInvitationStatus, Role, type PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ audit: vi.fn() }));
vi.mock("@/modules/audit/services/audit-service", () => ({ recordAuditEvent: mocks.audit }));

import { reissueCaregiverInvitationLink } from "./caregiver-relationship-service";

const actor = { userId: "11111111-1111-4111-8111-111111111111", personId: "patient-person", roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] };
const invitationId = "22222222-2222-4222-8222-222222222222";
const credential = { plaintextToken: "c".repeat(43), tokenHash: "d".repeat(64) };
const expiresAt = new Date("2026-10-17T00:00:00.000Z");

function databaseFixture(status: CaregiverInvitationStatus = CaregiverInvitationStatus.PENDING) {
  const transaction = {
    user: { findFirst: vi.fn().mockResolvedValue({ id: actor.userId, personId: actor.personId, roles: [{ role: Role.PATIENT }] }) },
    patientProfile: { findUnique: vi.fn().mockResolvedValue({ id: "patient-profile", personId: actor.personId }) },
    caregiverInvitation: { findFirst: vi.fn().mockResolvedValue({ id: invitationId, status }) },
    caregiverRelationship: { create: vi.fn() },
    $queryRaw: vi.fn().mockResolvedValue([{ id: invitationId, expiresAt }]),
  };
  const database = { $transaction: vi.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) => operation(transaction)) } as unknown as PrismaClient;
  return { transaction, database };
}

describe("reissueCaregiverInvitationLink (E2 QR of a pending invitation)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rotates only the token hash of the own pending invitation and returns the new link once", async () => {
    const { transaction, database } = databaseFixture();

    const result = await reissueCaregiverInvitationLink(actor, invitationId, { database, generateCredential: () => credential });

    expect(result).toEqual({ invitationId, plaintextToken: credential.plaintextToken, expiresAt });
    expect(transaction.caregiverInvitation.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: invitationId, patientProfileId: "patient-profile", issuedByUserId: actor.userId },
    }));
    const sql = transaction.$queryRaw.mock.calls[0]?.[0] as { strings: string[]; values: unknown[] };
    expect(sql.strings.join("?")).toContain(`SET "tokenHash" = ?`);
    expect(sql.strings.join("?")).toContain(`"status" = 'PENDING'`);
    expect(sql.strings.join("?")).toContain(`"expiresAt" > clock_timestamp()`);
    expect(sql.strings.join("?")).not.toMatch(/"expiresAt"\s*=|"caregiverUserId"\s*=|"status"\s*=\s*'(ACCEPTED|REVOKED)'/);
    expect(sql.values).toContain(credential.tokenHash);
    expect(sql.values).not.toContain(credential.plaintextToken);
    expect(transaction.caregiverRelationship.create).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledOnce();
    expect(mocks.audit.mock.calls[0]?.[0]).toMatchObject({ action: "caregiver_invitation.link_reissued", resourceId: invitationId });
    expect(JSON.stringify(mocks.audit.mock.calls[0]?.[0])).not.toContain(credential.plaintextToken);
    expect(JSON.stringify(mocks.audit.mock.calls[0]?.[0])).not.toContain(credential.tokenHash);
  });

  it.each([CaregiverInvitationStatus.ACCEPTED, CaregiverInvitationStatus.REJECTED, CaregiverInvitationStatus.REVOKED, CaregiverInvitationStatus.EXPIRED])(
    "refuses a %s invitation without rotating it",
    async (status) => {
      const { transaction, database } = databaseFixture(status);
      await expect(reissueCaregiverInvitationLink(actor, invitationId, { database, generateCredential: () => credential })).rejects.toMatchObject({ code: "CONFLICT" });
      expect(transaction.$queryRaw).not.toHaveBeenCalled();
      expect(mocks.audit).not.toHaveBeenCalled();
    },
  );

  it("expires a due invitation instead of rotating it", async () => {
    const { transaction, database } = databaseFixture();
    transaction.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: invitationId }]);
    await expect(reissueCaregiverInvitationLink(actor, invitationId, { database, generateCredential: () => credential })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.audit.mock.calls.map(([event]) => event.action)).toEqual(["caregiver_invitation.expired"]);
  });

  it("does not find another patient's invitation", async () => {
    const { transaction, database } = databaseFixture();
    transaction.caregiverInvitation.findFirst.mockResolvedValue(null);
    await expect(reissueCaregiverInvitationLink(actor, invitationId, { database, generateCredential: () => credential })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(transaction.$queryRaw).not.toHaveBeenCalled();
  });

  it("denies a non-patient actor before any database work", async () => {
    const { database } = databaseFixture();
    await expect(reissueCaregiverInvitationLink({ ...actor, roles: [Role.OSM] }, invitationId, { database })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(database.$transaction).not.toHaveBeenCalled();
  });
});
