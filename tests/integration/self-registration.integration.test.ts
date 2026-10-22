import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  PatientActivationPurpose,
  Role,
  UserStatus,
  WorkforceActivationMode,
  WorkforceActivationOperationState,
  WorkforceActivationPurpose,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import type { SelfRegistrationOutcome } from "@/modules/self-registration/domain/self-registration-schemas";
import { evaluateSelfRegistrationByUserId } from "@/modules/self-registration/services/self-registration-eligibility";
import { setHospitalSelfRegistrationEnabled } from "@/modules/hospital-settings/services/hospital-self-registration-settings-service";
import { findPatientDirectory } from "@/modules/patient-directory/services/patient-directory-query-service";
import {
  completePublicSelfRegistration,
  lookupPublicSelfRegistration,
} from "@/modules/self-registration/services/self-registration-service";
import { generateWorkforceActivationCredential, hashWorkforceActivationToken } from "@/modules/workforce/services/activation-token-service";
import { completeWorkforceActivation, listWorkforce } from "@/modules/workforce/services/workforce-service";
import { POST as postLookup } from "../../app/api/v1/self-registration/lookup/route";

const prisma = getPrisma();
const PASSWORD = "self-registration-integration-password";
let sequence = 12_000;

function nationalIdFor(value: number): string {
  const firstTwelveDigits = `1${String(value).padStart(11, "0")}`;
  const weightedSum = Array.from(firstTwelveDigits, Number)
    .reduce((sum, digit, index) => sum + digit * (13 - index), 0);
  return `${firstTwelveDigits}${(11 - weightedSum % 11) % 10}`;
}

async function clearDatabase(): Promise<void> {
  await prisma.publicSelfRegistrationRateLimitBucket.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.patientActivation.deleteMany();
  await prisma.patientOsmAssignment.deleteMany();
  await prisma.patientHospitalRelationship.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.workforceActivation.deleteMany();
  await prisma.osmHospitalRelationship.deleteMany();
  await prisma.hospitalOnboardingApplication.deleteMany();
  await prisma.hospitalMembership.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.hospital.deleteMany();
  await prisma.person.deleteMany();
}

async function getDatabaseNow(): Promise<Date> {
  const rows = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  const now = rows[0]?.now;
  if (!(now instanceof Date)) throw new Error("Database clock is unavailable");
  return now;
}

async function createHospital(input: { code?: string; selfRegistrationEnabled?: boolean } = {}) {
  return prisma.hospital.create({
    data: {
      hospitalCode: input.code ?? `SELF-${randomUUID().slice(0, 8)}`,
      name: "โรงพยาบาลทดสอบ",
      status: HospitalStatus.ACTIVE,
      selfRegistrationEnabled: input.selfRegistrationEnabled ?? true,
    },
    select: { id: true, name: true, status: true },
  });
}

async function createOwner(hospitalId: string): Promise<{ actor: ActorContext; userId: string; nationalId: string }> {
  sequence += 1;
  const nationalId = nationalIdFor(sequence);
  const person = await prisma.person.create({
    data: {
      identityKeyHash: hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: nationalId }),
      givenName: "ผู้ดูแล",
      familyName: "โรงพยาบาล",
    },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { personId: person.id, authSubject: randomUUID(), status: UserStatus.ACTIVE },
    select: { id: true },
  });
  await prisma.userRole.create({ data: { userId: user.id, role: Role.HOSPITAL } });
  await prisma.hospitalMembership.create({
    data: { userId: user.id, hospitalId, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE },
  });

  return {
    userId: user.id,
    nationalId,
    actor: {
      userId: user.id,
      personId: person.id,
      roles: [Role.HOSPITAL],
      hospitalMemberships: [{ hospitalId, membershipType: MembershipType.OWNER, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }],
      osmHospitalRelationships: [],
    },
  };
}

type TargetKind = "MEMBER" | "OSM" | "PATIENT";
type TargetShape = {
  kinds: readonly TargetKind[];
  roles?: readonly Role[];
  membershipType?: MembershipType;
  membershipStatus?: MembershipStatus;
  osmStatus?: MembershipStatus;
  patientEndedAt?: Date | null;
  createdAt?: Date;
};

