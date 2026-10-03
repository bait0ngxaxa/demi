import { Prisma, type PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { replacePersonalMedicationSchedules as replace } from "./personal-medication-service";
import { getOwnPersonalMedication as detail, personalMedicationDetailSelect, toPersonalMedicationDetailDto } from "./personal-medication-query-service";
import { toMedicationTimeCarrier as carrier } from "../domain/medication-local-time";

vi.mock("@/modules/audit/services/audit-service", () => ({ recordAuditEvent: vi.fn() }));
const actor: ActorContext = { userId: "11111111-1111-4111-8111-111111111111", personId: "22222222-2222-4222-8222-222222222222", roles: ["PATIENT"], hospitalMemberships: [], osmHospitalRelationships: [] };
const parentId = "44444444-4444-4444-8444-444444444444";
const ownerId = "33333333-3333-4333-8333-333333333333";
const now = new Date("2026-10-03T00:00:00Z");
const row = { id: parentId, medicationName: "ยาไทย", instructionText: "บันทึกเอง", status: "ACTIVE" as const, stoppedAt: null, createdAt: now, updatedAt: now };
const version = { medicationId: parentId, expectedUpdatedAt: now.toISOString() };
function fixture() {
  const person = { findFirst: vi.fn().mockResolvedValue({ patientProfile: { id: ownerId } }) };
  const personalMedication = { findFirst: vi.fn().mockResolvedValue({ ...row, schedules: [{ localTime: carrier("08:00") }] }), updateMany: vi.fn().mockResolvedValue({ count: 1 }) };
  const medicationSchedule = { findMany: vi.fn().mockResolvedValue([{ localTime: carrier("08:00") }, { localTime: carrier("12:00") }]), deleteMany: vi.fn().mockResolvedValue({ count: 1 }), createMany: vi.fn().mockResolvedValue({ count: 1 }) };
  const tx = { person, personalMedication, medicationSchedule } as unknown as Prisma.TransactionClient;
  const transaction = vi.fn(async (fn: (client: Prisma.TransactionClient) => Promise<unknown>) => fn(tx));
  const db = { $transaction: transaction } as unknown as PrismaClient;
  return { db, tx, person, personalMedication, medicationSchedule, transaction };
}
describe("schedule aggregate service and detail", () => {
  beforeEach(() => vi.resetAllMocks());
  it("claims parent then sequentially removes/adds only changed times, retaining unchanged rows", async () => {
    const f = fixture();
    const result = await replace(actor, { ...version, times: ["20:00", "08:00"] }, { database: f.db, now: () => now });
    expect(f.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(f.personalMedication.updateMany).toHaveBeenCalledWith({ where: { id: parentId, patientProfileId: ownerId, status: "ACTIVE", updatedAt: now }, data: { updatedAt: new Date(now.getTime() + 1) } });
    expect(f.medicationSchedule.deleteMany).toHaveBeenCalledExactlyOnceWith({ where: { personalMedicationId: parentId, localTime: { in: [carrier("12:00")] } } });
    expect(f.medicationSchedule.createMany).toHaveBeenCalledExactlyOnceWith({ data: [{ personalMedicationId: parentId, localTime: carrier("20:00") }] });
    const calls = [f.personalMedication.updateMany, f.medicationSchedule.findMany, f.medicationSchedule.deleteMany, f.medicationSchedule.createMany, vi.mocked(recordAuditEvent)].map((fn) => fn.mock.invocationCallOrder[0]);
    expect(calls).toEqual([...calls].sort((a, b) => a - b));
    expect(recordAuditEvent).toHaveBeenCalledExactlyOnceWith({ actorUserId: actor.userId, action: "personal_medication.schedule_updated", resourceType: "PersonalMedication", resourceId: parentId }, f.tx);
    expect(result.schedules).toEqual([{ localTime: "08:00" }]);
  });
  it("accepted identical set still claims version and audits with zero child writes", async () => {
    const f = fixture(); await replace(actor, { ...version, times: ["12:00", "08:00"] }, { database: f.db });
    expect(f.personalMedication.updateMany).toHaveBeenCalledOnce();
    expect(f.medicationSchedule.deleteMany).not.toHaveBeenCalled(); expect(f.medicationSchedule.createMany).not.toHaveBeenCalled(); expect(recordAuditEvent).toHaveBeenCalledOnce();
  });
  it("explicit empty set deletes all previous values without inserting", async () => {
    const f = fixture(); await replace(actor, { ...version, times: [] }, { database: f.db });
    expect(f.medicationSchedule.deleteMany).toHaveBeenCalledOnce(); expect(f.medicationSchedule.createMany).not.toHaveBeenCalled();
  });
  it.each([null, { ...row, status: "STOPPED" }, { ...row, updatedAt: new Date(now.getTime() + 1) }])("rejects missing/stopped/stale %j before writes/audit", async (current) => {
    const f = fixture(); f.personalMedication.findFirst.mockResolvedValue(current);
    await expect(replace(actor, { ...version, times: [] }, { database: f.db })).rejects.toMatchObject({ code: current === null ? "NOT_FOUND" : "CONFLICT" });
    expect(f.personalMedication.updateMany).not.toHaveBeenCalled(); expect(f.medicationSchedule.findMany).not.toHaveBeenCalled(); expect(recordAuditEvent).not.toHaveBeenCalled();
  });
  it("revalidates raw input and persisted SELF inside transaction and requires successful claim", async () => {
    const f = fixture(); await expect(replace(actor, { ...version, times: ["08:00:00"] }, { database: f.db })).rejects.toMatchObject({ code: "VALIDATION" });
    f.person.findFirst.mockResolvedValue(null);
    await expect(replace(actor, { ...version, times: [] }, { database: f.db })).rejects.toMatchObject({ code: "FORBIDDEN" });
    f.person.findFirst.mockResolvedValue({ patientProfile: { id: ownerId } }); f.personalMedication.updateMany.mockResolvedValue({ count: 0 });
    await expect(replace(actor, { ...version, times: [] }, { database: f.db })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(f.medicationSchedule.findMany).not.toHaveBeenCalled(); expect(recordAuditEvent).not.toHaveBeenCalled();
  });
  it("uses one detail transaction snapshot and explicit bounded projection without audit", async () => {
    const f = fixture(); const result = await detail(actor, parentId, f.db);
    expect(f.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(f.personalMedication.findFirst).toHaveBeenCalledWith({ where: { id: parentId, patientProfileId: ownerId }, select: personalMedicationDetailSelect });
    expect(Object.keys(result).sort()).toEqual([...Object.keys(row), "schedules"].sort());
    expect(result.schedules).toEqual([{ localTime: "08:00" }]); expect(recordAuditEvent).not.toHaveBeenCalled();
    expect(toPersonalMedicationDetailDto({ ...row, schedules: [] }).schedules).toEqual([]);
  });
  it("sanitizes infrastructure failures and retries only known aborted transactions", async () => {
    const f = fixture(); f.transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("private", { code: "P2034", clientVersion: "6.19.3" }));
    await replace(actor, { ...version, times: [] }, { database: f.db }); expect(f.transaction).toHaveBeenCalledTimes(2); expect(recordAuditEvent).toHaveBeenCalledOnce();
    f.transaction.mockRejectedValue(new Error("private times and SQL"));
    await expect(replace(actor, { ...version, times: [] }, { database: f.db })).rejects.toMatchObject({ code: "INFRASTRUCTURE", message: "Personal medication could not be saved" });
  });
});
