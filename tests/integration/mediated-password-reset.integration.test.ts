import {
  CaregiverAppointmentGrantStatus,
  CaregiverInvitationStatus,
  CaregiverRelationshipStatus,
  HospitalStatus,
  IdentityAssurance,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
  UserTakeoverProviderState,
  WorkforceActivationOperationState,
  type Hospital,
} from "@prisma/client";
import { AuthApiError } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import { createActorContextStore, resolveActorAccessByAuthSubject } from "@/modules/auth/services/actor-context-service";
import { authenticateWithPassword } from "@/modules/auth/services/authentication-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { createProviderResetLoginAlias } from "@/modules/auth/services/provider-login-alias";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { ProviderIdentityRejectedError } from "@/modules/account-security/adapters/supabase-account-security-provider";
import {
  completeMediatedPasswordReset,
  getMediatedPasswordResetAvailability,
  issueMediatedPasswordReset,
  listQuarantinedMediatedPasswordResets,
  reconcileMediatedPasswordReset,
  searchMediatedPasswordResetTargets,
} from "@/modules/account-security/services/mediated-password-reset-service";
import { lockSuspectedTakeover } from "@/modules/user-management/services/user-takeover-service";
import { provisionHospitalMember, provisionOsm } from "@/modules/workforce/services/workforce-service";
import { ConflictError, ForbiddenError, InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

const db = getPrisma();
const now = new Date("2026-10-22T03:00:00.000Z");
let sequence = 51_000;

function nationalIdFor(value: number): string {
  const firstTwelve = "3" + String(value).padStart(11, "0");
  const sum = Array.from(firstTwelve, Number).reduce((total, digit, index) => total + digit * (13 - index), 0);
  return firstTwelve + String((11 - (sum % 11)) % 10);
}

async function clearDatabase(): Promise<void> {
  await db.providerIdentityCleanup.deleteMany();
  await db.userTakeoverLock.deleteMany();
  await db.lineAccountBinding.deleteMany();
  await db.auditEvent.deleteMany();
  await db.accountRecovery.deleteMany();
  await db.caregiverAppointmentGrant.deleteMany();
  await db.caregiverRelationship.deleteMany();
  await db.caregiverInvitation.deleteMany();
  await db.patientHospitalHealthHistory.deleteMany();
  await db.patientHospitalRelationship.deleteMany();
  await db.patientProfile.deleteMany();
  await db.workforceActivation.deleteMany();
  await db.osmHospitalRelationship.deleteMany();
  await db.hospitalMembership.deleteMany();
  await db.userRole.deleteMany();
  await db.$transaction([
    db.$executeRaw`SELECT set_config('demi.service_area_purge', 'demo-reset', true)`,
    db.hospitalServiceArea.deleteMany(),
  ]);
  await db.hospitalServiceAreaEligibility.deleteMany();
  await db.user.deleteMany();
  await db.hospital.deleteMany();
  await db.person.deleteMany();
}

async function createHospital(): Promise<Hospital> {
  sequence += 1;
  return db.hospital.create({
    data: { hospitalCode: "REC1-" + sequence, name: "โรงพยาบาล REC-1 " + sequence, status: HospitalStatus.ACTIVE },
  });
}

async function createIdentity(input: { nationalId?: string; role?: Role; name?: string }): Promise<{ userId: string; personId: string; authSubject: string; nationalId: string }> {
  const nationalId = input.nationalId ?? nationalIdFor(++sequence);
  const person = await db.person.create({
    data: {
      identityKeyHash: hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: nationalId }),
      givenName: input.name ?? "ผู้ใช้",
      familyName: "REC-" + sequence,
    },
    select: { id: true },
  });
  const authSubject = randomUUID();
  const user = await db.user.create({
    data: {
      personId: person.id,
      status: UserStatus.ACTIVE,
      authSubject,
      ...(input.role ? { roles: { create: [{ role: input.role }] } } : {}),
    },
    select: { id: true },
  });
  return { userId: user.id, personId: person.id, authSubject, nationalId };
}

async function createOwner(hospitalId: string): Promise<ActorContext> {
  const identity = await createIdentity({ role: Role.HOSPITAL, name: "เจ้าของ" });
  await db.hospitalMembership.create({
    data: { userId: identity.userId, hospitalId, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE },
  });
  return {
    userId: identity.userId,
    personId: identity.personId,
    roles: [Role.HOSPITAL],
    hospitalMemberships: [{ hospitalId, membershipType: MembershipType.OWNER, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }],
    osmHospitalRelationships: [],
  };
}

async function createAdmin(): Promise<ActorContext> {
  const identity = await createIdentity({ role: Role.ADMIN, name: "ผู้ดูแลระบบ" });
  return { userId: identity.userId, personId: identity.personId, roles: [Role.ADMIN], hospitalMemberships: [], osmHospitalRelationships: [] };
}

async function createTarget(kind: "staff" | "osm" | "patient", hospitalId: string): Promise<{
  userId: string; personId: string; authSubject: string; nationalId: string; relationshipId: string; patientProfileId: string | null;
}> {
  const identity = await createIdentity({ role: kind === "staff" ? Role.HOSPITAL : kind === "osm" ? Role.OSM : Role.PATIENT });
  if (kind === "staff") {
    const relationship = await db.hospitalMembership.create({ data: { userId: identity.userId, hospitalId, membershipType: MembershipType.MEMBER, status: MembershipStatus.ACTIVE } });
    return { ...identity, relationshipId: relationship.id, patientProfileId: null };
  }
  if (kind === "osm") {
    const relationship = await db.osmHospitalRelationship.create({ data: { userId: identity.userId, hospitalId, status: MembershipStatus.ACTIVE } });
    return { ...identity, relationshipId: relationship.id, patientProfileId: null };
  }
  const profile = await db.patientProfile.create({ data: { personId: identity.personId } });
  const relationship = await db.patientHospitalRelationship.create({ data: { patientProfileId: profile.id, hospitalId, hospitalNumber: "HN-" + sequence } });
  return { ...identity, relationshipId: relationship.id, patientProfileId: profile.id };
}