async function createTarget(hospitalId: string, shape: TargetShape): Promise<{
  userId: string;
  nationalId: string;
  membershipIds: string[];
  osmIds: string[];
  patientRelationshipIds: string[];
}> {
  sequence += 1;
  const relationshipCreatedAt = shape.createdAt ?? await getDatabaseNow();
  const nationalId = nationalIdFor(sequence);
  const person = await prisma.person.create({
    data: {
      identityKeyHash: hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: nationalId }),
      givenName: "สมชาย",
      familyName: "นามสกุลลับ",
    },
    select: { id: true },
  });
  const user = await prisma.user.create({ data: { personId: person.id, status: UserStatus.PROVISIONED }, select: { id: true } });
  const roles = new Set(shape.roles ?? []);
  if (shape.kinds.includes("MEMBER")) roles.add(Role.HOSPITAL);
  if (shape.kinds.includes("OSM")) roles.add(Role.OSM);
  if (shape.kinds.includes("PATIENT")) roles.add(Role.PATIENT);
  if (roles.size) {
    await prisma.userRole.createMany({ data: [...roles].map((role) => ({ userId: user.id, role })) });
  }

  const membershipIds: string[] = [];
  if (shape.kinds.includes("MEMBER")) {
    const membership = await prisma.hospitalMembership.create({
      data: {
        userId: user.id,
        hospitalId,
        membershipType: shape.membershipType ?? MembershipType.MEMBER,
        profession: MembershipType.MEMBER === (shape.membershipType ?? MembershipType.MEMBER) ? "NURSE" : null,
        status: shape.membershipStatus ?? MembershipStatus.PROVISIONED,
        createdAt: relationshipCreatedAt,
      },
      select: { id: true },
    });
    membershipIds.push(membership.id);
  }

  const osmIds: string[] = [];
  if (shape.kinds.includes("OSM")) {
    const relationship = await prisma.osmHospitalRelationship.create({
      data: { userId: user.id, hospitalId, status: shape.osmStatus ?? MembershipStatus.PROVISIONED, createdAt: relationshipCreatedAt },
      select: { id: true },
    });
    osmIds.push(relationship.id);
  }

  const patientRelationshipIds: string[] = [];
  if (shape.kinds.includes("PATIENT")) {
    const patientProfile = await prisma.patientProfile.create({ data: { personId: person.id }, select: { id: true } });
    const relationship = await prisma.patientHospitalRelationship.create({
      data: {
        patientProfileId: patientProfile.id,
        hospitalId,
        hospitalNumber: `HN-${sequence}`,
        endedAt: shape.patientEndedAt ?? null,
        ...(shape.patientEndedAt ? { endedByUserId: user.id, endReason: "integration fixture" } : {}),
        createdAt: relationshipCreatedAt,
      },
      select: { id: true },
    });
    patientRelationshipIds.push(relationship.id);
  }

  return { userId: user.id, nationalId, membershipIds, osmIds, patientRelationshipIds };
}

async function publicLookup(nationalId: string, ipAddress: string) {
  return postLookup(new Request("http://localhost/api/v1/self-registration/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": ipAddress },
    body: JSON.stringify({ nationalId }),
  }));
}

function provisioner() {
  return vi.fn(async ({ userId, password }: { userId: string; password: string }) => {
    expect(password).toBe(PASSWORD);
    const authSubject = randomUUID();
    await prisma.user.update({ where: { id: userId }, data: { authSubject } });
    return { userId, authSubject };
  });
}

type SelfRegistrationFoundLookup = Extract<SelfRegistrationOutcome, { outcome: "FOUND" }> & { now: Date };

async function lookupFound(nationalId: string, ipAddress: string): Promise<SelfRegistrationFoundLookup> {
  const now = await getDatabaseNow();
  const response = await lookupPublicSelfRegistration({ nationalId }, { ipAddress }, { now: () => now });
  if (response.outcome !== "FOUND") throw new Error(`Expected FOUND, received ${response.outcome}`);
  return { ...response, now };
}

