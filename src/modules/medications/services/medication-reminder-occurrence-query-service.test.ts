import { Prisma, type PrismaClient, type Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { toMedicationTimeCarrier as carrier } from "../domain/medication-local-time";
import { createReminderSourceKey, type MedicationReminderOccurrenceSource } from "../domain/medication-reminder-occurrence";
import { encodeMedicationReminderOccurrenceCursor } from "./medication-reminder-occurrence-cursor";
import { listOwnPersonalMedicationReminderOccurrences as list, revalidateOwnPersonalMedicationReminderOccurrence as revalidate } from "./medication-reminder-occurrence-query-service";

vi.mock("@/modules/audit/services/audit-service", () => ({ recordAuditEvent: vi.fn() }));
const actor: ActorContext = { userId: "11111111-1111-4111-8111-111111111111", personId: "22222222-2222-4222-8222-222222222222", roles: ["PATIENT"], hospitalMemberships: [], osmHospitalRelationships: [] };
const medicationId = "44444444-4444-4444-8444-444444444444";
const ownerId = "33333333-3333-4333-8333-333333333333";
const childId = "55555555-5555-4555-8555-555555555555";
const instant = "2026-10-03T17:00:00.000Z";
const query = { medicationId, from: instant, to: "2026-10-04T17:00:00.000Z" };
const known: MedicationReminderOccurrenceSource = { sourceKey: createReminderSourceKey(childId, "2026-10-04"), sourceVersion: 1, kind: "PERSONAL_MEDICATION_DAILY", personalMedicationId: medicationId, localDate: "2026-10-04", localTime: "08:00", dueAt: "2026-10-04T01:00:00.000Z", aggregateVersion: instant };
function fixture(count = 1) {
  const row = { id: medicationId, status: "ACTIVE" as "ACTIVE" | "STOPPED", updatedAt: new Date(instant), schedules: count === 1 ? [{ id: childId, localTime: carrier("08:00") }] : Array.from({ length: count }, (_, minute) => ({ id: `00000000-0000-4000-8000-${String(minute).padStart(12, "0")}`, localTime: carrier(`${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`) })) };
  const person = { findFirst: vi.fn().mockResolvedValue({ patientProfile: { id: ownerId } }) };
  const personalMedication = { findFirst: vi.fn().mockResolvedValue(row), updateMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() };
  const medicationSchedule = { createMany: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() };
  const tx = { person, personalMedication, medicationSchedule } as unknown as Prisma.TransactionClient;
  const transaction = vi.fn(async (operation: (client: Prisma.TransactionClient) => Promise<unknown>) => operation(tx));
  const db = { $transaction: transaction } as unknown as PrismaClient;
  const now = vi.fn(() => new Date("2026-10-03T16:59:59.999Z"));
  return { row, person, personalMedication, medicationSchedule, tx, transaction, now, deps: { database: db, now } };
}
describe("SELF reminder read source", () => {
  beforeEach(() => vi.resetAllMocks());
  it.each([null, undefined, ...([[], ["OSM"], ["HOSPITAL"], ["ADMIN"]] as Role[][]).map((roles) => ({ ...actor, roles }))])("denies absent or non-Patient actor %j before work", async (bad) => {
    const f = fixture();
    await expect(list(bad, query, f.deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(revalidate(bad, known, f.deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it("requires exact persisted ACTIVE User/PATIENT/Person/Profile on every operation", async () => {
    const f = fixture();
    await list(actor, query, f.deps); await revalidate(actor, known, f.deps);
    expect(f.person.findFirst).toHaveBeenCalledWith({ where: { id: actor.personId, user: { is: { id: actor.userId, status: "ACTIVE", roles: { some: { role: "PATIENT" } } } } }, select: { patientProfile: { select: { id: true } } } });
    for (const denied of [null, { patientProfile: null }]) {
      f.person.findFirst.mockResolvedValue(denied);
      await expect(list(actor, query, f.deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(revalidate(actor, known, f.deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
  it("allows multi-role own SELF but scopes both operations against foreign/missing rows", async () => {
    const f = fixture();
    expect((await list({ ...actor, roles: ["PATIENT", "ADMIN", "OSM", "HOSPITAL"] }, query, f.deps)).items).toHaveLength(1);
    expect(f.personalMedication.findFirst.mock.calls[0][0].where).toEqual({ id: medicationId, patientProfileId: ownerId });
    f.personalMedication.findFirst.mockResolvedValue(null);
    await expect(list(actor, query, f.deps)).rejects.toMatchObject({ code: "NOT_FOUND", message: "The requested resource was not found" });
    await expect(revalidate(actor, known, f.deps)).rejects.toMatchObject({ code: "NOT_FOUND", message: "The requested resource was not found" });
  });
  it.each([0, 1])("returns empty for zero or STOPPED without derivation %s", async (count) => {
    const f = fixture(count); if (count) f.row.status = "STOPPED";
    expect(await list(actor, query, f.deps)).toEqual({ items: [], nextCursor: null, evaluationAsOf: f.now().toISOString(), aggregateVersion: instant });
    expect(await revalidate(actor, known, f.deps)).toEqual({ status: "STALE" });
  });
  it("selects only bounded minimal state in Serializable snapshot and performs no writes/audit", async () => {
    const f = fixture(); const result = await list(actor, query, f.deps); await revalidate(actor, known, f.deps);
    expect(f.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" });
    expect(f.personalMedication.findFirst).toHaveBeenCalledWith({ where: { id: medicationId, patientProfileId: ownerId }, select: { id: true, status: true, updatedAt: true, schedules: { select: { id: true, localTime: true }, orderBy: [{ localTime: "asc" }, { id: "asc" }], take: 1441 } } });
    expect(result.items).toEqual([known]);
    expect(Object.keys(result.items[0]).sort()).toEqual(Object.keys(known).sort());
    for (const fn of [f.personalMedication.updateMany, f.personalMedication.create, f.personalMedication.deleteMany, ...Object.values(f.medicationSchedule), recordAuditEvent]) expect(fn).not.toHaveBeenCalled();
    expect(f.row.updatedAt.toISOString()).toBe(instant);
  });
  it.each([99, 100, 101])("uses fixed 100 page with lookahead at %s", async (count) => {
    const f = fixture(count); const result = await list(actor, query, f.deps);
    expect(result.items).toHaveLength(Math.min(100, count));
    expect(result.nextCursor !== null).toBe(count > 100);
  });
  it("pages with no skip/duplicate and original asOf, but new query excludes elapsed points", async () => {
    const f = fixture(205); const first = await list(actor, query, f.deps);
    f.now.mockReturnValue(new Date(query.to));
    const second = await list(actor, { ...query, cursor: first.nextCursor }, f.deps);
    const third = await list(actor, { ...query, cursor: second.nextCursor }, f.deps);
    expect(second.evaluationAsOf).toBe(first.evaluationAsOf); expect(third.evaluationAsOf).toBe(first.evaluationAsOf);
    expect(f.now).toHaveBeenCalledOnce();
    const all = [...first.items, ...second.items, ...third.items];
    expect(all).toHaveLength(205); expect(new Set(all.map((item) => item.sourceKey)).size).toBe(205);
    expect(all.map((item) => item.dueAt)).toEqual([...all.map((item) => item.dueAt)].sort());
    expect(third.nextCursor).toBeNull();
    expect((await list(actor, query, f.deps)).items).toEqual([]);
    f.person.findFirst.mockResolvedValue(null);
    await expect(list(actor, { ...query, cursor: first.nextCursor }, f.deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("freezes and clones clock before known Serializable retries", async () => {
    const f = fixture(); const date = new Date("2026-10-03T16:59:59.999Z"); f.now.mockReturnValue(date);
    f.transaction.mockImplementationOnce(async (operation) => { await operation(f.tx); date.setTime(Date.parse(query.to)); throw new Prisma.PrismaClientKnownRequestError("private", { code: "P2034", clientVersion: "6" }); });
    const result = await list(actor, query, f.deps);
    expect(result.evaluationAsOf).toBe("2026-10-03T16:59:59.999Z"); expect(result.items).toHaveLength(1);
    expect(f.transaction).toHaveBeenCalledTimes(2); expect(f.now).toHaveBeenCalledOnce();
  });
  it.each(["version", "stop", "scope", "anchor"])("conflicts authentic stale continuation %s", async (change) => {
    const f = fixture(101); const first = await list(actor, query, f.deps);
    let cursor = first.nextCursor;
    if (change === "version") f.row.updatedAt = new Date(Date.parse(instant) + 1);
    if (change === "stop") f.row.status = "STOPPED";
    if (change === "anchor") cursor = encodeMedicationReminderOccurrenceCursor(actor, { cursorVersion: 1, sourceVersion: 1, aggregateVersion: instant, ...query, evaluationAsOf: first.evaluationAsOf, lastDueAt: known.dueAt, lastSourceKey: known.sourceKey });
    await expect(list(actor, { ...query, ...(change === "scope" ? { to: "2026-10-05T17:00:00.000Z" } : {}), cursor }, f.deps)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("cursor never bypasses resource ownership or eligibility", async () => {
    const f = fixture(101); const first = await list(actor, query, f.deps);
    f.personalMedication.findFirst.mockResolvedValue(null);
    await expect(list(actor, { ...query, cursor: first.nextCursor }, f.deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
    f.person.findFirst.mockResolvedValue(null);
    await expect(list(actor, { ...query, cursor: first.nextCursor }, f.deps)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it.each(["2026-10-04T00:00:00.000Z", "2026-10-04T01:00:00.000Z", "2026-10-04T02:00:00.000Z"])("strictly future at asOf %s; known elapsed can still be CURRENT", async (asOf) => {
    const f = fixture(); f.now.mockReturnValue(new Date(asOf));
    expect((await list(actor, query, f.deps)).items).toHaveLength(asOf < known.dueAt ? 1 : 0);
    expect(await revalidate(actor, known, f.deps)).toEqual({ status: "CURRENT", aggregateVersion: instant });
  });
  it("revalidates text/no-op edits using current version without requiring old input version", async () => {
    const f = fixture(); f.row.updatedAt = new Date(Date.parse(instant) + 1);
    expect(await revalidate(actor, known, f.deps)).toEqual({ status: "CURRENT", aggregateVersion: f.row.updatedAt.toISOString() });
    expect(f.now).not.toHaveBeenCalled();
  });
  it.each(["removed", "time", "readded", "stop", "localTime", "dueAt", "localDate", "unknown"])("returns only STALE for %s without alternative discovery", async (change) => {
    const f = fixture();
    if (change === "removed") f.row.schedules = [];
    if (change === "time") f.row.schedules[0].localTime = carrier("09:00");
    if (change === "readded") f.row.schedules[0].id = actor.userId;
    if (change === "stop") f.row.status = "STOPPED";
    const changed = { ...known, ...(change === "localTime" ? { localTime: "09:00" } : change === "dueAt" ? { dueAt: query.to } : change === "localDate" ? { localDate: "2026-10-05" } : change === "unknown" ? { sourceKey: createReminderSourceKey(actor.userId, known.localDate) } : {}) };
    expect(await revalidate(actor, changed, f.deps)).toEqual({ status: "STALE" }); expect(f.now).not.toHaveBeenCalled();
  });
  it.each([["00:00", "09:00", 1], ["03:00", "11:00", 1], ["03:00", "09:00", 0]] as const)("current edit at UTC %s to Bangkok %s gives %s future sources", async (clock, time, count) => {
    const f = fixture(); f.row.schedules[0] = { id: actor.userId, localTime: carrier(time) }; f.now.mockReturnValue(new Date(`2026-10-04T${clock}:00.000Z`));
    const page = await list(actor, query, f.deps); expect(page.items).toHaveLength(count); if (count) expect(page.items[0].localTime).toBe(time);
    expect(await revalidate(actor, known, f.deps)).toEqual({ status: "STALE" });
  });
  it("rejects malformed input before clock/transaction and tampered cursor safely", async () => {
    const f = fixture();
    await expect(list(actor, { ...query, evaluationAsOf: instant }, f.deps)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(revalidate(actor, { ...known, sourceKey: "bad" }, f.deps)).rejects.toMatchObject({ code: "VALIDATION" });
    expect(f.now).not.toHaveBeenCalled(); expect(f.transaction).not.toHaveBeenCalled();
    await expect(list(actor, { ...query, cursor: "bad" }, f.deps)).rejects.toMatchObject({ code: "VALIDATION" });
    expect(f.now).not.toHaveBeenCalled();
  });
  it("fails closed on invalid server clock, persisted schedule and infrastructure", async () => {
    const f = fixture();
    for (const date of [new Date(NaN), new Date("1969-12-31T23:59:59.999Z"), new Date("9999-12-31T17:00:00.000Z")]) {
      f.now.mockReturnValue(date); await expect(list(actor, query, f.deps)).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
    }
    f.now.mockReturnValue(new Date(instant)); f.row.schedules[0].localTime = new Date("1970-01-01T08:00:01.000Z");
    await expect(list(actor, query, f.deps)).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
    f.row.schedules = Array(1441).fill({ id: childId, localTime: carrier("08:00") });
    await expect(revalidate(actor, known, f.deps)).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
    f.transaction.mockRejectedValue(new Error("private SQL"));
    await expect(list(actor, query, f.deps)).rejects.toMatchObject({ code: "INFRASTRUCTURE", message: "Personal medication reminder source could not be loaded" });
    expect(f.transaction).toHaveBeenCalledTimes(3);
    f.transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("private", { code: "P2034", clientVersion: "6" })); f.transaction.mockClear();
    await expect(list(actor, query, f.deps)).rejects.toMatchObject({ code: "CONFLICT" }); expect(f.transaction).toHaveBeenCalledTimes(3);
  });
});