function fakeProvider() {
  const replacementSubject = randomUUID();
  const createReplacementIdentity = vi.fn(async ({ userId, resetId }: { userId: string; resetId: string }) => ({
    authSubject: replacementSubject,
    providerLoginAlias: createProviderResetLoginAlias(userId, resetId),
  }));
  const deleteProviderIdentity = vi.fn(async () => undefined);
  const sendLineMessage = vi.fn(async () => ({ kind: "ACCEPTED" }));
  return { replacementSubject, createReplacementIdentity, deleteProviderIdentity, sendLineMessage };
}

function issueInput(kind: "staff" | "osm" | "patient", hospitalId: string, relationshipId: string, mode: "IN_PERSON" | "ONLINE" = "IN_PERSON") {
  return { targetKind: kind, hospitalId, relationshipId, mode, verificationMethod: "IN_PERSON_ID_CARD" as const };
}

describe("REC-1 owner/admin-mediated password reset PostgreSQL workflows", () => {
  beforeAll(async () => {
    await db.$connect();
    await clearDatabase();
  });
  afterEach(clearDatabase);
  afterAll(async () => { await db.$disconnect(); });

  it.each([
    ["staff", "IN_PERSON"], ["staff", "ONLINE"],
    ["osm", "IN_PERSON"], ["osm", "ONLINE"],
    ["patient", "IN_PERSON"], ["patient", "ONLINE"],
  ] as const)("OWNER resets an eligible %s account in %s mode and replaces the canonical provider identity", async (kind, mode) => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const target = await createTarget(kind, hospital.id);
    const provider = fakeProvider();
    const issued = await issueMediatedPasswordReset(owner, issueInput(kind, hospital.id, target.relationshipId, mode), {
      database: db,
      now: () => now,
    });

    expect(issued.expiresAt.getTime()).toBe(now.getTime() + (mode === "IN_PERSON" ? 15 * 60_000 : 24 * 60 * 60_000));
    await completeMediatedPasswordReset({
      token: issued.token,
      nationalId: target.nationalId,
      newPassword: "new-password-for-rec1",
      passwordConfirmation: "new-password-for-rec1",
    }, { database: db, now: () => now, ...provider });

    expect(await db.user.findUniqueOrThrow({ where: { id: target.userId } })).toMatchObject({
      authSubject: provider.replacementSubject,
      providerLoginAlias: target.userId + "." + issued.resetId + "@auth.demi.internal",
      status: UserStatus.ACTIVE,
    });
    expect(provider.createReplacementIdentity).toHaveBeenCalledOnce();
    expect(provider.createReplacementIdentity).toHaveBeenCalledWith({
      userId: target.userId,
      resetId: issued.resetId,
      authSubject: target.authSubject,
      newPassword: "new-password-for-rec1",
    });
    expect(provider.deleteProviderIdentity).toHaveBeenCalledWith(target.authSubject);
    expect(await db.workforceActivation.count({ where: { userId: target.userId, purpose: "RESET", usedAt: { not: null } } }) +
      await db.accountRecovery.count({ where: { targetUserId: target.userId, completedAt: { not: null } } })).toBe(1);
    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: "account.password_reset.completed", resourceId: target.userId } });
    expect(audit).toMatchObject({ actorUserId: null, metadata: { issuerUserId: owner.userId, mode, verificationMethod: "IN_PERSON_ID_CARD", outcome: "COMPLETED" } });
    expect(await db.providerIdentityCleanup.findUniqueOrThrow({ where: { authSubject: target.authSubject } })).toMatchObject({ completedAt: now });
    expect(JSON.stringify(audit.metadata)).not.toContain(target.nationalId);
  });

  it("requires ADMIN for self, OWNER, ADMIN, multi-hospital, and caregiver targets; ADMIN may reset out-of-scope accounts but never self", async () => {
    const hospital = await createHospital();
    const otherHospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const ownerTarget = await createIdentity({ role: Role.HOSPITAL });
    const ownerMembership = await db.hospitalMembership.create({ data: { userId: ownerTarget.userId, hospitalId: hospital.id, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE } });
    const adminTarget = await createTarget("staff", hospital.id);
    await db.userRole.create({ data: { userId: adminTarget.userId, role: Role.ADMIN } });
    const multiHospitalTarget = await createTarget("staff", hospital.id);
    await db.hospitalMembership.create({ data: { userId: multiHospitalTarget.userId, hospitalId: otherHospital.id, membershipType: MembershipType.MEMBER, status: MembershipStatus.ENDED } });
    const caregiverTarget = await createTarget("patient", hospital.id);
    const caregiverPatientProfileId = caregiverTarget.patientProfileId;
    if (!caregiverPatientProfileId) throw new Error("Expected patient profile");
    const caregiverPatient = await createTarget("patient", hospital.id);
    await db.user.update({ where: { id: caregiverPatient.userId }, data: { identityAssurance: IdentityAssurance.CAREGIVER_INVITATION } });
    const caregiver = { userId: caregiverPatient.userId, personId: caregiverPatient.personId };
    const caregiverInvitation = await db.caregiverInvitation.create({
      data: {
        patientProfileId: caregiverPatientProfileId,
        caregiverUserId: caregiver.userId,
        caregiverPersonId: caregiver.personId,
        issuedByUserId: owner.userId,
        tokenHash: randomUUID().replace(/-/gu, "").padEnd(64, "1"),
        issuedAt: now,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60_000),
        status: CaregiverInvitationStatus.ACCEPTED,
        acceptedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });
    const caregiverRelationship = await db.caregiverRelationship.create({
      data: {
        patientProfileId: caregiverPatientProfileId,
        caregiverUserId: caregiver.userId,
        sourceInvitationId: caregiverInvitation.id,
        status: CaregiverRelationshipStatus.ACTIVE,
        activatedAt: now,
      },
    });
    await db.caregiverAppointmentGrant.create({
      data: {
        caregiverRelationshipId: caregiverRelationship.id,
        patientProfileId: caregiverPatientProfileId,
        patientPersonId: caregiverTarget.personId,
        caregiverUserId: caregiver.userId,
        caregiverPersonId: caregiver.personId,
        patientHospitalRelationshipId: caregiverTarget.relationshipId,
        contractVersion: "REC-1-test",
        status: CaregiverAppointmentGrantStatus.ACTIVE,
        proposedByUserId: caregiverTarget.userId,
        proposedAt: now,
        acceptedByUserId: caregiver.userId,
        acceptedAt: now,
      },
    });
    const selfMembership = await db.hospitalMembership.findFirstOrThrow({ where: { userId: owner.userId, hospitalId: hospital.id } });
    const invalidTargets = [
      issueInput("staff", hospital.id, selfMembership.id),
      issueInput("staff", hospital.id, ownerMembership.id),
      issueInput("staff", hospital.id, adminTarget.relationshipId),
      issueInput("staff", hospital.id, multiHospitalTarget.relationshipId),
      issueInput("patient", hospital.id, caregiverPatient.relationshipId),
    ];
    for (const input of invalidTargets) {
      await expect(issueMediatedPasswordReset(owner, input, { database: db, now: () => now })).rejects.toBeInstanceOf(ForbiddenError);
    }
    await expect(issueMediatedPasswordReset(owner, { ...invalidTargets[0], verificationMethod: undefined }, { database: db, now: () => now })).rejects.toBeInstanceOf(ValidationError);

    // A single-Hospital patient who HAS caregivers stays OWNER-eligible; only acting as a caregiver requires ADMIN.
    const patientWithCaregiverProvider = fakeProvider();
    const patientWithCaregiverReset = await issueMediatedPasswordReset(owner, issueInput("patient", hospital.id, caregiverTarget.relationshipId), { database: db, now: () => now });
    await completeMediatedPasswordReset({
      token: patientWithCaregiverReset.token,
      nationalId: caregiverTarget.nationalId,
      newPassword: "new-password-for-rec1",
      passwordConfirmation: "new-password-for-rec1",
    }, { database: db, now: () => now, ...patientWithCaregiverProvider });
    expect(await db.user.findUniqueOrThrow({ where: { id: caregiverTarget.userId } })).toMatchObject({ authSubject: patientWithCaregiverProvider.replacementSubject });

    const admin = await createAdmin();
    const adminIssued = await issueMediatedPasswordReset(admin, issueInput("staff", hospital.id, multiHospitalTarget.relationshipId, "ONLINE"), { database: db, now: () => now });
    await expect(issueMediatedPasswordReset(admin, issueInput("staff", hospital.id, ownerMembership.id), { database: db, now: () => now })).resolves.toMatchObject({ mode: "IN_PERSON" });
    await expect(issueMediatedPasswordReset(admin, issueInput("staff", hospital.id, adminTarget.relationshipId), { database: db, now: () => now })).resolves.toMatchObject({ mode: "IN_PERSON" });
    const adminSelfMembership = await db.hospitalMembership.create({ data: { userId: admin.userId, hospitalId: hospital.id, membershipType: MembershipType.MEMBER, status: MembershipStatus.ACTIVE } });
    await expect(issueMediatedPasswordReset(admin, issueInput("staff", hospital.id, adminSelfMembership.id), { database: db, now: () => now })).rejects.toBeInstanceOf(ForbiddenError);

    const platformAdminTarget = await createIdentity({ role: Role.ADMIN, name: "บัญชีผู้ดูแลที่ไม่มีความสัมพันธ์โรงพยาบาล" });
    const platformAdminProvider = fakeProvider();
    const platformAdminReset = await issueMediatedPasswordReset(admin, {
      targetKind: "platform_admin",
      targetUserId: platformAdminTarget.userId,
      hospitalId: hospital.id,
      relationshipId: null,
      mode: "ONLINE",
      verificationMethod: "VIDEO_CALL_FACE_AND_ID_CARD",
    }, { database: db, now: () => now });
    await completeMediatedPasswordReset({
      token: platformAdminReset.token,
      nationalId: platformAdminTarget.nationalId,
      newPassword: "new-password-for-rec1",
      passwordConfirmation: "new-password-for-rec1",
    }, { database: db, now: () => now, ...platformAdminProvider });
    expect(await db.user.findUniqueOrThrow({ where: { id: platformAdminTarget.userId } })).toMatchObject({ authSubject: platformAdminProvider.replacementSubject, status: UserStatus.ACTIVE });

    const caregiverPatientRelationship = await db.patientHospitalRelationship.findUniqueOrThrow({
      where: { id: caregiverPatient.relationshipId }, select: { updatedAt: true },
    });
    await lockSuspectedTakeover(owner, {
      kind: "patient",
      relationshipId: caregiverPatient.relationshipId,
      targetHospitalId: hospital.id,
      expectedUpdatedAt: caregiverPatientRelationship.updatedAt.toISOString(),
      confirmation: "ไม่ใช่เจ้าของจริง",
    }, { database: db, now: () => now, revokeProviderSessions: async () => "CONFIRMED" });
    const caregiverResetProvider = fakeProvider();
    const previousCaregiverSubject = caregiverPatient.authSubject;
    const caregiverReset = await issueMediatedPasswordReset(admin, issueInput("patient", hospital.id, caregiverPatient.relationshipId), { database: db, now: () => now });
    await completeMediatedPasswordReset({
      token: caregiverReset.token,
      nationalId: caregiverPatient.nationalId,
      newPassword: "new-password-for-rec1",
      passwordConfirmation: "new-password-for-rec1",
    }, { database: db, now: () => now, ...caregiverResetProvider });
    expect(await db.user.findUniqueOrThrow({ where: { id: caregiverPatient.userId } })).toMatchObject({
      status: UserStatus.ACTIVE,
      identityAssurance: IdentityAssurance.HOSPITAL_PROOFED,
      authSubject: caregiverResetProvider.replacementSubject,
    });
    expect(caregiverResetProvider.deleteProviderIdentity).toHaveBeenCalledWith(previousCaregiverSubject);
    expect(await createActorContextStore(db).findUserByAuthSubject(previousCaregiverSubject)).toBeNull();
    expect(await createActorContextStore(db).findUserByAuthSubject(caregiverResetProvider.replacementSubject)).not.toBeNull();
    const replacementLoginProvider = {
      signInWithPassword: vi.fn(async ({ password }: { email: string; password: string }) => password === "new-password-for-rec1"
        ? { data: { user: { id: caregiverResetProvider.replacementSubject } }, error: null }
        : { data: { user: null }, error: new AuthApiError("Invalid login credentials", 400, "invalid_credentials") }),
      getUser: vi.fn(async () => ({ data: { user: { id: caregiverResetProvider.replacementSubject } }, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    };
    await expect(authenticateWithPassword({ nationalId: caregiverPatient.nationalId, password: "new-password-for-rec1" }, {
      provider: replacementLoginProvider,
      actorStore: createActorContextStore(db),
    })).resolves.toMatchObject({ status: "AUTHORIZED", actor: { userId: caregiverPatient.userId } });
    await expect(authenticateWithPassword({ nationalId: caregiverPatient.nationalId, password: "caregiver-test-password-2026" }, {
      provider: replacementLoginProvider,
      actorStore: createActorContextStore(db),
    })).resolves.toEqual({ status: "INVALID_CREDENTIALS" });
    expect(await db.caregiverRelationship.findUniqueOrThrow({ where: { id: caregiverRelationship.id }, select: { status: true } }))
      .toEqual({ status: CaregiverRelationshipStatus.ACTIVE });
    expect(await db.caregiverAppointmentGrant.findFirstOrThrow({ where: { caregiverUserId: caregiverPatient.userId }, select: { status: true } }))
      .toEqual({ status: CaregiverAppointmentGrantStatus.ACTIVE });
    expect(adminIssued.mode).toBe("ONLINE");
  });

  it("revokes the online link after five wrong national IDs", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const target = await createTarget("patient", hospital.id);
    const issued = await issueMediatedPasswordReset(owner, issueInput("patient", hospital.id, target.relationshipId, "ONLINE"), { database: db, now: () => now });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(completeMediatedPasswordReset({
        token: issued.token,
        nationalId: nationalIdFor(90_000 + attempt),
        newPassword: "new-password-for-rec1",
        passwordConfirmation: "new-password-for-rec1",
      }, { database: db, now: () => now })).rejects.toBeInstanceOf(ForbiddenError);
    }
    const record = await db.accountRecovery.findUniqueOrThrow({ where: { id: issued.resetId } });
    expect(record).toMatchObject({ failedVerificationCount: 5, claimedAt: null });
    expect(record.revokedAt).toEqual(now);
    const identityChecks = await db.auditEvent.findMany({ where: { action: "account.password_reset.identity_check", resourceId: target.userId } });
    expect(identityChecks).toHaveLength(5);
    for (const event of identityChecks) {
      expect(event).toMatchObject({ actorUserId: null, metadata: { issuerUserId: owner.userId } });
    }
  });

  it("binds the patient scope and expires online links at 24 hours", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const target = await createTarget("patient", hospital.id);
    const issued = await issueMediatedPasswordReset(owner, issueInput("patient", hospital.id, target.relationshipId, "ONLINE"), { database: db, now: () => now });
    expect(await db.accountRecovery.findUniqueOrThrow({ where: { id: issued.resetId } })).toMatchObject({ hospitalId: hospital.id });
    expect(await getMediatedPasswordResetAvailability(issued.token, { database: db, now: () => now })).toMatchObject({ mode: "ONLINE", expiresAt: issued.expiresAt });
    await expect(getMediatedPasswordResetAvailability(issued.token, {
      database: db,
      now: () => new Date(now.getTime() + 24 * 60 * 60_000),
    })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("searches by the HMAC National ID index and audits without persisting the ID or hash", async () => {
    const hospital = await createHospital();
    const admin = await createAdmin();
    const target = await createTarget("staff", hospital.id);
    const candidates = await searchMediatedPasswordResetTargets(admin, { nationalId: target.nationalId }, db);
    expect(candidates).toContainEqual(expect.objectContaining({ userId: target.userId, relationshipId: target.relationshipId, hospitalId: hospital.id }));
    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: "account.password_reset.admin_search", actorUserId: admin.userId } });
    expect(audit.metadata).toMatchObject({ outcome: "MATCH", candidateCount: 1 });
    expect(JSON.stringify(audit.metadata)).not.toContain(target.nationalId);
    expect(JSON.stringify(audit.metadata)).not.toContain(hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: target.nationalId }));
    const owner = await createOwner(hospital.id);
    await expect(searchMediatedPasswordResetTargets(owner, { nationalId: target.nationalId }, db)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("does not offer self-reset or a suspended account without a takeover lock in the ADMIN search", async () => {
    const adminIdentity = await createIdentity({ role: Role.ADMIN, name: "ผู้ดูแลระบบ" });
    const admin: ActorContext = {
      userId: adminIdentity.userId,
      personId: adminIdentity.personId,
      roles: [Role.ADMIN],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    const hospital = await createHospital();
    const suspendedTarget = await createTarget("staff", hospital.id);
    await db.user.update({ where: { id: suspendedTarget.userId }, data: { status: UserStatus.SUSPENDED } });

    await expect(searchMediatedPasswordResetTargets(admin, { nationalId: adminIdentity.nationalId }, db)).resolves.toEqual([]);
    await expect(searchMediatedPasswordResetTargets(admin, { nationalId: suspendedTarget.nationalId }, db)).resolves.toEqual([]);
  });

  it("rechecks the owner's full historical Hospital scope when an online reset is completed", async () => {
    const hospital = await createHospital();
    const otherHospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const target = await createTarget("patient", hospital.id);
    const issued = await issueMediatedPasswordReset(owner, issueInput("patient", hospital.id, target.relationshipId, "ONLINE"), { database: db, now: () => now });
    const patientProfileId = target.patientProfileId;
    if (!patientProfileId) throw new Error("Expected patient profile");
    await db.patientHospitalRelationship.create({ data: { patientProfileId, hospitalId: otherHospital.id, hospitalNumber: "HN-" + sequence + "-OTHER" } });
    const provider = fakeProvider();
    await expect(completeMediatedPasswordReset({
      token: issued.token,
      nationalId: target.nationalId,
      newPassword: "new-password-for-rec1",
      passwordConfirmation: "new-password-for-rec1",
    }, { database: db, now: () => now, ...provider })).rejects.toBeInstanceOf(ForbiddenError);
    expect(provider.createReplacementIdentity).not.toHaveBeenCalled();
    expect(await db.accountRecovery.findUniqueOrThrow({ where: { id: issued.resetId } })).toMatchObject({ claimedAt: null });
  });

  it("allows only one of two concurrent completion attempts to create a credential", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const target = await createTarget("staff", hospital.id);
    const issued = await issueMediatedPasswordReset(owner, issueInput("staff", hospital.id, target.relationshipId, "ONLINE"), { database: db, now: () => now });
    const provider = fakeProvider();
    const input = { token: issued.token, nationalId: target.nationalId, newPassword: "new-password-for-rec1", passwordConfirmation: "new-password-for-rec1" };
    const results = await Promise.allSettled([
      completeMediatedPasswordReset(input, { database: db, now: () => now, ...provider }),
      completeMediatedPasswordReset(input, { database: db, now: () => now, ...provider }),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(provider.createReplacementIdentity).toHaveBeenCalledOnce();
    expect(provider.deleteProviderIdentity).toHaveBeenCalledOnce();
  });

  it("keeps an ambiguous provider response quarantined", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const target = await createTarget("staff", hospital.id);
    const issued = await issueMediatedPasswordReset(owner, issueInput("staff", hospital.id, target.relationshipId), { database: db, now: () => now });
    const createReplacementIdentity = vi.fn(async () => { throw new Error("provider outcome unknown"); });
    await expect(completeMediatedPasswordReset({
      token: issued.token,
      nationalId: target.nationalId,
      newPassword: "new-password-for-rec1",
      passwordConfirmation: "new-password-for-rec1",
    }, { database: db, now: () => now, createReplacementIdentity })).rejects.toBeInstanceOf(InfrastructureError);
    expect(await db.workforceActivation.findUniqueOrThrow({ where: { id: issued.resetId } })).toMatchObject({
      operationState: WorkforceActivationOperationState.RECONCILIATION_REQUIRED,
      reconciliationRequiredAt: now,
    });
    expect(await createActorContextStore(db).findUserById(target.userId)).toBeNull();
  });

  it("finalizes the reset when deleting the old provider identity fails and retries the cleanup later", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const target = await createTarget("staff", hospital.id);
    const issued = await issueMediatedPasswordReset(owner, issueInput("staff", hospital.id, target.relationshipId), { database: db, now: () => now });
    const provider = fakeProvider();
    provider.deleteProviderIdentity.mockRejectedValueOnce(new Error("provider delete response lost"));

    await completeMediatedPasswordReset({
      token: issued.token,
      nationalId: target.nationalId,
      newPassword: "new-password-for-rec1",
      passwordConfirmation: "new-password-for-rec1",
    }, { database: db, now: () => now, ...provider });
    expect(await db.user.findUniqueOrThrow({ where: { id: target.userId } })).toMatchObject({ authSubject: provider.replacementSubject, status: UserStatus.ACTIVE });
    expect(await db.workforceActivation.findUniqueOrThrow({ where: { id: issued.resetId } })).toMatchObject({
      operationState: WorkforceActivationOperationState.FINALIZED,
      usedAt: now,
      reconciliationRequiredAt: null,
    });
    expect(await createActorContextStore(db).findUserByAuthSubject(provider.replacementSubject)).not.toBeNull();
    expect(await createActorContextStore(db).findUserByAuthSubject(target.authSubject)).toBeNull();
    expect(await db.providerIdentityCleanup.findUniqueOrThrow({ where: { authSubject: target.authSubject } })).toMatchObject({
      userId: target.userId, reason: "PREVIOUS_IDENTITY", completedAt: null, attemptCount: 1,
    });
    expect(await db.auditEvent.findFirstOrThrow({ where: { action: "account.password_reset.previous_identity_cleanup_pending", resourceId: target.userId } })).toMatchObject({
      actorUserId: null,
      metadata: { issuerUserId: owner.userId },
    });

    const later = new Date(now.getTime() + 60_000);
    const retry = fakeProvider();
    await issueMediatedPasswordReset(owner, issueInput("staff", hospital.id, target.relationshipId), {
      database: db, now: () => later, deleteProviderIdentity: retry.deleteProviderIdentity,
    });
    expect(retry.deleteProviderIdentity).toHaveBeenCalledWith(target.authSubject);
    expect(await db.providerIdentityCleanup.findUniqueOrThrow({ where: { authSubject: target.authSubject } })).toMatchObject({ completedAt: later, attemptCount: 2 });
  });

  it("rolls a definite provider password-policy rejection back so the same link can be retried", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const target = await createTarget("patient", hospital.id);
    const issued = await issueMediatedPasswordReset(owner, issueInput("patient", hospital.id, target.relationshipId, "ONLINE"), { database: db, now: () => now });
    await expect(completeMediatedPasswordReset({
      token: issued.token,
      nationalId: nationalIdFor(91_000),
      newPassword: "new-password-for-rec1",
      passwordConfirmation: "new-password-for-rec1",
    }, { database: db, now: () => now })).rejects.toBeInstanceOf(ForbiddenError);
    const createReplacementIdentity = vi.fn(async () => { throw new ProviderIdentityRejectedError("PASSWORD_POLICY"); });

    await expect(completeMediatedPasswordReset({
      token: issued.token,
      nationalId: target.nationalId,
      newPassword: "rejected-by-provider-policy",
      passwordConfirmation: "rejected-by-provider-policy",
    }, { database: db, now: () => now, createReplacementIdentity })).rejects.toBeInstanceOf(ProviderIdentityRejectedError);

    expect(await db.accountRecovery.findUniqueOrThrow({ where: { id: issued.resetId } })).toMatchObject({
      claimedAt: null,
      completedAt: null,
      revokedAt: null,
      operationState: WorkforceActivationOperationState.NOT_STARTED,
      reconciliationRequiredAt: null,
      previousAuthSubject: null,
      failedVerificationCount: 1,
    });
    expect(await db.user.findUniqueOrThrow({ where: { id: target.userId } })).toMatchObject({ authSubject: target.authSubject });
    expect(await createActorContextStore(db).findUserById(target.userId)).not.toBeNull();
    expect(await db.auditEvent.findFirstOrThrow({ where: { action: "account.password_reset.claim_rolled_back", resourceId: target.userId } })).toMatchObject({
      actorUserId: null,
      metadata: { issuerUserId: owner.userId, outcome: "PASSWORD_POLICY" },
    });

    const provider = fakeProvider();
    await expect(getMediatedPasswordResetAvailability(issued.token, { database: db, now: () => now })).resolves.toMatchObject({ mode: "ONLINE" });
    await completeMediatedPasswordReset({
      token: issued.token,
      nationalId: target.nationalId,
      newPassword: "a-stronger-new-password-1!",
      passwordConfirmation: "a-stronger-new-password-1!",
    }, { database: db, now: () => now, ...provider });
    expect(await db.user.findUniqueOrThrow({ where: { id: target.userId } })).toMatchObject({ authSubject: provider.replacementSubject });
  });

  it("revokes the reset and deletes the replacement when authorization is lost between claim and switch", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const target = await createTarget("staff", hospital.id);
    const issued = await issueMediatedPasswordReset(owner, issueInput("staff", hospital.id, target.relationshipId, "ONLINE"), { database: db, now: () => now });
    const provider = fakeProvider();
    provider.createReplacementIdentity.mockImplementationOnce(async ({ userId, resetId }) => {
      await db.hospitalMembership.updateMany({ where: { userId: owner.userId, hospitalId: hospital.id }, data: { status: MembershipStatus.SUSPENDED } });
      return { authSubject: provider.replacementSubject, providerLoginAlias: createProviderResetLoginAlias(userId, resetId) };
    });

    await expect(completeMediatedPasswordReset({
      token: issued.token,
      nationalId: target.nationalId,
      newPassword: "new-password-for-rec1",
      passwordConfirmation: "new-password-for-rec1",
    }, { database: db, now: () => now, ...provider })).rejects.toBeInstanceOf(ForbiddenError);

    expect(provider.deleteProviderIdentity).toHaveBeenCalledWith(provider.replacementSubject);
    expect(provider.deleteProviderIdentity).not.toHaveBeenCalledWith(target.authSubject);
    expect(await db.workforceActivation.findUniqueOrThrow({ where: { id: issued.resetId } })).toMatchObject({
      claimedAt: null, usedAt: null, revokedAt: now, reconciliationRequiredAt: null,
    });
    expect(await db.user.findUniqueOrThrow({ where: { id: target.userId } })).toMatchObject({ authSubject: target.authSubject });
    expect(await createActorContextStore(db).findUserById(target.userId)).not.toBeNull();
    expect(await db.providerIdentityCleanup.findUniqueOrThrow({ where: { authSubject: provider.replacementSubject } })).toMatchObject({
      reason: "ORPHAN_REPLACEMENT", completedAt: now,
    });
  });

  it("lets an ADMIN reconcile an ambiguous reset by rolling back an orphan replacement", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const admin = await createAdmin();
    const target = await createTarget("staff", hospital.id);
    const issued = await issueMediatedPasswordReset(owner, issueInput("staff", hospital.id, target.relationshipId), { database: db, now: () => now });
    const orphanSubject = randomUUID();
    await expect(completeMediatedPasswordReset({
      token: issued.token,
      nationalId: target.nationalId,
      newPassword: "new-password-for-rec1",
      passwordConfirmation: "new-password-for-rec1",
    }, { database: db, now: () => now, createReplacementIdentity: async () => { throw new Error("provider outcome unknown"); } })).rejects.toBeInstanceOf(InfrastructureError);
    expect(await listQuarantinedMediatedPasswordResets(admin, db)).toEqual([
      expect.objectContaining({ resetId: issued.resetId, userId: target.userId, hospitalId: hospital.id }),
    ]);
    await expect(listQuarantinedMediatedPasswordResets(owner, db)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(reconcileMediatedPasswordReset(owner, { resetId: issued.resetId }, { database: db, now: () => now })).rejects.toBeInstanceOf(ForbiddenError);

    // An unconfirmed provider probe never clears quarantine.
    await expect(reconcileMediatedPasswordReset(admin, { resetId: issued.resetId }, {
      database: db,
      now: () => now,
      findProviderIdentityByLoginAlias: async () => { throw new InfrastructureError("probe failed"); },
      providerIdentityExists: async () => true,
      deleteProviderIdentity: vi.fn(async () => undefined),
    })).rejects.toBeInstanceOf(InfrastructureError);
    expect(await createActorContextStore(db).findUserById(target.userId)).toBeNull();

    const findProviderIdentityByLoginAlias = vi.fn(async () => ({ authSubject: orphanSubject }));
    const deleteProviderIdentity = vi.fn(async () => undefined);
    await expect(reconcileMediatedPasswordReset(admin, { resetId: issued.resetId }, {
      database: db,
      now: () => now,
      findProviderIdentityByLoginAlias,
      providerIdentityExists: async (subject: string) => subject === target.authSubject,
      deleteProviderIdentity,
    })).resolves.toEqual({ outcome: "ROLLED_BACK" });

    expect(findProviderIdentityByLoginAlias).toHaveBeenCalledWith(createProviderResetLoginAlias(target.userId, issued.resetId));
    expect(deleteProviderIdentity).toHaveBeenCalledWith(orphanSubject);
    expect(await db.workforceActivation.findUniqueOrThrow({ where: { id: issued.resetId } })).toMatchObject({ claimedAt: null, revokedAt: now, usedAt: null });
    expect(await db.user.findUniqueOrThrow({ where: { id: target.userId } })).toMatchObject({ authSubject: target.authSubject });
    expect(await createActorContextStore(db).findUserById(target.userId)).not.toBeNull();
    const reconcileAudits = await db.auditEvent.findMany({ where: { action: "account.password_reset.reconciled", resourceId: target.userId }, orderBy: { createdAt: "asc" } });
    expect(reconcileAudits.map(({ actorUserId, metadata }) => ({ actorUserId, metadata }))).toEqual([
      { actorUserId: admin.userId, metadata: expect.objectContaining({ outcome: "PROVIDER_UNCONFIRMED", issuerUserId: owner.userId }) },
      { actorUserId: admin.userId, metadata: expect.objectContaining({ outcome: "ROLLED_BACK", issuerUserId: owner.userId }) },
    ]);
    expect(await listQuarantinedMediatedPasswordResets(admin, db)).toEqual([]);
    await expect(issueMediatedPasswordReset(owner, issueInput("staff", hospital.id, target.relationshipId), { database: db, now: () => now })).resolves.toMatchObject({ mode: "IN_PERSON" });
  });

  it("lets an ADMIN reconcile a quarantined reset whose identity switch already committed", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const admin = await createAdmin();
    const target = await createTarget("staff", hospital.id);
    const issued = await issueMediatedPasswordReset(owner, issueInput("staff", hospital.id, target.relationshipId), { database: db, now: () => now });
    const replacementSubject = randomUUID();
    await db.workforceActivation.update({
      where: { id: issued.resetId },
      data: {
        claimedAt: now,
        operationState: WorkforceActivationOperationState.RECONCILIATION_REQUIRED,
        reconciliationRequiredAt: now,
        previousAuthSubject: target.authSubject,
        replacementAuthSubject: replacementSubject,
      },
    });
    await db.user.update({ where: { id: target.userId }, data: { authSubject: replacementSubject, providerLoginAlias: createProviderResetLoginAlias(target.userId, issued.resetId) } });
    expect(await createActorContextStore(db).findUserById(target.userId)).toBeNull();

    const deleteProviderIdentity = vi.fn(async () => undefined);
    await expect(reconcileMediatedPasswordReset(admin, { resetId: issued.resetId }, {
      database: db,
      now: () => now,
      findProviderIdentityByLoginAlias: async () => ({ authSubject: replacementSubject }),
      providerIdentityExists: async () => true,
      deleteProviderIdentity,
    })).resolves.toEqual({ outcome: "COMPLETED" });

    expect(deleteProviderIdentity).toHaveBeenCalledWith(target.authSubject);
    expect(await db.workforceActivation.findUniqueOrThrow({ where: { id: issued.resetId } })).toMatchObject({
      usedAt: now, operationState: WorkforceActivationOperationState.FINALIZED, reconciliationRequiredAt: null,
    });
    expect(await createActorContextStore(db).findUserById(target.userId)).not.toBeNull();
  });

  it("keeps quarantine when the provider state matches neither recovery direction", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const admin = await createAdmin();
    const target = await createTarget("staff", hospital.id);
    const issued = await issueMediatedPasswordReset(owner, issueInput("staff", hospital.id, target.relationshipId), { database: db, now: () => now });
    await expect(completeMediatedPasswordReset({
      token: issued.token,
      nationalId: target.nationalId,
      newPassword: "new-password-for-rec1",
      passwordConfirmation: "new-password-for-rec1",
    }, { database: db, now: () => now, createReplacementIdentity: async () => { throw new Error("unknown"); } })).rejects.toBeInstanceOf(InfrastructureError);
    const deleteProviderIdentity = vi.fn(async () => undefined);
    await expect(reconcileMediatedPasswordReset(admin, { resetId: issued.resetId }, {
      database: db,
      now: () => now,
      findProviderIdentityByLoginAlias: async () => null,
      providerIdentityExists: async () => false,
      deleteProviderIdentity,
    })).rejects.toBeInstanceOf(ConflictError);
    expect(deleteProviderIdentity).not.toHaveBeenCalled();
    expect(await createActorContextStore(db).findUserById(target.userId)).toBeNull();
  });

  it("restores the exact UM-1 relationship snapshot and leaves bindings created after the lock unlinked", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const target = await createTarget("osm", hospital.id);
    const memberRelationship = await db.hospitalMembership.create({
      data: { userId: target.userId, hospitalId: hospital.id, membershipType: MembershipType.MEMBER, status: MembershipStatus.ACTIVE },
    });
    const relationBeforeLock = await db.osmHospitalRelationship.findUniqueOrThrow({ where: { id: target.relationshipId } });
    await lockSuspectedTakeover(owner, {
      kind: "osm",
      relationshipId: target.relationshipId,
      targetHospitalId: hospital.id,
      expectedUpdatedAt: relationBeforeLock.updatedAt.toISOString(),
      confirmation: "ไม่ใช่เจ้าของจริง",
    }, { database: db, now: () => now, revokeProviderSessions: async () => "CONFIRMED" });

    const postLockLineId = "U" + randomUUID().replace(/-/gu, "");
    const postLockBinding = await db.lineAccountBinding.create({
      data: {
        userId: target.userId,
        lineUserId: postLockLineId,
        lineSubjectFingerprint: randomUUID().replace(/-/gu, "").padStart(64, "0"),
        lineSubjectFingerprintKeyId: "rec1-test",
        linkedAt: new Date(now.getTime() + 1_000),
        lastLinkedAt: new Date(now.getTime() + 1_000),
      },
    });
    const issued = await issueMediatedPasswordReset(owner, issueInput("osm", hospital.id, target.relationshipId), { database: db, now: () => now });
    const provider = fakeProvider();
    await completeMediatedPasswordReset({
      token: issued.token,
      nationalId: target.nationalId,
      newPassword: "new-password-for-rec1",
      passwordConfirmation: "new-password-for-rec1",
    }, { database: db, now: () => now, ...provider });

    expect(await db.user.findUniqueOrThrow({ where: { id: target.userId } })).toMatchObject({ status: UserStatus.ACTIVE, authSubject: provider.replacementSubject });
    expect(await db.hospitalMembership.findUniqueOrThrow({ where: { id: memberRelationship.id } })).toMatchObject({ status: MembershipStatus.ACTIVE });
    expect(await db.osmHospitalRelationship.findUniqueOrThrow({ where: { id: target.relationshipId } })).toMatchObject({ status: MembershipStatus.ACTIVE });
    expect(await db.userTakeoverLock.findUniqueOrThrow({ where: { userId: target.userId } })).toMatchObject({
      hospitalId: hospital.id,
      providerState: UserTakeoverProviderState.RESOLVED,
      suspendedMembershipIds: [memberRelationship.id],
      suspendedOsmRelationshipIds: [target.relationshipId],
    });
    expect(await db.lineAccountBinding.findUniqueOrThrow({ where: { id: postLockBinding.id } })).toMatchObject({ unlinkedAt: now });
    expect(await db.auditEvent.count({ where: { action: "user.takeover_locked", resourceId: target.userId } })).toBe(1);
    expect(await db.auditEvent.findFirstOrThrow({ where: { action: "user.takeover_lock_resolved", resourceId: target.userId } })).toMatchObject({ actorUserId: null, metadata: { issuerUserId: owner.userId } });
  });

  it("records workforce granted at other Hospitals on an existing caregiver lock and restores it after the reset", async () => {
    const [first, second, third] = [await createHospital(), await createHospital(), await createHospital()];
    const [firstOwner, secondOwner, thirdOwner] = [await createOwner(first.id), await createOwner(second.id), await createOwner(third.id)];
    const admin = await createAdmin();
    const caregiver = await createIdentity({ role: Role.CAREGIVER });
    await db.user.update({ where: { id: caregiver.userId }, data: { identityAssurance: IdentityAssurance.CAREGIVER_INVITATION } });
    const person = { nationalId: caregiver.nationalId, givenName: "ผู้ดูแล", familyName: "หลายโรงพยาบาล" };
    const revokeProviderSessions = vi.fn(async () => "CONFIRMED" as const);

    const firstGrant = await provisionHospitalMember(firstOwner, { ...person, targetHospitalId: first.id, profession: "NURSE" }, { revokeProviderSessions });
    const secondGrant = await provisionHospitalMember(secondOwner, { ...person, targetHospitalId: second.id, profession: "NURSE" }, { revokeProviderSessions });
    const thirdGrant = await provisionOsm(thirdOwner, { ...person, targetHospitalId: third.id }, { revokeProviderSessions });

    // The lock is already CONFIRMED after the first grant: later grants are recorded without another provider revocation.
    expect(revokeProviderSessions).toHaveBeenCalledOnce();
    for (const grant of [firstGrant, secondGrant, thirdGrant]) {
      expect(grant).toMatchObject({ userId: caregiver.userId, accountStatus: UserStatus.SUSPENDED, relationshipStatus: MembershipStatus.SUSPENDED, activationToken: null });
    }
    expect(await db.userTakeoverLock.findUniqueOrThrow({ where: { userId: caregiver.userId } })).toMatchObject({
      hospitalId: first.id,
      providerState: UserTakeoverProviderState.CONFIRMED,
      suspendedMembershipIds: [firstGrant.relationshipId, secondGrant.relationshipId],
      suspendedOsmRelationshipIds: [thirdGrant.relationshipId],
    });
    expect(await db.auditEvent.count({ where: { action: "user.takeover_lock_extended", resourceId: caregiver.userId } })).toBe(2);
    expect(await db.workforceActivation.count({ where: { userId: caregiver.userId } })).toBe(0);

    // The identity now spans Hospitals, so only a platform ADMIN may reset it.
    await expect(issueMediatedPasswordReset(secondOwner, issueInput("staff", second.id, secondGrant.relationshipId), { database: db, now: () => now }))
      .rejects.toBeInstanceOf(ForbiddenError);
    const issued = await issueMediatedPasswordReset(admin, issueInput("staff", second.id, secondGrant.relationshipId), { database: db, now: () => now });
    const provider = fakeProvider();
    await completeMediatedPasswordReset({
      token: issued.token,
      nationalId: caregiver.nationalId,
      newPassword: "new-password-for-rec1",
      passwordConfirmation: "new-password-for-rec1",
    }, { database: db, now: () => now, ...provider });

    expect(await db.user.findUniqueOrThrow({ where: { id: caregiver.userId } })).toMatchObject({
      status: UserStatus.ACTIVE,
      identityAssurance: IdentityAssurance.HOSPITAL_PROOFED,
      authSubject: provider.replacementSubject,
    });
    for (const relationshipId of [firstGrant.relationshipId, secondGrant.relationshipId]) {
      expect(await db.hospitalMembership.findUniqueOrThrow({ where: { id: relationshipId } })).toMatchObject({ status: MembershipStatus.ACTIVE });
    }
    expect(await db.osmHospitalRelationship.findUniqueOrThrow({ where: { id: thirdGrant.relationshipId } })).toMatchObject({ status: MembershipStatus.ACTIVE });
    expect(await db.auditEvent.findFirstOrThrow({ where: { action: "user.takeover_lock_resolved", resourceId: caregiver.userId } }))
      .toMatchObject({ metadata: { membershipsRestored: 2, osmRelationshipsRestored: 1 } });
    const access = await resolveActorAccessByAuthSubject(provider.replacementSubject, createActorContextStore(db));
    expect(access).toMatchObject({ status: "AUTHORIZED", actor: { userId: caregiver.userId } });
    expect(access.status === "AUTHORIZED" ? access.actor.hospitalMemberships : []).toEqual(expect.arrayContaining([
      expect.objectContaining({ hospitalId: second.id, status: MembershipStatus.ACTIVE, profession: "NURSE" }),
    ]));
  });

  it("sends the approved password-change warning to an active LINE binding", async () => {
    const hospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const target = await createTarget("staff", hospital.id);
    const lineUserId = "U" + randomUUID().replace(/-/gu, "");
    await db.lineAccountBinding.create({
      data: {
        userId: target.userId,
        lineUserId,
        lineSubjectFingerprint: randomUUID().replace(/-/gu, "").padStart(64, "0"),
        lineSubjectFingerprintKeyId: "rec1-test",
      },
    });
    const provider = fakeProvider();
    const issued = await issueMediatedPasswordReset(owner, issueInput("staff", hospital.id, target.relationshipId), { database: db, now: () => now });
    await completeMediatedPasswordReset({
      token: issued.token,
      nationalId: target.nationalId,
      newPassword: "new-password-for-rec1",
      passwordConfirmation: "new-password-for-rec1",
    }, { database: db, now: () => now, ...provider });
    expect(provider.sendLineMessage).toHaveBeenCalledWith(
      lineUserId,
      expect.stringMatching(/^รหัสผ่านบัญชี DEMI ของคุณถูกเปลี่ยนเมื่อ .+ หากไม่ใช่คุณ ติดต่อโรงพยาบาล$/u),
      expect.any(String),
    );
  });
});
