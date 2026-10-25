import {
  CaregiverAppointmentGrantStatus,
  CaregiverInvitationStatus,
  CaregiverResource,
  CaregiverResourceGrantStatus,
  CaregiverRelationshipStatus,
  HospitalStatus,
  IdentityAssurance,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
  UserTakeoverProviderState,
  WorkforceActivationMode,
  WorkforceActivationOperationState,
  WorkforceActivationPurpose,
  type Hospital,
} from "@prisma/client";
import { AuthApiError } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import { createActorContextStore, resolveActorAccessByAuthSubject } from "@/modules/auth/services/actor-context-service";
import { authenticateWithPassword } from "@/modules/auth/services/authentication-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { createProviderResetLoginAlias } from "@/modules/auth/services/provider-login-alias";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { CurrentPasswordRejectedError, ProviderIdentityRejectedError } from "@/modules/account-security/adapters/supabase-account-security-provider";
import {
  completeMediatedPasswordReset,
  confirmLinePasswordRecoveryDelivery,
  getLinePasswordRecoveryAvailabilityByCapabilityId,
  getMediatedPasswordResetEligibility,
  getMediatedPasswordResetAvailability,
  issueMediatedPasswordReset,
  issueLinePasswordRecoveryCapability,
  listQuarantinedMediatedPasswordResets,
  reconcileMediatedPasswordReset,
  reconcilePlatformAdminBreakGlassPassword,
  recoverPlatformAdminPassword,
  searchMediatedPasswordResetTargets,
} from "@/modules/account-security/services/mediated-password-reset-service";
import { changeAuthenticatedUserPassword, PasswordChangeRecoveryPendingError } from "@/modules/account-security/services/password-change-service";
import { createAuthAttemptThrottle } from "@/modules/auth/services/auth-attempt-throttle-service";
import { lockSuspectedTakeover } from "@/modules/user-management/services/user-takeover-service";
import { createLineSubjectFingerprint } from "@/modules/line/services/line-identity-fingerprint";
import type { LinePushResult } from "@/modules/line/adapters/line-messaging-client";
import {
  completeLinePasswordRecoveryWithIdentityToken,
  LinePasswordRecoveryCompletionError,
  openLinePasswordRecovery,
  requestLinePasswordRecovery,
} from "@/modules/line/services/line-password-recovery-service";
import { consumePasswordResetNotice } from "@/modules/account-security/services/password-reset-notice-service";
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
  await db.linePasswordRecoveryCapability.deleteMany();
  await db.lineAccountBinding.deleteMany();
  await db.auditEvent.deleteMany();
  await db.authenticationAttemptThrottleBucket.deleteMany();
  await db.accountRecovery.deleteMany();
  await db.caregiverAppointmentGrant.deleteMany();
  await db.caregiverResourceGrant.deleteMany();
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

async function createCaregiverTarget(hospitalIds: string[]): Promise<{ userId: string; personId: string; authSubject: string; nationalId: string }> {
  const caregiver = await createIdentity({ role: Role.CAREGIVER, name: "ผู้ดูแล REC-2A" });
  for (const hospitalId of hospitalIds) {
    const patient = await createTarget("patient", hospitalId);
    const patientProfileId = patient.patientProfileId;
    if (!patientProfileId) throw new Error("Expected a patient profile for caregiver evidence");
    const invitation = await db.caregiverInvitation.create({
      data: {
        patientProfileId,
        caregiverUserId: caregiver.userId,
        caregiverPersonId: caregiver.personId,
        issuedByUserId: patient.userId,
        tokenHash: randomUUID().replace(/-/gu, "").padEnd(64, "1"),
        issuedAt: now,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60_000),
        status: CaregiverInvitationStatus.ACCEPTED,
        acceptedAt: now,
      },
    });
    const relationship = await db.caregiverRelationship.create({
      data: {
        patientProfileId,
        caregiverUserId: caregiver.userId,
        sourceInvitationId: invitation.id,
        status: CaregiverRelationshipStatus.REVOKED,
        activatedAt: now,
        revokedAt: now,
        revokedByUserId: patient.userId,
      },
    });
    const grant = {
      caregiverRelationshipId: relationship.id,
      patientProfileId,
      patientPersonId: patient.personId,
      caregiverUserId: caregiver.userId,
      caregiverPersonId: caregiver.personId,
      proposedByUserId: patient.userId,
      proposedAt: now,
      acceptedByUserId: caregiver.userId,
      acceptedAt: now,
      revokedAt: now,
      revokedByUserId: patient.userId,
    };
    await db.caregiverAppointmentGrant.create({
      data: {
        ...grant,
        patientHospitalRelationshipId: patient.relationshipId,
        contractVersion: "REC-2A-test",
        status: CaregiverAppointmentGrantStatus.REVOKED,
      },
    });
    await db.caregiverResourceGrant.create({
      data: {
        ...grant,
        resource: CaregiverResource.PROFILE_SUMMARY,
        contractVersion: "REC-2A-test",
        status: CaregiverResourceGrantStatus.REVOKED,
      },
    });
  }
  return caregiver;
}

async function createLineRecoveryTarget(role?: Role): Promise<{
  userId: string;
  personId: string;
  authSubject: string;
  nationalId: string;
  lineUserId: string;
  bindingId: string;
}> {
  const identity = await createIdentity({ ...(role ? { role } : {}) });
  const lineUserId = `U${randomUUID().replaceAll("-", "").slice(0, 32)}`;
  const fingerprint = createLineSubjectFingerprint(lineUserId);
  const binding = await db.lineAccountBinding.create({
    data: {
      userId: identity.userId,
      lineUserId,
      lineSubjectFingerprint: fingerprint.fingerprint,
      lineSubjectFingerprintKeyId: fingerprint.keyId,
    },
    select: { id: true },
  });
  return { ...identity, lineUserId, bindingId: binding.id };
}

function lineRecoveryDependencies(lineUserId: string) {
  const provider = fakeProvider();
  const sendPush = vi.fn(async (lineUserId: string, message: string, retryKey: string): Promise<LinePushResult> => {
    void lineUserId;
    void message;
    void retryKey;
    return { kind: "ACCEPTED" };
  });
  const attemptThrottle = {
    isBlocked: vi.fn(async () => false),
    recordFailure: vi.fn(async () => undefined),
  };
  const verifyIdentity = vi.fn(async (idToken: string) => {
    if (idToken === "wrong-audience-line-token" || idToken === "expired-line-token") throw new Error("Line ID token rejected");
    return {
      subject: idToken === "other-line-account-token" ? `U${"f".repeat(32)}` : lineUserId,
      verifiedAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    };
  });
  return {
    ...provider,
    enabled: true,
    lineLiffId: "1234567890-AbCdEf",
    database: db,
    now: () => now,
    attemptThrottle,
    verifyIdentity,
    sendPush,
  };
}

function latestLineCapabilityId(dependencies: ReturnType<typeof lineRecoveryDependencies>): string {
  const message = dependencies.sendPush.mock.calls[dependencies.sendPush.mock.calls.length - 1]?.[1];
  const match = typeof message === "string" ? /[?&]capability=([0-9a-f-]{36})/u.exec(message) : null;
  if (!match?.[1]) throw new Error("Recovery push did not include a capability locator");
  return match[1];
}

