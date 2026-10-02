import {
  CaregiverInvitationStatus,
  CaregiverRelationshipStatus,
  Role,
  UserStatus,
} from "@prisma/client";
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { resolveOwnPatientContext } from "@/modules/patient-self/services/patient-self-query-service";
import { getFamilyManagementOverview } from "@/modules/family/services/caregiver-relationship-query-service";
import {
  CAREGIVER_INVITATION_TTL_MS,
  acceptCaregiverInvitation,
  createCaregiverInvitation,
  previewCaregiverInvitation,
  rejectCaregiverInvitation,
  revokeCaregiverRelationship,
  revokePendingCaregiverInvitation,
  withdrawOwnCaregiverRelationship,
} from "@/modules/family/services/caregiver-relationship-service";
import { hashCaregiverInvitationToken } from "@/modules/family/services/caregiver-invitation-token-service";

const prisma = getPrisma();
const validNationalId = "1000000000009";
const alternateNationalId = "1101700203450";
let sequence = 0;

type TestActor = { actor: ActorContext; userId: string; personId: string };

async function clearDatabase(): Promise<void> {
  await prisma.auditEvent.deleteMany();
  await prisma.caregiverRelationship.deleteMany();
  await prisma.caregiverInvitation.deleteMany();
  await prisma.patientOsmAssignment.deleteMany();
  await prisma.patientActivation.deleteMany();
  await prisma.patientHospitalRelationship.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.workforceActivation.deleteMany();
  await prisma.osmHospitalRelationship.deleteMany();
  await prisma.hospitalOnboardingApplication.deleteMany();
  await prisma.hospitalMembership.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.hospital.updateMany({ data: { parentHospitalId: null } });
  await prisma.hospital.deleteMany();
  await prisma.person.deleteMany();
}

async function createActor(input: {
  roles: Role[];
  status?: UserStatus;
  nationalId?: string;
  givenName?: string;
  familyName?: string;
}): Promise<TestActor> {
  sequence += 1;
  const person = await prisma.person.create({
    data: {
      identityKeyHash: input.nationalId
        ? hashIdentityReference({
            namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
            value: input.nationalId,
          })
        : `family-integration-person-${sequence}`,
      givenName: input.givenName ?? `Family${sequence}`,
      familyName: input.familyName ?? "ทดสอบ",
    },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      personId: person.id,
      authSubject: `family-integration-subject-${sequence}`,
      status: input.status ?? UserStatus.ACTIVE,
    },
    select: { id: true },
  });
  if (input.roles.length > 0) {
    await prisma.userRole.createMany({
      data: input.roles.map((role) => ({ userId: user.id, role })),
    });
  }

  return {
    userId: user.id,
    personId: person.id,
    actor: {
      userId: user.id,
      personId: person.id,
      roles: input.roles,
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    },
  };
}

async function createPatient(input: {
  nationalId?: string;
  extraRoles?: Role[];
} = {}): Promise<TestActor & { patientProfileId: string }> {
  const patient = await createActor({
    roles: [Role.PATIENT, ...(input.extraRoles ?? [])],
    nationalId: input.nationalId,
    givenName: "ผู้ป่วยทดสอบ",
    familyName: "เดมี",
  });
  const profile = await prisma.patientProfile.create({
    data: { personId: patient.personId },
    select: { id: true },
  });

  return { ...patient, patientProfileId: profile.id };
}

function createCredential() {
  const plaintextToken = randomBytes(32).toString("base64url");
  return { plaintextToken, tokenHash: hashCaregiverInvitationToken(plaintextToken) };
}

