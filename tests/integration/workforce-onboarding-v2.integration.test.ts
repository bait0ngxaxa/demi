import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  PrismaClient,
  Role,
  UserStatus,
  WorkforceActivationPurpose,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import { createActorContextStore } from "@/modules/auth/services/actor-context-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { completePatientActivation, getPatientActivationDetails, issuePatientActivation } from "@/modules/patient-activation/services/patient-activation-service";
import { provisionPatientFixture as provisionPatient } from "./support/patient-provisioning";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { hashWorkforceActivationToken } from "@/modules/workforce/services/activation-token-service";
import {
  completeWorkforceActivation,
  completeWorkforcePasswordReset,
  getWorkforceDetail,
  issueWorkforceActivationSlips,
  issueWorkforcePasswordReset,
  listHospitalOwnersForPasswordReset,
  listWorkforce,
  listWorkforceHospitals,
  previewWorkforceActivation,
  provisionHospitalMember,
  provisionOsm,
  provisionWorkforceBulk,
  regenerateWorkforceActivation,
  revokeIssuedWorkforceActivation,
  revokeWorkforceActivation,
  suspendOsmRelationship,
  updateWorkforceContactPhone,
  WorkforceBulkDuplicateError,
  type WorkforceDatabase,
} from "@/modules/workforce/services/workforce-service";
import { InfrastructureError } from "@/shared/errors/application-error";
import { PasswordAuthProvisioningProviderRejectedError } from "@/modules/auth/services/password-auth-provisioning-service";
import { generateWorkforceActivationCredential } from "@/modules/workforce/services/activation-token-service";

const { mockedReplacePassword } = vi.hoisted(() => ({ mockedReplacePassword: vi.fn() }));

vi.mock("@/modules/account-security/adapters/supabase-account-security-provider", () => ({
  replacePasswordAndRevokeRecoverySessions: mockedReplacePassword,
}));

const prisma = getPrisma();
const PASSWORD = "integration-workforce-password";
const NEW_PASSWORD = "integration-new-workforce-password";
const GENERIC_UNAVAILABLE = "ไม่สามารถยืนยันได้";

function faultDatabase(hook: (call: number, phase: "before" | "after") => Promise<void>): WorkforceDatabase {
  let calls = 0;
  return new Proxy(prisma, {
    get(target, key) {
      if (key !== "$transaction") return Reflect.get(target, key);
      return async <T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>,
        options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): Promise<T> => {
        const call = ++calls;
        await hook(call, "before");
        const result = await target.$transaction(operation, options);
        await hook(call, "after");
        return result;
      };
    },
  });
}

// Valid Thai national IDs (checksum included) so the suite never depends on the test bypass.
function nationalIdFor(sequence: number): string {
  const base = `1${String(sequence).padStart(11, "0")}`;
  const sum = Array.from(base, Number).reduce((total, digit, index) => total + digit * (13 - index), 0);

  return `${base}${(11 - (sum % 11)) % 10}`;
}

async function clearDatabase(): Promise<void> {
  await prisma.auditEvent.deleteMany();
  await prisma.patientActivation.deleteMany();
  await prisma.patientOsmAssignment.deleteMany();
  await prisma.workforceActivation.deleteMany();
  await prisma.osmHospitalRelationship.deleteMany();
  await prisma.hospitalOnboardingApplication.deleteMany();
  await prisma.hospitalMembership.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.$transaction([
    prisma.$executeRaw`SELECT set_config('demi.service_area_purge', 'demo-reset', true)`,
    prisma.hospitalServiceArea.deleteMany(),
  ]);
  await prisma.hospitalServiceAreaEligibility.deleteMany();
  await prisma.user.deleteMany();
  await prisma.hospital.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.person.deleteMany();
}

async function createHospital(code: string): Promise<{ id: string; name: string }> {
  return prisma.hospital.create({
    data: { hospitalCode: code, name: `โรงพยาบาล ${code}`, status: HospitalStatus.ACTIVE },
    select: { id: true, name: true },
  });
}

type TestActor = { actor: ActorContext; userId: string };

async function createMember(
  hospitalId: string,
  membershipType: MembershipType,
  sequence: number,
): Promise<TestActor> {
  const person = await prisma.person.create({
    data: {
      identityKeyHash: hashIdentityReference({
        namespace: "thai-national-id",
        value: nationalIdFor(sequence),
      }),
      givenName: "ผู้ดูแล",
      familyName: `หมายเลข${sequence}`,
    },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, authSubject: randomUUID(), status: UserStatus.ACTIVE },
    select: { id: true },
  });

  await prisma.userRole.create({ data: { userId: user.id, role: Role.HOSPITAL } });
  await prisma.hospitalMembership.create({
    data: {
      userId: user.id,
      hospitalId,
      membershipType,
      profession: membershipType === MembershipType.MEMBER ? "NURSE" : null,
      status: MembershipStatus.ACTIVE,
    },
  });

  return {
    userId: user.id,
    actor: {
      userId: user.id,
      personId: person.id,
      roles: [Role.HOSPITAL],
      hospitalMemberships: [
        {
          hospitalId,
          membershipType,
          profession: membershipType === MembershipType.MEMBER ? "NURSE" : null,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
      osmHospitalRelationships: [],
    },
  };
}

async function createAdmin(sequence: number): Promise<TestActor> {
  const person = await prisma.person.create({
    data: {
      identityKeyHash: hashIdentityReference({
        namespace: "thai-national-id",
        value: nationalIdFor(sequence),
      }),
    },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, authSubject: randomUUID(), status: UserStatus.ACTIVE },
    select: { id: true },
  });

  await prisma.userRole.create({ data: { userId: user.id, role: Role.ADMIN } });

  return {
    userId: user.id,
    actor: {
      userId: user.id,
      personId: person.id,
      roles: [Role.ADMIN],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    },
  };
}

async function createActiveOsm(
  hospitalId: string,
  sequence: number,
): Promise<{ userId: string; authSubject: string; nationalId: string }> {
  const nationalId = nationalIdFor(sequence);
  const person = await prisma.person.create({
    data: {
      identityKeyHash: hashIdentityReference({ namespace: "thai-national-id", value: nationalId }),
      givenName: "สมหญิง",
      familyName: "ใจดี",
    },
    select: { id: true },
  });
  const authSubject = randomUUID();
  const user = await prisma.user.create({
    data: { personId: person.id, authSubject, status: UserStatus.ACTIVE },
    select: { id: true },
  });

  await prisma.userRole.create({ data: { userId: user.id, role: Role.OSM } });
  await prisma.osmHospitalRelationship.create({
    data: { userId: user.id, hospitalId, status: MembershipStatus.ACTIVE, contactPhone: "0812345678" },
  });

  return { userId: user.id, authSubject, nationalId };
}

function provisioner(authSubject: string) {
  return async ({ userId, password }: { userId: string; password: string }) => {
    expect(password).toBe(PASSWORD);
    await prisma.user.update({ where: { id: userId }, data: { authSubject } });
    return { userId, authSubject };
  };
}

async function provisionPendingOsm(
  owner: TestActor,
  hospitalId: string,
  sequence: number,
): Promise<{ userId: string; relationshipId: string; token: string; nationalId: string }> {
  const nationalId = nationalIdFor(sequence);
  const result = await provisionOsm(owner.actor, { contactPhone: "0812345678",
    nationalId,
    givenName: "สมชาย",
    familyName: "ใจดีมาก",
    targetHospitalId: hospitalId,
  });

  return { userId: result.userId, relationshipId: result.relationshipId, token: result.activationToken!, nationalId };
}

async function createPatientIdentity(
  hospitalId: string,
  sequence: number,
  status: UserStatus,
): Promise<{ userId: string; personId: string; nationalId: string; authSubject: string | null }> {
  const nationalId = nationalIdFor(sequence);
  const person = await prisma.person.create({
    data: {
      identityKeyHash: hashIdentityReference({ namespace: "thai-national-id", value: nationalId }),
      givenName: "ผู้ป่วย",
      familyName: `หมายเลข${sequence}`,
    },
    select: { id: true },
  });
  const authSubject = status === UserStatus.ACTIVE ? randomUUID() : null;
  const user = await prisma.user.create({
    data: { personId: person.id, status, authSubject },
    select: { id: true },
  });
  await prisma.userRole.create({ data: { userId: user.id, role: Role.PATIENT } });
  const profile = await prisma.patientProfile.create({ data: { personId: person.id }, select: { id: true } });
  await prisma.patientHospitalRelationship.create({ data: { patientProfileId: profile.id, hospitalId, hospitalNumber: `HN${sequence}` } });

  return { userId: user.id, personId: person.id, nationalId, authSubject };
}

async function identityState(userId: string) {
  return {
    user: await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { status: true, authSubject: true, personId: true } }),
    roles: (await prisma.userRole.findMany({ where: { userId }, select: { role: true }, orderBy: { role: "asc" } })).map(({ role }) => role),
    memberships: await prisma.hospitalMembership.count({ where: { userId } }),
    osm: await prisma.osmHospitalRelationship.count({ where: { userId } }),
    activations: await prisma.workforceActivation.count({ where: { userId } }),
    patientRelationships: await prisma.patientHospitalRelationship.count({ where: { patientProfile: { person: { user: { id: userId } } } } }),
    audits: await prisma.auditEvent.count(),
  };
}

async function auditCount(action: string): Promise<number> {
  return prisma.auditEvent.count({ where: { action } });
}

