import { Prisma, type PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { resolvePersonalMedicationOwner } from "./personal-medication-access-service";
import { createPersonalMedication, updatePersonalMedication, stopPersonalMedication } from "./personal-medication-service";
import { getOwnPersonalMedication, listOwnPersonalMedications, personalMedicationSelect, personalMedicationDetailSelect } from "./personal-medication-query-service";

vi.mock("@/modules/audit/services/audit-service", () => ({ recordAuditEvent: vi.fn() }));
const a: ActorContext = { userId: "11111111-1111-4111-8111-111111111111", personId: "22222222-2222-4222-8222-222222222222", roles: ["PATIENT"], hospitalMemberships: [], osmHospitalRelationships: [] };
const profileId = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-10-02T00:00:00.000Z");
const row = { id: "44444444-4444-4444-8444-444444444444", medicationName: "ยาไทย", instructionText: null, status: "ACTIVE" as const, stoppedAt: null, createdAt: now, updatedAt: now, schedules: [] };
const version = { medicationId: row.id, expectedUpdatedAt: now.toISOString() };

function fixture(): { db: PrismaClient; tx: Prisma.TransactionClient; person: { findFirst: ReturnType<typeof vi.fn> }; medication: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> }; transaction: ReturnType<typeof vi.fn> } {
  const person = { findFirst: vi.fn().mockResolvedValue({ patientProfile: { id: profileId } }) };
  const medication = { findFirst: vi.fn().mockResolvedValue(row), findMany: vi.fn().mockResolvedValue([row]), create: vi.fn().mockResolvedValue(row), updateMany: vi.fn().mockResolvedValue({ count: 1 }) };
  const tx = { person, personalMedication: medication } as unknown as Prisma.TransactionClient;
  const transaction = vi.fn(async (operation: (transaction: Prisma.TransactionClient) => Promise<unknown>) => operation(tx));
  const db = { person, personalMedication: medication, $transaction: transaction } as unknown as PrismaClient;
  return { db, tx, person, medication, transaction };
}
describe("medication persisted access/services/queries", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("resolves exact persisted active User + Person + role with minimal profile select", async () => {
    const f = fixture(); expect(await resolvePersonalMedicationOwner(a, f.db)).toBe(profileId);
    expect(f.person.findFirst).toHaveBeenCalledWith({ where: { id: a.personId, user: { is: { id: a.userId, status: "ACTIVE", roles: { some: { role: "PATIENT" } } } } }, select: { patientProfile: { select: { id: true } } } });
    f.person.findFirst.mockResolvedValue({ patientProfile: null });
    await expect(resolvePersonalMedicationOwner(a, f.db)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("creates with system owner/state/time and same transaction audit without text metadata", async () => {
    const f = fixture(); await createPersonalMedication(a, { medicationName: " ยาไทย " }, { database: f.db, now: () => now });
    expect(f.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(f.medication.create).toHaveBeenCalledWith({ data: { patientProfileId: profileId, medicationName: "ยาไทย", instructionText: null, status: "ACTIVE", stoppedAt: null, createdAt: now, updatedAt: now }, select: personalMedicationSelect });
    expect(recordAuditEvent).toHaveBeenCalledWith({ actorUserId: a.userId, action: "personal_medication.created", resourceType: "PersonalMedication", resourceId: row.id }, f.tx);
  });
  it("checks current eligibility and validates raw strict fields within transaction", async () => {
    const f = fixture(); f.person.findFirst.mockResolvedValue(null);
    await expect(createPersonalMedication(a, { medicationName: "ยา" }, { database: f.db })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.medication.create).not.toHaveBeenCalled();
    f.person.findFirst.mockResolvedValue({ patientProfile: { id: profileId } });
    await expect(createPersonalMedication(a, { medicationName: "ยา", status: "STOPPED" }, { database: f.db })).rejects.toMatchObject({ code: "VALIDATION" });
  });
  it("guards conditional edit/stop by owner ACTIVE exact version, advances timestamp and rejects count !=1", async () => {
    for (const operation of [updatePersonalMedication, stopPersonalMedication]) {
      const f = fixture(); await operation(a, operation === updatePersonalMedication ? { ...version, medicationName: "ยาไทย" } : version, { database: f.db, now: () => now });
      expect(f.medication.updateMany).toHaveBeenCalledWith({ where: { id: row.id, patientProfileId: profileId, status: "ACTIVE", updatedAt: now }, data: operation === updatePersonalMedication ? { medicationName: "ยาไทย", instructionText: null, updatedAt: new Date(now.getTime() + 1) } : { status: "STOPPED", stoppedAt: now, updatedAt: new Date(now.getTime() + 1) } });
      f.medication.updateMany.mockResolvedValue({ count: 0 });
      await expect(operation(a, operation === updatePersonalMedication ? { ...version, medicationName: "ยา" } : version, { database: f.db })).rejects.toMatchObject({ code: "CONFLICT" });
    }
  });
  it("foreign/missing lookups are identical and stopped/stale do not write/audit", async () => {
    for (const current of [null, { ...row, status: "STOPPED", stoppedAt: now }, { ...row, updatedAt: new Date(now.getTime() + 1) }]) {
      const f = fixture(); f.medication.findFirst.mockResolvedValue(current);
      await expect(stopPersonalMedication(a, version, { database: f.db })).rejects.toMatchObject({ code: current === null ? "NOT_FOUND" : "CONFLICT" });
      expect(f.medication.updateMany).not.toHaveBeenCalled();
    }
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
  it("uses owner/status scoped cursor and at most 51 explicit DTO rows; detail never audits", async () => {
    const f = fixture(); await listOwnPersonalMedications(a, { status: "ACTIVE", cursor: row.id }, f.db);
    expect(f.medication.findFirst).toHaveBeenCalledWith({ where: { patientProfileId: profileId, status: "ACTIVE", id: row.id }, select: personalMedicationSelect });
    expect(f.medication.findMany).toHaveBeenCalledWith({ where: { patientProfileId: profileId, status: "ACTIVE", OR: [{ createdAt: { lt: now } }, { createdAt: now, id: { lt: row.id } }] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, select: personalMedicationSelect });
    await getOwnPersonalMedication(a, row.id, f.db);
    expect(f.medication.findFirst).toHaveBeenLastCalledWith({ where: { id: row.id, patientProfileId: profileId }, select: personalMedicationDetailSelect });
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
  it("retries only known rolled-back failures with bounded shared infrastructure, never ambiguous create", async () => {
    const f = fixture(); const rollback = new Prisma.PrismaClientKnownRequestError("rollback", { code: "P2034", clientVersion: "6.19" });
    f.transaction.mockRejectedValueOnce(rollback);
    await createPersonalMedication(a, { medicationName: "ยา" }, { database: f.db });
    expect(f.transaction).toHaveBeenCalledTimes(2); expect(recordAuditEvent).toHaveBeenCalledTimes(1);
    f.transaction.mockClear(); f.transaction.mockRejectedValue(new Error("ambiguous transport"));
    await expect(createPersonalMedication(a, { medicationName: "ยา" }, { database: f.db })).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
    expect(f.transaction).toHaveBeenCalledTimes(1);
    f.transaction.mockClear(); f.transaction.mockRejectedValue(rollback);
    await expect(createPersonalMedication(a, { medicationName: "ยา" }, { database: f.db })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(f.transaction).toHaveBeenCalledTimes(3);
  });
});