function lineRecoveryToken(sequence: number, lineUserId: string): string {
  return createHash("sha256").update(`${lineUserId}:${sequence}`, "utf8").digest("base64url");
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

    const firstGrant = await provisionHospitalMember(firstOwner, { contactPhone: "0812345678", ...person, targetHospitalId: first.id, profession: "NURSE" }, { revokeProviderSessions });
    const secondGrant = await provisionHospitalMember(secondOwner, { contactPhone: "0812345678", ...person, targetHospitalId: second.id, profession: "NURSE" }, { revokeProviderSessions });
    const thirdGrant = await provisionOsm(thirdOwner, { contactPhone: "0812345678", ...person, targetHospitalId: third.id }, { revokeProviderSessions });

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

  it("allows a same-Hospital co-OWNER, denies self-reset and sends cross-Hospital OWNER history to ADMIN", async () => {
    const hospital = await createHospital();
    const otherHospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const coOwner = await createIdentity({ role: Role.HOSPITAL, name: "เจ้าของร่วม" });
    const coOwnerMembership = await db.hospitalMembership.create({
      data: { userId: coOwner.userId, hospitalId: hospital.id, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE },
    });
    const coOwnerInput = issueInput("staff", hospital.id, coOwnerMembership.id);

    await expect(getMediatedPasswordResetEligibility(owner, coOwnerInput, db)).resolves.toBe("OWNER_ELIGIBLE");
    const issued = await issueMediatedPasswordReset(owner, coOwnerInput, { database: db, now: () => now });
    const provider = fakeProvider();
    await completeMediatedPasswordReset({
      token: issued.token,
      nationalId: coOwner.nationalId,
      newPassword: "new-password-for-rec2a",
      passwordConfirmation: "new-password-for-rec2a",
    }, { database: db, now: () => now, ...provider });
    expect(await db.user.findUniqueOrThrow({ where: { id: coOwner.userId } })).toMatchObject({ authSubject: provider.replacementSubject });

    const ownMembership = await db.hospitalMembership.findFirstOrThrow({ where: { userId: owner.userId, hospitalId: hospital.id } });
    await expect(getMediatedPasswordResetEligibility(owner, issueInput("staff", hospital.id, ownMembership.id), db)).resolves.toBe("ADMIN_REQUIRED");

    const admin = await createAdmin();
    const lockedCoOwner = await createIdentity({ role: Role.HOSPITAL, name: "เจ้าของร่วมที่ถูกกัก" });
    const lockedCoOwnerMembership = await db.hospitalMembership.create({
      data: { userId: lockedCoOwner.userId, hospitalId: hospital.id, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE },
    });
    await db.user.update({ where: { id: lockedCoOwner.userId }, data: { status: UserStatus.SUSPENDED } });
    await db.userTakeoverLock.create({
      data: {
        userId: lockedCoOwner.userId,
        hospitalId: hospital.id,
        lockedByUserId: owner.userId,
        lockedAt: now,
        providerState: UserTakeoverProviderState.RECONCILIATION_REQUIRED,
        providerCheckedAt: now,
      },
    });
    const lockedCoOwnerInput = issueInput("staff", hospital.id, lockedCoOwnerMembership.id);
    await expect(getMediatedPasswordResetEligibility(owner, lockedCoOwnerInput, db)).resolves.toBe("ADMIN_REQUIRED");
    await expect(getMediatedPasswordResetEligibility(admin, lockedCoOwnerInput, db)).resolves.toBe("ADMIN_ALLOWED");

    const ownerWithOsmHistory = await createIdentity({ role: Role.HOSPITAL, name: "เจ้าของร่วมที่เคยเป็น อสม." });
    const ownerWithOsmMembership = await db.hospitalMembership.create({
      data: { userId: ownerWithOsmHistory.userId, hospitalId: hospital.id, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE },
    });
    await db.userRole.create({ data: { userId: ownerWithOsmHistory.userId, role: Role.OSM } });
    await db.osmHospitalRelationship.create({ data: { userId: ownerWithOsmHistory.userId, hospitalId: otherHospital.id, status: MembershipStatus.ENDED } });
    await expect(getMediatedPasswordResetEligibility(owner, issueInput("staff", hospital.id, ownerWithOsmMembership.id), db)).resolves.toBe("ADMIN_REQUIRED");

    const ownerWithPatientHistory = await createIdentity({ role: Role.HOSPITAL, name: "เจ้าของร่วมที่เคยเป็นผู้ป่วย" });
    const ownerWithPatientMembership = await db.hospitalMembership.create({
      data: { userId: ownerWithPatientHistory.userId, hospitalId: hospital.id, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE },
    });
    const historicalPatientProfile = await db.patientProfile.create({ data: { personId: ownerWithPatientHistory.personId } });
    await db.patientHospitalRelationship.create({
      data: {
        patientProfileId: historicalPatientProfile.id,
        hospitalId: otherHospital.id,
        hospitalNumber: "REC2A-OWNER-HISTORY",
        endedAt: now,
        endedByUserId: owner.userId,
        endReason: "ทดสอบประวัติความสัมพันธ์ที่สิ้นสุดแล้ว",
      },
    });
    await expect(getMediatedPasswordResetEligibility(owner, issueInput("staff", hospital.id, ownerWithPatientMembership.id), db)).resolves.toBe("ADMIN_REQUIRED");

    const sharedOwner = await createIdentity({ role: Role.HOSPITAL, name: "เจ้าของหลายโรงพยาบาล" });
    const localOwner = await db.hospitalMembership.create({
      data: { userId: sharedOwner.userId, hospitalId: hospital.id, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE },
    });
    await db.hospitalMembership.create({
      data: { userId: sharedOwner.userId, hospitalId: otherHospital.id, membershipType: MembershipType.MEMBER, status: MembershipStatus.ENDED },
    });
    const sharedInput = issueInput("staff", hospital.id, localOwner.id);
    await expect(getMediatedPasswordResetEligibility(owner, sharedInput, db)).resolves.toBe("ADMIN_REQUIRED");
    await expect(issueMediatedPasswordReset(owner, sharedInput, { database: db, now: () => now })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getMediatedPasswordResetEligibility(admin, sharedInput, db)).resolves.toBe("ADMIN_ALLOWED");
  });

  it("limits caregiver-only reset to single-Hospital patients and keeps mixed, takeover-locked and quarantined users ADMIN-only", async () => {
    const hospital = await createHospital();
    const otherHospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const admin = await createAdmin();
    const directInput = (userId: string) => ({
      targetKind: "caregiver" as const,
      targetUserId: userId,
      hospitalId: hospital.id,
      relationshipId: null,
      mode: "IN_PERSON" as const,
      verificationMethod: "IN_PERSON_ID_CARD" as const,
    });

    const singleHospitalCaregiver = await createCaregiverTarget([hospital.id]);
    const singleInput = directInput(singleHospitalCaregiver.userId);
    await expect(getMediatedPasswordResetEligibility(owner, singleInput, db)).resolves.toBe("OWNER_ELIGIBLE");
    await expect(searchMediatedPasswordResetTargets(owner, { nationalId: singleHospitalCaregiver.nationalId }, db, { hospitalId: hospital.id }))
      .resolves.toEqual([expect.objectContaining({ userId: singleHospitalCaregiver.userId, targetKind: "caregiver", relationshipId: null })]);
    const caregiverReset = await issueMediatedPasswordReset(owner, singleInput, { database: db, now: () => now });
    const caregiverProvider = fakeProvider();
    await completeMediatedPasswordReset({
      token: caregiverReset.token,
      nationalId: singleHospitalCaregiver.nationalId,
      newPassword: "new-password-for-rec2a",
      passwordConfirmation: "new-password-for-rec2a",
    }, { database: db, now: () => now, ...caregiverProvider });
    expect(await db.user.findUniqueOrThrow({ where: { id: singleHospitalCaregiver.userId } })).toMatchObject({ authSubject: caregiverProvider.replacementSubject });
    const historicalMultiHospital = await createCaregiverTarget([hospital.id]);
    const historicRelationship = await db.caregiverRelationship.findFirstOrThrow({
      where: { caregiverUserId: historicalMultiHospital.userId },
      select: { patientProfileId: true },
    });
    await db.patientHospitalRelationship.create({
      data: {
        patientProfileId: historicRelationship.patientProfileId,
        hospitalId: otherHospital.id,
        hospitalNumber: "REC2A-HISTORY",
        endedAt: now,
        endedByUserId: owner.userId,
        endReason: "ทดสอบประวัติความสัมพันธ์ที่สิ้นสุดแล้ว",
      },
    });
    await expect(getMediatedPasswordResetEligibility(owner, directInput(historicalMultiHospital.userId), db)).resolves.toBe("ADMIN_REQUIRED");
    const multiPatientCaregiver = await createCaregiverTarget([hospital.id, otherHospital.id]);
    await expect(getMediatedPasswordResetEligibility(owner, directInput(multiPatientCaregiver.userId), db)).resolves.toBe("ADMIN_REQUIRED");

    const mixedRoleCaregiver = await createCaregiverTarget([hospital.id]);
    await db.userRole.create({ data: { userId: mixedRoleCaregiver.userId, role: Role.PATIENT } });
    await expect(getMediatedPasswordResetEligibility(owner, directInput(mixedRoleCaregiver.userId), db)).resolves.toBe("ADMIN_REQUIRED");

    const lockedCaregiver = await createCaregiverTarget([hospital.id]);
    await db.user.update({ where: { id: lockedCaregiver.userId }, data: { status: UserStatus.SUSPENDED } });
    await db.userTakeoverLock.create({
      data: {
        userId: lockedCaregiver.userId,
        hospitalId: hospital.id,
        lockedByUserId: owner.userId,
        lockedAt: now,
        providerState: UserTakeoverProviderState.CONFIRMED,
        providerCheckedAt: now,
      },
    });
    await expect(getMediatedPasswordResetEligibility(owner, directInput(lockedCaregiver.userId), db)).resolves.toBe("ADMIN_REQUIRED");
    await expect(getMediatedPasswordResetEligibility(admin, directInput(lockedCaregiver.userId), db)).resolves.toBe("ADMIN_ALLOWED");

    const quarantinedCaregiver = await createCaregiverTarget([hospital.id]);
    await db.workforceActivation.create({
      data: {
        userId: quarantinedCaregiver.userId,
        hospitalId: hospital.id,
        relationshipKind: "caregiver",
        createdByUserId: owner.userId,
        tokenHash: randomUUID().replace(/-/gu, "").padEnd(64, "2"),
        mode: WorkforceActivationMode.ASSISTED,
        purpose: WorkforceActivationPurpose.RESET,
        verificationMethod: "IN_PERSON_ID_CARD",
        expiresAt: new Date(now.getTime() + 60_000),
        claimedAt: now,
        operationState: WorkforceActivationOperationState.RECONCILIATION_REQUIRED,
        reconciliationRequiredAt: now,
        previousAuthSubject: quarantinedCaregiver.authSubject,
      },
    });
    await expect(getMediatedPasswordResetEligibility(owner, directInput(quarantinedCaregiver.userId), db)).resolves.toBe("ADMIN_REQUIRED");
    await expect(getMediatedPasswordResetEligibility(admin, directInput(quarantinedCaregiver.userId), db)).resolves.toBe("ADMIN_ALLOWED");
  });

  it("rechecks co-OWNER authority at claim and switch and revokes a reset when authority changes", async () => {
    const hospital = await createHospital();
    const otherHospital = await createHospital();
    const owner = await createOwner(hospital.id);
    const claimTarget = await createIdentity({ role: Role.HOSPITAL });
    const claimMembership = await db.hospitalMembership.create({
      data: { userId: claimTarget.userId, hospitalId: hospital.id, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE },
    });
    const claimIssued = await issueMediatedPasswordReset(owner, issueInput("staff", hospital.id, claimMembership.id), { database: db, now: () => now });
    const issuerMembership = await db.hospitalMembership.findFirstOrThrow({ where: { userId: owner.userId, hospitalId: hospital.id } });
    await db.hospitalMembership.update({ where: { id: issuerMembership.id }, data: { status: MembershipStatus.ENDED } });
    await expect(completeMediatedPasswordReset({
      token: claimIssued.token,
      nationalId: claimTarget.nationalId,
      newPassword: "new-password-for-rec2a",
      passwordConfirmation: "new-password-for-rec2a",
    }, { database: db, now: () => now })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.workforceActivation.findUniqueOrThrow({ where: { id: claimIssued.resetId } })).toMatchObject({ claimedAt: null, usedAt: null });

    const switchOwner = await createOwner(hospital.id);
    const switchTarget = await createIdentity({ role: Role.HOSPITAL });
    const switchMembership = await db.hospitalMembership.create({
      data: { userId: switchTarget.userId, hospitalId: hospital.id, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE },
    });
    const switchIssued = await issueMediatedPasswordReset(switchOwner, issueInput("staff", hospital.id, switchMembership.id), { database: db, now: () => now });
    const replacementSubject = randomUUID();
    const deleteProviderIdentity = vi.fn(async () => undefined);
    await expect(completeMediatedPasswordReset({
      token: switchIssued.token,
      nationalId: switchTarget.nationalId,
      newPassword: "new-password-for-rec2a",
      passwordConfirmation: "new-password-for-rec2a",
    }, {
      database: db,
      now: () => now,
      createReplacementIdentity: async ({ userId, resetId }) => {
        await db.hospitalMembership.create({
          data: { userId, hospitalId: otherHospital.id, membershipType: MembershipType.MEMBER, status: MembershipStatus.ENDED },
        });
        return { authSubject: replacementSubject, providerLoginAlias: createProviderResetLoginAlias(userId, resetId) };
      },
      deleteProviderIdentity,
    })).rejects.toBeInstanceOf(ForbiddenError);
    expect(deleteProviderIdentity).toHaveBeenCalledWith(replacementSubject);
    expect(await db.workforceActivation.findUniqueOrThrow({ where: { id: switchIssued.resetId } })).toMatchObject({ claimedAt: null, revokedAt: now });
    expect(await db.user.findUniqueOrThrow({ where: { id: switchTarget.userId } })).toMatchObject({ authSubject: switchTarget.authSubject });
  });

  it("allows ADMIN peer reset, denies ADMIN self-reset, and uses the REC-1 switch for break-glass", async () => {
    const hospital = await createHospital();
    const admin = await createAdmin();
    const peer = await createIdentity({ role: Role.ADMIN, name: "ผู้ดูแลอีกบัญชี" });
    const peerInput = {
      targetKind: "platform_admin" as const,
      targetUserId: peer.userId,
      hospitalId: hospital.id,
      relationshipId: null,
      mode: "ONLINE" as const,
      verificationMethod: "VIDEO_CALL_FACE_AND_ID_CARD" as const,
    };
    await expect(getMediatedPasswordResetEligibility(admin, peerInput, db)).resolves.toBe("ADMIN_ALLOWED");
    await expect(getMediatedPasswordResetEligibility({
      userId: peer.userId,
      personId: peer.personId,
      roles: [Role.ADMIN],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    }, peerInput, db)).resolves.toBe("ADMIN_REQUIRED");
    const peerReset = await issueMediatedPasswordReset(admin, peerInput, { database: db, now: () => now });
    const peerProvider = fakeProvider();
    await completeMediatedPasswordReset({
      token: peerReset.token,
      nationalId: peer.nationalId,
      newPassword: "new-password-for-rec2a",
      passwordConfirmation: "new-password-for-rec2a",
    }, { database: db, now: () => now, ...peerProvider });
    expect(await db.user.findUniqueOrThrow({ where: { id: peer.userId } })).toMatchObject({ authSubject: peerProvider.replacementSubject });

    const breakGlassTarget = await createIdentity({ role: Role.ADMIN, name: "ผู้ดูแลฉุกเฉิน" });
    const incidentNote = "INC-REC2A-2026: normal ADMIN recovery unavailable";
    const secretPassword = "break-glass-secret-password";
    await expect(recoverPlatformAdminPassword({
      loginIdentifier: breakGlassTarget.nationalId,
      newPassword: secretPassword,
      passwordConfirmation: secretPassword,
      operatorNote: `INC-REC2A-2026: ${breakGlassTarget.nationalId}`,
      allowActivePeer: true,
    }, { database: db, now: () => now })).rejects.toBeInstanceOf(ValidationError);
    await expect(recoverPlatformAdminPassword({
      loginIdentifier: breakGlassTarget.nationalId,
      newPassword: secretPassword,
      passwordConfirmation: secretPassword,
      operatorNote: incidentNote,
      allowActivePeer: false,
    }, { database: db, now: () => now })).rejects.toBeInstanceOf(ConflictError);
    expect(await db.workforceActivation.count({ where: { userId: breakGlassTarget.userId, purpose: WorkforceActivationPurpose.RESET } })).toBe(0);

    const replacementSubject = randomUUID();
    const deleteProviderIdentity = vi.fn(async () => undefined);
    const result = await recoverPlatformAdminPassword({
      loginIdentifier: breakGlassTarget.nationalId,
      newPassword: secretPassword,
      passwordConfirmation: secretPassword,
      operatorNote: incidentNote,
      allowActivePeer: true,
    }, {
      database: db,
      now: () => now,
      createReplacementIdentity: async ({ userId, resetId }) => ({
        authSubject: replacementSubject,
        providerLoginAlias: createProviderResetLoginAlias(userId, resetId),
      }),
      deleteProviderIdentity,
    });
    expect(result).toBeUndefined();
    expect(deleteProviderIdentity).toHaveBeenCalledWith(breakGlassTarget.authSubject);
    expect(await db.user.findUniqueOrThrow({ where: { id: breakGlassTarget.userId } })).toMatchObject({ authSubject: replacementSubject });
    const breakGlassAudit = await db.auditEvent.findFirstOrThrow({
      where: { action: "account.password_reset.break_glass", resourceId: breakGlassTarget.userId },
    });
    expect(breakGlassAudit.metadata).toMatchObject({ operatorNote: incidentNote, activePeerOverride: true, outcome: "STARTED" });
    expect(JSON.stringify(breakGlassAudit.metadata)).not.toContain(secretPassword);
    expect(JSON.stringify({ result })).not.toContain(secretPassword);
    expect(await db.auditEvent.findFirstOrThrow({
      where: { action: "account.password_reset.completed", resourceId: breakGlassTarget.userId },
    })).toMatchObject({ metadata: { verificationMethod: "BREAK_GLASS_CLI", outcome: "COMPLETED" } });
    expect(await db.workforceActivation.findFirstOrThrow({
      where: { userId: breakGlassTarget.userId, verificationMethod: "BREAK_GLASS_CLI" },
    })).toMatchObject({ usedAt: now, operationState: WorkforceActivationOperationState.FINALIZED });
  });

  it("reconciles a quarantined last-ADMIN break-glass reset through REC-1 and audits the operator note", async () => {
    const admin = await createIdentity({ role: Role.ADMIN, name: "ผู้ดูแลฉุกเฉิน" });
    const operatorNote = "INC-REC2A-RECON: provider outcome checked";
    const newPassword = "break-glass-secret-password";
    await expect(recoverPlatformAdminPassword({
      loginIdentifier: admin.nationalId,
      newPassword,
      passwordConfirmation: newPassword,
      operatorNote,
      allowActivePeer: false,
    }, {
      database: db,
      now: () => now,
      createReplacementIdentity: async () => { throw new Error("provider outcome unknown"); },
    })).rejects.toBeInstanceOf(InfrastructureError);

    const quarantined = await db.workforceActivation.findFirstOrThrow({
      where: { userId: admin.userId, verificationMethod: "BREAK_GLASS_CLI" },
    });
    expect(quarantined.reconciliationRequiredAt).toEqual(now);
    const result = await reconcilePlatformAdminBreakGlassPassword({ loginIdentifier: admin.nationalId, operatorNote }, {
      database: db,
      now: () => now,
      findProviderIdentityByLoginAlias: async () => null,
      providerIdentityExists: async (authSubject) => authSubject === admin.authSubject,
    });

    expect(result).toEqual({ outcome: "ROLLED_BACK" });
    expect(await db.workforceActivation.findUniqueOrThrow({ where: { id: quarantined.id } })).toMatchObject({
      usedAt: null,
      claimedAt: null,
      revokedAt: now,
      operationState: WorkforceActivationOperationState.NOT_STARTED,
    });
    const reconciliationAudit = await db.auditEvent.findFirstOrThrow({
      where: { action: "account.password_reset.reconciled", resourceId: admin.userId },
    });
    expect(reconciliationAudit).toMatchObject({
      actorUserId: null,
      metadata: { outcome: "ROLLED_BACK", operatorNote },
    });
    expect(JSON.stringify(reconciliationAudit)).not.toContain(newPassword);
  });

  it("throttles by identity and IP, emits audits without identifiers and clears buckets after the window", async () => {
    const throttle = createAuthAttemptThrottle({ database: db, secret: "rec2a-test-throttle-secret" });
    const identityInput = { scope: "PASSWORD_LOGIN" as const, identityHash: "a".repeat(64), clientIp: null, now };

    for (let attempt = 0; attempt < 4; attempt += 1) await throttle.recordFailure(identityInput);
    await expect(throttle.isBlocked(identityInput)).resolves.toBe(false);
    await throttle.recordFailure(identityInput);
    await expect(throttle.isBlocked(identityInput)).resolves.toBe(true);
    const identityBlockAudit = await db.auditEvent.findFirstOrThrow({ where: { action: "auth.password_login.throttled" } });
    expect(identityBlockAudit).toMatchObject({ actorUserId: null, metadata: { dimension: "IDENTITY", outcome: "BLOCKED" } });
    expect(JSON.stringify(identityBlockAudit)).not.toContain(identityInput.identityHash);
    expect(await throttle.isBlocked({ ...identityInput, now: new Date(now.getTime() + 15 * 60_000) })).toBe(false);
    await throttle.recordFailure({ ...identityInput, now: new Date(now.getTime() + 15 * 60_000) });
    await expect(throttle.isBlocked({ ...identityInput, now: new Date(now.getTime() + 15 * 60_000) })).resolves.toBe(false);

    const sharedIp = "192.0.2.77";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await throttle.recordFailure({
        scope: "RECOVERY_IDENTITY",
        identityHash: String(attempt + 1).repeat(64),
        clientIp: sharedIp,
        now,
      });
    }
    await expect(throttle.isBlocked({
      scope: "RECOVERY_IDENTITY",
      identityHash: "f".repeat(64),
      clientIp: sharedIp,
      now,
    })).resolves.toBe(true);
    await expect(throttle.isBlocked({
      scope: "RECOVERY_IDENTITY",
      identityHash: "e".repeat(64),
      clientIp: null,
      now,
    })).resolves.toBe(false);
    const blockEvents = await db.auditEvent.findMany({
      where: { action: "auth.recovery_identity.throttled" },
      select: { metadata: true },
    });
    expect(blockEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ metadata: { dimension: "IP", outcome: "BLOCKED" } }),
    ]));
    expect(JSON.stringify(blockEvents)).not.toContain(sharedIp);
  });

  describe("REC-2B LINE password recovery", () => {
    beforeEach(() => {
      vi.stubEnv("IDENTITY_HASH_SECRET", "rec2b-test-identity-hash-secret-32-chars");
      vi.stubEnv("DEMI_LINE_LOGIN_CHANNEL_ID", "1234567890");
    });
    afterEach(() => vi.unstubAllEnvs());

    it("invalidates all unclaimed reset stores atomically after a confirmed password change and allows a later LINE link", async () => {
      const target = await createLineRecoveryTarget(Role.PATIENT);
      const hospital = await createHospital();
      const owner = await createOwner(hospital.id);
      const profile = await db.patientProfile.create({ data: { personId: target.personId } });
      const relationship = await db.patientHospitalRelationship.create({
        data: { patientProfileId: profile.id, hospitalId: hospital.id, hospitalNumber: `PW-${sequence}` },
      });
      const workforceReset = await db.workforceActivation.create({
        data: {
          userId: target.userId,
          hospitalId: hospital.id,
          relationshipId: relationship.id,
          relationshipKind: "patient",
          tokenHash: randomUUID().replaceAll("-", "").padEnd(64, "1"),
          purpose: WorkforceActivationPurpose.RESET,
          expiresAt: new Date(now.getTime() + 60 * 60_000),
          createdByUserId: owner.userId,
          createdAt: now,
        },
      });
      const patientReset = await db.accountRecovery.create({
        data: {
          targetUserId: target.userId,
          patientHospitalRelationshipId: relationship.id,
          hospitalId: hospital.id,
          issuedByUserId: owner.userId,
          tokenHash: randomUUID().replaceAll("-", "").padEnd(64, "2"),
          expiresAt: new Date(now.getTime() + 60 * 60_000),
          createdAt: now,
        },
      });
      const lineReset = await db.linePasswordRecoveryCapability.create({
        data: {
          targetUserId: target.userId,
          lineAccountBindingId: target.bindingId,
          lineSubjectFingerprint: createLineSubjectFingerprint(target.lineUserId).fingerprint,
          expiresAt: new Date(now.getTime() + 15 * 60_000),
          deliveredAt: now,
          createdAt: now,
        },
      });
      const actor: ActorContext = {
        userId: target.userId,
        personId: target.personId,
        roles: [Role.PATIENT],
        hospitalMemberships: [],
        osmHospitalRelationships: [],
      };
      const lineNotice = vi.fn(async () => ({ kind: "ACCEPTED" }));
      await changeAuthenticatedUserPassword(actor, {
        currentPassword: "old-credential-password-123",
        newPassword: "new-credential-password-123",
        passwordConfirmation: "new-credential-password-123",
      }, {
        database: db,
        provider: vi.fn(async () => ({ otherSessionsRevoked: true })),
        attemptThrottle: { isBlocked: async () => false, recordFailure: async () => undefined },
        now: () => now,
        sendLineMessage: lineNotice,
      });

      expect(await db.workforceActivation.findUniqueOrThrow({ where: { id: workforceReset.id } })).toMatchObject({ revokedAt: now, claimedAt: null, usedAt: null });
      expect(await db.accountRecovery.findUniqueOrThrow({ where: { id: patientReset.id } })).toMatchObject({ revokedAt: now, claimedAt: null, completedAt: null });
      expect(await db.linePasswordRecoveryCapability.findUniqueOrThrow({ where: { id: lineReset.id } })).toMatchObject({ revokedAt: now, claimedAt: null, completedAt: null });

      const identity = await db.person.findUniqueOrThrow({ where: { id: target.personId }, select: { identityKeyHash: true } });
      const laterCapability = await issueLinePasswordRecoveryCapability({ userId: target.userId, identityKeyHash: identity.identityKeyHash }, { database: db, now: () => now });
      expect(laterCapability).not.toBeNull();
      if (!laterCapability) throw new Error("Expected a later recovery capability");
      await confirmLinePasswordRecoveryDelivery(laterCapability.resetId, { database: db, now: () => now });
      await expect(getLinePasswordRecoveryAvailabilityByCapabilityId(
        laterCapability.resetId,
        createLineSubjectFingerprint(target.lineUserId).fingerprint,
        { database: db, now: () => now },
      )).resolves.toBe("READY");
      expect(lineNotice).toHaveBeenCalledOnce();
    });

    it("preserves links after a definite password rejection and serializes both password-change/reset races", async () => {
      const failedTarget = await createLineRecoveryTarget(Role.PATIENT);
      const failedCapability = await issueLinePasswordRecoveryCapability({
        userId: failedTarget.userId,
        identityKeyHash: hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: failedTarget.nationalId }),
      }, { database: db, now: () => now });
      if (!failedCapability) throw new Error("Expected a pending LINE recovery capability");
      await confirmLinePasswordRecoveryDelivery(failedCapability.resetId, { database: db, now: () => now });
      const failedActor: ActorContext = {
        userId: failedTarget.userId,
        personId: failedTarget.personId,
        roles: [Role.PATIENT],
        hospitalMemberships: [],
        osmHospitalRelationships: [],
      };
      await expect(changeAuthenticatedUserPassword(failedActor, {
        currentPassword: "incorrect-current-password",
        newPassword: "new-credential-password-123",
        passwordConfirmation: "new-credential-password-123",
      }, {
        database: db,
        provider: vi.fn(async () => { throw new CurrentPasswordRejectedError(); }),
        attemptThrottle: { isBlocked: async () => false, recordFailure: async () => undefined },
        now: () => now,
      })).rejects.toBeInstanceOf(CurrentPasswordRejectedError);
      expect(await db.linePasswordRecoveryCapability.findUniqueOrThrow({ where: { id: failedCapability.resetId } })).toMatchObject({ revokedAt: null, claimedAt: null });
      await expect(getLinePasswordRecoveryAvailabilityByCapabilityId(
        failedCapability.resetId,
        createLineSubjectFingerprint(failedTarget.lineUserId).fingerprint,
        { database: db, now: () => now },
      )).resolves.toBe("READY");

      const passwordFirst = await createLineRecoveryTarget(Role.PATIENT);
      const passwordFirstCapability = await issueLinePasswordRecoveryCapability({
        userId: passwordFirst.userId,
        identityKeyHash: hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: passwordFirst.nationalId }),
      }, { database: db, now: () => now });
      if (!passwordFirstCapability) throw new Error("Expected a pending LINE recovery capability");
      await confirmLinePasswordRecoveryDelivery(passwordFirstCapability.resetId, { database: db, now: () => now });
      const passwordFirstActor: ActorContext = {
        userId: passwordFirst.userId,
        personId: passwordFirst.personId,
        roles: [Role.PATIENT],
        hospitalMemberships: [],
        osmHospitalRelationships: [],
      };
      let signalPasswordProviderStarted: (() => void) | undefined;
      let finishPasswordProvider: (() => void) | undefined;
      const passwordProviderStarted = new Promise<void>((resolve) => { signalPasswordProviderStarted = resolve; });
      const passwordProviderCanFinish = new Promise<void>((resolve) => { finishPasswordProvider = resolve; });
      const passwordChange = changeAuthenticatedUserPassword(passwordFirstActor, {
        currentPassword: "old-credential-password-123",
        newPassword: "new-credential-password-123",
        passwordConfirmation: "new-credential-password-123",
      }, {
        database: db,
        provider: vi.fn(async () => {
          signalPasswordProviderStarted?.();
          await passwordProviderCanFinish;
          return { otherSessionsRevoked: true };
        }),
        attemptThrottle: { isBlocked: async () => false, recordFailure: async () => undefined },
        now: () => now,
        sendLineMessage: async () => ({ kind: "ACCEPTED" }),
      });
      await passwordProviderStarted;
      const completion = {
        capabilityId: passwordFirstCapability.resetId,
        idToken: "fresh-line-id-token-for-recovery",
        newPassword: "line-recovery-password-123",
        passwordConfirmation: "line-recovery-password-123",
      };
      const passwordFirstLineDependencies = lineRecoveryDependencies(passwordFirst.lineUserId);
      await expect(completeLinePasswordRecoveryWithIdentityToken(completion, passwordFirstLineDependencies)).rejects.toMatchObject({ code: "LINK_UNAVAILABLE" });
      expect(passwordFirstLineDependencies.createReplacementIdentity).not.toHaveBeenCalled();
      finishPasswordProvider?.();
      await passwordChange;
      expect(await db.linePasswordRecoveryCapability.findUniqueOrThrow({ where: { id: passwordFirstCapability.resetId } })).toMatchObject({ revokedAt: now, claimedAt: null });

      const resetFirst = await createLineRecoveryTarget(Role.PATIENT);
      const resetFirstCapability = await issueLinePasswordRecoveryCapability({
        userId: resetFirst.userId,
        identityKeyHash: hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: resetFirst.nationalId }),
      }, { database: db, now: () => now });
      if (!resetFirstCapability) throw new Error("Expected a pending LINE recovery capability");
      await confirmLinePasswordRecoveryDelivery(resetFirstCapability.resetId, { database: db, now: () => now });
      let signalResetProviderStarted: (() => void) | undefined;
      let finishResetProvider: (() => void) | undefined;
      const resetProviderStarted = new Promise<void>((resolve) => { signalResetProviderStarted = resolve; });
      const resetProviderCanFinish = new Promise<void>((resolve) => { finishResetProvider = resolve; });
      const resetDependencies = lineRecoveryDependencies(resetFirst.lineUserId);
      resetDependencies.createReplacementIdentity = vi.fn(async ({ userId, resetId }: { userId: string; resetId: string }) => {
        signalResetProviderStarted?.();
        await resetProviderCanFinish;
        return { authSubject: randomUUID(), providerLoginAlias: createProviderResetLoginAlias(userId, resetId) };
      });
      const resetCompletion = completeLinePasswordRecoveryWithIdentityToken({
        capabilityId: resetFirstCapability.resetId,
        idToken: "fresh-line-id-token-for-recovery",
        newPassword: "line-recovery-password-123",
        passwordConfirmation: "line-recovery-password-123",
      }, resetDependencies);
      await resetProviderStarted;
      const resetFirstActor: ActorContext = {
        userId: resetFirst.userId,
        personId: resetFirst.personId,
        roles: [Role.PATIENT],
        hospitalMemberships: [],
        osmHospitalRelationships: [],
      };
      const competingPasswordProvider = vi.fn();
      await expect(changeAuthenticatedUserPassword(resetFirstActor, {
        currentPassword: "old-credential-password-123",
        newPassword: "new-credential-password-123",
        passwordConfirmation: "new-credential-password-123",
      }, {
        database: db,
        provider: competingPasswordProvider,
        attemptThrottle: { isBlocked: async () => false, recordFailure: async () => undefined },
        now: () => now,
      })).rejects.toBeInstanceOf(PasswordChangeRecoveryPendingError);
      expect(competingPasswordProvider).not.toHaveBeenCalled();
      finishResetProvider?.();
      await expect(resetCompletion).resolves.toBeUndefined();
    });

    it("returns identical copy and sends only for active non-ADMIN users with one eligible binding", async () => {
      const eligible = await createLineRecoveryTarget(Role.PATIENT);
      const noBinding = await createIdentity({ role: Role.CAREGIVER });
      const admin = await createLineRecoveryTarget(Role.ADMIN);
      const suspended = await createLineRecoveryTarget(Role.PATIENT);
      await db.user.update({ where: { id: suspended.userId }, data: { status: UserStatus.SUSPENDED } });

      const hospital = await createHospital();
      const lockActor = await createAdmin();
      const locked = await createLineRecoveryTarget(Role.PATIENT);
      await db.userTakeoverLock.create({
        data: {
          userId: locked.userId,
          hospitalId: hospital.id,
          lockedByUserId: lockActor.userId,
          lockedAt: now,
          providerState: UserTakeoverProviderState.RECONCILIATION_REQUIRED,
          providerCheckedAt: now,
        },
      });

      const quarantined = await createLineRecoveryTarget(Role.PATIENT);
      await db.linePasswordRecoveryCapability.create({
        data: {
          targetUserId: quarantined.userId,
          lineAccountBindingId: quarantined.bindingId,
          lineSubjectFingerprint: createLineSubjectFingerprint(quarantined.lineUserId).fingerprint,
          tokenHash: randomUUID().replaceAll("-", "").padEnd(64, "1"),
          expiresAt: new Date(now.getTime() + 15 * 60_000),
          claimedAt: now,
          reconciliationRequiredAt: now,
          operationState: WorkforceActivationOperationState.RECONCILIATION_REQUIRED,
        },
      });

      const dependencies = lineRecoveryDependencies(eligible.lineUserId);
      const identities = [eligible.nationalId, nationalIdFor(++sequence), noBinding.nationalId, admin.nationalId, suspended.nationalId, locked.nationalId, quarantined.nationalId];
      const messages: string[] = [];
      for (const nationalId of identities) {
        messages.push((await requestLinePasswordRecovery({ nationalId }, dependencies)).message);
      }

      expect(new Set(messages)).toEqual(new Set(["หากบัญชีนี้ผูก LINE ไว้ ระบบส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่ LINE แล้ว ลิงก์ใช้ได้ 15 นาที — ถ้าไม่ได้รับให้ตรวจว่ายังเป็นเพื่อนกับ LINE OA ของ DEMI หรือติดต่อโรงพยาบาล"]));
      expect(dependencies.sendPush).toHaveBeenCalledOnce();
      expect(dependencies.sendPush).toHaveBeenCalledWith(eligible.lineUserId, expect.stringContaining("https://liff.line.me/1234567890-AbCdEf/recover?capability="), expect.any(String));
      expect(JSON.stringify(dependencies.sendPush.mock.calls)).not.toContain("#");
      expect((await db.linePasswordRecoveryCapability.findFirstOrThrow({ where: { targetUserId: eligible.userId } })).tokenHash).toBeNull();
      expect(JSON.stringify(dependencies.sendPush.mock.calls)).not.toContain(noBinding.nationalId);
      expect(JSON.stringify(dependencies.sendPush.mock.calls)).not.toContain(admin.nationalId);
    });

    it("verifies the bound LINE subject, replaces the canonical credential once, records the audit and consumes the next-sign-in notice", async () => {
      const target = await createLineRecoveryTarget(Role.PATIENT);
      const dependencies = lineRecoveryDependencies(target.lineUserId);
      const response = await requestLinePasswordRecovery({ nationalId: target.nationalId }, dependencies);
      const capabilityId = latestLineCapabilityId(dependencies);

      expect(response.message).toBe("หากบัญชีนี้ผูก LINE ไว้ ระบบส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่ LINE แล้ว ลิงก์ใช้ได้ 15 นาที — ถ้าไม่ได้รับให้ตรวจว่ายังเป็นเพื่อนกับ LINE OA ของ DEMI หรือติดต่อโรงพยาบาล");
      expect(dependencies.sendPush).toHaveBeenCalledOnce();
      expect(dependencies.sendPush.mock.calls[0]?.[1]).toContain(`?capability=${capabilityId}`);
      const availabilityInput = { capabilityId, idToken: "fresh-line-id-token-for-recovery" };
      await expect(openLinePasswordRecovery(availabilityInput, dependencies)).resolves.toEqual({ status: "READY" });
      await expect(openLinePasswordRecovery({ ...availabilityInput, idToken: "other-line-account-token" }, dependencies)).resolves.toEqual({ status: "OTHER_LINE" });
      await expect(openLinePasswordRecovery({ ...availabilityInput, idToken: "wrong-audience-line-token" }, dependencies)).resolves.toEqual({ status: "EXPIRED" });
      await expect(openLinePasswordRecovery({ ...availabilityInput, idToken: "expired-line-token" }, dependencies)).resolves.toEqual({ status: "EXPIRED" });
      await expect(completeLinePasswordRecoveryWithIdentityToken({
        capabilityId,
        idToken: "other-line-account-token",
        newPassword: "line-recovery-password-123",
        passwordConfirmation: "line-recovery-password-123",
      }, dependencies)).rejects.toMatchObject({ code: "LINE_PROOF_INVALID" });
      await expect(completeLinePasswordRecoveryWithIdentityToken({
        capabilityId,
        idToken: "wrong-audience-line-token",
        newPassword: "line-recovery-password-123",
        passwordConfirmation: "line-recovery-password-123",
      }, dependencies)).rejects.toMatchObject({ code: "LINE_PROOF_INVALID" });
      expect(dependencies.createReplacementIdentity).not.toHaveBeenCalled();

      await completeLinePasswordRecoveryWithIdentityToken({
        capabilityId,
        idToken: "fresh-line-id-token-for-recovery",
        newPassword: "line-recovery-password-123",
        passwordConfirmation: "line-recovery-password-123",
      }, dependencies);

      const user = await db.user.findUniqueOrThrow({ where: { id: target.userId } });
      expect(user.authSubject).toBe(dependencies.replacementSubject);
      expect(user.passwordResetNoticePendingAt).toEqual(now);
      expect(await resolveActorAccessByAuthSubject(target.authSubject, createActorContextStore(db))).toMatchObject({ status: "UNMAPPED" });
      expect(dependencies.createReplacementIdentity).toHaveBeenCalledOnce();
      expect(dependencies.deleteProviderIdentity).toHaveBeenCalledWith(target.authSubject);
      expect(dependencies.sendLineMessage).toHaveBeenCalledWith(target.lineUserId, expect.stringContaining("รหัสผ่านบัญชี DEMI ของคุณถูกเปลี่ยนเมื่อ"), expect.any(String));
      await expect(openLinePasswordRecovery(availabilityInput, dependencies)).resolves.toEqual({ status: "EXPIRED" });

      const selfServiceAudit = await db.auditEvent.findFirstOrThrow({ where: { action: "account.password_reset.self_service", resourceId: target.userId } });
      expect(selfServiceAudit).toMatchObject({
        actorUserId: target.userId,
        resourceType: "User",
        metadata: { bindingId: target.bindingId, method: "LINE_ID_TOKEN", path: "LINE", outcome: "COMPLETED" },
      });
      expect(JSON.stringify(selfServiceAudit)).not.toContain(target.nationalId);
      expect(JSON.stringify(selfServiceAudit)).not.toContain(target.lineUserId);
      expect(JSON.stringify(selfServiceAudit)).not.toContain(capabilityId);
      const capability = await db.linePasswordRecoveryCapability.findUniqueOrThrow({ where: { id: capabilityId } });
      expect(capability).toMatchObject({ completedAt: now, deliveredAt: now, revokedAt: null });
      await expect(consumePasswordResetNotice(target.userId, db)).resolves.toEqual(now);
      await expect(consumePasswordResetNotice(target.userId, db)).resolves.toBeNull();
      expect(await db.user.findUniqueOrThrow({ where: { id: target.userId } })).toMatchObject({ passwordResetNoticePendingAt: null });
    });

    it("keeps legacy fragment links, releases a definite policy rejection for retry, and quarantines ambiguous completion", async () => {
      const legacyTarget = await createLineRecoveryTarget(Role.PATIENT);
      const legacyDependencies = lineRecoveryDependencies(legacyTarget.lineUserId);
      const legacyToken = lineRecoveryToken(1, legacyTarget.lineUserId);
      await db.linePasswordRecoveryCapability.create({
        data: {
          targetUserId: legacyTarget.userId,
          lineAccountBindingId: legacyTarget.bindingId,
          lineSubjectFingerprint: createLineSubjectFingerprint(legacyTarget.lineUserId).fingerprint,
          tokenHash: createHash("sha256").update(legacyToken, "utf8").digest("hex"),
          deliveredAt: now,
          expiresAt: new Date(now.getTime() + 15 * 60_000),
        },
      });
      await expect(openLinePasswordRecovery({ token: legacyToken, idToken: "fresh-line-id-token-for-recovery" }, legacyDependencies)).resolves.toEqual({ status: "READY" });

      const retryTarget = await createLineRecoveryTarget(Role.PATIENT);
      const retryDependencies = lineRecoveryDependencies(retryTarget.lineUserId);
      await requestLinePasswordRecovery({ nationalId: retryTarget.nationalId }, retryDependencies);
      const retryCapabilityId = latestLineCapabilityId(retryDependencies);
      retryDependencies.createReplacementIdentity.mockRejectedValueOnce(new ProviderIdentityRejectedError("PASSWORD_POLICY"));
      const completion = {
        capabilityId: retryCapabilityId,
        idToken: "fresh-line-id-token-for-recovery",
        newPassword: "line-recovery-password-123",
        passwordConfirmation: "line-recovery-password-123",
      };
      await expect(completeLinePasswordRecoveryWithIdentityToken(completion, retryDependencies)).rejects.toMatchObject({
        code: "PASSWORD_POLICY_REJECTED",
      } satisfies Partial<LinePasswordRecoveryCompletionError>);
      expect(await db.linePasswordRecoveryCapability.findUniqueOrThrow({ where: { id: retryCapabilityId } })).toMatchObject({
        claimedAt: null,
        revokedAt: null,
        reconciliationRequiredAt: null,
      });
      await expect(completeLinePasswordRecoveryWithIdentityToken(completion, retryDependencies)).resolves.toBeUndefined();

      const uncertainTarget = await createLineRecoveryTarget(Role.PATIENT);
      const uncertainDependencies = lineRecoveryDependencies(uncertainTarget.lineUserId);
      await requestLinePasswordRecovery({ nationalId: uncertainTarget.nationalId }, uncertainDependencies);
      const uncertainCapabilityId = latestLineCapabilityId(uncertainDependencies);
      uncertainDependencies.createReplacementIdentity.mockRejectedValueOnce(new Error("provider timeout"));
      await expect(completeLinePasswordRecoveryWithIdentityToken({ ...completion, capabilityId: uncertainCapabilityId }, uncertainDependencies)).rejects.toMatchObject({
        code: "RECONCILIATION_REQUIRED",
      } satisfies Partial<LinePasswordRecoveryCompletionError>);
      expect(await db.linePasswordRecoveryCapability.findUniqueOrThrow({ where: { id: uncertainCapabilityId } })).toMatchObject({
        claimedAt: now,
        reconciliationRequiredAt: now,
        revokedAt: null,
      });
      expect(await db.user.findUniqueOrThrow({ where: { id: uncertainTarget.userId } })).toMatchObject({ authSubject: uncertainTarget.authSubject });
    });

    it("expires at 15 minutes, supersedes prior links, enforces three links per hour and revokes a failed push", async () => {
      const target = await createLineRecoveryTarget(Role.CAREGIVER);
      const dependencies = lineRecoveryDependencies(target.lineUserId);
      await requestLinePasswordRecovery({ nationalId: target.nationalId }, dependencies);
      const firstCapabilityId = latestLineCapabilityId(dependencies);
      await requestLinePasswordRecovery({ nationalId: target.nationalId }, dependencies);
      const secondCapabilityId = latestLineCapabilityId(dependencies);
      await expect(openLinePasswordRecovery({ capabilityId: firstCapabilityId, idToken: "fresh-line-id-token-for-recovery" }, dependencies)).resolves.toEqual({ status: "EXPIRED" });
      await expect(openLinePasswordRecovery({ capabilityId: secondCapabilityId, idToken: "fresh-line-id-token-for-recovery" }, dependencies)).resolves.toEqual({ status: "READY" });
      await requestLinePasswordRecovery({ nationalId: target.nationalId }, dependencies);
      const beforeFourthRequest = dependencies.sendPush.mock.calls.length;
      await requestLinePasswordRecovery({ nationalId: target.nationalId }, dependencies);
      expect(dependencies.sendPush).toHaveBeenCalledTimes(beforeFourthRequest);

      const expiring = await createLineRecoveryTarget(Role.PATIENT);
      const expiringDependencies = lineRecoveryDependencies(expiring.lineUserId);
      await requestLinePasswordRecovery({ nationalId: expiring.nationalId }, expiringDependencies);
      const expiringCapabilityId = latestLineCapabilityId(expiringDependencies);
      const expiredAt = new Date(now.getTime() + 15 * 60_000);
      const expiryDependencies = {
        ...expiringDependencies,
        now: () => expiredAt,
        verifyIdentity: async () => ({ subject: expiring.lineUserId, verifiedAt: expiredAt, expiresAt: new Date(expiredAt.getTime() + 60_000) }),
      };
      await expect(openLinePasswordRecovery({ capabilityId: expiringCapabilityId, idToken: "fresh-line-id-token-for-recovery" }, expiryDependencies)).resolves.toEqual({ status: "EXPIRED" });

      const pushFailure = await createLineRecoveryTarget(Role.PATIENT);
      const failedDependencies = lineRecoveryDependencies(pushFailure.lineUserId);
      failedDependencies.sendPush.mockResolvedValueOnce({ kind: "PERMANENT_FAILURE" });
      const sameMessage = (await requestLinePasswordRecovery({ nationalId: pushFailure.nationalId }, failedDependencies)).message;
      const failedCapabilityId = latestLineCapabilityId(failedDependencies);
      expect(sameMessage).toBe((await requestLinePasswordRecovery({ nationalId: nationalIdFor(++sequence) }, failedDependencies)).message);
      const failedCapability = await db.linePasswordRecoveryCapability.findFirstOrThrow({ where: { targetUserId: pushFailure.userId } });
      expect(failedCapability).toMatchObject({ deliveredAt: null, revokedAt: now });
      await expect(openLinePasswordRecovery({ capabilityId: failedCapabilityId, idToken: "fresh-line-id-token-for-recovery" }, failedDependencies)).resolves.toEqual({ status: "EXPIRED" });
      const failedDeliveryAudit = await db.auditEvent.findFirstOrThrow({ where: { action: "account.password_reset.self_service.delivery", resourceId: pushFailure.userId } });
      expect(JSON.stringify(failedDeliveryAudit)).not.toContain(pushFailure.nationalId);
      expect(JSON.stringify(failedDeliveryAudit)).not.toContain(pushFailure.lineUserId);
    });

    it("allows at most one concurrent completion and keeps the old credential when eligibility is lost before switch", async () => {
      const target = await createLineRecoveryTarget(Role.PATIENT);
      const dependencies = lineRecoveryDependencies(target.lineUserId);
      await requestLinePasswordRecovery({ nationalId: target.nationalId }, dependencies);
      const capabilityId = latestLineCapabilityId(dependencies);
      const completion = {
        capabilityId,
        idToken: "fresh-line-id-token-for-recovery",
        newPassword: "line-recovery-password-123",
        passwordConfirmation: "line-recovery-password-123",
      };
      const results = await Promise.allSettled([
        completeLinePasswordRecoveryWithIdentityToken(completion, dependencies),
        completeLinePasswordRecoveryWithIdentityToken(completion, dependencies),
      ]);
      expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
      expect(dependencies.createReplacementIdentity).toHaveBeenCalledOnce();
      expect((await db.user.findUniqueOrThrow({ where: { id: target.userId } })).authSubject).toBe(dependencies.replacementSubject);

      const lost = await createLineRecoveryTarget(Role.PATIENT);
      const lostDependencies = lineRecoveryDependencies(lost.lineUserId);
      const replacementSubject = randomUUID();
      const createReplacementIdentity = vi.fn(async ({ userId, resetId }: { userId: string; resetId: string }) => {
        await db.lineAccountBinding.update({ where: { id: lost.bindingId }, data: { unlinkedAt: now, lineUserId: null } });
        return { authSubject: replacementSubject, providerLoginAlias: createProviderResetLoginAlias(userId, resetId) };
      });
      lostDependencies.createReplacementIdentity = createReplacementIdentity;
      await requestLinePasswordRecovery({ nationalId: lost.nationalId }, lostDependencies);
      await expect(completeLinePasswordRecoveryWithIdentityToken({ ...completion, capabilityId: latestLineCapabilityId(lostDependencies) }, lostDependencies)).rejects.toMatchObject({ code: "LINK_UNAVAILABLE" });
      expect(await db.user.findUniqueOrThrow({ where: { id: lost.userId } })).toMatchObject({ authSubject: lost.authSubject, passwordResetNoticePendingAt: null });
      expect(lostDependencies.deleteProviderIdentity).toHaveBeenCalledWith(replacementSubject);
      expect(lostDependencies.deleteProviderIdentity).not.toHaveBeenCalledWith(lost.authSubject);
      expect(await db.linePasswordRecoveryCapability.findFirstOrThrow({ where: { targetUserId: lost.userId } })).toMatchObject({ claimedAt: null, revokedAt: now });
      const oldCredentialProvider = {
        signInWithPassword: vi.fn(async ({ password }: { email: string; password: string }) => password === "old-password-before-reset"
          ? { data: { user: { id: lost.authSubject } }, error: null }
          : { data: { user: null }, error: new AuthApiError("Invalid login credentials", 400, "invalid_credentials") }),
        getUser: vi.fn(async () => ({ data: { user: { id: lost.authSubject } }, error: null })),
        signOut: vi.fn(async () => ({ error: null })),
      };
      await expect(authenticateWithPassword({ nationalId: lost.nationalId, password: "old-password-before-reset" }, {
        provider: oldCredentialProvider,
        actorStore: createActorContextStore(db),
        attemptThrottle: { isBlocked: async () => false, recordFailure: async () => undefined },
      })).resolves.toMatchObject({ status: "AUTHORIZED", actor: { userId: lost.userId } });
    });

    it("applies national-ID and client-IP recovery throttles without changing the generic response", async () => {
      const throttle = createAuthAttemptThrottle({ database: db, secret: "rec2b-test-throttle-secret" });
      const identity = nationalIdFor(++sequence);
      const identityDependencies = {
        ...lineRecoveryDependencies(`U${"a".repeat(32)}`),
        attemptThrottle: throttle,
      };
      const identityMessages: string[] = [];
      for (let attempt = 0; attempt < 6; attempt += 1) {
        identityMessages.push((await requestLinePasswordRecovery({ nationalId: identity }, identityDependencies)).message);
      }
      expect(new Set(identityMessages).size).toBe(1);
      expect(identityDependencies.sendPush).not.toHaveBeenCalled();
      expect(await throttle.isBlocked({ scope: "RECOVERY_IDENTITY", identityHash: hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: identity }), clientIp: null, now })).toBe(true);

      const sharedIp = "192.0.2.83";
      const ipMessages: string[] = [];
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const dependencies = {
          ...lineRecoveryDependencies(`U${String(attempt + 1).repeat(32)}`),
          attemptThrottle: throttle,
          clientIpAddress: sharedIp,
        };
        ipMessages.push((await requestLinePasswordRecovery({ nationalId: nationalIdFor(++sequence) }, dependencies)).message);
      }
      expect(new Set(ipMessages).size).toBe(1);
      expect(await throttle.isBlocked({ scope: "RECOVERY_IDENTITY", identityHash: hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: nationalIdFor(sequence + 1) }), clientIp: sharedIp, now })).toBe(true);
      const blockAudits = await db.auditEvent.findMany({ where: { action: "auth.recovery_identity.throttled" } });
      expect(JSON.stringify(blockAudits)).not.toContain(identity);
      expect(JSON.stringify(blockAudits)).not.toContain(sharedIp);
    });
  });
});