describe("workforce onboarding v2 PostgreSQL workflow", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    mockedReplacePassword.mockReset();
    await clearDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("WF-PHONE persistence and replay", () => {
    it("persists normalized phones in single provisioning and enforces database format checks", async () => {
      const hospital = await createHospital("PHONE-SINGLE");
      const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
      const input = { nationalId: nationalIdFor(1899), givenName: "สมใจ", familyName: "ใจดี", targetHospitalId: hospital.id, contactPhone: "089-123-4567" };
      const osm = await provisionOsm(owner.actor, input);
      const staff = await provisionHospitalMember(owner.actor, { ...input, contactPhone: "02 123 4567", profession: "NURSE" });
      expect((await prisma.osmHospitalRelationship.findUniqueOrThrow({ where: { id: osm.relationshipId } })).contactPhone).toBe("0891234567");
      expect((await prisma.hospitalMembership.findUniqueOrThrow({ where: { id: staff.relationshipId } })).contactPhone).toBe("021234567");
      await expect(prisma.$executeRaw`UPDATE "HospitalMembership" SET "contactPhone" = ${"081-234-5678"} WHERE "id" = ${staff.relationshipId}::uuid`).rejects.toThrow();
      await expect(prisma.$executeRaw`UPDATE "OsmHospitalRelationship" SET "contactPhone" = ${"0712345678"} WHERE "id" = ${osm.relationshipId}::uuid`).rejects.toThrow();
    });
    it.each(["HOSPITAL_MEMBER", "OSM"] as const)("requires every bulk phone and persists normalized %s phones", async (kind) => {
      const hospital = await createHospital("PHONE-BULK");
      const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
      const row = { nationalId: nationalIdFor(1900), givenName: "สมใจ", familyName: "ใจดี", ...(kind === "HOSPITAL_MEMBER" ? { profession: "NURSE" } : {}) };
      const missing = await provisionWorkforceBulk(owner.actor, { submissionId: `${Date.now()}.${randomUUID()}`, targetHospitalId: hospital.id, kind, rows: [row] });
      expect(missing.rows[0]).toMatchObject({ status: "invalid", reason: "INVALID_ROW" });
      const input = { submissionId: `${Date.now()}.${randomUUID()}`, targetHospitalId: hospital.id, kind, rows: [{ ...row, contactPhone: "081-234-5678" }] };
      const result = await provisionWorkforceBulk(owner.actor, input);
      const saved = result.rows[0];
      expect(saved.status).toBe("created");
      if (saved.status === "invalid") throw new Error("Expected provisioned row");
      const relationship = kind === "OSM" ? await prisma.osmHospitalRelationship.findUniqueOrThrow({ where: { id: saved.relationshipId } }) : await prisma.hospitalMembership.findUniqueOrThrow({ where: { id: saved.relationshipId } });
      expect(relationship.contactPhone).toBe("0812345678");
      expect(await provisionWorkforceBulk(owner.actor, input)).toEqual(result);
      await expect(provisionWorkforceBulk(owner.actor, { ...input, rows: [{ ...row, contactPhone: "0899999999" }] })).rejects.toMatchObject({ code: "CONFLICT" });
      const slips = await issueWorkforceActivationSlips(owner.actor, { targetHospitalId: hospital.id, kind, userIds: [saved.userId] });
      expect(JSON.stringify(slips)).not.toContain("0812345678");
    });

    it.each(["staff", "osm"] as const)("lets OWNER add a legacy %s phone, rejects stale edits, and audits without a phone", async (kind) => {
      const hospital = await createHospital("PHONE-EDIT");
      const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
      const target = await provisionPendingOsm(owner, hospital.id, 1901);
      const staff = kind === "staff" ? await provisionHospitalMember(owner.actor, { contactPhone: "021234567", nationalId: target.nationalId, givenName: "สมชาย", familyName: "ใจดีมาก", targetHospitalId: hospital.id, profession: "NURSE" }) : null;
      const relationshipId = staff?.relationshipId ?? target.relationshipId;
      const legacy = kind === "staff" ? await prisma.hospitalMembership.update({ where: { id: relationshipId }, data: { contactPhone: null } }) : await prisma.osmHospitalRelationship.update({ where: { id: relationshipId }, data: { contactPhone: null } });
      const input = { kind, relationshipId, targetHospitalId: hospital.id, expectedUpdatedAt: legacy.updatedAt.toISOString(), contactPhone: "02-123-4567" };
      await updateWorkforceContactPhone(owner.actor, input);
      expect((await getWorkforceDetail(owner.actor, { kind, relationshipId })).contactPhone).toBe("021234567");
      await expect(updateWorkforceContactPhone(owner.actor, input)).rejects.toMatchObject({ code: "CONFLICT" });
      const events = await prisma.auditEvent.findMany({ where: { action: "workforce.contact_phone_updated" } });
      expect(events).toHaveLength(1);
      expect(events[0].metadata).toEqual({ hospitalId: hospital.id });
      expect(JSON.stringify(events)).not.toContain("021234567");
    });

    it("keeps a reused ACTIVE User's phones local to each new relationship", async () => {
      const a = await createHospital("PHONE-A");
      const b = await createHospital("PHONE-B");
      const ownerA = await createMember(a.id, MembershipType.OWNER, 1);
      const ownerB = await createMember(b.id, MembershipType.OWNER, 2);
      const active = await createActiveOsm(a.id, 1902);
      const added = await provisionOsm(ownerB.actor, { nationalId: active.nationalId, givenName: "สมหญิง", familyName: "ใจดี", targetHospitalId: b.id, contactPhone: "053-123-456" });
      expect(added.userId).toBe(active.userId);
      expect(await prisma.osmHospitalRelationship.findMany({ where: { userId: active.userId }, select: { hospitalId: true, contactPhone: true } })).toEqual(expect.arrayContaining([{ hospitalId: a.id, contactPhone: "0812345678" }, { hospitalId: b.id, contactPhone: "053123456" }]));
      expect((await listWorkforce(ownerB.actor, { targetHospitalId: b.id })).rows.find((row) => row.userId === active.userId)?.contactPhone).toBe("053123456");
      expect((await getWorkforceDetail(ownerA.actor, { kind: "osm", relationshipId: (await prisma.osmHospitalRelationship.findFirstOrThrow({ where: { userId: active.userId, hospitalId: a.id } })).id })).contactPhone).toBe("0812345678");
    });
  });

  describe("activation identity check", () => {
    it("previews only a masked name and treats every unusable token alike", async () => {
      const hospital = await createHospital("V2-PREVIEW");
      const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
      const pending = await provisionPendingOsm(owner, hospital.id, 100);

      const preview = await previewWorkforceActivation(pending.token);

      expect(preview).toEqual({ maskedName: "สม*** ใจ***", purpose: "ACTIVATION" });
      expect(JSON.stringify(preview)).not.toContain(pending.nationalId);
      expect(JSON.stringify(preview)).not.toContain("ใจดีมาก");

      await expect(previewWorkforceActivation("unknown-token")).rejects.toMatchObject({
        code: "CONFLICT",
      });
      await prisma.workforceActivation.updateMany({
        where: { userId: pending.userId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await expect(previewWorkforceActivation(pending.token)).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    it("rejects a wrong national ID with the same error as a bad link and never calls the provider", async () => {
      const hospital = await createHospital("V2-WRONG");
      const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
      const pending = await provisionPendingOsm(owner, hospital.id, 100);
      const provisionIdentity = vi.fn();

      const wrongId = await completeWorkforceActivation(
        pending.token,
        { nationalId: nationalIdFor(999), password: PASSWORD, passwordConfirmation: PASSWORD },
        { provisionIdentity },
      ).catch((error: Error) => error);
      const badLink = await completeWorkforceActivation(
        "not-a-real-token",
        { nationalId: pending.nationalId, password: PASSWORD, passwordConfirmation: PASSWORD },
        { provisionIdentity },
      ).catch((error: Error) => error);

      expect(wrongId).toMatchObject({ code: "CONFLICT" });
      expect((wrongId as Error).message).toBe((badLink as Error).message);
      expect((wrongId as Error).message).toContain(GENERIC_UNAVAILABLE);
      expect(provisionIdentity).not.toHaveBeenCalled();
      expect(
        await prisma.workforceActivation.findFirst({
          where: { userId: pending.userId },
          select: { failedVerificationCount: true, revokedAt: true },
        }),
      ).toEqual({ failedVerificationCount: 1, revokedAt: null });
    });

    it("keeps the link usable after four failures and succeeds with the correct ID", async () => {
      const hospital = await createHospital("V2-FOUR");
      const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
      const pending = await provisionPendingOsm(owner, hospital.id, 100);

      for (let attempt = 0; attempt < 4; attempt += 1) {
        await expect(
          completeWorkforceActivation(pending.token, {
            nationalId: nationalIdFor(900 + attempt),
            password: PASSWORD,
            passwordConfirmation: PASSWORD,
          }),
        ).rejects.toMatchObject({ code: "CONFLICT" });
      }

      await completeWorkforceActivation(
        pending.token,
        { nationalId: pending.nationalId, password: PASSWORD, passwordConfirmation: PASSWORD },
        { provisionIdentity: provisioner(randomUUID()) },
      );

      expect(
        await prisma.user.findUnique({ where: { id: pending.userId }, select: { status: true } }),
      ).toEqual({ status: UserStatus.ACTIVE });
    });

    it("revokes the token after five wrong IDs, audits it, and rejects the correct ID afterwards", async () => {
      const hospital = await createHospital("V2-FIVE");
      const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
      const pending = await provisionPendingOsm(owner, hospital.id, 100);
      const provisionIdentity = vi.fn();

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await expect(
          completeWorkforceActivation(
            pending.token,
            { nationalId: nationalIdFor(900 + attempt), password: PASSWORD, passwordConfirmation: PASSWORD },
            { provisionIdentity },
          ),
        ).rejects.toMatchObject({ code: "CONFLICT" });
      }

      const activation = await prisma.workforceActivation.findFirstOrThrow({
        where: { userId: pending.userId },
        select: { failedVerificationCount: true, revokedAt: true, usedAt: true },
      });
      expect(activation.failedVerificationCount).toBe(5);
      expect(activation.revokedAt).toBeInstanceOf(Date);
      expect(await auditCount("workforce_activation.verification_failed")).toBe(5);
      expect(await auditCount("workforce_activation.revoked")).toBe(1);

      await expect(
        completeWorkforceActivation(
          pending.token,
          { nationalId: pending.nationalId, password: PASSWORD, passwordConfirmation: PASSWORD },
          { provisionIdentity },
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(previewWorkforceActivation(pending.token)).rejects.toMatchObject({ code: "CONFLICT" });
      expect(provisionIdentity).not.toHaveBeenCalled();

      const events = await prisma.auditEvent.findMany({
        where: { action: { startsWith: "workforce_activation." } },
        select: { metadata: true },
      });
      const serialized = JSON.stringify(events);
      expect(serialized).not.toContain(pending.nationalId);
      expect(serialized).not.toContain(pending.token);
    });
  });

  describe("activation context and durable provider effects", () => {
    async function setup() {
      const hospital = await createHospital("BOUND-A");
      const other = await createHospital("BOUND-B");
      const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
      const pending = await provisionPendingOsm(owner, hospital.id, 2);
      const input = { nationalId: pending.nationalId, password: PASSWORD, passwordConfirmation: PASSWORD };
      const authSubject = randomUUID();
      return { hospital, other, owner, pending, input, authSubject };
    }

    it.each(["revoked_relationship", "suspended_hospital", "suspended_user", "revoked_issuer", "removed_role", "target_owner", "reassigned_relationship", "removed_relationship"])(
      "rejects %s instead of inheriting unrelated scope", async (change) => {
        const { hospital, other, owner, pending, input } = await setup();
        const relationship = await prisma.osmHospitalRelationship.findFirstOrThrow({ where: { userId: pending.userId } });
        if (change === "revoked_relationship") await prisma.osmHospitalRelationship.update({ where: { id: relationship.id }, data: { status: MembershipStatus.SUSPENDED } });
        if (change === "suspended_hospital") await prisma.hospital.update({ where: { id: hospital.id }, data: { status: HospitalStatus.SUSPENDED } });
        if (change === "suspended_user") await prisma.user.update({ where: { id: pending.userId }, data: { status: UserStatus.SUSPENDED } });
        if (change === "revoked_issuer") await prisma.hospitalMembership.updateMany({ where: { userId: owner.userId }, data: { status: MembershipStatus.SUSPENDED } });
        if (change === "removed_role") await prisma.userRole.deleteMany({ where: { userId: pending.userId, role: Role.OSM } });
        if (change === "target_owner") await prisma.hospitalMembership.create({ data: { userId: pending.userId, hospitalId: other.id, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE } });
        if (change === "reassigned_relationship") await prisma.osmHospitalRelationship.update({ where: { id: relationship.id }, data: { hospitalId: other.id } });
        if (change === "removed_relationship") await prisma.osmHospitalRelationship.delete({ where: { id: relationship.id } });
        // A qualifying relationship elsewhere must never repair the bound relationship's authorization.
        if (change !== "reassigned_relationship") await prisma.osmHospitalRelationship.create({ data: { userId: pending.userId, hospitalId: other.id, status: MembershipStatus.PROVISIONED } });
        const provisionIdentity = vi.fn();
        await expect(completeWorkforceActivation(pending.token, input, { provisionIdentity })).rejects.toMatchObject({ code: "CONFLICT" });
        expect(provisionIdentity).not.toHaveBeenCalled();
      },
    );

    it("rejects cross-Hospital first-time activation and preserves both pending relationships", async () => {
      const { other, owner, pending, input } = await setup();
      await prisma.osmHospitalRelationship.create({ data: { userId: pending.userId, hospitalId: other.id, status: MembershipStatus.PROVISIONED } });
      const provisionIdentity = vi.fn();
      await expect(completeWorkforceActivation(pending.token, input, { provisionIdentity })).rejects.toMatchObject({ code: "CONFLICT" });
      expect(provisionIdentity).not.toHaveBeenCalled();
      expect(await prisma.osmHospitalRelationship.count({ where: { userId: pending.userId, status: MembershipStatus.PROVISIONED } })).toBe(2);
      expect(await prisma.user.findUniqueOrThrow({ where: { id: owner.userId } })).toMatchObject({ status: UserStatus.ACTIVE });
    });

    it.each([Role.HOSPITAL, Role.OSM])("rejects missing %s role in a combined same-Hospital pending activation", async (removedRole) => {
      const { hospital, owner, pending, input, authSubject } = await setup();
      await provisionHospitalMember(owner.actor, { contactPhone: "0812345678", nationalId: pending.nationalId, givenName: "สมชาย", familyName: "ทีม", targetHospitalId: hospital.id, profession: "NURSE" });
      const token = removedRole === Role.OSM ? (await regenerateWorkforceActivation(owner.actor, {
        userId: pending.userId, targetHospitalId: hospital.id, kind: "HOSPITAL_MEMBER", mode: "REMOTE",
      })).activationToken : pending.token;
      await prisma.userRole.deleteMany({ where: { userId: pending.userId, role: removedRole } });
      const provisionIdentity = vi.fn(provisioner(authSubject));
      await expect(completeWorkforceActivation(token, input, { provisionIdentity })).rejects.toMatchObject({ code: "CONFLICT" });
      expect(provisionIdentity).not.toHaveBeenCalled();
    });

    it("blocks new credentials for revoked ambiguous initial operations until reconciliation", async () => {
      const { hospital, owner, pending } = await setup();
      const now = new Date();
      await prisma.workforceActivation.updateMany({ where: { userId: pending.userId }, data: {
        claimedAt: now, revokedAt: now, reconciliationRequiredAt: now, operationState: "RECONCILIATION_REQUIRED",
      } });
      await expect(regenerateWorkforceActivation(owner.actor, { userId: pending.userId, targetHospitalId: hospital.id, kind: "OSM", mode: "REMOTE" })).rejects.toMatchObject({ code: "CONFLICT" });
      const slips = await issueWorkforceActivationSlips(owner.actor, { targetHospitalId: hospital.id, kind: "OSM", userIds: [pending.userId] });
      expect(slips.slips).toHaveLength(0);
      await expect(provisionOsm(owner.actor, { contactPhone: "0812345678", nationalId: pending.nationalId, givenName: "สมชาย", familyName: "เดิม", targetHospitalId: hospital.id })).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await prisma.workforceActivation.count({ where: { userId: pending.userId } })).toBe(1);
      expect(await auditCount("workforce_activation.issued")).toBe(1);
      expect((await listWorkforce(owner.actor, { targetHospitalId: hospital.id })).rows.find(({ userId }) => userId === pending.userId)).toMatchObject({ activationStatus: "IN_PROGRESS" });
    });

    it("can retry a definitive provider rejection without persisting a password", async () => {
      const { pending, input, authSubject } = await setup();
      await expect(completeWorkforceActivation(pending.token, input, { provisionIdentity: vi.fn().mockRejectedValue(new PasswordAuthProvisioningProviderRejectedError()) })).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
      expect(await prisma.workforceActivation.findFirstOrThrow({ where: { userId: pending.userId } })).toMatchObject({ operationState: "NOT_STARTED", claimedAt: null });
      await completeWorkforceActivation(pending.token, input, { provisionIdentity: provisioner(authSubject) });
      expect(await prisma.workforceActivation.findFirstOrThrow({ where: { userId: pending.userId } })).toMatchObject({ operationState: "FINALIZED", usedAt: expect.any(Date) });
      expect(JSON.stringify(await prisma.workforceActivation.findMany())).not.toContain(PASSWORD);
    });

    it("quarantines an ambiguous provider outcome and refuses to overwrite it on replay", async () => {
      const { pending, input, authSubject } = await setup();
      const provisionIdentity = vi.fn(async ({ userId }: { userId: string; password: string }) => {
        await prisma.user.update({ where: { id: userId }, data: { authSubject } });
        throw new Error("Provider response lost after application");
      });
      await expect(completeWorkforceActivation(pending.token, input, { provisionIdentity })).rejects.toMatchObject({ requiresReconciliation: true });
      expect(await prisma.workforceActivation.findFirstOrThrow({ where: { userId: pending.userId } })).toMatchObject({ operationState: "RECONCILIATION_REQUIRED", claimedAt: expect.any(Date), reconciliationRequiredAt: expect.any(Date), usedAt: null });
      await expect(completeWorkforceActivation(pending.token, input, { provisionIdentity })).rejects.toMatchObject({ code: "CONFLICT" });
      expect(provisionIdentity).toHaveBeenCalledOnce();
      expect(await auditCount("workforce_activation.reconciliation_required")).toBe(1);
    });

    it("retains a durable provider-started state even if reconciliation persistence is unavailable", async () => {
      const { pending, input } = await setup();
      const database = faultDatabase(async (call, phase) => {
        if (call >= 3 && phase === "before") throw new InfrastructureError("Reconciliation storage unavailable");
      });
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const provisionIdentity = vi.fn().mockRejectedValue(new Error("Unknown provider outcome"));
      await expect(completeWorkforceActivation(pending.token, input, { provisionIdentity, database })).rejects.toMatchObject({ requiresReconciliation: true });
      expect(await prisma.workforceActivation.findFirstOrThrow({ where: { userId: pending.userId } })).toMatchObject({ operationState: "PROVIDER_STARTED", claimedAt: expect.any(Date), usedAt: null });
      await expect(completeWorkforceActivation(pending.token, input, { provisionIdentity })).rejects.toMatchObject({ code: "CONFLICT" });
      expect(provisionIdentity).toHaveBeenCalledOnce();
      expect(errorLog).toHaveBeenCalledWith("Workforce activation reconciliation marker could not be persisted");
    });

    it("recognizes a committed finalization after the DB response is lost without deleting the identity", async () => {
      const { pending, input, authSubject } = await setup();
      const database = faultDatabase(async (call, phase) => {
        // claim, provider-started, provider-confirmed, finalization
        if (call === 4 && phase === "after") throw new InfrastructureError("DB finalization response lost");
      });
      const deleteProviderIdentity = vi.fn();
      await expect(completeWorkforceActivation(pending.token, input, { database, provisionIdentity: provisioner(authSubject), deleteProviderIdentity })).resolves.toEqual({ userId: pending.userId });
      expect(deleteProviderIdentity).not.toHaveBeenCalled();
      expect(await auditCount("workforce_activation.completed")).toBe(1);
      expect(await prisma.user.findUniqueOrThrow({ where: { id: pending.userId } })).toMatchObject({ status: UserStatus.ACTIVE, authSubject });
    });

    it("compensates only a newly created initial identity when finalization fails and permits safe retry", async () => {
      const { pending, input, authSubject } = await setup();
      const database = faultDatabase(async (call, phase) => {
        if (call === 4 && phase === "before") throw new InfrastructureError("DB finalization unavailable");
      });
      const deleteProviderIdentity = vi.fn().mockResolvedValue(undefined);
      await expect(completeWorkforceActivation(pending.token, input, { database, provisionIdentity: provisioner(authSubject), deleteProviderIdentity })).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
      expect(deleteProviderIdentity).toHaveBeenCalledWith(authSubject);
      expect(await prisma.user.findUniqueOrThrow({ where: { id: pending.userId } })).toMatchObject({ status: UserStatus.PROVISIONED, authSubject: null });
      expect(await prisma.workforceActivation.findFirstOrThrow({ where: { userId: pending.userId } })).toMatchObject({ operationState: "NOT_STARTED", claimedAt: null, usedAt: null });
      await completeWorkforceActivation(pending.token, input, { provisionIdentity: provisioner(randomUUID()) });
      expect(await auditCount("workforce_activation.completed")).toBe(1);
    });

    it("rejects authority removal during provider execution and escalates failed compensation", async () => {
      const { owner, pending, input, authSubject } = await setup();
      const provisionIdentity = async ({ userId }: { userId: string; password: string }) => {
        await prisma.user.update({ where: { id: userId }, data: { authSubject } });
        await prisma.hospitalMembership.updateMany({ where: { userId: owner.userId }, data: { status: MembershipStatus.SUSPENDED } });
        return { userId, authSubject };
      };
      const deleteProviderIdentity = vi.fn().mockRejectedValue(new Error("Provider cleanup unavailable"));
      await expect(completeWorkforceActivation(pending.token, input, { provisionIdentity, deleteProviderIdentity })).rejects.toMatchObject({ requiresReconciliation: true });
      expect(await prisma.workforceActivation.findFirstOrThrow({ where: { userId: pending.userId } })).toMatchObject({ operationState: "RECONCILIATION_REQUIRED", usedAt: null });
      expect(await auditCount("workforce_activation.completed")).toBe(0);
    });
  });

  describe("global workforce recovery is fail-closed", () => {
    it.each(["MEMBER_AND_OWNER", "HOSPITAL_OSM", "PATIENT_WORKFORCE", "ADMIN", "SUSPENDED"])(
      "rejects a malicious issuer for %s, including legacy bearer token plus national ID", async (scenario) => {
        const hospital = await createHospital("RECOVERY-A");
        const other = await createHospital("RECOVERY-B");
        const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
        const target = await createMember(hospital.id, MembershipType.MEMBER, 2);
        if (scenario === "MEMBER_AND_OWNER") await prisma.hospitalMembership.create({ data: {
          userId: target.userId, hospitalId: other.id, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE,
        } });
        if (scenario === "HOSPITAL_OSM" || scenario === "PATIENT_WORKFORCE" || scenario === "ADMIN") await prisma.userRole.create({ data: {
          userId: target.userId, role: scenario === "HOSPITAL_OSM" ? Role.OSM : scenario === "ADMIN" ? Role.ADMIN : Role.PATIENT,
        } });
        if (scenario === "SUSPENDED") await prisma.hospitalMembership.updateMany({ where: { userId: target.userId }, data: { status: MembershipStatus.SUSPENDED } });
        const admin = await createAdmin(3);
        for (const issuer of [owner.actor, admin.actor]) await expect(issueWorkforcePasswordReset(issuer, {
          userId: target.userId, targetHospitalId: hospital.id,
        })).rejects.toMatchObject({ code: "FORBIDDEN" });
        const token = "issuer-visible-legacy-reset";
        const legacy = await prisma.workforceActivation.create({ data: {
          userId: target.userId, createdByUserId: owner.userId, tokenHash: hashWorkforceActivationToken(token),
          purpose: WorkforceActivationPurpose.RESET, mode: "ASSISTED", expiresAt: new Date(Date.now() + 900_000),
        } });
        const completion = { nationalId: nationalIdFor(2), password: NEW_PASSWORD, passwordConfirmation: NEW_PASSWORD };
        await expect(completeWorkforcePasswordReset(token, completion)).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(previewWorkforceActivation(token)).rejects.toMatchObject({ code: "CONFLICT" });
        await expect(completeWorkforceActivation(token, completion)).rejects.toMatchObject({ code: "CONFLICT" });
        expect(mockedReplacePassword).not.toHaveBeenCalled();
        expect(await prisma.workforceActivation.findUniqueOrThrow({ where: { id: legacy.id } })).toMatchObject({ claimedAt: null, usedAt: null });
        expect(await auditCount("workforce_password_reset.completed")).toBe(0);
      },
    );

    it.each(["expired", "revoked", "claimed", "consumed"])("never retries provider effects from a %s RESET", async (state) => {
      const hospital = await createHospital("LEGACY-RESET");
      const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
      const target = await createActiveOsm(hospital.id, 2);
      const now = new Date();
      const token = "legacy-ambiguous-reset";
      await prisma.workforceActivation.create({ data: {
        userId: target.userId, createdByUserId: owner.userId, tokenHash: hashWorkforceActivationToken(token), purpose: "RESET",
        expiresAt: state === "expired" ? new Date(now.getTime() - 1) : new Date(now.getTime() + 900_000),
        operationState: state === "claimed" ? "CLAIMED" : state === "consumed" ? "FINALIZED" : "NOT_STARTED",
        revokedAt: state === "revoked" ? now : null, claimedAt: state === "claimed" ? now : null, usedAt: state === "consumed" ? now : null,
      } });
      const replacePassword = vi.fn().mockRejectedValue(new Error("Ambiguous provider outcome"));
      const completion = { nationalId: target.nationalId, password: NEW_PASSWORD, passwordConfirmation: NEW_PASSWORD };
      const attempts = await Promise.allSettled([completeWorkforcePasswordReset(token, completion, { replacePassword }),
        completeWorkforcePasswordReset(token, { ...completion, password: "another-new-password", passwordConfirmation: "another-new-password" }, { replacePassword })]);
      expect(attempts.every(({ status }) => status === "rejected")).toBe(true);
      expect(replacePassword).not.toHaveBeenCalled();
    });

    it("quarantines application access for an ambiguous legacy global reset, even after token revocation", async () => {
      const hospital = await createHospital("QUARANTINE-RESET");
      const issuer = await createMember(hospital.id, MembershipType.OWNER, 1);
      const target = await createMember(hospital.id, MembershipType.MEMBER, 2);
      const store = createActorContextStore(prisma);
      const mapped = await prisma.user.findUniqueOrThrow({ where: { id: target.userId } });
      if (!mapped.authSubject) throw new Error("Fixture auth subject is missing");
      expect(await store.findUserByAuthSubject(mapped.authSubject)).not.toBeNull();
      await prisma.workforceActivation.create({ data: {
        userId: target.userId, createdByUserId: issuer.userId, purpose: "RESET", tokenHash: hashWorkforceActivationToken("possibly-applied-legacy-reset"),
        expiresAt: new Date(Date.now() - 1), claimedAt: new Date(), revokedAt: new Date(),
        reconciliationRequiredAt: new Date(), operationState: "RECONCILIATION_REQUIRED",
      } });
      expect(await store.findUserByAuthSubject(mapped.authSubject)).toBeNull();
      expect(await store.findUserById(target.userId)).toBeNull();
      expect(await store.findUserById(issuer.userId)).not.toBeNull();
      expect(await prisma.user.findUniqueOrThrow({ where: { id: target.userId } })).toMatchObject({ authSubject: mapped.authSubject, status: UserStatus.ACTIVE });
    });

    it("shows no ADMIN bypass in the owner directory", async () => {
      const hospital = await createHospital("ADMIN-RESET");
      const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
      const admin = await createAdmin(2);
      expect(await listHospitalOwnersForPasswordReset(admin.actor, hospital.id)).toEqual([
        { userId: owner.userId, displayName: "ผู้ดูแล หมายเลข1", canReset: false },
      ]);
      await expect(listHospitalOwnersForPasswordReset(owner.actor, hospital.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("OWNER-only OSM administration supersedes ADR-0008 D1", () => {
    it("denies MEMBER provisioning, listing, regeneration and slips", async () => {
      const hospital = await createHospital("V2-MEMBER-DENIED");
      const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
      const member = await createMember(hospital.id, MembershipType.MEMBER, 2);
      const pending = await provisionPendingOsm(owner, hospital.id, 300);
      await expect(provisionOsm(member.actor, { contactPhone: "0812345678", nationalId: nationalIdFor(301), givenName: "ห้าม", familyName: "สร้าง", targetHospitalId: hospital.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(listWorkforce(member.actor, { targetHospitalId: hospital.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(getWorkforceDetail(member.actor, { kind: "osm", relationshipId: pending.relationshipId })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(regenerateWorkforceActivation(member.actor, { kind: "OSM", userId: pending.userId, targetHospitalId: hospital.id, mode: "REMOTE" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(issueWorkforceActivationSlips(member.actor, { kind: "OSM", userIds: [pending.userId], targetHospitalId: hospital.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(listWorkforceHospitals(member.actor)).resolves.toEqual([]);
      const relationship = await prisma.osmHospitalRelationship.findFirstOrThrow({ where: { userId: pending.userId, hospitalId: hospital.id } });
      await expect(suspendOsmRelationship(member.actor, { relationshipId: relationship.id, targetHospitalId: hospital.id, expectedUpdatedAt: relationship.updatedAt.toISOString() })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(revokeWorkforceActivation(member.actor, { kind: "OSM", userId: pending.userId, targetHospitalId: hospital.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
      const activation = await prisma.workforceActivation.findFirstOrThrow({ where: { userId: pending.userId, revokedAt: null } });
      await prisma.workforceActivation.update({ where: { id: activation.id }, data: { createdByUserId: member.userId } });
      await expect(revokeIssuedWorkforceActivation(member.actor, { activationId: activation.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(revokeIssuedWorkforceActivation({ ...member.actor, hospitalMemberships: owner.actor.hospitalMemberships }, { activationId: activation.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(previewWorkforceActivation(pending.token)).resolves.toBeDefined();
      await completeWorkforceActivation(pending.token, { nationalId: pending.nationalId, password: PASSWORD, passwordConfirmation: PASSWORD }, { provisionIdentity: provisioner(randomUUID()) });
      expect(await prisma.osmHospitalRelationship.findUniqueOrThrow({ where: { id: pending.relationshipId } })).toMatchObject({ status: MembershipStatus.ACTIVE });
    });
  });

  describe("multi-row add", () => {
    async function setup() {
      const hospital = await createHospital("V2-BULK");
      const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
      const member = await createMember(hospital.id, MembershipType.MEMBER, 2);

      return { hospital, owner, member };
    }

    const osmRow = (sequence: number) => ({
      contactPhone: "0812345678",
      nationalId: nationalIdFor(sequence),
      givenName: "สมชาย",
      familyName: `อสม${sequence}`,
    });

    it("reports created, existing and invalid rows for 50 mixed rows without duplicating identities", async () => {
      const { hospital, owner } = await setup();
      for (let sequence = 1000; sequence < 1010; sequence += 1) {
        await provisionOsm(owner.actor, { ...osmRow(sequence), targetHospitalId: hospital.id });
      }
      const rows: unknown[] = [
        ...Array.from({ length: 20 }, (_, index) => osmRow(1100 + index)),
        ...Array.from({ length: 10 }, (_, index) => osmRow(1000 + index)),
        ...Array.from({ length: 10 }, (_, index) =>
          index % 2 === 0
            ? { ...osmRow(1200 + index), nationalId: `12345678901${index}` }
            : { ...osmRow(1200 + index), givenName: "" },
        ),
        ...Array.from({ length: 10 }, (_, index) => osmRow(1300 + index)),
      ];
      const personsBefore = await prisma.person.count();

      const result = await provisionWorkforceBulk(owner.actor, { submissionId: `${Date.now()}.${randomUUID()}`,
        kind: "OSM",
        targetHospitalId: hospital.id,
        rows,
      });

      expect(result.rows).toHaveLength(50);
      expect(result.rows.map(({ rowNumber }) => rowNumber)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
      expect(result.rows.filter(({ status }) => status === "created")).toHaveLength(30);
      expect(result.rows.filter(({ status }) => status === "existing")).toHaveLength(10);
      expect(result.rows.filter((row) => row.status === "invalid")).toEqual(
        Array.from({ length: 10 }, (_, index) => ({
          rowNumber: 31 + index,
          status: "invalid",
          reason: "INVALID_ROW",
        })),
      );
      expect(JSON.stringify(result)).not.toMatch(/token|activationToken/i);
      expect(await prisma.person.count()).toBe(personsBefore + 30);
      expect(await prisma.osmHospitalRelationship.count()).toBe(40);
      expect(await prisma.user.count({ where: { status: UserStatus.PROVISIONED } })).toBe(40);

      const rerun = await provisionWorkforceBulk(owner.actor, { submissionId: `${Date.now()}.${randomUUID()}`,
        kind: "OSM",
        targetHospitalId: hospital.id,
        rows: rows.slice(0, 5),
      });
      expect(rerun.rows.every((row) => row.status === "existing")).toBe(true);
      expect(await prisma.osmHospitalRelationship.count()).toBe(40);
    });

    it("rejects in-batch duplicate national IDs before any write", async () => {
      const { hospital, owner } = await setup();
      const rows = [osmRow(1400), osmRow(1401), { ...osmRow(1400), givenName: "ซ้ำ" }, osmRow(1402)];
      const before = { persons: await prisma.person.count(), users: await prisma.user.count() };

      const error = await provisionWorkforceBulk(owner.actor, { submissionId: `${Date.now()}.${randomUUID()}`,
        kind: "OSM",
        targetHospitalId: hospital.id,
        rows,
      }).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(WorkforceBulkDuplicateError);
      expect((error as WorkforceBulkDuplicateError).rowNumbers).toEqual([1, 3]);
      expect(await prisma.person.count()).toBe(before.persons);
      expect(await prisma.user.count()).toBe(before.users);
    });

    it("bounds the submission to 1-50 rows", async () => {
      const { hospital, owner } = await setup();

      await expect(
        provisionWorkforceBulk(owner.actor, { submissionId: `${Date.now()}.${randomUUID()}`, kind: "OSM", targetHospitalId: hospital.id, rows: [] }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(
        provisionWorkforceBulk(owner.actor, { submissionId: `${Date.now()}.${randomUUID()}`,
          kind: "OSM",
          targetHospitalId: hospital.id,
          rows: Array.from({ length: 51 }, (_, index) => osmRow(1500 + index)),
        }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
      expect(await prisma.osmHospitalRelationship.count()).toBe(0);
    });

    it("applies the staff conflicts per row and adds staff in bulk only for an OWNER", async () => {
      const { hospital, owner, member } = await setup();
      const staffRow = (sequence: number, profession: string) => ({
        nationalId: nationalIdFor(sequence),
        givenName: "สมชาย",
        familyName: `บุคลากร${sequence}`,
        contactPhone: "0812345678",
        profession,
      });
      await provisionHospitalMember(owner.actor, {
        ...staffRow(1600, "DOCTOR"),
        profession: "DOCTOR",
        targetHospitalId: hospital.id,
      });

      const result = await provisionWorkforceBulk(owner.actor, { submissionId: `${Date.now()}.${randomUUID()}`,
        kind: "HOSPITAL_MEMBER",
        targetHospitalId: hospital.id,
        rows: [staffRow(1601, "NURSE"), staffRow(1600, "DOCTOR"), staffRow(1600 + 2, "NOT_A_PROFESSION"), staffRow(1600 + 3, "OTHER")],
      });
      const conflict = await provisionWorkforceBulk(owner.actor, { submissionId: `${Date.now()}.${randomUUID()}`,
        kind: "HOSPITAL_MEMBER",
        targetHospitalId: hospital.id,
        rows: [staffRow(1600, "NURSE")],
      });

      expect(result.rows.map(({ status }) => status)).toEqual(["created", "existing", "invalid", "created"]);
      expect(conflict.rows).toEqual([{ rowNumber: 1, status: "invalid", reason: "CONFLICT" }]);
      await expect(
        provisionWorkforceBulk(member.actor, { submissionId: `${Date.now()}.${randomUUID()}`,
          kind: "HOSPITAL_MEMBER",
          targetHospitalId: hospital.id,
          rows: [staffRow(1700, "NURSE")],
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        provisionWorkforceBulk(member.actor, { submissionId: `${Date.now()}.${randomUUID()}`,
          kind: "OSM",
          targetHospitalId: hospital.id,
          rows: [osmRow(1701)],
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("durable bulk replay and reconciliation", () => {
    async function setup(count = 25) {
      const hospital = await createHospital("DURABLE-BULK");
      const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
      const rows = Array.from({ length: count }, (_, index) => ({ contactPhone: "0812345678", nationalId: nationalIdFor(5000 + index), givenName: "สมชาย", familyName: `ทีม${index}` }));
      const input = { submissionId: `${Date.now()}.${randomUUID()}`, targetHospitalId: hospital.id, kind: "OSM" as const, rows };
      return { hospital, owner, input };
    }

    it.each([1, 25, 50])("replays %i rows with their original created classification and no duplicate audit", async (count) => {
      const { owner, input } = await setup(count);
      const first = await provisionWorkforceBulk(owner.actor, input);
      const replay = await provisionWorkforceBulk(owner.actor, { ...input, rows: input.rows.map((row) => ({ contactPhone: "0812345678", familyName: ` ${row.familyName} `, nationalId: row.nationalId, givenName: row.givenName })) });
      expect(replay).toEqual(first);
      expect(first.rows.every(({ status }) => status === "created")).toBe(true);
      expect(await prisma.workforceBulkSubmission.count()).toBe(1);
      expect(await prisma.workforceBulkRowReceipt.count()).toBe(count);
      expect(await auditCount("osm_relationship.provisioned")).toBe(count);
      const metadata = JSON.stringify(await prisma.workforceBulkSubmission.findMany({ include: { rows: true } }));
      expect(metadata).not.toContain(input.rows[0].nationalId);
      expect(metadata).not.toContain(input.rows[0].givenName);
      expect(metadata).not.toMatch(/plaintextToken|activationToken|tokenHash|identityKeyHash/iu);
      expect(JSON.stringify(first)).not.toMatch(/token|fingerprint/iu);
    });

    it("conflicts for the same key with changed payload or visible row mapping", async () => {
      const { owner, input } = await setup(1);
      const first = await provisionWorkforceBulk(owner.actor, input);
      for (const changed of [{ ...input, rows: [{ ...input.rows[0], givenName: "เปลี่ยนชื่อ" }] }, { ...input, rowNumbers: [2] }]) {
        await expect(provisionWorkforceBulk(owner.actor, changed)).rejects.toMatchObject({ code: "CONFLICT" });
      }
      expect(await provisionWorkforceBulk(owner.actor, input)).toEqual(first);
      expect(await auditCount("osm_relationship.provisioned")).toBe(1);
    });

    it("resumes after 20 of 50 committed rows when both the request and failure reporting are unavailable", async () => {
      const { owner, input } = await setup(50);
      const database = faultDatabase(async (call, phase) => {
        if (call >= 22 && phase === "before") throw new InfrastructureError("Injected disconnect");
      });
      await expect(provisionWorkforceBulk(owner.actor, input, { database })).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
      expect(await prisma.workforceBulkRowReceipt.count()).toBe(20);
      expect(await auditCount("osm_relationship.provisioned")).toBe(20);
      const resumed = await provisionWorkforceBulk(owner.actor, input);
      expect(resumed.rows).toHaveLength(50);
      expect(resumed.rows.every(({ status }) => status === "created")).toBe(true);
      expect(await auditCount("osm_relationship.provisioned")).toBe(50);
      expect(await prisma.osmHospitalRelationship.count()).toBe(50);
    });

    it("returns the committed receipt when the caller loses a successful row response", async () => {
      const { owner, input } = await setup(1);
      const database = faultDatabase(async (call, phase) => {
        if (call === 2 && phase === "after") throw new InfrastructureError("Response lost after commit");
      });
      const first = await provisionWorkforceBulk(owner.actor, input, { database });
      expect(first.rows[0].status).toBe("created");
      expect(await provisionWorkforceBulk(owner.actor, input)).toEqual(first);
      expect(await auditCount("osm_relationship.provisioned")).toBe(1);
    });

    it("serializes concurrent submissions with the same key", async () => {
      const { owner, input } = await setup(25);
      const [first, concurrent] = await Promise.all([provisionWorkforceBulk(owner.actor, input), provisionWorkforceBulk(owner.actor, input)]);
      expect(concurrent).toEqual(first);
      expect(await prisma.workforceBulkRowReceipt.count()).toBe(25);
      expect(await prisma.osmHospitalRelationship.count()).toBe(25);
      expect(await auditCount("osm_relationship.provisioned")).toBe(25);
    });

    it("does not duplicate a Person/User/relationship across different submission keys", async () => {
      const { owner, input } = await setup(1);
      const results = await Promise.all([provisionWorkforceBulk(owner.actor, input), provisionWorkforceBulk(owner.actor, { ...input, submissionId: `${Date.now()}.${randomUUID()}` })]);
      expect(results.flatMap(({ rows }) => rows).map(({ status }) => status).sort()).toEqual(["created", "existing"]);
      expect(await prisma.person.count()).toBe(2);
      expect(await prisma.user.count()).toBe(2);
      expect(await prisma.osmHospitalRelationship.count()).toBe(1);
      expect(await auditCount("osm_relationship.provisioned")).toBe(1);
    });

    it("stops after authority is revoked during a batch and also denies replay", async () => {
      const { owner, input } = await setup(50);
      const database = faultDatabase(async (call, phase) => {
        if (call === 21 && phase === "after") await prisma.hospitalMembership.updateMany({ where: { userId: owner.userId }, data: { status: MembershipStatus.SUSPENDED } });
      });
      await expect(provisionWorkforceBulk(owner.actor, input, { database })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await prisma.osmHospitalRelationship.count()).toBe(20);
      await expect(provisionWorkforceBulk(owner.actor, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await auditCount("osm_relationship.provisioned")).toBe(20);
    });

    it("resumes transient failures while preserving successful and invalid rows", async () => {
      const { owner, input } = await setup(3);
      input.rows[2].nationalId = "invalid";
      let unavailable = true;
      const generateCredential = () => {
        if (unavailable) { unavailable = false; throw new InfrastructureError("Injected failure"); }
        return generateWorkforceActivationCredential();
      };
      const first = await provisionWorkforceBulk(owner.actor, input, { generateCredential });
      expect(first.rows.map(({ status }) => status)).toEqual(["invalid", "created", "invalid"]);
      expect(first.rows[0]).toMatchObject({ reason: "UNAVAILABLE" });
      const replay = await provisionWorkforceBulk(owner.actor, input, { generateCredential });
      expect(replay.rows.map(({ status }) => status)).toEqual(["created", "created", "invalid"]);
      expect(replay.rows[1]).toEqual(first.rows[1]);
      expect(replay.rows[2]).toEqual(first.rows[2]);
      expect(await auditCount("osm_relationship.provisioned")).toBe(2);
    });

    it("bounds retries and rejects expired keys even after receipt cleanup", async () => {
      const { owner, input } = await setup(1);
      const generateCredential = vi.fn(() => { throw new InfrastructureError("Unavailable"); });
      for (let attempt = 0; attempt < 4; attempt += 1) await provisionWorkforceBulk(owner.actor, input, { generateCredential });
      expect(generateCredential).toHaveBeenCalledTimes(3);
      expect(await prisma.workforceBulkRowReceipt.findFirst()).toMatchObject({ attempts: 3 });
      const expired = `${Date.now() - 31 * 24 * 60 * 60 * 1000}.${randomUUID()}`;
      await expect(provisionWorkforceBulk(owner.actor, { ...input, submissionId: expired })).rejects.toMatchObject({ code: "VALIDATION" });
      expect(await prisma.osmHospitalRelationship.count()).toBe(0);
    });
  });

  describe("bounded directory pagination", () => {
    async function setup() {
      const hospital = await createHospital("PAGED-A");
      const other = await createHospital("PAGED-B");
      const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
      const member = await createMember(hospital.id, MembershipType.MEMBER, 2);
      const timestamp = new Date("2026-10-01T00:00:00.000Z");
      const people = Array.from({ length: 501 }, (_, index) => ({ id: randomUUID(), identityKeyHash: hashIdentityReference({ namespace: "thai-national-id", value: nationalIdFor(10000 + index) }), givenName: index % 10 === 0 ? null : "ชื่อซ้ำ", familyName: index % 10 === 0 ? null : "นามซ้ำ" }));
      const users = people.map(({ id }) => ({ id: randomUUID(), personId: id, status: UserStatus.PROVISIONED }));
      const staff = users.slice(0, 200).map(({ id }) => ({ id: randomUUID(), userId: id, hospitalId: hospital.id, membershipType: MembershipType.MEMBER, profession: "NURSE" as const, status: MembershipStatus.PROVISIONED, createdAt: timestamp }));
      const osms = users.slice(200, 500).map(({ id }) => ({ id: randomUUID(), userId: id, hospitalId: hospital.id, status: MembershipStatus.PROVISIONED, createdAt: timestamp }));
      await prisma.$transaction(async (transaction) => {
        await transaction.person.createMany({ data: people });
        await transaction.user.createMany({ data: users });
        await transaction.userRole.createMany({ data: users.map(({ id }, index) => ({ userId: id, role: index < 200 ? Role.HOSPITAL : Role.OSM })) });
        await transaction.hospitalMembership.createMany({ data: staff });
        await transaction.osmHospitalRelationship.createMany({ data: [...osms, { userId: users[500].id, hospitalId: other.id, status: MembershipStatus.PROVISIONED }] });
        await transaction.workforceActivation.createMany({ data: osms.map((row, index) => ({ userId: row.userId, tokenHash: hashWorkforceActivationToken(`fixture-${index}`), createdByUserId: owner.userId, hospitalId: hospital.id, relationshipId: row.id, relationshipKind: "OSM", expiresAt: new Date(Date.now() + 3_600_000) })) });
      });
      return { hospital, other, owner, member, staff, osms };
    }

    it("pages hundreds of duplicate/missing names without duplication or skipped rows", async () => {
      const { hospital, owner, staff, osms } = await setup();
      const activationQueries = vi.spyOn(prisma.workforceActivation, "findMany");
      const seenStaff: string[] = [];
      const seenOsm: string[] = [];
      let staffCursor: string | undefined;
      let osmCursor: string | undefined;
      do {
        const page = await listWorkforce(owner.actor, { targetHospitalId: hospital.id, staffCursor, osmCursor, status: MembershipStatus.PROVISIONED });
        expect(page.rows.filter(({ kind }) => kind === "HOSPITAL_MEMBER").length).toBeLessThanOrEqual(25);
        expect(page.rows.filter(({ kind }) => kind === "OSM").length).toBeLessThanOrEqual(25);
        if (seenStaff.length < staff.length) seenStaff.push(...page.rows.filter(({ kind }) => kind === "HOSPITAL_MEMBER").map(({ id }) => id));
        seenOsm.push(...page.rows.filter(({ kind }) => kind === "OSM").map(({ id }) => id));
        staffCursor = page.pageInfo.staffNextCursor ?? staffCursor;
        osmCursor = page.pageInfo.osmNextCursor ?? undefined;
      } while (osmCursor);
      expect(new Set(seenStaff).size).toBe(staff.length);
      expect(seenStaff).toHaveLength(staff.length);
      expect(new Set(seenOsm).size).toBe(osms.length);
      expect(seenOsm).toHaveLength(osms.length);
      for (const [query] of activationQueries.mock.calls) {
        const ids = query?.where?.userId;
        expect(typeof ids === "object" && ids !== null && "in" in ids ? Array.isArray(ids.in) ? ids.in.length : 0 : 0).toBeLessThanOrEqual(50);
        expect(query?.where?.purpose).toBe("ACTIVATION");
      }
      activationQueries.mockRestore();
      const plan = await prisma.$queryRaw<Prisma.JsonObject[]>(Prisma.sql`EXPLAIN (ANALYZE, FORMAT JSON) SELECT "id" FROM "HospitalMembership" WHERE "hospitalId" = ${hospital.id}::uuid ORDER BY "createdAt", "id" LIMIT 26`);
      expect(JSON.stringify(plan)).toContain('"Actual Rows":26');
    });

    it("uses a bounded, constant number of real SQL queries as page depth changes", async () => {
      const { hospital, owner } = await setup();
      const traced = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
      const queries: string[] = [];
      traced.$on("query", ({ query }) => queries.push(query));
      try {
        const first = await listWorkforce(owner.actor, { targetHospitalId: hospital.id }, traced);
        const firstCount = queries.length;
        queries.length = 0;
        const next = await listWorkforce(owner.actor, { targetHospitalId: hospital.id, osmCursor: first.pageInfo.osmNextCursor ?? undefined, staffCursor: first.pageInfo.staffNextCursor ?? undefined }, traced);
        expect(firstCount).toBeLessThanOrEqual(12);
        expect(queries.length).toBe(firstCount);
        expect(next.rows.length).toBeLessThanOrEqual(50);
        console.info(`Workforce directory SQL queries per OWNER page: ${firstCount}; fixture: 200 staff / 300 OSM`);
      } finally { await traced.$disconnect(); }
    });

    it("applies search/status/Hospital scope on every page and denies mismatched cursors", async () => {
      const { hospital, other, owner } = await setup();
      const page = await listWorkforce(owner.actor, { targetHospitalId: hospital.id, search: "ชื่อซ้ำ นามซ้ำ", status: "PROVISIONED" });
      expect(page.rows).toHaveLength(50);
      expect(page.rows.every(({ displayName }) => displayName === "ชื่อซ้ำ นามซ้ำ")).toBe(true);
      expect(page.pageInfo.staffNextCursor).toBeTruthy();
      const cursor = page.pageInfo.osmNextCursor;
      expect(cursor).toBeTruthy();
      const next = await listWorkforce(owner.actor, { targetHospitalId: hospital.id, search: "ชื่อซ้ำ นามซ้ำ", status: "PROVISIONED", osmCursor: cursor ?? undefined, staffCursor: page.pageInfo.staffNextCursor ?? undefined });
      expect(next.rows.some(({ id }) => page.rows.some((row) => row.id === id))).toBe(false);
      for (const input of [
        { targetHospitalId: other.id, search: "ชื่อซ้ำ นามซ้ำ", status: "PROVISIONED" as const, osmCursor: cursor ?? undefined },
        { targetHospitalId: hospital.id, search: "อื่น", status: "PROVISIONED" as const, osmCursor: cursor ?? undefined },
        { targetHospitalId: hospital.id, search: "ชื่อซ้ำ นามซ้ำ", status: "ACTIVE" as const, osmCursor: cursor ?? undefined },
        { targetHospitalId: hospital.id, search: "ชื่อซ้ำ นามซ้ำ", status: "PROVISIONED" as const, staffCursor: cursor ?? undefined },
      ]) await expect(listWorkforce(owner.actor, input)).rejects.toMatchObject({ code: "VALIDATION" });
      expect((await listWorkforce(owner.actor, { targetHospitalId: hospital.id, search: "ไม่พบแน่นอน" })).rows).toHaveLength(0);
      await prisma.hospitalMembership.updateMany({ where: { userId: owner.userId }, data: { status: MembershipStatus.SUSPENDED } });
      await expect(listWorkforce(owner.actor, { targetHospitalId: hospital.id, search: "ชื่อซ้ำ นามซ้ำ", status: "PROVISIONED", osmCursor: cursor ?? undefined })).rejects.toBeDefined();
    });
  });

  describe("activation slips and the pending view", () => {
    async function setup() {
      const hospital = await createHospital("V2-SLIPS");
      const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
      const member = await createMember(hospital.id, MembershipType.MEMBER, 2);

      return { hospital, owner, member };
    }

    it("issues fresh 72-hour REMOTE tokens, revokes the previous ones, and stores only digests", async () => {
      const { hospital, owner } = await setup();
      const now = new Date("2026-10-14T03:00:00.000Z");
      const people = [] as { userId: string; token: string; nationalId: string }[];
      for (const sequence of [2000, 2001, 2002]) {
        const created = await provisionOsm(owner.actor, { contactPhone: "0812345678",
          nationalId: nationalIdFor(sequence),
          givenName: "สมชาย",
          familyName: "ใจดีมาก",
          targetHospitalId: hospital.id,
        });
        people.push({ userId: created.userId, token: created.activationToken!, nationalId: nationalIdFor(sequence) });
      }

      const result = await issueWorkforceActivationSlips(
        owner.actor,
        { targetHospitalId: hospital.id, kind: "OSM", userIds: people.map(({ userId }) => userId) },
        { now: () => now },
      );

      expect(result.failures).toEqual([]);
      expect(result.slips).toHaveLength(3);
      for (const slip of result.slips) {
        const original = people.find(({ userId }) => userId === slip.userId)!;

        expect(slip.maskedName).toBe("สม*** ใจ***");
        expect(slip.hospitalName).toBe(hospital.name);
        expect(slip.activationExpiresAt.toISOString()).toBe("2026-10-17T03:00:00.000Z");
        expect(slip.activationToken).not.toBe(original.token);
        expect(
          await prisma.workforceActivation.findUniqueOrThrow({
            where: { tokenHash: hashWorkforceActivationToken(original.token) },
            select: { revokedAt: true },
          }),
        ).toEqual({ revokedAt: now });
        expect(
          await prisma.workforceActivation.findUniqueOrThrow({
            where: { tokenHash: hashWorkforceActivationToken(slip.activationToken) },
            select: { mode: true, purpose: true, expiresAt: true },
          }),
        ).toEqual({ mode: "REMOTE", purpose: "ACTIVATION", expiresAt: slip.activationExpiresAt });
        await expect(previewWorkforceActivation(original.token, { now: () => now })).rejects.toMatchObject({
          code: "CONFLICT",
        });
        await expect(previewWorkforceActivation(slip.activationToken, { now: () => now })).resolves.toBeDefined();
      }

      const stored = JSON.stringify(await prisma.workforceActivation.findMany());
      const audits = JSON.stringify(await prisma.auditEvent.findMany());
      for (const { activationToken } of result.slips) {
        expect(stored).not.toContain(activationToken);
        expect(audits).not.toContain(activationToken);
      }
      expect(
        await prisma.auditEvent.count({
          where: { action: "workforce_activation.issued", metadata: { path: ["source"], equals: "activation_slip" } },
        }),
      ).toBe(3);
    });

    it("reports people who are not pending instead of issuing for them, and bounds the selection", async () => {
      const { hospital, owner } = await setup();
      const pending = await provisionPendingOsm(owner, hospital.id, 2100);
      const active = await createActiveOsm(hospital.id, 2101);
      const otherHospital = await createHospital("V2-SLIPS-OTHER");
      const foreign = await provisionPendingOsm(
        await createMember(otherHospital.id, MembershipType.OWNER, 3),
        otherHospital.id,
        2102,
      );

      const result = await issueWorkforceActivationSlips(owner.actor, {
        targetHospitalId: hospital.id,
        kind: "OSM",
        userIds: [pending.userId, active.userId, foreign.userId, randomUUID()],
      });

      expect(result.slips.map(({ userId }) => userId)).toEqual([pending.userId]);
      expect(result.failures).toEqual([
        { userId: active.userId, reason: "NOT_PENDING" },
        { userId: foreign.userId, reason: "NOT_PENDING" },
        expect.objectContaining({ reason: "NOT_PENDING" }),
      ]);
      // The other Hospital's credential is untouched.
      expect(
        await prisma.workforceActivation.findFirstOrThrow({
          where: { userId: foreign.userId },
          select: { revokedAt: true },
        }),
      ).toEqual({ revokedAt: null });
      await expect(
        issueWorkforceActivationSlips(owner.actor, {
          targetHospitalId: hospital.id,
          kind: "OSM",
          userIds: Array.from({ length: 51 }, () => randomUUID()),
        }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    });

    it("keeps staff slips OWNER-only and reports an in-flight credential", async () => {
      const { hospital, owner, member } = await setup();
      const created = await provisionHospitalMember(owner.actor, { contactPhone: "0812345678",
        nationalId: nationalIdFor(2200),
        givenName: "สมชาย",
        familyName: "บุคลากร",
        targetHospitalId: hospital.id,
        profession: "NURSE",
      });
      const inFlight = await provisionPendingOsm(owner, hospital.id, 2201);
      await prisma.workforceActivation.updateMany({
        where: { userId: inFlight.userId },
        data: { claimedAt: new Date(), operationState: "CLAIMED" },
      });

      await expect(
        issueWorkforceActivationSlips(member.actor, {
          targetHospitalId: hospital.id,
          kind: "HOSPITAL_MEMBER",
          userIds: [created.userId],
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        issueWorkforceActivationSlips(owner.actor, {
          targetHospitalId: hospital.id,
          kind: "HOSPITAL_MEMBER",
          userIds: [created.userId],
        }),
      ).resolves.toMatchObject({ slips: [{ userId: created.userId }], failures: [] });
      await expect(
        issueWorkforceActivationSlips(member.actor, {
          targetHospitalId: hospital.id,
          kind: "OSM",
          userIds: [inFlight.userId],
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("shows pending and expired people with the latest expiry, and never marks active people pending", async () => {
      const { hospital, owner } = await setup();
      const fresh = await provisionPendingOsm(owner, hospital.id, 2300);
      const stale = await provisionPendingOsm(owner, hospital.id, 2301);
      const revoked = await provisionPendingOsm(owner, hospital.id, 2302);
      const active = await createActiveOsm(hospital.id, 2303);
      await prisma.workforceActivation.updateMany({
        where: { userId: stale.userId },
        data: { expiresAt: new Date("2026-01-01T00:00:00.000Z") },
      });
      await prisma.workforceActivation.updateMany({
        where: { userId: revoked.userId },
        data: { revokedAt: new Date() },
      });

      const list = await listWorkforce(owner.actor, { targetHospitalId: hospital.id });
      const byUser = new Map(list.rows.map((row) => [row.userId, row]));

      expect(byUser.get(fresh.userId)).toMatchObject({ activationStatus: "PENDING", activationRequired: true });
      expect(byUser.get(fresh.userId)!.activationExpiresAt).toBeInstanceOf(Date);
      expect(byUser.get(stale.userId)).toMatchObject({
        activationStatus: "EXPIRED",
        activationExpiresAt: new Date("2026-01-01T00:00:00.000Z"),
      });
      expect(byUser.get(revoked.userId)).toMatchObject({ activationStatus: "EXPIRED", activationExpiresAt: null });
      expect(byUser.get(active.userId)).toMatchObject({ activationStatus: null, activationRequired: false });
    });
  });
  describe("global credential ownership (P0)", () => {
    async function setup() {
      const hospital = await createHospital("OWN-A");
      const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
      return { hospital, owner };
    }
    const person = (nationalId: string) => ({ nationalId, givenName: "ผู้ป่วย", familyName: "ทดสอบ" });
    const completion = (nationalId: string) => ({ nationalId, password: PASSWORD, passwordConfirmation: PASSWORD });

    it("rejects workforce provisioning for a PROVISIONED PATIENT identity and changes nothing", async () => {
      const { hospital, owner } = await setup();
      const patient = await createPatientIdentity(hospital.id, 10, UserStatus.PROVISIONED);
      const before = await identityState(patient.userId);
      const peopleBefore = await prisma.person.count();

      await expect(provisionOsm(owner.actor, { contactPhone: "0812345678", ...person(patient.nationalId), targetHospitalId: hospital.id }))
        .rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("บัญชีผู้ป่วย") });
      await expect(provisionHospitalMember(owner.actor, { contactPhone: "0812345678", ...person(patient.nationalId), targetHospitalId: hospital.id, profession: "NURSE" }))
        .rejects.toMatchObject({ code: "CONFLICT" });

      expect(await identityState(patient.userId)).toEqual(before);
      expect(await prisma.person.count()).toBe(peopleBefore);
      expect(await prisma.user.count({ where: { personId: patient.personId } })).toBe(1);
    });

    it("blocks a directly written activation for an unactivated multi-role identity before any provider call", async () => {
      const { hospital, owner } = await setup();
      const patient = await createPatientIdentity(hospital.id, 11, UserStatus.PROVISIONED);
      await prisma.userRole.create({ data: { userId: patient.userId, role: Role.OSM } });
      const relationship = await prisma.osmHospitalRelationship.create({ data: { userId: patient.userId, hospitalId: hospital.id, status: MembershipStatus.PROVISIONED } });
      const credential = generateWorkforceActivationCredential();
      await prisma.workforceActivation.create({ data: {
        userId: patient.userId, tokenHash: credential.tokenHash, mode: "REMOTE", expiresAt: new Date(Date.now() + 3_600_000),
        createdByUserId: owner.userId, hospitalId: hospital.id, relationshipId: relationship.id, relationshipKind: "OSM",
      } });
      const before = await identityState(patient.userId);
      const provisionIdentity = vi.fn();

      await expect(previewWorkforceActivation(credential.plaintextToken)).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(completeWorkforceActivation(credential.plaintextToken, completion(patient.nationalId), { provisionIdentity })).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(regenerateWorkforceActivation(owner.actor, { userId: patient.userId, targetHospitalId: hospital.id, kind: "OSM", mode: "REMOTE" }))
        .rejects.toMatchObject({ code: "CONFLICT" });
      await expect(issueWorkforceActivationSlips(owner.actor, { kind: "OSM", targetHospitalId: hospital.id, userIds: [patient.userId] }))
        .resolves.toMatchObject({ slips: [], failures: [{ userId: patient.userId }] });

      expect(provisionIdentity).not.toHaveBeenCalled();
      expect(await identityState(patient.userId)).toEqual(before);
    });

    it("keeps an ACTIVE PATIENT reusable for OSM and staff relationships without any new credential", async () => {
      const { hospital, owner } = await setup();
      const patient = await createPatientIdentity(hospital.id, 12, UserStatus.ACTIVE);
      const osm = await provisionOsm(owner.actor, { contactPhone: "0812345678", ...person(patient.nationalId), targetHospitalId: hospital.id });
      const staff = await provisionHospitalMember(owner.actor, { contactPhone: "0812345678", ...person(patient.nationalId), targetHospitalId: hospital.id, profession: "NURSE" });

      expect(osm).toMatchObject({ userId: patient.userId, reusedExistingUser: true, activationRequired: false, activationToken: null, relationshipStatus: MembershipStatus.ACTIVE });
      expect(staff).toMatchObject({ userId: patient.userId, activationToken: null, relationshipStatus: MembershipStatus.ACTIVE });
      expect(await identityState(patient.userId)).toMatchObject({
        user: { status: UserStatus.ACTIVE, authSubject: patient.authSubject }, roles: [Role.HOSPITAL, Role.OSM, Role.PATIENT], activations: 0, patientRelationships: 1,
      });
      expect(await prisma.user.count({ where: { personId: patient.personId } })).toBe(1);
    });

    it("still activates a fresh workforce-only identity", async () => {
      const { owner, hospital } = await setup();
      const pending = await provisionPendingOsm(owner, hospital.id, 13);
      const authSubject = randomUUID();
      await completeWorkforceActivation(pending.token, completion(pending.nationalId), { provisionIdentity: provisioner(authSubject) });
      expect(await prisma.user.findUniqueOrThrow({ where: { id: pending.userId } })).toMatchObject({ status: UserStatus.ACTIVE, authSubject });
    });

    it.each(["SUSPENDED", "ACTIVE_WITHOUT_SUBJECT"] as const)("denies a %s account", async (state) => {
      const { hospital, owner } = await setup();
      const patient = await createPatientIdentity(hospital.id, 14, state === "SUSPENDED" ? UserStatus.SUSPENDED : UserStatus.ACTIVE);
      if (state === "ACTIVE_WITHOUT_SUBJECT") await prisma.user.update({ where: { id: patient.userId }, data: { authSubject: null } });
      const before = await identityState(patient.userId);
      await expect(provisionOsm(owner.actor, { contactPhone: "0812345678", ...person(patient.nationalId), targetHospitalId: hospital.id })).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await identityState(patient.userId)).toEqual(before);
    });

    it("rejects a PATIENT role added between issuance and provider start without provider effects", async () => {
      const { owner, hospital } = await setup();
      const pending = await provisionPendingOsm(owner, hospital.id, 15);
      await prisma.userRole.create({ data: { userId: pending.userId, role: Role.PATIENT } });
      const provisionIdentity = vi.fn();
      await expect(completeWorkforceActivation(pending.token, completion(pending.nationalId), { provisionIdentity })).rejects.toMatchObject({ code: "CONFLICT" });
      expect(provisionIdentity).not.toHaveBeenCalled();
      expect(await prisma.user.findUniqueOrThrow({ where: { id: pending.userId } })).toMatchObject({ status: UserStatus.PROVISIONED, authSubject: null });
    });

    it("rejects a PATIENT role added between the claim and the provider-start transaction", async () => {
      const { owner, hospital } = await setup();
      const pending = await provisionPendingOsm(owner, hospital.id, 16);
      const database = faultDatabase(async (call, phase) => {
        if (call === 2 && phase === "before") await prisma.userRole.create({ data: { userId: pending.userId, role: Role.PATIENT } });
      });
      const provisionIdentity = vi.fn();
      await expect(completeWorkforceActivation(pending.token, completion(pending.nationalId), { database, provisionIdentity })).rejects.toBeDefined();
      expect(provisionIdentity).not.toHaveBeenCalled();
      expect(await prisma.user.findUniqueOrThrow({ where: { id: pending.userId } })).toMatchObject({ status: UserStatus.PROVISIONED, authSubject: null });
    });

    it("rejects a PATIENT role added after provider confirmation, compensates the new identity, and activates nothing", async () => {
      const { owner, hospital } = await setup();
      const pending = await provisionPendingOsm(owner, hospital.id, 17);
      const authSubject = randomUUID();
      const database = faultDatabase(async (call, phase) => {
        if (call === 4 && phase === "before") await prisma.userRole.create({ data: { userId: pending.userId, role: Role.PATIENT } });
      });
      const deleteProviderIdentity = vi.fn().mockResolvedValue(undefined);
      await expect(completeWorkforceActivation(pending.token, completion(pending.nationalId),
        { database, provisionIdentity: provisioner(authSubject), deleteProviderIdentity })).rejects.toMatchObject({ code: "CONFLICT" });
      expect(deleteProviderIdentity).toHaveBeenCalledWith(authSubject);
      expect(await prisma.user.findUniqueOrThrow({ where: { id: pending.userId } })).toMatchObject({ status: UserStatus.PROVISIONED, authSubject: null });
      expect(await prisma.osmHospitalRelationship.findFirstOrThrow({ where: { userId: pending.userId } })).toMatchObject({ status: MembershipStatus.PROVISIONED });
      expect(await auditCount("workforce_activation.completed")).toBe(0);
    });

    it("never turns a concurrent PATIENT role grant plus regeneration into an activatable credential", async () => {
      const { owner, hospital } = await setup();
      const pending = await provisionPendingOsm(owner, hospital.id, 18);
      const [regenerated] = await Promise.allSettled([
        regenerateWorkforceActivation(owner.actor, { userId: pending.userId, targetHospitalId: hospital.id, kind: "OSM", mode: "REMOTE" }),
        prisma.userRole.create({ data: { userId: pending.userId, role: Role.PATIENT } }),
      ]);
      const token = regenerated.status === "fulfilled" ? regenerated.value.activationToken : pending.token;
      const provisionIdentity = vi.fn();
      await expect(completeWorkforceActivation(token, completion(pending.nationalId), { provisionIdentity })).rejects.toMatchObject({ code: "CONFLICT" });
      expect(provisionIdentity).not.toHaveBeenCalled();
    });
  });

  describe("single-Hospital pending scope (P1)", () => {
    async function setup() {
      const a = await createHospital("SCOPE-A");
      const b = await createHospital("SCOPE-B");
      const c = await createHospital("SCOPE-C");
      const ownerA = await createMember(a.id, MembershipType.OWNER, 1);
      const ownerB = await createMember(b.id, MembershipType.OWNER, 2);
      return { a, b, c, ownerA, ownerB };
    }
    const person = (nationalId: string) => ({ nationalId, givenName: "สมชาย", familyName: "ใจดีมาก" });
    const complete = (token: string, nationalId: string, authSubject = randomUUID()) =>
      completeWorkforceActivation(token, { nationalId, password: PASSWORD, passwordConfirmation: PASSWORD }, { provisionIdentity: provisioner(authSubject) });

    it("rejects a second Hospital for a pending User and leaves Hospital A's activation usable", async () => {
      const { a, b, ownerA, ownerB } = await setup();
      const pending = await provisionPendingOsm(ownerA, a.id, 20);
      const before = await identityState(pending.userId);

      await expect(provisionOsm(ownerB.actor, { contactPhone: "0812345678", ...person(pending.nationalId), targetHospitalId: b.id }))
        .rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("โรงพยาบาลอื่น") });
      await expect(provisionHospitalMember(ownerB.actor, { contactPhone: "0812345678", ...person(pending.nationalId), targetHospitalId: b.id, profession: "NURSE" }))
        .rejects.toMatchObject({ code: "CONFLICT" });
      await expect(regenerateWorkforceActivation(ownerB.actor, { userId: pending.userId, targetHospitalId: b.id, kind: "OSM", mode: "REMOTE" }))
        .rejects.toMatchObject({ code: "CONFLICT" });

      expect(await identityState(pending.userId)).toEqual(before);
      expect(await prisma.osmHospitalRelationship.count({ where: { userId: pending.userId, hospitalId: b.id } })).toBe(0);
      await expect(previewWorkforceActivation(pending.token)).resolves.toBeDefined();
      await complete(pending.token, pending.nationalId);
      expect(await prisma.osmHospitalRelationship.findFirstOrThrow({ where: { userId: pending.userId } })).toMatchObject({ hospitalId: a.id, status: MembershipStatus.ACTIVE });
    });

    it("allows an ACTIVE User to join Hospitals A, B and C", async () => {
      const { a, b, c, ownerA, ownerB } = await setup();
      const ownerC = await createMember(c.id, MembershipType.OWNER, 3);
      const active = await createActiveOsm(a.id, 21);
      for (const [owner, hospital] of [[ownerA, a], [ownerB, b], [ownerC, c]] as const) {
        await expect(provisionOsm(owner.actor, { contactPhone: "0812345678", ...person(active.nationalId), targetHospitalId: hospital.id })).resolves.toMatchObject({ userId: active.userId, activationToken: null });
      }
      expect(await prisma.osmHospitalRelationship.count({ where: { userId: active.userId, status: MembershipStatus.ACTIVE } })).toBe(3);
    });

    it("keeps same-Hospital MEMBER + OSM onboarding on one activation", async () => {
      const { a, ownerA } = await setup();
      const pending = await provisionPendingOsm(ownerA, a.id, 22);
      const staff = await provisionHospitalMember(ownerA.actor, { contactPhone: "0812345678", ...person(pending.nationalId), targetHospitalId: a.id, profession: "NURSE" });
      expect(staff).toMatchObject({ userId: pending.userId, activationToken: null });
      await complete(pending.token, pending.nationalId);
      expect(await prisma.hospitalMembership.findFirstOrThrow({ where: { userId: pending.userId } })).toMatchObject({ status: MembershipStatus.ACTIVE });
      expect(await prisma.osmHospitalRelationship.findFirstOrThrow({ where: { userId: pending.userId } })).toMatchObject({ status: MembershipStatus.ACTIVE });
    });

    it("lets exactly one of two concurrent Hospitals create the first pending scope", async () => {
      const { a, b, ownerA, ownerB } = await setup();
      const nationalId = nationalIdFor(23);
      const results = await Promise.allSettled([
        provisionOsm(ownerA.actor, { contactPhone: "0812345678", ...person(nationalId), targetHospitalId: a.id }),
        provisionOsm(ownerB.actor, { contactPhone: "0812345678", ...person(nationalId), targetHospitalId: b.id }),
      ]);
      const winners = results.filter((result) => result.status === "fulfilled");
      expect(winners).toHaveLength(1);
      expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
      const winner = winners[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof provisionOsm>>>;
      expect(await prisma.osmHospitalRelationship.count({ where: { userId: winner.value.userId } })).toBe(1);
      expect(await prisma.workforceActivation.count({ where: { userId: winner.value.userId, revokedAt: null } })).toBe(1);
      expect(await prisma.user.count({ where: { person: { identityKeyHash: hashIdentityReference({ namespace: "thai-national-id", value: nationalId }) } } })).toBe(1);
      await complete(winner.value.activationToken!, nationalId);
    });

    it("retries Serializable conflicts and still ends in exactly one consistent scope", async () => {
      const { a, b, ownerA, ownerB } = await setup();
      const nationalId = nationalIdFor(24);
      const results = await Promise.allSettled(Array.from({ length: 4 }, (_, index) =>
        provisionOsm((index % 2 ? ownerA : ownerB).actor, { contactPhone: "0812345678", ...person(nationalId), targetHospitalId: index % 2 ? a.id : b.id })));
      expect(results.some((result) => result.status === "fulfilled")).toBe(true);
      const hospitals = await prisma.osmHospitalRelationship.findMany({ where: { status: MembershipStatus.PROVISIONED }, select: { hospitalId: true } });
      expect(new Set(hospitals.map(({ hospitalId }) => hospitalId)).size).toBe(1);
    });

    it("returns per-row CONFLICT in bulk, preserves valid rows, and keeps the original receipt on replay", async () => {
      const { a, b, ownerA, ownerB } = await setup();
      const pending = await provisionPendingOsm(ownerA, a.id, 25);
      const input = { submissionId: `${Date.now()}.${randomUUID()}`, targetHospitalId: b.id, kind: "OSM" as const, rows: [
        { ...person(nationalIdFor(26)), contactPhone: "0812345678" }, { ...person(pending.nationalId), contactPhone: "0812345678" }, { ...person(nationalIdFor(27)), contactPhone: "0812345678" },
      ] };
      const first = await provisionWorkforceBulk(ownerB.actor, input);
      expect(first.rows.map(({ status }) => status)).toEqual(["created", "invalid", "created"]);
      expect(first.rows[1]).toMatchObject({ reason: "CONFLICT" });
      expect(await provisionWorkforceBulk(ownerB.actor, input)).toEqual(first);
      expect(await prisma.osmHospitalRelationship.count({ where: { userId: pending.userId } })).toBe(1);
      await complete(pending.token, pending.nationalId);
    });

    it("keeps historical cross-Hospital pending records blocked, unchanged and identifiable", async () => {
      const { a, b, ownerA, ownerB } = await setup();
      const pending = await provisionPendingOsm(ownerA, a.id, 28);
      await prisma.osmHospitalRelationship.create({ data: { userId: pending.userId, hospitalId: b.id, status: MembershipStatus.PROVISIONED } });
      const before = await identityState(pending.userId);

      await expect(provisionOsm(ownerA.actor, { contactPhone: "0812345678", ...person(pending.nationalId), targetHospitalId: a.id })).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(provisionOsm(ownerB.actor, { contactPhone: "0812345678", ...person(pending.nationalId), targetHospitalId: b.id })).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(regenerateWorkforceActivation(ownerA.actor, { userId: pending.userId, targetHospitalId: a.id, kind: "OSM", mode: "REMOTE" })).rejects.toMatchObject({ code: "CONFLICT" });
      await expect(complete(pending.token, pending.nationalId)).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await identityState(pending.userId)).toEqual(before);

      // The operator query documented in WORKFORCE_ONBOARDING_V2_REMEDIATION.md.
      const stranded = await prisma.$queryRaw<{ userId: string; hospitalCount: number }[]>`
        SELECT u."id" AS "userId", COUNT(DISTINCT p."hospitalId")::int AS "hospitalCount"
        FROM "User" u
        JOIN (
          SELECT "userId", "hospitalId" FROM "HospitalMembership" WHERE "status" = 'PROVISIONED'
          UNION SELECT "userId", "hospitalId" FROM "OsmHospitalRelationship" WHERE "status" = 'PROVISIONED'
        ) p ON p."userId" = u."id"
        WHERE u."status" = 'PROVISIONED' AND u."authSubject" IS NULL
        GROUP BY u."id" HAVING COUNT(DISTINCT p."hospitalId") > 1`;
      expect(stranded).toEqual([{ userId: pending.userId, hospitalCount: 2 }]);
    });
  });
  describe("cross-domain identity lifecycle (Patient and Workforce)", () => {
    async function setup() {
      const hospital = await createHospital("XDOM-A");
      const owner = await createMember(hospital.id, MembershipType.OWNER, 1);
      return { hospital, owner };
    }
    const workforcePerson = (nationalId: string) => ({ nationalId, givenName: "สมชาย", familyName: "ใจดีมาก" });
    const patientInput = (nationalId: string, targetHospitalId: string) => ({
      identity: { namespace: "thai-national-id" as const, value: nationalId }, givenName: "สมชาย", familyName: "ใจดีมาก", targetHospitalId,
    });
    const completion = (nationalId: string) => ({ nationalId, password: PASSWORD, passwordConfirmation: PASSWORD });
    const patientCompletion = { password: PASSWORD, passwordConfirmation: PASSWORD };
    const patientProvisioner = (authSubject: string) => vi.fn(async ({ userId }: { userId: string; password: string }) => {
      await prisma.user.update({ where: { id: userId }, data: { authSubject } });
      return { userId, authSubject };
    });

    async function domainState() {
      return {
        persons: await prisma.person.findMany({ select: { id: true, givenName: true, familyName: true }, orderBy: { id: "asc" } }),
        users: await prisma.user.findMany({ select: { id: true, status: true, authSubject: true }, orderBy: { id: "asc" } }),
        roles: await prisma.userRole.findMany({ select: { userId: true, role: true }, orderBy: [{ userId: "asc" }, { role: "asc" }] }),
        profiles: await prisma.patientProfile.count(),
        patientRelationships: await prisma.patientHospitalRelationship.count(),
        memberships: await prisma.hospitalMembership.count(),
        osm: await prisma.osmHospitalRelationship.count(),
        workforceActivations: await prisma.workforceActivation.findMany({ select: { id: true, operationState: true, revokedAt: true, usedAt: true, claimedAt: true }, orderBy: { id: "asc" } }),
        patientActivations: await prisma.patientActivation.findMany({ select: { id: true, revokedAt: true, usedAt: true, claimedAt: true }, orderBy: { id: "asc" } }),
        audits: await prisma.auditEvent.count(),
      };
    }

    async function createPatientProfileWithoutUser(hospitalId: string, sequence: number) {
      const nationalId = nationalIdFor(sequence);
      const person = await prisma.person.create({
        data: { identityKeyHash: hashIdentityReference({ namespace: "thai-national-id", value: nationalId }), givenName: "สมชาย", familyName: "ใจดีมาก" },
        select: { id: true },
      });
      const profile = await prisma.patientProfile.create({ data: { personId: person.id }, select: { id: true } });
      await prisma.patientHospitalRelationship.create({ data: { patientProfileId: profile.id, hospitalId, hospitalNumber: `HN${sequence}` } });
      return { nationalId, personId: person.id };
    }

    it("rejects workforce provisioning for a Person with a PatientProfile but no User, committing nothing", async () => {
      const { hospital, owner } = await setup();
      const patient = await createPatientProfileWithoutUser(hospital.id, 40);
      const before = await domainState();

      await expect(provisionOsm(owner.actor, { contactPhone: "0812345678", ...workforcePerson(patient.nationalId), targetHospitalId: hospital.id }))
        .rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("บัญชีผู้ป่วย") });
      await expect(provisionHospitalMember(owner.actor, { contactPhone: "0812345678", ...workforcePerson(patient.nationalId), targetHospitalId: hospital.id, profession: "NURSE" }))
        .rejects.toMatchObject({ code: "CONFLICT" });

      expect(await domainState()).toEqual(before);
      expect(await prisma.user.count({ where: { personId: patient.personId } })).toBe(0);
      expect(await prisma.patientHospitalRelationship.count()).toBe(1);
    });

    it("fails closed for a PROVISIONED User whose PatientProfile exists without the PATIENT role", async () => {
      const { hospital, owner } = await setup();
      const patient = await createPatientProfileWithoutUser(hospital.id, 41);
      await prisma.user.create({ data: { personId: patient.personId, status: UserStatus.PROVISIONED } });
      const before = await domainState();
      await expect(provisionOsm(owner.actor, { contactPhone: "0812345678", ...workforcePerson(patient.nationalId), targetHospitalId: hospital.id })).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await domainState()).toEqual(before);
    });

    it("still provisions and activates a genuine workforce-only Person", async () => {
      const { hospital, owner } = await setup();
      const pending = await provisionPendingOsm(owner, hospital.id, 42);
      await completeWorkforceActivation(pending.token, completion(pending.nationalId), { provisionIdentity: provisioner(randomUUID()) });
      expect(await prisma.user.findUniqueOrThrow({ where: { id: pending.userId } })).toMatchObject({ status: UserStatus.ACTIVE });
      expect(await prisma.patientProfile.count()).toBe(0);
    });

    it("reports a PatientProfile-owned Person as a per-row bulk CONFLICT without failing valid rows", async () => {
      const { hospital, owner } = await setup();
      const patient = await createPatientProfileWithoutUser(hospital.id, 43);
      const input = { submissionId: `${Date.now()}.${randomUUID()}`, targetHospitalId: hospital.id, kind: "OSM" as const, rows: [
        { ...workforcePerson(nationalIdFor(44)), contactPhone: "0812345678" }, { ...workforcePerson(patient.nationalId), contactPhone: "0812345678" }, { ...workforcePerson(nationalIdFor(45)), contactPhone: "0812345678" },
      ] };
      const first = await provisionWorkforceBulk(owner.actor, input);
      expect(first.rows.map(({ status }) => status)).toEqual(["created", "invalid", "created"]);
      expect(first.rows[1]).toMatchObject({ reason: "CONFLICT" });
      const afterFirst = await domainState();
      expect(await provisionWorkforceBulk(owner.actor, input)).toEqual(first);
      expect(await domainState()).toEqual(afterFirst);
      expect(await prisma.user.count({ where: { personId: patient.personId } })).toBe(0);
    });

    it("never leaves a contradictory account when Workforce and Patient provision a new Person concurrently", async () => {
      const { hospital, owner } = await setup();
      const nationalId = nationalIdFor(46);
      const results = await Promise.allSettled([
        provisionOsm(owner.actor, { contactPhone: "0812345678", ...workforcePerson(nationalId), targetHospitalId: hospital.id }),
        provisionPatient(owner.actor, patientInput(nationalId, hospital.id)),
      ]);
      expect(results.some((result) => result.status === "fulfilled")).toBe(true);
      expect(await prisma.person.count({ where: { identityKeyHash: hashIdentityReference({ namespace: "thai-national-id", value: nationalId }) } })).toBe(1);
      expect(await prisma.user.count({ where: { person: { identityKeyHash: hashIdentityReference({ namespace: "thai-national-id", value: nationalId }) } } })).toBe(1);
      const workforce = await prisma.osmHospitalRelationship.count();
      const patient = await prisma.patientProfile.count();
      expect(workforce + patient).toBe(1);
    });

    it.each(["OSM", "HOSPITAL_MEMBER"] as const)("rejects Patient provisioning for a %s still awaiting activation and keeps its token usable", async (kind) => {
      const { hospital, owner } = await setup();
      const nationalId = nationalIdFor(47);
      const pending = kind === "OSM"
        ? await provisionOsm(owner.actor, { contactPhone: "0812345678", ...workforcePerson(nationalId), targetHospitalId: hospital.id })
        : await provisionHospitalMember(owner.actor, { contactPhone: "0812345678", ...workforcePerson(nationalId), targetHospitalId: hospital.id, profession: "NURSE" });
      const before = await domainState();

      await expect(provisionPatient(owner.actor, patientInput(nationalId, hospital.id)))
        .rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("บุคลากร") });
      expect(await domainState()).toEqual(before);

      await expect(previewWorkforceActivation(pending.activationToken!)).resolves.toBeDefined();
      await completeWorkforceActivation(pending.activationToken!, completion(nationalId), { provisionIdentity: provisioner(randomUUID()) });
      expect(await prisma.patientProfile.count()).toBe(0);
    });

    it("lets an ACTIVE workforce User gain PATIENT authority and a profile without any credential change", async () => {
      const { hospital, owner } = await setup();
      const active = await createActiveOsm(hospital.id, 48);
      const result = await provisionPatient(owner.actor, { ...patientInput(active.nationalId, hospital.id), givenName: "สมหญิง", familyName: "ใจดี" });
      expect(result).toMatchObject({ outcome: "CREATED", userId: active.userId, reusedExistingUser: true, accountStatus: UserStatus.ACTIVE });
      expect(await prisma.user.findUniqueOrThrow({ where: { id: active.userId } })).toMatchObject({ authSubject: active.authSubject, status: UserStatus.ACTIVE });
      expect((await prisma.userRole.findMany({ where: { userId: active.userId }, orderBy: { role: "asc" } })).map(({ role }) => role)).toEqual([Role.OSM, Role.PATIENT]);
      await expect(issuePatientActivation(owner.actor, { userId: active.userId, targetHospitalId: hospital.id, reissue: false }))
        .resolves.toMatchObject({ outcome: "ALREADY_ACTIVE", activationToken: null });
    });

    it("still provisions and activates a fresh Patient-only identity", async () => {
      const { hospital, owner } = await setup();
      const nationalId = nationalIdFor(49);
      const patient = await provisionPatient(owner.actor, patientInput(nationalId, hospital.id));
      const issued = await issuePatientActivation(owner.actor, { userId: patient.userId, targetHospitalId: hospital.id, reissue: false });
      const authSubject = randomUUID();
      await completePatientActivation(issued.activationToken!, patientCompletion, { provisionIdentity: patientProvisioner(authSubject) });
      expect(await prisma.user.findUniqueOrThrow({ where: { id: patient.userId } })).toMatchObject({ status: UserStatus.ACTIVE, authSubject });
    });

    const addWorkforceAuthority = {
      osm_role_and_relationship: async (userId: string, hospitalId: string) => {
        await prisma.userRole.create({ data: { userId, role: Role.OSM } });
        await prisma.osmHospitalRelationship.create({ data: { userId, hospitalId, status: MembershipStatus.PROVISIONED } });
      },
      staff_role_and_membership: async (userId: string, hospitalId: string) => {
        await prisma.userRole.create({ data: { userId, role: Role.HOSPITAL } });
        await prisma.hospitalMembership.create({ data: { userId, hospitalId, membershipType: MembershipType.MEMBER, profession: "NURSE", status: MembershipStatus.PROVISIONED } });
      },
      admin_role: async (userId: string) => {
        await prisma.userRole.create({ data: { userId, role: Role.ADMIN } });
      },
      // Legacy-shaped (context-free) row: unfinished provider operation with no relationship to find it by.
      ambiguous_workforce_operation: async (userId: string, _hospitalId: string, creatorId: string) => {
        await prisma.workforceActivation.create({ data: {
          userId, tokenHash: generateWorkforceActivationCredential().tokenHash, mode: "REMOTE", expiresAt: new Date(Date.now() + 3_600_000),
          createdByUserId: creatorId, operationState: "PROVIDER_STARTED", claimedAt: new Date(),
        } });
      },
    };

    it.each(Object.keys(addWorkforceAuthority) as (keyof typeof addWorkforceAuthority)[])(
      "blocks a previously issued Patient activation once workforce authority appears (%s)", async (change) => {
        const { hospital, owner } = await setup();
        const patient = await createPatientIdentity(hospital.id, 50, UserStatus.PROVISIONED);
        const issued = await issuePatientActivation(owner.actor, { userId: patient.userId, targetHospitalId: hospital.id, reissue: false });
        expect(issued.outcome).toBe("ISSUED");
        await addWorkforceAuthority[change](patient.userId, hospital.id, owner.userId);
        const before = await domainState();
        const provisionIdentity = patientProvisioner(randomUUID());

        await expect(getPatientActivationDetails(issued.activationToken!)).rejects.toMatchObject({ code: "CONFLICT" });
        await expect(completePatientActivation(issued.activationToken!, patientCompletion, { provisionIdentity })).rejects.toMatchObject({ code: "CONFLICT" });
        await expect(issuePatientActivation(owner.actor, { userId: patient.userId, targetHospitalId: hospital.id, reissue: true }))
          .rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("บุคลากร") });

        expect(provisionIdentity).not.toHaveBeenCalled();
        expect(await domainState()).toEqual(before);
      },
    );

    it("rejects workforce authority added during the Patient provider call, compensating the new identity", async () => {
      const { hospital, owner } = await setup();
      const patient = await createPatientIdentity(hospital.id, 51, UserStatus.PROVISIONED);
      const issued = await issuePatientActivation(owner.actor, { userId: patient.userId, targetHospitalId: hospital.id, reissue: false });
      const authSubject = randomUUID();
      const provisionIdentity = async ({ userId }: { userId: string; password: string }) => {
        await prisma.user.update({ where: { id: userId }, data: { authSubject } });
        await prisma.userRole.create({ data: { userId, role: Role.OSM } });
        await prisma.osmHospitalRelationship.create({ data: { userId, hospitalId: hospital.id, status: MembershipStatus.PROVISIONED } });
        return { userId, authSubject };
      };
      const deleteProviderIdentity = vi.fn().mockResolvedValue(undefined);
      await expect(completePatientActivation(issued.activationToken!, patientCompletion, { provisionIdentity, deleteProviderIdentity })).rejects.toMatchObject({ code: "CONFLICT" });
      expect(deleteProviderIdentity).toHaveBeenCalledWith(authSubject);
      expect(await prisma.user.findUniqueOrThrow({ where: { id: patient.userId } })).toMatchObject({ status: UserStatus.PROVISIONED, authSubject: null });
    });

    it("keeps a Patient activation usable after a rejected workforce attempt on the same Person", async () => {
      const { hospital, owner } = await setup();
      const patient = await createPatientIdentity(hospital.id, 52, UserStatus.PROVISIONED);
      const issued = await issuePatientActivation(owner.actor, { userId: patient.userId, targetHospitalId: hospital.id, reissue: false });
      await expect(provisionOsm(owner.actor, { contactPhone: "0812345678", ...workforcePerson(patient.nationalId), targetHospitalId: hospital.id })).rejects.toMatchObject({ code: "CONFLICT" });
      const authSubject = randomUUID();
      await completePatientActivation(issued.activationToken!, patientCompletion, { provisionIdentity: patientProvisioner(authSubject) });
      expect(await prisma.user.findUniqueOrThrow({ where: { id: patient.userId } })).toMatchObject({ status: UserStatus.ACTIVE, authSubject });
      expect(await prisma.osmHospitalRelationship.count()).toBe(0);
    });
  });
});
