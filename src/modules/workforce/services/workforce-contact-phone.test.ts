import { HospitalStatus, MembershipStatus, MembershipType, Role, UserStatus, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { fingerprintWorkforceBulkSubmission } from "./workforce-bulk-submission";
import { updateWorkforceContactPhone } from "./workforce-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const actorId = "33333333-3333-4333-8333-333333333333";
const updatedAt = new Date("2026-10-24T10:00:00.000Z");
const owner: ActorContext = { userId: actorId, personId: actorId, roles: [Role.HOSPITAL], hospitalMemberships: [{ hospitalId, membershipType: MembershipType.OWNER, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }], osmHospitalRelationships: [] };
const input = { kind: "staff" as const, targetHospitalId: hospitalId, relationshipId, expectedUpdatedAt: updatedAt.toISOString(), contactPhone: "081-234-5678" };

function databaseFixture() {
  const audit = vi.fn().mockResolvedValue({ id: relationshipId });
  const update = vi.fn().mockResolvedValue({ count: 1 });
  const tx = {
    user: { findUnique: vi.fn().mockResolvedValue({ status: UserStatus.ACTIVE, roles: [{ role: Role.HOSPITAL }] }) },
    hospitalMembership: { findFirst: vi.fn().mockResolvedValue({ id: actorId }), updateMany: update, findUniqueOrThrow: vi.fn().mockResolvedValue({ id: relationshipId, hospitalId, updatedAt }) },
    osmHospitalRelationship: { updateMany: update, findUniqueOrThrow: vi.fn().mockResolvedValue({ id: relationshipId, hospitalId, updatedAt }) },
    auditEvent: { create: audit },
  };
  const database = { $transaction: vi.fn(async (operation: (transaction: typeof tx) => Promise<unknown>) => operation(tx)) } as unknown as PrismaClient;
  return { database, tx, update, audit };
}

describe("WF-PHONE OWNER edit", () => {
  it.each(["staff", "osm"] as const)("normalizes and atomically updates %s with a PII-free audit", async (kind) => {
    const f = databaseFixture();
    await updateWorkforceContactPhone(owner, { ...input, kind }, { database: f.database });
    expect(f.update).toHaveBeenCalledWith({ where: { id: relationshipId, hospitalId, status: { not: "ENDED" }, updatedAt }, data: { contactPhone: "0812345678" } });
    expect(f.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "workforce.contact_phone_updated", metadata: { hospitalId } }) });
    expect(JSON.stringify(f.audit.mock.calls)).not.toContain("0812345678");
  });
  it.each(["MEMBER", "OSM", "ADMIN", "OTHER_HOSPITAL", "SUSPENDED_OWNER", "INACTIVE_HOSPITAL"])("denies %s", async (kind) => {
    const f = databaseFixture();
    const membership = { ...owner.hospitalMemberships[0], ...(kind === "MEMBER" ? { membershipType: MembershipType.MEMBER } : {}), ...(kind === "OTHER_HOSPITAL" ? { hospitalId: relationshipId } : {}), ...(kind === "SUSPENDED_OWNER" ? { status: MembershipStatus.SUSPENDED } : {}), ...(kind === "INACTIVE_HOSPITAL" ? { hospitalStatus: HospitalStatus.SUSPENDED } : {}) };
    const actor = { ...owner, roles: kind === "OSM" ? [Role.OSM] : kind === "ADMIN" ? [Role.ADMIN] : [Role.HOSPITAL], hospitalMemberships: [membership] };
    await expect(updateWorkforceContactPhone(actor, input, { database: f.database })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.update).not.toHaveBeenCalled();
    expect(f.audit).not.toHaveBeenCalled();
  });
  it("rechecks persisted authority rather than trusting an OWNER context", async () => {
    const f = databaseFixture();
    f.tx.hospitalMembership.findFirst.mockResolvedValue(null);
    await expect(updateWorkforceContactPhone(owner, input, { database: f.database })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.update).not.toHaveBeenCalled();
  });
  it("refuses stale versions or ended relationships without auditing success", async () => {
    const f = databaseFixture();
    f.update.mockResolvedValue({ count: 0 });
    await expect(updateWorkforceContactPhone(owner, input, { database: f.database })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(f.audit).not.toHaveBeenCalled();
  });
});

describe("WF-PHONE bulk fingerprint", () => {
  const batch = { submissionId: "1792836000000.22222222-2222-4222-8222-222222222222", targetHospitalId: hospitalId, kind: "OSM" as const, rows: [{ nationalId: "1000000000009", givenName: "สมใจ", familyName: "ใจดี", contactPhone: "081-234-5678" }] };
  it("includes normalized phones and detects changed or forbidden raw phones", () => {
    const fingerprint = fingerprintWorkforceBulkSubmission(actorId, batch);
    const withPhone = (contactPhone: string) => fingerprintWorkforceBulkSubmission(actorId, { ...batch, rows: [{ ...batch.rows[0], contactPhone }] });
    expect(withPhone("081 234 5678")).toBe(fingerprint);
    expect(withPhone("0899999999")).not.toBe(fingerprint);
    expect(withPhone("0812345678\n")).not.toBe(fingerprint);
  });
});