describe("SR-1 public self-registration PostgreSQL flow", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("activates MEMBER, OSM, Patient and mixed pending relationships through existing completion services", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const cases: readonly { label: string; kinds: readonly TargetKind[] }[] = [
      { label: "member", kinds: ["MEMBER"] },
      { label: "OSM", kinds: ["OSM"] },
      { label: "patient", kinds: ["PATIENT"] },
      { label: "mixed", kinds: ["MEMBER", "PATIENT"] },
    ];

    for (const [index, testCase] of cases.entries()) {
      const target = await createTarget(hospital.id, { kinds: testCase.kinds });
      const eligibilityNow = await getDatabaseNow();
      const eligibility = await prisma.$transaction((transaction) => evaluateSelfRegistrationByUserId(transaction, target.userId, eligibilityNow));
      expect(eligibility).toMatchObject({ outcome: "ELIGIBLE" });
      const lookup = await lookupFound(target.nationalId, `198.51.100.${index + 1}`);
      expect(lookup.maskedName).toContain("***");
      expect(JSON.stringify(lookup)).not.toContain(target.nationalId);
      expect(JSON.stringify(lookup)).not.toContain(hospital.name);

      await completePublicSelfRegistration({
        token: lookup.capability,
        nationalId: target.nationalId,
        password: PASSWORD,
        passwordConfirmation: PASSWORD,
        nameConfirmed: true,
      }, { now: () => lookup.now, provisionIdentity: provisioner() });

      await expect(prisma.user.findUnique({ where: { id: target.userId }, select: { status: true, authSubject: true } }))
        .resolves.toMatchObject({ status: UserStatus.ACTIVE, authSubject: expect.any(String) });
      if (target.membershipIds.length) {
        const memberships = await prisma.hospitalMembership.findMany({ where: { id: { in: target.membershipIds } }, select: { status: true, selfRegisteredAt: true } });
        expect(memberships).toHaveLength(target.membershipIds.length);
        expect(memberships.every(({ status, selfRegisteredAt }) => status === MembershipStatus.ACTIVE && selfRegisteredAt instanceof Date)).toBe(true);
      }
      if (target.osmIds.length) {
        const relationships = await prisma.osmHospitalRelationship.findMany({ where: { id: { in: target.osmIds } }, select: { status: true, selfRegisteredAt: true } });
        expect(relationships.every(({ status, selfRegisteredAt }) => status === MembershipStatus.ACTIVE && selfRegisteredAt instanceof Date)).toBe(true);
      }
      if (target.patientRelationshipIds.length) {
        const relationships = await prisma.patientHospitalRelationship.findMany({ where: { id: { in: target.patientRelationshipIds } }, select: { selfRegisteredAt: true } });
        expect(relationships.every(({ selfRegisteredAt }) => selfRegisteredAt instanceof Date)).toBe(true);
      }
      const completionAudit = await prisma.auditEvent.findMany({ where: { action: "self_registration.completed", resourceId: hospital.id }, select: { actorUserId: true, metadata: true } });
      expect(completionAudit).not.toHaveLength(0);
      expect(JSON.stringify(completionAudit)).not.toContain(target.nationalId);
      expect(JSON.stringify(completionAudit)).not.toContain("นามสกุลลับ");
    }

    const memberTarget = await createTarget(hospital.id, { kinds: ["MEMBER"] });
    const memberLookup = await lookupFound(memberTarget.nationalId, "198.51.100.20");
    await completePublicSelfRegistration({ token: memberLookup.capability, nationalId: memberTarget.nationalId, password: PASSWORD, passwordConfirmation: PASSWORD, nameConfirmed: true }, { now: () => memberLookup.now, provisionIdentity: provisioner() });
    const workforce = await listWorkforce(owner.actor, { targetHospitalId: hospital.id, selfRegistration: "SELF_REGISTERED" });
    expect(workforce.rows.some(({ id }) => memberTarget.membershipIds.includes(id))).toBe(true);

    const patientTarget = await createTarget(hospital.id, { kinds: ["PATIENT"] });
    const patientLookup = await lookupFound(patientTarget.nationalId, "198.51.100.21");
    await completePublicSelfRegistration({ token: patientLookup.capability, nationalId: patientTarget.nationalId, password: PASSWORD, passwordConfirmation: PASSWORD, nameConfirmed: true }, { now: () => patientLookup.now, provisionIdentity: provisioner() });
    const patients = await findPatientDirectory(owner.actor, { targetHospitalId: hospital.id, lookupType: "NAME", value: "", page: "1", selfRegistration: "SELF_REGISTERED" });
    expect(patients.items.some(({ patientHospitalRelationshipId }) => patientTarget.patientRelationshipIds.includes(patientHospitalRelationshipId))).toBe(true);
  });

  it("returns identical NOT_FOUND status and body for unknown and ineligible records", async () => {
    const activeHospital = await createHospital();
    const activeOwner = await createOwner(activeHospital.id);
    const disabledHospital = await createHospital({ selfRegistrationEnabled: false });
    const oldDate = new Date((await getDatabaseNow()).getTime() - 31 * 24 * 60 * 60 * 1000);
    const targets = [
      await createTarget(activeHospital.id, { kinds: ["MEMBER"], membershipType: MembershipType.OWNER }),
      await createTarget(activeHospital.id, { kinds: [], roles: [Role.ADMIN] }),
      await createTarget(activeHospital.id, { kinds: ["MEMBER"], membershipStatus: MembershipStatus.SUSPENDED }),
      await createTarget(activeHospital.id, { kinds: ["MEMBER"], membershipStatus: MembershipStatus.ENDED }),
      await createTarget(activeHospital.id, { kinds: ["PATIENT"], patientEndedAt: new Date() }),
      await createTarget(activeHospital.id, { kinds: ["MEMBER"], createdAt: oldDate }),
      await createTarget(disabledHospital.id, { kinds: ["MEMBER"] }),
    ];
    const quarantined = await createTarget(activeHospital.id, { kinds: ["MEMBER"] });
    const relationshipId = quarantined.membershipIds[0];
    if (!relationshipId) throw new Error("Missing quarantined membership");
    const now = new Date();
    await prisma.workforceActivation.create({
      data: {
        userId: quarantined.userId,
        createdByUserId: quarantined.userId,
        tokenHash: hashWorkforceActivationToken(`quarantine-${randomUUID()}`),
        mode: WorkforceActivationMode.REMOTE,
        purpose: WorkforceActivationPurpose.ACTIVATION,
        hospitalId: activeHospital.id,
        relationshipId,
        relationshipKind: "HOSPITAL_MEMBER",
        expiresAt: new Date(now.getTime() + 60_000),
        claimedAt: now,
        operationState: WorkforceActivationOperationState.RECONCILIATION_REQUIRED,
        reconciliationRequiredAt: now,
      },
    });
    targets.push(quarantined);
    const unknownId = nationalIdFor(sequence + 1);
    const ids = [unknownId, activeOwner.nationalId, ...targets.map(({ nationalId }) => nationalId)];

    const responses = await Promise.all(ids.map(async (nationalId, index) => {
      const response = await publicLookup(nationalId, `203.0.113.${index + 1}`);
      return { status: response.status, body: await response.json() };
    }));

    expect(responses).toHaveLength(10);
    expect(new Set(responses.map(({ status }) => status))).toEqual(new Set([200]));
    expect(new Set(responses.map(({ body }) => JSON.stringify(body)))).toEqual(new Set([
      JSON.stringify({ outcome: "NOT_FOUND", message: "ไม่พบข้อมูลในระบบ กรุณาติดต่อโรงพยาบาลที่ดูแลคุณ" }),
    ]));
    expect(await prisma.workforceActivation.count({ where: { purpose: WorkforceActivationPurpose.SELF_REGISTRATION } })).toBe(0);
    expect(await prisma.patientActivation.count({ where: { purpose: PatientActivationPurpose.SELF_REGISTRATION } })).toBe(0);
  });

  it("returns ALREADY_ACTIVE with no capability for an existing credential", async () => {
    const hospital = await createHospital();
    const target = await createTarget(hospital.id, { kinds: [] });
    await prisma.user.update({ where: { id: target.userId }, data: { status: UserStatus.ACTIVE, authSubject: randomUUID() } });

    const response = await publicLookup(target.nationalId, "203.0.113.50");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ outcome: "ALREADY_ACTIVE", message: "บัญชีนี้เปิดใช้งานแล้ว" });
    expect(await prisma.workforceActivation.count({ where: { userId: target.userId, purpose: WorkforceActivationPurpose.SELF_REGISTRATION } })).toBe(0);
    expect(await prisma.patientActivation.count({ where: { userId: target.userId, purpose: PatientActivationPurpose.SELF_REGISTRATION } })).toBe(0);
  });

  it("verifies the national ID again before a Patient password is provisioned", async () => {
    const hospital = await createHospital();
    const target = await createTarget(hospital.id, { kinds: ["PATIENT"] });
    const lookup = await lookupFound(target.nationalId, "198.51.100.29");
    const provider = provisioner();
    const input = {
      token: lookup.capability,
      nationalId: nationalIdFor(987_654_321),
      password: PASSWORD,
      passwordConfirmation: PASSWORD,
      nameConfirmed: true,
    };

    await expect(completePublicSelfRegistration(input, { now: () => lookup.now, provisionIdentity: provider }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(provider).not.toHaveBeenCalled();

    await expect(completePublicSelfRegistration({ ...input, nationalId: target.nationalId }, {
      now: () => lookup.now,
      provisionIdentity: provider,
    })).resolves.toMatchObject({ userId: target.userId });
    expect(provider).toHaveBeenCalledOnce();
  });

  it("fails when the capability expires or eligibility is lost, and consumes a successful capability once", async () => {
    const hospital = await createHospital();
    const expiredTarget = await createTarget(hospital.id, { kinds: ["MEMBER"] });
    const expiredLookup = await lookupFound(expiredTarget.nationalId, "198.51.100.30");
    const expiredProvider = provisioner();
    await expect(completePublicSelfRegistration({ token: expiredLookup.capability, nationalId: expiredTarget.nationalId, password: PASSWORD, passwordConfirmation: PASSWORD, nameConfirmed: true }, {
      now: () => new Date(expiredLookup.now.getTime() + 11 * 60 * 1000),
      provisionIdentity: expiredProvider,
    })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(expiredProvider).not.toHaveBeenCalled();

    const disabledTarget = await createTarget(hospital.id, { kinds: ["MEMBER"] });
    const disabledLookup = await lookupFound(disabledTarget.nationalId, "198.51.100.31");
    await prisma.hospital.update({ where: { id: hospital.id }, data: { selfRegistrationEnabled: false } });
    const disabledProvider = provisioner();
    await expect(completePublicSelfRegistration({ token: disabledLookup.capability, nationalId: disabledTarget.nationalId, password: PASSWORD, passwordConfirmation: PASSWORD, nameConfirmed: true }, { now: () => disabledLookup.now, provisionIdentity: disabledProvider }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(disabledProvider).not.toHaveBeenCalled();
    await prisma.hospital.update({ where: { id: hospital.id }, data: { selfRegistrationEnabled: true } });

    const suspendedTarget = await createTarget(hospital.id, { kinds: ["MEMBER"] });
    const suspendedLookup = await lookupFound(suspendedTarget.nationalId, "198.51.100.34");
    const suspendedMembershipId = suspendedTarget.membershipIds[0];
    if (!suspendedMembershipId) throw new Error("Missing provisioned membership");
    await prisma.hospitalMembership.update({
      where: { id: suspendedMembershipId },
      data: { status: MembershipStatus.SUSPENDED },
    });
    const suspendedProvider = provisioner();
    await expect(completePublicSelfRegistration({
      token: suspendedLookup.capability,
      nationalId: suspendedTarget.nationalId,
      password: PASSWORD,
      passwordConfirmation: PASSWORD,
      nameConfirmed: true,
    }, { now: () => suspendedLookup.now, provisionIdentity: suspendedProvider }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(suspendedProvider).not.toHaveBeenCalled();

    const target = await createTarget(hospital.id, { kinds: ["MEMBER"] });
    const lookup = await lookupFound(target.nationalId, "198.51.100.32");
    const provider = provisioner();
    const input = { token: lookup.capability, nationalId: target.nationalId, password: PASSWORD, passwordConfirmation: PASSWORD, nameConfirmed: true };
    await completePublicSelfRegistration(input, { now: () => lookup.now, provisionIdentity: provider });
    await expect(completePublicSelfRegistration(input, { now: () => lookup.now, provisionIdentity: provider })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(provider).toHaveBeenCalledOnce();
  });

  it("rejects self-registration after an invite completes for the same Person", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const target = await createTarget(hospital.id, { kinds: ["MEMBER"] });
    const lookup = await lookupFound(target.nationalId, "198.51.100.33");
    const membershipId = target.membershipIds[0];
    if (!membershipId) throw new Error("Missing provisioned membership");

    const invite = generateWorkforceActivationCredential();
    await prisma.workforceActivation.create({
      data: {
        userId: target.userId,
        tokenHash: invite.tokenHash,
        mode: WorkforceActivationMode.REMOTE,
        purpose: WorkforceActivationPurpose.ACTIVATION,
        hospitalId: hospital.id,
        relationshipId: membershipId,
        relationshipKind: "HOSPITAL_MEMBER",
        expiresAt: new Date(lookup.now.getTime() + 60 * 60 * 1000),
        createdByUserId: owner.userId,
      },
    });

    const inviteProvider = provisioner();
    await completeWorkforceActivation(invite.plaintextToken, {
      nationalId: target.nationalId,
      password: PASSWORD,
      passwordConfirmation: PASSWORD,
    }, { provisionIdentity: inviteProvider });

    const selfRegistrationProvider = provisioner();
    await expect(completePublicSelfRegistration({
      token: lookup.capability,
      nationalId: target.nationalId,
      password: PASSWORD,
      passwordConfirmation: PASSWORD,
      nameConfirmed: true,
    }, { now: () => lookup.now, provisionIdentity: selfRegistrationProvider }))
      .rejects.toMatchObject({ code: "CONFLICT" });

    expect(inviteProvider).toHaveBeenCalledOnce();
    expect(selfRegistrationProvider).not.toHaveBeenCalled();
    await expect(prisma.user.findUnique({ where: { id: target.userId }, select: { status: true, authSubject: true } }))
      .resolves.toMatchObject({ status: UserStatus.ACTIVE, authSubject: expect.any(String) });
    await expect(prisma.hospitalMembership.findUnique({ where: { id: membershipId }, select: { status: true } }))
      .resolves.toEqual({ status: MembershipStatus.ACTIVE });
  });

  it("allows only one concurrent first-credential completion", async () => {
    const hospital = await createHospital();
    const target = await createTarget(hospital.id, { kinds: ["MEMBER"] });
    const lookup = await lookupFound(target.nationalId, "198.51.100.40");
    let releaseProvider: (() => void) | undefined;
    let providerStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => { providerStarted = resolve; });
    const release = new Promise<void>((resolve) => { releaseProvider = resolve; });
    const authSubject = randomUUID();
    const provider = vi.fn(async ({ userId, password }: { userId: string; password: string }) => {
      expect(password).toBe(PASSWORD);
      providerStarted?.();
      await release;
      await prisma.user.update({ where: { id: userId }, data: { authSubject } });
      return { userId, authSubject };
    });
    const input = { token: lookup.capability, nationalId: target.nationalId, password: PASSWORD, passwordConfirmation: PASSWORD, nameConfirmed: true };
    const first = completePublicSelfRegistration(input, { now: () => lookup.now, provisionIdentity: provider });
    await started;
    await expect(completePublicSelfRegistration(input, { now: () => lookup.now, provisionIdentity: provider })).rejects.toMatchObject({ code: "CONFLICT" });
    releaseProvider?.();
    await expect(first).resolves.toMatchObject({ userId: target.userId });
    expect(provider).toHaveBeenCalledOnce();
    await expect(prisma.user.findUnique({ where: { id: target.userId }, select: { status: true, authSubject: true } }))
      .resolves.toEqual({ status: UserStatus.ACTIVE, authSubject });
  });

  it("allows only the direct active OWNER to change the setting and audits each change", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);

    await expect(setHospitalSelfRegistrationEnabled(owner.actor, { hospitalId: hospital.id, enabled: false }))
      .resolves.toEqual({ enabled: false, changed: true });
    const settingEvents = await prisma.auditEvent.findMany({ where: { action: { in: ["self_registration.setting_disabled", "self_registration.setting_enabled"] } }, select: { actorUserId: true, action: true, metadata: true } });
    expect(settingEvents).toEqual([{ actorUserId: owner.userId, action: "self_registration.setting_disabled", metadata: { enabled: false } }]);
    await expect(setHospitalSelfRegistrationEnabled({ ...owner.actor, roles: [Role.ADMIN, Role.HOSPITAL] }, { hospitalId: hospital.id, enabled: true }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