describe("Phase 17F.1 Family caregiver relationship PostgreSQL workflow", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.each([
    { label: "OSM-only", role: Role.OSM, membershipType: null },
    { label: "Hospital MEMBER", role: Role.HOSPITAL, membershipType: "MEMBER" },
    { label: "Hospital OWNER", role: Role.HOSPITAL, membershipType: "OWNER" },
    { label: "platform ADMIN", role: Role.ADMIN, membershipType: null },
  ] as const)("does not give $label another person's Family authority", async ({ role, membershipType }) => {
    const patient = await createPatient({ extraRoles: [Role.HOSPITAL] });
    const caregiver = await createActor({ roles: [], nationalId: validNationalId });
    const wrongAccount = await createActor({ roles: [role] });
    const hospital = await prisma.hospital.create({ data: {
      hospitalCode: randomUUID().slice(0, 30), name: "Family synthetic hospital", status: "ACTIVE",
    } });
    const patientHospitalRelationship = await prisma.patientHospitalRelationship.create({ data: {
      patientProfileId: patient.patientProfileId, hospitalId: hospital.id,
    } });
    await prisma.hospitalMembership.create({ data: {
      userId: patient.userId, hospitalId: hospital.id, membershipType: "MEMBER", status: "ACTIVE",
    } });
    patient.actor = { ...patient.actor, hospitalMemberships: [{
      hospitalId: hospital.id, membershipType: "MEMBER", profession: null,
      status: "ACTIVE", hospitalStatus: "ACTIVE",
    }] };
    if (membershipType) {
      await prisma.hospitalMembership.create({ data: {
        userId: wrongAccount.userId, hospitalId: hospital.id, membershipType, status: "ACTIVE",
      } });
      wrongAccount.actor = { ...wrongAccount.actor, hospitalMemberships: [{
        hospitalId: hospital.id, membershipType, profession: null,
        status: "ACTIVE", hospitalStatus: "ACTIVE",
      }] };
    }
    if (role === Role.OSM) {
      await prisma.osmHospitalRelationship.create({ data: {
        userId: wrongAccount.userId, hospitalId: hospital.id, status: "ACTIVE",
      } });
      wrongAccount.actor = { ...wrongAccount.actor, osmHospitalRelationships: [{
        hospitalId: hospital.id, status: "ACTIVE", hospitalStatus: "ACTIVE",
      }] };
      await prisma.patientOsmAssignment.create({ data: {
        patientHospitalRelationshipId: patientHospitalRelationship.id,
        osmUserId: wrongAccount.userId, assignedByUserId: patient.userId,
      } });
    }
    const invitation = await createCaregiverInvitation(patient.actor, { nationalId: validNationalId });
    await expect(previewCaregiverInvitation(wrongAccount.actor, invitation.plaintextToken)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(acceptCaregiverInvitation(wrongAccount.actor, invitation.plaintextToken)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(rejectCaregiverInvitation(wrongAccount.actor, invitation.plaintextToken)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(revokePendingCaregiverInvitation(wrongAccount.actor, invitation.invitationId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const overview = await getFamilyManagementOverview(wrongAccount.actor);
    expect(overview).toEqual({ patient: null, caregiver: {
      invitations: [], nextInvitationsCursor: null, relationships: [], nextRelationshipsCursor: null,
    } });
    const accepted = await acceptCaregiverInvitation(caregiver.actor, invitation.plaintextToken);
    await expect(revokeCaregiverRelationship(wrongAccount.actor, accepted.relationshipId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(withdrawOwnCaregiverRelationship(wrongAccount.actor, accepted.relationshipId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await prisma.caregiverRelationship.findUniqueOrThrow({
      where: { id: accepted.relationshipId }, select: { status: true },
    })).toEqual({ status: CaregiverRelationshipStatus.ACTIVE });
    expect(await prisma.auditEvent.count({ where: { actorUserId: wrongAccount.userId } })).toBe(0);
    await revokeCaregiverRelationship(patient.actor, accepted.relationshipId);
  });

  it("serializes acceptance against caregiver rejection with exactly the winning lifecycle audit", async () => {
    const patient = await createPatient();
    const caregiver = await createActor({ roles: [], nationalId: validNationalId });
    const invitation = await createCaregiverInvitation(patient.actor, { nationalId: validNationalId });
    const outcomes = await Promise.allSettled([
      acceptCaregiverInvitation(caregiver.actor, invitation.plaintextToken),
      rejectCaregiverInvitation(caregiver.actor, invitation.plaintextToken),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    const finalInvitation = await prisma.caregiverInvitation.findUniqueOrThrow({
      where: { id: invitation.invitationId }, select: { status: true },
    });
    expect([CaregiverInvitationStatus.ACCEPTED, CaregiverInvitationStatus.REJECTED]).toContain(finalInvitation.status);
    const accepted = finalInvitation.status === CaregiverInvitationStatus.ACCEPTED;
    const relationships = await prisma.caregiverRelationship.findMany({
      where: { sourceInvitationId: invitation.invitationId }, select: { id: true, status: true },
    });
    expect(relationships).toEqual(accepted ? [{ id: expect.any(String), status: CaregiverRelationshipStatus.ACTIVE }] : []);
    const audits = await prisma.auditEvent.findMany({
      where: { actorUserId: caregiver.userId }, select: { action: true, resourceId: true },
    });
    expect(audits.map(({ action }) => action).sort()).toEqual(accepted
      ? ["caregiver_invitation.accepted", "caregiver_relationship.activated"]
      : ["caregiver_invitation.rejected"]);
    expect(audits.map(({ resourceId }) => resourceId).sort()).toEqual(
      [invitation.invitationId, ...relationships.map(({ id }) => id)].sort(),
    );
    await expect(acceptCaregiverInvitation(caregiver.actor, invitation.plaintextToken)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(rejectCaregiverInvitation(caregiver.actor, invitation.plaintextToken)).rejects.toMatchObject({ code: "CONFLICT" });
  });


  it("enforces invitation TTL, exact caregiver identity and lifecycle evidence in PostgreSQL", async () => {
    const patient = await createPatient();
    const caregiver = await createActor({ roles: [], nationalId: validNationalId });
    const otherCaregiver = await createActor({ roles: [] });
    const invitation = await createCaregiverInvitation(patient.actor, { nationalId: validNationalId });
    await expect(prisma.$executeRaw`
      UPDATE "CaregiverInvitation"
      SET "expiresAt" = "issuedAt" + INTERVAL '23 hours'
      WHERE "id" = ${invitation.invitationId}::uuid
    `).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
    await expect(prisma.caregiverInvitation.update({
      where: { id: invitation.invitationId },
      data: { caregiverPersonId: otherCaregiver.personId },
    })).rejects.toMatchObject({ code: "P2003" });
    await expect(prisma.$executeRaw`
      UPDATE "CaregiverInvitation"
      SET "status" = 'ACCEPTED'
      WHERE "id" = ${invitation.invitationId}::uuid
    `).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
    expect(await prisma.caregiverInvitation.findUniqueOrThrow({
      where: { id: invitation.invitationId },
      select: { status: true, caregiverUserId: true, caregiverPersonId: true, issuedAt: true, expiresAt: true },
    })).toEqual({
      status: CaregiverInvitationStatus.PENDING, caregiverUserId: caregiver.userId,
      caregiverPersonId: caregiver.personId, issuedAt: invitation.issuedAt, expiresAt: invitation.expiresAt,
    });
    expect(await prisma.caregiverRelationship.count()).toBe(0);
  });

  it("denies acceptance at or after a database-clock expiry threshold and audits expiry atomically", async () => {
    const patient = await createPatient();
    const caregiver = await createActor({ roles: [], nationalId: validNationalId });
    const invitation = await createCaregiverInvitation(patient.actor, { nationalId: validNationalId });
    // Anchor at millisecond-truncated DB time without sleeps. The following
    // acceptance runs at or after this threshold; the service's strict SQL >
    // predicate separately proves equality is excluded.
    const [threshold] = await prisma.$queryRaw<{ issuedAt: Date; expiresAt: Date }[]>`
      WITH boundary AS MATERIALIZED (
        SELECT date_trunc('milliseconds', clock_timestamp()) AS expires_at
      )
      UPDATE "CaregiverInvitation" AS invitation
      SET "issuedAt" = boundary.expires_at - INTERVAL '24 hours',
          "expiresAt" = boundary.expires_at
      FROM boundary
      WHERE invitation."id" = ${invitation.invitationId}::uuid
      RETURNING invitation."issuedAt", invitation."expiresAt"
    `;
    expect(threshold).toBeDefined();
    if (!threshold) throw new Error("Invitation expiry threshold was not recorded");
    expect(threshold.expiresAt.getTime() - threshold.issuedAt.getTime()).toBe(CAREGIVER_INVITATION_TTL_MS);
    await expect(acceptCaregiverInvitation(caregiver.actor, invitation.plaintextToken)).rejects.toMatchObject({ code: "CONFLICT" });
    const expired = await prisma.caregiverInvitation.findUniqueOrThrow({
      where: { id: invitation.invitationId }, select: { status: true, expiredAt: true, acceptedAt: true },
    });
    expect(expired).toEqual({ status: CaregiverInvitationStatus.EXPIRED, expiredAt: expect.any(Date), acceptedAt: null });
    expect(expired.expiredAt?.getTime()).toBeGreaterThanOrEqual(threshold.expiresAt.getTime());
    expect(await prisma.caregiverRelationship.count()).toBe(0);
    const audits = await prisma.auditEvent.findMany({
      where: { actorUserId: caregiver.userId }, select: { action: true, resourceId: true, metadata: true },
    });
    expect(audits).toEqual([{
      action: "caregiver_invitation.expired", resourceId: invitation.invitationId,
      metadata: { status: CaregiverInvitationStatus.EXPIRED },
    }]);
  });

  it("rejects source invitation pair mismatches in PostgreSQL and accepts the correct pair through the service", async () => {
    const patient = await createPatient();
    const otherPatient = await createPatient();
    const caregiver = await createActor({ roles: [], nationalId: validNationalId });
    const otherCaregiver = await createActor({ roles: [] });
    const credential = createCredential();
    const invite = await createCaregiverInvitation(patient.actor, { nationalId: validNationalId }, { generateCredential: () => credential });
    for (const pair of [
      { patientProfileId: otherPatient.patientProfileId, caregiverUserId: caregiver.userId },
      { patientProfileId: patient.patientProfileId, caregiverUserId: otherCaregiver.userId },
    ]) {
      await expect(prisma.caregiverRelationship.create({ data: {
        ...pair, sourceInvitationId: invite.invitationId,
        status: CaregiverRelationshipStatus.ACTIVE, activatedAt: new Date(),
      } })).rejects.toMatchObject({ code: "P2003" });
    }
    expect(await prisma.caregiverRelationship.count()).toBe(0);
    const accepted = await acceptCaregiverInvitation(caregiver.actor, credential.plaintextToken);
    expect(await prisma.caregiverRelationship.findUniqueOrThrow({ where: { id: accepted.relationshipId } })).toMatchObject({
      patientProfileId: patient.patientProfileId, caregiverUserId: caregiver.userId, sourceInvitationId: invite.invitationId,
    });
  });

  it.each(["PENDING", "REJECTED", "REVOKED", "EXPIRED"] as const)(
    "creates no authority from %s through preview/management or unsuccessful acceptance",
    async (status) => {
      const patient = await createPatient();
      const caregiver = await createActor({ roles: [], nationalId: validNationalId });
      const credential = createCredential();
      const invite = await createCaregiverInvitation(patient.actor, { nationalId: validNationalId }, { generateCredential: () => credential });
      if (status === "REJECTED") await rejectCaregiverInvitation(caregiver.actor, credential.plaintextToken);
      if (status === "REVOKED") await revokePendingCaregiverInvitation(patient.actor, invite.invitationId);
      if (status === "EXPIRED") {
        const issuedAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
        await prisma.caregiverInvitation.update({ where: { id: invite.invitationId }, data: {
          issuedAt, expiresAt: new Date(issuedAt.getTime() + CAREGIVER_INVITATION_TTL_MS),
        } });
      }
      const preview = await previewCaregiverInvitation(caregiver.actor, credential.plaintextToken);
      expect(preview.status).toBe(status);
      await getFamilyManagementOverview(patient.actor);
      await getFamilyManagementOverview(caregiver.actor);
      expect(await prisma.caregiverRelationship.count()).toBe(0);
      if (status !== "PENDING") {
        await expect(acceptCaregiverInvitation(caregiver.actor, credential.plaintextToken)).rejects.toMatchObject({ code: "CONFLICT" });
        expect(await prisma.caregiverRelationship.count()).toBe(0);
      }
      expect(await prisma.auditEvent.count({ where: { action: "caregiver_relationship.activated" } })).toBe(0);
    },
  );

  it("projects only opposite-party names and lifecycle for many-to-many management", async () => {
    const patientA = await createPatient();
    const patientB = await createPatient();
    await prisma.person.update({ where: { id: patientB.personId }, data: { givenName: "สมชาย", familyName: "ใจดี" } });
    const caregiverA = await createActor({ roles: [], nationalId: validNationalId, givenName: "สมหญิง", familyName: "ใจดี" });
    const caregiverB = await createActor({ roles: [], nationalId: alternateNationalId, givenName: "สมศรี", familyName: "ใจดี" });
    for (const pair of [
      { patient: patientA, caregiver: caregiverA, nationalId: validNationalId },
      { patient: patientA, caregiver: caregiverB, nationalId: alternateNationalId },
      { patient: patientB, caregiver: caregiverA, nationalId: validNationalId },
    ]) {
      const credential = createCredential();
      await createCaregiverInvitation(pair.patient.actor, { nationalId: pair.nationalId }, { generateCredential: () => credential });
      const pending = await getFamilyManagementOverview(pair.patient.actor);
      expect(pending.patient?.invitations.some((item) => item.participant.givenName === (pair.caregiver === caregiverA ? "สมหญิง" : "สมศรี"))).toBe(true);
      await acceptCaregiverInvitation(pair.caregiver.actor, credential.plaintextToken);
    }
    const patientOverview = await getFamilyManagementOverview(patientA.actor);
    const caregiverOverview = await getFamilyManagementOverview(caregiverA.actor);
    expect(patientOverview.patient?.relationships.map((item) => item.participant.givenName).sort()).toEqual(["สมศรี", "สมหญิง"].sort());
    expect(caregiverOverview.caregiver.relationships.map((item) => item.participant.givenName).sort()).toEqual(["สมชาย", "ผู้ป่วยทดสอบ"].sort());
    for (const perspective of [patientOverview.patient, caregiverOverview.caregiver]) {
      expect(perspective).not.toBeNull();
      for (const item of perspective?.invitations ?? []) {
        expect(Object.keys(item).sort()).toEqual(["invitationId", "participant", "status", "issuedAt", "expiresAt"].sort());
        expect(Object.keys(item.participant).sort()).toEqual(["givenName", "familyName"].sort());
      }
      for (const item of perspective?.relationships ?? []) {
        expect(Object.keys(item).sort()).toEqual(["relationshipId", "participant", "status", "activatedAt", "revokedAt", "withdrawnAt"].sort());
        expect(Object.keys(item.participant).sort()).toEqual(["givenName", "familyName"].sort());
      }
      expect(JSON.stringify(perspective)).not.toMatch(/identityKeyHash|national.?id|hospitalNumber|phone|email|address|birth|emergencyContact|authSubject|roles|memberships|hospital|appointment|screening|goalPlan|followup|clinical/i);
    }
  });

  it("resolves an existing active account, stores only a token digest, and atomically accepts for the intended non-Patient account", async () => {
    const patient = await createPatient({ extraRoles: [Role.OSM] });
    const caregiver = await createActor({
      roles: [Role.OSM, Role.HOSPITAL],
      nationalId: validNationalId,
    });
    const unrelatedOsm = await createActor({ roles: [Role.OSM] });
    const unrelatedOverview = await getFamilyManagementOverview(unrelatedOsm.actor);
    expect(unrelatedOverview.patient).toBeNull();
    expect(unrelatedOverview.caregiver.invitations).toEqual([]);
    expect(unrelatedOverview.caregiver.relationships).toEqual([]);
    const credential = createCredential();
    const issued = await createCaregiverInvitation(
      patient.actor,
      { nationalId: validNationalId },
      { generateCredential: () => credential },
    );

    expect(issued.expiresAt.getTime() - issued.issuedAt.getTime()).toBe(CAREGIVER_INVITATION_TTL_MS);
    expect(issued.plaintextToken).toBe(credential.plaintextToken);
    const persisted = await prisma.caregiverInvitation.findUniqueOrThrow({
      where: { id: issued.invitationId },
      select: {
        patientProfileId: true,
        caregiverUserId: true,
        caregiverPersonId: true,
        issuedByUserId: true,
        tokenHash: true,
        status: true,
        acceptanceContractVersion: true,
        issuedAt: true,
        expiresAt: true,
      },
    });
    expect(persisted).toMatchObject({
      patientProfileId: patient.patientProfileId,
      caregiverUserId: caregiver.userId,
      caregiverPersonId: caregiver.personId,
      issuedByUserId: patient.userId,
      tokenHash: hashCaregiverInvitationToken(credential.plaintextToken),
      status: CaregiverInvitationStatus.PENDING,
      acceptanceContractVersion: null,
    });
    expect(JSON.stringify(persisted)).not.toContain(validNationalId);
    expect(JSON.stringify(persisted)).not.toContain(credential.plaintextToken);

    const auditAtIssue = await prisma.auditEvent.findMany({
      where: { action: "caregiver_invitation.created" },
      select: { actorUserId: true, resourceId: true, metadata: true },
    });
    expect(auditAtIssue).toHaveLength(1);
    expect(auditAtIssue[0]).toMatchObject({ actorUserId: patient.userId, resourceId: issued.invitationId });
    expect(JSON.stringify(auditAtIssue)).not.toContain(validNationalId);
    expect(JSON.stringify(auditAtIssue)).not.toContain(credential.plaintextToken);
    expect(JSON.stringify(auditAtIssue)).not.toContain(credential.tokenHash);

    await expect(
      acceptCaregiverInvitation(patient.actor, credential.plaintextToken),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const acceptanceResults = await Promise.allSettled([
      acceptCaregiverInvitation(caregiver.actor, credential.plaintextToken),
      acceptCaregiverInvitation(caregiver.actor, credential.plaintextToken),
    ]);
    expect(acceptanceResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(acceptanceResults.filter((result) => result.status === "rejected")).toHaveLength(1);
    const successfulAcceptance = acceptanceResults.find((result) => result.status === "fulfilled");
    if (!successfulAcceptance || successfulAcceptance.status !== "fulfilled") {
      throw new Error("Concurrent acceptance did not produce an accepted relationship");
    }
    const acceptance = successfulAcceptance.value;
    expect(acceptance).toMatchObject({
      invitationId: issued.invitationId,
      acceptanceContractVersion: "family-delegation-v1",
    });
    await expect(
      acceptCaregiverInvitation(caregiver.actor, credential.plaintextToken),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const relationship = await prisma.caregiverRelationship.findUniqueOrThrow({
      where: { sourceInvitationId: issued.invitationId },
      select: {
        patientProfileId: true,
        caregiverUserId: true,
        status: true,
        activatedAt: true,
      },
    });
    expect(relationship).toMatchObject({
      patientProfileId: patient.patientProfileId,
      caregiverUserId: caregiver.userId,
      status: CaregiverRelationshipStatus.ACTIVE,
      activatedAt: acceptance.acceptedAt,
    });
    await expect(resolveOwnPatientContext(caregiver.actor)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const caregiverOverview = await getFamilyManagementOverview(caregiver.actor);
    expect(caregiverOverview.patient).toBeNull();
    expect(caregiverOverview.caregiver.relationships).toMatchObject([
      { relationshipId: expect.any(String), status: CaregiverRelationshipStatus.ACTIVE },
    ]);
    expect(JSON.stringify(caregiverOverview)).not.toMatch(/identityKeyHash|national.?id|hospitalNumber|authSubject|screening|goalPlan|followup/i);

    const auditEvents = await prisma.auditEvent.findMany({
      where: { action: { in: ["caregiver_invitation.accepted", "caregiver_relationship.activated"] } },
      select: { actorUserId: true, action: true, resourceId: true, metadata: true },
      orderBy: { action: "asc" },
    });
    expect(auditEvents).toHaveLength(2);
    expect(auditEvents.every((event) => event.actorUserId === caregiver.userId)).toBe(true);
    expect(auditEvents.map(({ action }) => action).sort()).toEqual([
      "caregiver_invitation.accepted",
      "caregiver_relationship.activated",
    ]);
    expect(JSON.stringify(auditEvents)).not.toContain(validNationalId);
    expect(JSON.stringify(auditEvents)).not.toContain(credential.plaintextToken);
    expect(JSON.stringify(auditEvents)).not.toContain(credential.tokenHash);

    await prisma.user.update({ where: { id: caregiver.userId }, data: { status: UserStatus.SUSPENDED } });
    await expect(
      withdrawOwnCaregiverRelationship(caregiver.actor, acceptance.relationshipId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      prisma.caregiverRelationship.findUniqueOrThrow({
        where: { id: acceptance.relationshipId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: CaregiverRelationshipStatus.ACTIVE });
    await prisma.user.update({ where: { id: caregiver.userId }, data: { status: UserStatus.ACTIVE } });
    await withdrawOwnCaregiverRelationship(caregiver.actor, acceptance.relationshipId);
  });

  it("lets only the owning Patient revoke a pending invitation", async () => {
    const patient = await createPatient();
    const otherPatient = await createPatient();
    const caregiver = await createActor({ roles: [Role.OSM], nationalId: validNationalId });
    const credential = createCredential();
    const invitation = await createCaregiverInvitation(
      patient.actor,
      { nationalId: validNationalId },
      { generateCredential: () => credential },
    );

    await expect(
      revokePendingCaregiverInvitation(otherPatient.actor, invitation.invitationId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await revokePendingCaregiverInvitation(patient.actor, invitation.invitationId);
    await expect(
      acceptCaregiverInvitation(caregiver.actor, credential.plaintextToken),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      prisma.caregiverInvitation.findUniqueOrThrow({
        where: { id: invitation.invitationId },
        select: { status: true, revokedByUserId: true },
      }),
    ).resolves.toEqual({ status: CaregiverInvitationStatus.REVOKED, revokedByUserId: patient.userId });
    await expect(
      prisma.auditEvent.count({
        where: { action: "caregiver_invitation.revoked", actorUserId: patient.userId },
      }),
    ).resolves.toBe(1);
  });

  it("serializes acceptance against Patient revocation without partial authority", async () => {
    const patient = await createPatient();
    const caregiver = await createActor({ roles: [Role.OSM], nationalId: validNationalId });
    const credential = createCredential();
    const invitation = await createCaregiverInvitation(
      patient.actor,
      { nationalId: validNationalId },
      { generateCredential: () => credential },
    );

    const outcomes = await Promise.allSettled([
      acceptCaregiverInvitation(caregiver.actor, credential.plaintextToken),
      revokePendingCaregiverInvitation(patient.actor, invitation.invitationId),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);

    const finalInvitation = await prisma.caregiverInvitation.findUniqueOrThrow({
      where: { id: invitation.invitationId },
      select: { status: true },
    });
    const relationships = await prisma.caregiverRelationship.findMany({
      where: { patientProfileId: patient.patientProfileId, caregiverUserId: caregiver.userId },
      select: { id: true, status: true },
    });
    const accepted = finalInvitation.status === CaregiverInvitationStatus.ACCEPTED;
    expect(finalInvitation.status).toMatch(/^(ACCEPTED|REVOKED)$/u);
    expect(relationships).toEqual(
      accepted ? [{ id: expect.any(String), status: CaregiverRelationshipStatus.ACTIVE }] : [],
    );
    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        action: {
          in: ["caregiver_invitation.accepted", "caregiver_invitation.revoked", "caregiver_relationship.activated"],
        },
      },
      select: { action: true, resourceId: true },
    });
    expect(auditEvents.map(({ action }) => action).sort()).toEqual(
      accepted
        ? ["caregiver_invitation.accepted", "caregiver_relationship.activated"]
        : ["caregiver_invitation.revoked"],
    );
    expect(auditEvents.map(({ resourceId }) => resourceId)).toContain(invitation.invitationId);
    if (accepted) {
      const relationship = relationships[0];
      expect(relationship).toBeDefined();
      if (relationship) {
        expect(auditEvents.map(({ resourceId }) => resourceId)).toContain(relationship.id);
      }
    }
  });

  it("rolls back invitation consumption and relationship creation if the transactional audit write fails", async () => {
    const patient = await createPatient();
    const caregiver = await createActor({ roles: [Role.OSM], nationalId: validNationalId });
    const credential = createCredential();
    const invitation = await createCaregiverInvitation(
      patient.actor,
      { nationalId: validNationalId },
      { generateCredential: () => credential },
    );

    try {
      await prisma.$executeRaw`
        CREATE OR REPLACE FUNCTION "family_test_raise_on_activated_audit"()
        RETURNS trigger AS $function$
        BEGIN
          IF NEW."action" = 'caregiver_relationship.activated' THEN
            RAISE EXCEPTION 'family integration audit failure';
          END IF;
          RETURN NEW;
        END;
        $function$ LANGUAGE plpgsql
      `;
      await prisma.$executeRaw`
        CREATE TRIGGER "family_test_raise_on_activated_audit"
        BEFORE INSERT ON "AuditEvent"
        FOR EACH ROW EXECUTE FUNCTION "family_test_raise_on_activated_audit"()
      `;

      await expect(
        acceptCaregiverInvitation(caregiver.actor, credential.plaintextToken),
      ).rejects.toMatchObject({ code: "INFRASTRUCTURE" });
      await expect(
        prisma.caregiverInvitation.findUniqueOrThrow({
          where: { id: invitation.invitationId },
          select: { status: true },
        }),
      ).resolves.toEqual({ status: CaregiverInvitationStatus.PENDING });
      await expect(prisma.caregiverRelationship.count()).resolves.toBe(0);
      await expect(
        prisma.auditEvent.count({
          where: {
            action: { in: ["caregiver_invitation.accepted", "caregiver_relationship.activated"] },
          },
        }),
      ).resolves.toBe(0);
    } finally {
      await prisma.$executeRaw`
        DROP TRIGGER IF EXISTS "family_test_raise_on_activated_audit" ON "AuditEvent"
      `;
      await prisma.$executeRaw`
        DROP FUNCTION IF EXISTS "family_test_raise_on_activated_audit"()
      `;
    }
  });

  it("enforces one pending invitation per pair under concurrent issuance and reissues after expiry", async () => {
    const patient = await createPatient();
    const caregiver = await createActor({ roles: [Role.OSM], nationalId: validNationalId });
    const credentials = [createCredential(), createCredential()];
    const results = await Promise.allSettled(
      credentials.map((credential) =>
        createCaregiverInvitation(
          patient.actor,
          { nationalId: validNationalId },
          { generateCredential: () => credential },
        ),
      ),
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(
      await prisma.caregiverInvitation.count({
        where: {
          patientProfileId: patient.patientProfileId,
          caregiverUserId: caregiver.userId,
          status: CaregiverInvitationStatus.PENDING,
        },
      }),
    ).toBe(1);

    const first = results.find((result) => result.status === "fulfilled");
    if (!first || first.status !== "fulfilled") {
      throw new Error("Concurrent issuance did not produce an invitation");
    }
    const oldIssuedAt = new Date(Date.now() - 26 * 60 * 60 * 1000);
    await prisma.caregiverInvitation.update({
      where: { id: first.value.invitationId },
      data: {
        issuedAt: oldIssuedAt,
        expiresAt: new Date(oldIssuedAt.getTime() + 24 * 60 * 60 * 1000),
      },
    });

    const replacement = await createCaregiverInvitation(
      patient.actor,
      { nationalId: validNationalId },
      { generateCredential: createCredential },
    );
    expect(
      await prisma.caregiverInvitation.findUniqueOrThrow({
        where: { id: first.value.invitationId },
        select: { status: true, expiredAt: true },
      }),
    ).toMatchObject({ status: CaregiverInvitationStatus.EXPIRED, expiredAt: expect.any(Date) });
    expect(
      await prisma.caregiverInvitation.findUniqueOrThrow({
        where: { id: replacement.invitationId },
        select: { status: true },
      }),
    ).toEqual({ status: CaregiverInvitationStatus.PENDING });
    expect(
      await prisma.caregiverInvitation.count({
        where: {
          patientProfileId: patient.patientProfileId,
          caregiverUserId: caregiver.userId,
          status: CaregiverInvitationStatus.PENDING,
        },
      }),
    ).toBe(1);
  });

  it("expires at the database boundary, rejects the wrong account, and makes rejection terminal", async () => {
    const patient = await createPatient();
    const caregiver = await createActor({ roles: [Role.OSM], nationalId: validNationalId });
    const wrongCaregiver = await createActor({ roles: [], nationalId: alternateNationalId });
    const expiredCredential = createCredential();
    const expiredInvite = await createCaregiverInvitation(
      patient.actor,
      { nationalId: validNationalId },
      { generateCredential: () => expiredCredential },
    );
    const pastIssuedAt = new Date(Date.now() - 26 * 60 * 60 * 1000);
    await prisma.caregiverInvitation.update({
      where: { id: expiredInvite.invitationId },
      data: {
        issuedAt: pastIssuedAt,
        expiresAt: new Date(pastIssuedAt.getTime() + 24 * 60 * 60 * 1000),
      },
    });
    await expect(
      acceptCaregiverInvitation(caregiver.actor, expiredCredential.plaintextToken),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      prisma.caregiverInvitation.findUniqueOrThrow({
        where: { id: expiredInvite.invitationId },
        select: { status: true, expiredAt: true },
      }),
    ).resolves.toMatchObject({ status: CaregiverInvitationStatus.EXPIRED, expiredAt: expect.any(Date) });
    await expect(
      prisma.caregiverRelationship.count({ where: { patientProfileId: patient.patientProfileId } }),
    ).resolves.toBe(0);

    const rejectedCredential = createCredential();
    const rejectedInvite = await createCaregiverInvitation(
      patient.actor,
      { nationalId: validNationalId },
      { generateCredential: () => rejectedCredential },
    );
    await expect(
      rejectCaregiverInvitation(wrongCaregiver.actor, rejectedCredential.plaintextToken),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await rejectCaregiverInvitation(caregiver.actor, rejectedCredential.plaintextToken);
    await expect(
      acceptCaregiverInvitation(caregiver.actor, rejectedCredential.plaintextToken),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      prisma.caregiverInvitation.findUniqueOrThrow({
        where: { id: rejectedInvite.invitationId },
        select: { status: true, rejectedAt: true },
      }),
    ).resolves.toMatchObject({ status: CaregiverInvitationStatus.REJECTED, rejectedAt: expect.any(Date) });
    await expect(prisma.caregiverRelationship.count()).resolves.toBe(0);
    await expect(
      prisma.auditEvent.count({ where: { action: "caregiver_invitation.rejected", actorUserId: caregiver.userId } }),
    ).resolves.toBe(1);
  });

  it("enforces one active relationship per pair and allows terminal close followed by a new invitation lifecycle", async () => {
    const patient = await createPatient();
    const caregiver = await createActor({ roles: [Role.OSM], nationalId: validNationalId });
    const firstCredential = createCredential();
    const firstInvitation = await createCaregiverInvitation(
      patient.actor,
      { nationalId: validNationalId },
      { generateCredential: () => firstCredential },
    );
    const accepted = await acceptCaregiverInvitation(caregiver.actor, firstCredential.plaintextToken);

    await expect(
      createCaregiverInvitation(patient.actor, { nationalId: validNationalId }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const terminalInvitationId = randomUUID();
    const terminalNow = new Date();
    await prisma.caregiverInvitation.create({
      data: {
        id: terminalInvitationId,
        patientProfileId: patient.patientProfileId,
        caregiverUserId: caregiver.userId,
        caregiverPersonId: caregiver.personId,
        issuedByUserId: patient.userId,
        tokenHash: createCredential().tokenHash,
        status: CaregiverInvitationStatus.REJECTED,
        issuedAt: terminalNow,
        expiresAt: new Date(terminalNow.getTime() + 24 * 60 * 60 * 1000),
        rejectedAt: terminalNow,
      },
    });
    await expect(
      prisma.caregiverRelationship.create({
        data: {
          patientProfileId: patient.patientProfileId,
          caregiverUserId: caregiver.userId,
          sourceInvitationId: terminalInvitationId,
          status: CaregiverRelationshipStatus.ACTIVE,
          activatedAt: accepted.acceptedAt,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    const otherPatient = await createPatient();
    const otherCaregiver = await createActor({ roles: [] });
    await expect(
      revokeCaregiverRelationship(otherPatient.actor, accepted.relationshipId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      withdrawOwnCaregiverRelationship(otherCaregiver.actor, accepted.relationshipId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      prisma.caregiverRelationship.findUniqueOrThrow({
        where: { id: accepted.relationshipId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: CaregiverRelationshipStatus.ACTIVE });

    await withdrawOwnCaregiverRelationship(caregiver.actor, accepted.relationshipId);
    await expect(
      withdrawOwnCaregiverRelationship(caregiver.actor, accepted.relationshipId),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const secondCredential = createCredential();
    const secondInvitation = await createCaregiverInvitation(
      patient.actor,
      { nationalId: validNationalId },
      { generateCredential: () => secondCredential },
    );
    const secondAcceptance = await acceptCaregiverInvitation(
      caregiver.actor,
      secondCredential.plaintextToken,
    );
    await revokeCaregiverRelationship(patient.actor, secondAcceptance.relationshipId);
    await expect(
      revokeCaregiverRelationship(patient.actor, secondAcceptance.relationshipId),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const relationshipRows = await prisma.caregiverRelationship.findMany({
      where: { patientProfileId: patient.patientProfileId, caregiverUserId: caregiver.userId },
      select: { id: true, sourceInvitationId: true, status: true },
      orderBy: { createdAt: "asc" },
    });
    expect(relationshipRows).toHaveLength(2);
    expect(relationshipRows.map(({ status }) => status)).toEqual([
      CaregiverRelationshipStatus.WITHDRAWN,
      CaregiverRelationshipStatus.REVOKED,
    ]);
    expect(new Set(relationshipRows.map(({ sourceInvitationId }) => sourceInvitationId))).toEqual(
      new Set([firstInvitation.invitationId, secondInvitation.invitationId]),
    );
    expect(
      await prisma.auditEvent.count({
        where: {
          action: { in: ["caregiver_relationship.withdrawn", "caregiver_relationship.revoked"] },
          actorUserId: { in: [patient.userId, caregiver.userId] },
        },
      }),
    ).toBe(2);
  });

  it("serializes Patient revocation against caregiver withdrawal and requires a new lifecycle", async () => {
    const patient = await createPatient();
    const caregiver = await createActor({ roles: [Role.OSM], nationalId: validNationalId });
    const firstCredential = createCredential();
    await createCaregiverInvitation(
      patient.actor,
      { nationalId: validNationalId },
      { generateCredential: () => firstCredential },
    );
    const firstAcceptance = await acceptCaregiverInvitation(
      caregiver.actor,
      firstCredential.plaintextToken,
    );

    const outcomes = await Promise.allSettled([
      revokeCaregiverRelationship(patient.actor, firstAcceptance.relationshipId),
      withdrawOwnCaregiverRelationship(caregiver.actor, firstAcceptance.relationshipId),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    const terminalRelationship = await prisma.caregiverRelationship.findUniqueOrThrow({
      where: { id: firstAcceptance.relationshipId },
      select: { status: true },
    });
    expect([CaregiverRelationshipStatus.REVOKED, CaregiverRelationshipStatus.WITHDRAWN]).toContain(
      terminalRelationship.status,
    );
    await expect(
      prisma.auditEvent.count({
        where: {
          action: { in: ["caregiver_relationship.revoked", "caregiver_relationship.withdrawn"] },
          resourceId: firstAcceptance.relationshipId,
        },
      }),
    ).resolves.toBe(1);

    const secondCredential = createCredential();
    await createCaregiverInvitation(
      patient.actor,
      { nationalId: validNationalId },
      { generateCredential: () => secondCredential },
    );
    await acceptCaregiverInvitation(caregiver.actor, secondCredential.plaintextToken);
    await expect(
      prisma.caregiverRelationship.count({
        where: {
          patientProfileId: patient.patientProfileId,
          caregiverUserId: caregiver.userId,
          status: CaregiverRelationshipStatus.ACTIVE,
        },
      }),
    ).resolves.toBe(1);
  });

  it("supports many caregivers per Patient and one caregiver across multiple Patients", async () => {
    const patientA = await createPatient();
    const patientB = await createPatient();
    const caregiverA = await createActor({ roles: [Role.OSM], nationalId: validNationalId });
    const caregiverB = await createActor({ roles: [], nationalId: alternateNationalId });
    const pairs = [
      { patient: patientA, caregiver: caregiverA, id: validNationalId },
      { patient: patientA, caregiver: caregiverB, id: alternateNationalId },
      { patient: patientB, caregiver: caregiverA, id: validNationalId },
    ];

    for (const pair of pairs) {
      const credential = createCredential();
      await createCaregiverInvitation(
        pair.patient.actor,
        { nationalId: pair.id },
        { generateCredential: () => credential },
      );
      await acceptCaregiverInvitation(pair.caregiver.actor, credential.plaintextToken);
    }

    await expect(prisma.caregiverRelationship.count({ where: { status: CaregiverRelationshipStatus.ACTIVE } })).resolves.toBe(3);
    await expect(
      prisma.caregiverRelationship.count({
        where: { patientProfileId: patientA.patientProfileId, status: CaregiverRelationshipStatus.ACTIVE },
      }),
    ).resolves.toBe(2);
    await expect(
      prisma.caregiverRelationship.count({
        where: { caregiverUserId: caregiverA.userId, status: CaregiverRelationshipStatus.ACTIVE },
      }),
    ).resolves.toBe(2);
  });

  it("rejects inactive recipients and self-delegation without revealing account state", async () => {
    const patient = await createPatient({ nationalId: validNationalId });
    const nonPatient = await createActor({ roles: [Role.OSM] });
    const unregisteredNationalId = "1200000000007";
    await prisma.person.create({
      data: {
        identityKeyHash: hashIdentityReference({
          namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
          value: unregisteredNationalId,
        }),
      },
    });
    const inactiveCaregiver = await createActor({
      roles: [Role.OSM],
      status: UserStatus.SUSPENDED,
      nationalId: alternateNationalId,
    });
    const usersBeforeIssuance = await prisma.user.count();

    await expect(
      createCaregiverInvitation(nonPatient.actor, { nationalId: alternateNationalId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      createCaregiverInvitation(patient.actor, { nationalId: validNationalId }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      createCaregiverInvitation(patient.actor, { nationalId: alternateNationalId }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      createCaregiverInvitation(patient.actor, { nationalId: unregisteredNationalId }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(prisma.caregiverInvitation.count()).resolves.toBe(0);
    await expect(prisma.caregiverRelationship.count()).resolves.toBe(0);
    await expect(prisma.user.count()).resolves.toBe(usersBeforeIssuance);

    await prisma.user.update({ where: { id: inactiveCaregiver.userId }, data: { status: UserStatus.ACTIVE } });
    await expect(
      createCaregiverInvitation(patient.actor, { nationalId: alternateNationalId }),
    ).resolves.toMatchObject({ invitationId: expect.any(String) });
    await expect(prisma.user.count()).resolves.toBe(usersBeforeIssuance);
  });
});
