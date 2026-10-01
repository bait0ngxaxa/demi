import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  PatientAccessRequestResolution,
  PatientAccessRequestStatus,
  PatientServiceCode,
  PatientServiceRequestStatus,
  Role,
  UserStatus,
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import {
  listPublicActiveHospitals,
  locateHospitalPatientAccessRequest,
  listHospitalPatientAccessRequestLookupHospitals,
  getHospitalPatientAccessRequestDetail,
  reviewPatientAccessRequest,
  submitPublicPatientAccessRequest,
  withdrawPatientAccessRequestByHospital,
} from "@/modules/patient-access-requests/services/patient-access-request-service";
import {
  listManagedHospitalServiceCatalog,
  setHospitalServiceOffering,
} from "@/modules/patient-service-requests/services/patient-service-catalog-service";
import {
  createPatientServiceRequest,
  listHospitalPatientServiceRequests,
  listOwnPatientServiceRequests,
  reviewPatientServiceRequest,
  withdrawOwnPatientServiceRequest,
} from "@/modules/patient-service-requests/services/patient-service-request-service";
import {
  completePatientActivation,
  issuePatientActivation,
} from "@/modules/patient-activation/services/patient-activation-service";
import { hashPatientActivationToken } from "@/modules/patient-activation/services/activation-token-service";
import { PasswordAuthProvisioningReconciliationError } from "@/modules/auth/services/password-auth-provisioning-service";

const prisma = getPrisma();
const nationalId = "1000000000009";
let sequence = 0;

async function clearDatabase(): Promise<void> {
  await prisma.auditEvent.deleteMany();
  await prisma.patientServiceRequest.deleteMany();
  await prisma.patientActivation.deleteMany();
  await prisma.patientAccessRequest.deleteMany();
  await prisma.hospitalServiceOffering.deleteMany();
  await prisma.patientOsmAssignment.deleteMany();
  await prisma.patientHospitalRelationship.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.osmHospitalRelationship.deleteMany();
  await prisma.hospitalMembership.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.hospital.updateMany({ data: { parentHospitalId: null } });
  await prisma.hospital.deleteMany();
  await prisma.person.deleteMany();
}

async function createHospital(
  code: string,
  status: HospitalStatus = HospitalStatus.ACTIVE,
  parentHospitalId?: string,
): Promise<{ id: string; status: HospitalStatus }> {
  return prisma.hospital.create({
    data: {
      hospitalCode: code,
      name: `โรงพยาบาล ${code}`,
      status,
      parentHospitalId,
    },
    select: { id: true, status: true },
  });
}

async function createHospitalActor(input: {
  hospitalId: string;
  hospitalStatus?: HospitalStatus;
  userStatus?: UserStatus;
  membershipStatus?: MembershipStatus;
  membershipType?: MembershipType;
  extraRoles?: Role[];
}): Promise<{ actor: ActorContext; userId: string }> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `core-flow-hospital-actor-${sequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      personId: person.id,
      authSubject: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
      status: input.userStatus ?? UserStatus.ACTIVE,
    },
    select: { id: true },
  });
  const membershipType = input.membershipType ?? MembershipType.MEMBER;
  const membershipStatus = input.membershipStatus ?? MembershipStatus.ACTIVE;
  const roles = [Role.HOSPITAL, ...(input.extraRoles ?? [])];

  await prisma.userRole.createMany({ data: roles.map((role) => ({ userId: user.id, role })) });
  await prisma.hospitalMembership.create({
    data: {
      userId: user.id,
      hospitalId: input.hospitalId,
      membershipType,
      status: membershipStatus,
    },
  });

  return {
    userId: user.id,
    actor: {
      userId: user.id,
      personId: person.id,
      roles,
      hospitalMemberships: [
        {
          hospitalId: input.hospitalId,
          membershipType,
          profession: null,
          status: membershipStatus,
          hospitalStatus: input.hospitalStatus ?? HospitalStatus.ACTIVE,
        },
      ],
      osmHospitalRelationships: [],
    },
  };
}

async function createPlatformAdmin(): Promise<{ actor: ActorContext; userId: string }> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `core-flow-admin-${sequence}` },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      personId: person.id,
      authSubject: `10000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
      status: UserStatus.ACTIVE,
    },
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

type CorePatientInput = {
  hospitalId: string;
  nationalId?: string;
  givenName?: string;
  familyName?: string;
};

async function createPatient(input: CorePatientInput & {
  status?: UserStatus;
}): Promise<{ personId: string; userId: string; relationshipId: string }> {
  sequence += 1;
  const person = await prisma.person.create({
    data: {
      identityKeyHash: input.nationalId
        ? hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: input.nationalId })
        : `core-flow-patient-${sequence}`,
      givenName: input.givenName ?? "สมชาย",
      familyName: input.familyName ?? "ผู้ป่วย",
    },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      personId: person.id,
      status: input.status ?? UserStatus.PROVISIONED,
      authSubject:
        input.status === UserStatus.ACTIVE
          ? `20000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`
          : null,
    },
    select: { id: true },
  });
  await prisma.userRole.create({ data: { userId: user.id, role: Role.PATIENT } });
  const profile = await prisma.patientProfile.create({
    data: { personId: person.id },
    select: { id: true },
  });
  const relationship = await prisma.patientHospitalRelationship.create({
    data: { patientProfileId: profile.id, hospitalId: input.hospitalId },
    select: { id: true },
  });
  return { personId: person.id, userId: user.id, relationshipId: relationship.id };
}

async function createActivePatient(input: CorePatientInput): Promise<{
  personId: string;
  userId: string;
  relationshipId: string;
}> {
  return createPatient({ ...input, status: UserStatus.ACTIVE });
}

async function createOsm(input: {
  hospitalId: string;
  status?: UserStatus;
  relationshipStatus?: MembershipStatus;
  hospitalStatus?: HospitalStatus;
}): Promise<{ userId: string; relationshipId: string; actor: ActorContext }> {
  sequence += 1;
  const person = await prisma.person.create({
    data: { identityKeyHash: `core-flow-osm-${sequence}`, givenName: "สมใจ", familyName: "อสม." },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      personId: person.id,
      authSubject: `30000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
      status: input.status ?? UserStatus.ACTIVE,
    },
    select: { id: true },
  });
  await prisma.userRole.create({ data: { userId: user.id, role: Role.OSM } });
  const relationship = await prisma.osmHospitalRelationship.create({
    data: {
      userId: user.id,
      hospitalId: input.hospitalId,
      status: input.relationshipStatus ?? MembershipStatus.ACTIVE,
    },
    select: { id: true },
  });
  return {
    userId: user.id,
    relationshipId: relationship.id,
    actor: {
      userId: user.id,
      personId: person.id,
      roles: [Role.OSM],
      hospitalMemberships: [],
      osmHospitalRelationships: [
        {
          hospitalId: input.hospitalId,
          status: input.relationshipStatus ?? MembershipStatus.ACTIVE,
          hospitalStatus: input.hospitalStatus ?? HospitalStatus.ACTIVE,
        },
      ],
    },
  };
}

async function submitAccessRequest(requestedId: string, hospitalId: string) {
  await submitPublicPatientAccessRequest({ nationalId: requestedId, hospitalId });
  const identityKeyHash = hashIdentityReference({
    namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
    value: requestedId,
  });
  return prisma.patientAccessRequest.findFirstOrThrow({
    where: { identityKeyHash, hospitalId, status: PatientAccessRequestStatus.PENDING },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, identityKeyHash: true, status: true },
  });
}

async function enableService(
  actor: ActorContext,
  hospitalId: string,
  code: PatientServiceCode = PatientServiceCode.SCREENING,
): Promise<{ id: string }> {
  await setHospitalServiceOffering(actor, { hospitalId, code, enabled: true });
  return prisma.hospitalServiceOffering.findUniqueOrThrow({
    where: { hospitalId_code: { hospitalId, code } },
    select: { id: true },
  });
}

function activationCredential(token: string) {
  return () => ({ plaintextToken: token, tokenHash: hashPatientActivationToken(token) });
}

function requestInput(input: {
  relationshipId: string;
  offeringId: string;
  preferredOsmRelationshipId?: string | null;
}) {
  return {
    relationshipId: input.relationshipId,
    offeringId: input.offeringId,
    preferredOsmRelationshipId: input.preferredOsmRelationshipId ?? null,
  };
}

describe("Phase 17E.3 Patient core flow PostgreSQL workflow", () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  afterEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.each([MembershipType.OWNER, MembershipType.MEMBER])("locates an exact-Hospital request for %s without changing state or creating domain records", async (membershipType) => {
    const hospital = await createHospital("LOOKUP-EXACT");
    const { actor } = await createHospitalActor({ hospitalId: hospital.id, membershipType });
    const request = await submitAccessRequest(nationalId, hospital.id);
    const before = await prisma.patientAccessRequest.findUniqueOrThrow({ where: { id: request.id } });
    const personCount = await prisma.person.count();
    const userCount = await prisma.user.count();
    expect(await listHospitalPatientAccessRequestLookupHospitals(actor)).toEqual([{ id: hospital.id, hospitalCode: "LOOKUP-EXACT", name: "โรงพยาบาล LOOKUP-EXACT" }]);
    const located = await locateHospitalPatientAccessRequest(actor, { hospitalId: hospital.id, nationalId });
    expect(located).toEqual({ requestId: request.id, status: "PENDING" });
    expect(JSON.stringify(located)).not.toMatch(/identityKeyHash|authSubject|1000000000009/);
    expect(await prisma.patientAccessRequest.findUniqueOrThrow({ where: { id: request.id } })).toEqual(before);
    expect(JSON.stringify(before)).not.toContain(nationalId);
    expect(await prisma.auditEvent.count()).toBe(0);
    expect(await prisma.person.count()).toBe(personCount);
    expect(await prisma.user.count()).toBe(userCount);
    expect(await prisma.patientProfile.count()).toBe(0);
    expect(await prisma.patientHospitalRelationship.count()).toBe(0);
    expect(await prisma.patientActivation.count()).toBe(0);
    await expect(reviewPatientAccessRequest(actor, { requestId: request.id, decision: "APPROVE", nationalId })).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await prisma.patientAccessRequest.findUniqueOrThrow({ where: { id: request.id } })).status).toBe("PENDING");
  });

  it("does not widen lookup through hierarchy or another direct Hospital", async () => {
    const parent = await createHospital("LOOKUP-PARENT");
    const child = await createHospital("LOOKUP-CHILD", HospitalStatus.ACTIVE, parent.id);
    const { actor } = await createHospitalActor({ hospitalId: parent.id });
    await submitAccessRequest(nationalId, child.id);
    await expect(locateHospitalPatientAccessRequest(actor, { hospitalId: child.id, nationalId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await locateHospitalPatientAccessRequest(actor, { hospitalId: parent.id, nationalId })).toBeNull();
    expect((await listHospitalPatientAccessRequestLookupHospitals(actor)).map(({ id }) => id)).toEqual([parent.id]);
  });

  it.each([Role.OSM, Role.PATIENT, Role.ADMIN])("denies persisted %s lookup despite stale claimed Hospital scope", async (role) => {
    const hospital = await createHospital("LOOKUP-ROLE");
    const { actor, userId } = await createHospitalActor({ hospitalId: hospital.id });
    await submitAccessRequest(nationalId, hospital.id);
    await prisma.userRole.deleteMany({ where: { userId } });
    await prisma.userRole.create({ data: { userId, role } });
    await expect(locateHospitalPatientAccessRequest(actor, { hospitalId: hospital.id, nationalId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listHospitalPatientAccessRequestLookupHospitals(actor)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each(["user", "membership", "hospital"] as const)("denies lookup after persisted %s becomes inactive", async (target) => {
    const hospital = await createHospital("LOOKUP-INACTIVE");
    const { actor, userId } = await createHospitalActor({ hospitalId: hospital.id });
    await submitAccessRequest(nationalId, hospital.id);
    if (target === "user") await prisma.user.update({ where: { id: userId }, data: { status: "SUSPENDED" } });
    if (target === "membership") await prisma.hospitalMembership.updateMany({ where: { userId }, data: { status: "SUSPENDED" } });
    if (target === "hospital") await prisma.hospital.update({ where: { id: hospital.id }, data: { status: "SUSPENDED" } });
    await expect(locateHospitalPatientAccessRequest(actor, { hospitalId: hospital.id, nationalId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("locates only current actionable requests and returns no match for a different identity", async () => {
    const hospital = await createHospital("LOOKUP-STATE");
    const { actor } = await createHospitalActor({ hospitalId: hospital.id });
    const request = await submitAccessRequest(nationalId, hospital.id);
    expect(await locateHospitalPatientAccessRequest(actor, { hospitalId: hospital.id, nationalId: "1000000000017" })).toBeNull();
    for (const status of [PatientAccessRequestStatus.APPROVED, PatientAccessRequestStatus.ACTIVATION_ISSUED]) {
      await prisma.patientAccessRequest.update({ where: { id: request.id }, data: { status } });
      expect(await locateHospitalPatientAccessRequest(actor, { hospitalId: hospital.id, nationalId })).toEqual({ requestId: request.id, status });
    }
    for (const status of [PatientAccessRequestStatus.COMPLETED, PatientAccessRequestStatus.REJECTED, PatientAccessRequestStatus.WITHDRAWN]) {
      await prisma.patientAccessRequest.update({ where: { id: request.id }, data: { status } });
      expect(await locateHospitalPatientAccessRequest(actor, { hospitalId: hospital.id, nationalId })).toBeNull();
    }
  });

  it("audits the persisted offering row ID on create/update and skips a true no-op", async () => {
    const hospital = await createHospital("CATALOG-AUDIT");
    const { actor } = await createHospitalActor({ hospitalId: hospital.id, membershipType: "OWNER" });
    const offering = await enableService(actor, hospital.id);
    await setHospitalServiceOffering(actor, { hospitalId: hospital.id, code: "SCREENING", enabled: true });
    expect(await prisma.auditEvent.count()).toBe(1);
    await setHospitalServiceOffering(actor, { hospitalId: hospital.id, code: "SCREENING", enabled: false });
    const events = await prisma.auditEvent.findMany({ select: { resourceId: true, metadata: true } });
    expect(events).toHaveLength(2);
    expect(events.every(({ resourceId }) => resourceId === offering.id)).toBe(true);
    expect(JSON.stringify(events)).not.toContain(nationalId);
  });

  it("stores only the canonical identity hash on public submit and does not provision a Person or User", async () => {
    const hospital = await createHospital("CORE-ACCESS-PUBLIC");
    const request = await submitAccessRequest(nationalId, hospital.id);
    const canonicalHash = hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: nationalId });

    expect(request).toMatchObject({ identityKeyHash: canonicalHash, status: PatientAccessRequestStatus.PENDING });
    expect(request.identityKeyHash).not.toBe(nationalId);
    expect(await prisma.person.count()).toBe(0);
    expect(await prisma.user.count()).toBe(0);
    expect(JSON.stringify(await prisma.auditEvent.findMany({ select: { metadata: true } }))).not.toContain(nationalId);
  });

  it("lists only active Hospitals and rejects a public request targeting an inactive Hospital", async () => {
    const activeHospital = await createHospital("CORE-ACCESS-ACTIVE");
    const inactiveHospital = await createHospital("CORE-ACCESS-INACTIVE", HospitalStatus.SUSPENDED);

    await expect(listPublicActiveHospitals()).resolves.toEqual([
      expect.objectContaining({ id: activeHospital.id, hospitalCode: "CORE-ACCESS-ACTIVE" }),
    ]);
    await expect(submitPublicPatientAccessRequest({ nationalId, hospitalId: inactiveHospital.id })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect(await prisma.patientAccessRequest.count()).toBe(0);
  });

  it("treats repeated open public submissions as idempotent without returning request state", async () => {
    const hospital = await createHospital("CORE-ACCESS-DUP");
    const first = await submitPublicPatientAccessRequest({ nationalId, hospitalId: hospital.id });
    const repeated = await submitPublicPatientAccessRequest({ nationalId, hospitalId: hospital.id });

    expect(first).toBeUndefined();
    expect(repeated).toBe(first);
    expect(await prisma.patientAccessRequest.count()).toBe(1);
  });

  it("keeps concurrent repeated public submissions to one unresolved request", async () => {
    const hospital = await createHospital("CORE-ACCESS-CONCURRENT-DUP");
    const results = await Promise.all([
      submitPublicPatientAccessRequest({ nationalId, hospitalId: hospital.id }),
      submitPublicPatientAccessRequest({ nationalId, hospitalId: hospital.id }),
    ]);

    expect(results).toEqual([undefined, undefined]);
    expect(await prisma.patientAccessRequest.count({ where: { hospitalId: hospital.id } })).toBe(1);
  });

  it("returns the same service-level result for existing and unknown identities", async () => {
    const hospital = await createHospital("CORE-ACCESS-ENUMERATION");
    const existing = await createPatient({ hospitalId: hospital.id, nationalId });
    const existingResult = await submitPublicPatientAccessRequest({ nationalId, hospitalId: hospital.id });
    const unknownResult = await submitPublicPatientAccessRequest({ nationalId: "1000000000017", hospitalId: hospital.id });

    expect(existingResult).toBeUndefined();
    expect(unknownResult).toBe(existingResult);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: existing.userId }, select: { status: true } })).toEqual({
      status: UserStatus.PROVISIONED,
    });
    expect(await prisma.patientAccessRequest.count()).toBe(2);
  });

  it("denies access-request review from an unrelated Hospital, OSM, and Platform ADMIN", async () => {
    const hospital = await createHospital("CORE-ACCESS-REVIEW");
    const unrelated = await createHospital("CORE-ACCESS-OTHER");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const otherOwner = await createHospitalActor({ hospitalId: unrelated.id, membershipType: MembershipType.OWNER });
    const osm = await createOsm({ hospitalId: hospital.id });
    const admin = await createPlatformAdmin();
    const request = await submitAccessRequest(nationalId, hospital.id);
    const reviewInput = { requestId: request.id, decision: "REJECT" as const };

    await expect(reviewPatientAccessRequest(otherOwner.actor, reviewInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(reviewPatientAccessRequest(osm.actor, reviewInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(reviewPatientAccessRequest(admin.actor, reviewInput)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(reviewPatientAccessRequest(owner.actor, reviewInput)).resolves.toMatchObject({ status: "REJECTED" });
  });

  it.each([MembershipType.OWNER, MembershipType.MEMBER])("allows exact active Hospital %s to review a request", async (membershipType) => {
    const hospital = await createHospital(`CORE-ACCESS-${membershipType}`);
    const reviewer = await createHospitalActor({ hospitalId: hospital.id, membershipType });
    const request = await submitAccessRequest(nationalId, hospital.id);

    await expect(
      reviewPatientAccessRequest(reviewer.actor, { requestId: request.id, decision: "REJECT" }),
    ).resolves.toMatchObject({ status: PatientAccessRequestStatus.REJECTED });
  });

  it("requires the assisted identity input to match before approval", async () => {
    const hospital = await createHospital("CORE-ACCESS-MISMATCH");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const request = await submitAccessRequest(nationalId, hospital.id);

    await expect(
      reviewPatientAccessRequest(owner.actor, {
        requestId: request.id,
        decision: "APPROVE",
        nationalId: "1000000000017",
        identityVerified: true,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(prisma.patientAccessRequest.findUniqueOrThrow({ where: { id: request.id }, select: { status: true } })).resolves.toEqual({
      status: PatientAccessRequestStatus.PENDING,
    });
  });

  it("approves an unprovisioned request without creating a Person or User", async () => {
    const hospital = await createHospital("CORE-ACCESS-NO-PATIENT");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const request = await submitAccessRequest(nationalId, hospital.id);
    const beforePersonCount = await prisma.person.count();
    const beforeUserCount = await prisma.user.count();

    await expect(
      reviewPatientAccessRequest(owner.actor, {
        requestId: request.id,
        decision: "APPROVE",
        nationalId,
        identityVerified: true,
      }),
    ).resolves.toMatchObject({ status: PatientAccessRequestStatus.APPROVED });
    expect(await prisma.person.count()).toBe(beforePersonCount);
    expect(await prisma.user.count()).toBe(beforeUserCount);
    await expect(getHospitalPatientAccessRequestDetail(owner.actor, { requestId: request.id })).resolves.toMatchObject({
      status: PatientAccessRequestStatus.APPROVED,
      reconciliation: { kind: "NOT_PROVISIONED" },
    });
  });

  it("leaves incomplete existing Person state for the controlled provisioning workflow", async () => {
    const hospital = await createHospital("CORE-ACCESS-PROVISIONING");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const identityKeyHash = hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: nationalId });
    await prisma.person.create({ data: { identityKeyHash, givenName: "สมชาย" } });
    const request = await submitAccessRequest(nationalId, hospital.id);

    await reviewPatientAccessRequest(owner.actor, {
      requestId: request.id,
      decision: "APPROVE",
      nationalId,
      identityVerified: true,
    });

    await expect(getHospitalPatientAccessRequestDetail(owner.actor, { requestId: request.id })).resolves.toMatchObject({
      status: PatientAccessRequestStatus.APPROVED,
      reconciliation: { kind: "PROVISIONING_REQUIRED", displayName: "สมชาย" },
    });
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.patientProfile.count()).toBe(0);
  });

  it("resolves an already-active exact-Hospital Patient without issuing activation or changing credentials", async () => {
    const hospital = await createHospital("CORE-ACCESS-ACTIVE-ACCOUNT");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const patient = await createPatient({ hospitalId: hospital.id, nationalId, status: UserStatus.ACTIVE });
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: patient.userId },
      select: { status: true, authSubject: true },
    });
    const request = await submitAccessRequest(nationalId, hospital.id);

    await expect(
      reviewPatientAccessRequest(owner.actor, {
        requestId: request.id,
        decision: "APPROVE",
        nationalId,
        identityVerified: true,
      }),
    ).resolves.toEqual({ status: PatientAccessRequestStatus.COMPLETED, resolution: PatientAccessRequestResolution.ALREADY_ACTIVE });
    expect(await prisma.patientActivation.count()).toBe(0);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: patient.userId }, select: { status: true, authSubject: true } })).toEqual(before);
    await expect(getHospitalPatientAccessRequestDetail(owner.actor, { requestId: request.id })).resolves.toMatchObject({
      status: PatientAccessRequestStatus.COMPLETED,
      resolution: PatientAccessRequestResolution.ALREADY_ACTIVE,
    });
    const auditMetadata = await prisma.auditEvent.findMany({ select: { metadata: true } });
    expect(JSON.stringify(auditMetadata)).not.toContain(nationalId);
    expect(JSON.stringify(auditMetadata)).not.toContain(request.identityKeyHash);
  });

  it("reuses PatientActivation and completes the linked access request only after activation succeeds", async () => {
    const hospital = await createHospital("CORE-ACCESS-ACTIVATION");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const patient = await createPatient({ hospitalId: hospital.id, nationalId });
    const request = await submitAccessRequest(nationalId, hospital.id);
    await reviewPatientAccessRequest(owner.actor, {
      requestId: request.id,
      decision: "APPROVE",
      nationalId,
      identityVerified: true,
    });
    const token = "phase-17e3-linked-patient-activation-token";
    const issued = await issuePatientActivation(
      owner.actor,
      { patientAccessRequestId: request.id, reissue: false },
      { generateCredential: activationCredential(token) },
    );

    expect(issued).toMatchObject({ outcome: "ISSUED", userId: patient.userId, hospitalId: hospital.id });
    expect(await prisma.patientAccessRequest.findUniqueOrThrow({ where: { id: request.id }, select: { status: true } })).toEqual({
      status: PatientAccessRequestStatus.ACTIVATION_ISSUED,
    });
    expect(await prisma.patientActivation.findUniqueOrThrow({
      where: { tokenHash: hashPatientActivationToken(token) },
      select: { patientAccessRequestId: true },
    })).toEqual({ patientAccessRequestId: request.id });

    await expect(
      completePatientActivation(
        token,
        { password: "correct-horse-battery-12", passwordConfirmation: "correct-horse-battery-12" },
        {
          provisionIdentity: async ({ userId }) => {
            const authSubject = "abcdefab-cdef-4abc-8def-abcdefabcdef";
            await prisma.user.update({ where: { id: userId }, data: { authSubject } });
            return { userId, authSubject };
          },
        },
      ),
    ).resolves.toEqual({ userId: patient.userId, hospitalId: hospital.id });
    await expect(prisma.patientAccessRequest.findUniqueOrThrow({
      where: { id: request.id },
      select: { status: true, resolution: true, completedAt: true },
    })).resolves.toEqual({
      status: PatientAccessRequestStatus.COMPLETED,
      resolution: PatientAccessRequestResolution.ACTIVATION_COMPLETED,
      completedAt: expect.any(Date),
    });
  });

  it("does not mark onboarding complete when activation provider state is ambiguous", async () => {
    const hospital = await createHospital("CORE-ACCESS-ACTIVATION-AMBIGUOUS");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    await createPatient({ hospitalId: hospital.id, nationalId });
    const request = await submitAccessRequest(nationalId, hospital.id);
    await reviewPatientAccessRequest(owner.actor, {
      requestId: request.id,
      decision: "APPROVE",
      nationalId,
      identityVerified: true,
    });
    const token = "phase-17e3-linked-patient-activation-ambiguous";
    await issuePatientActivation(
      owner.actor,
      { patientAccessRequestId: request.id, reissue: false },
      { generateCredential: activationCredential(token) },
    );

    await expect(
      completePatientActivation(
        token,
        { password: "correct-horse-battery-12", passwordConfirmation: "correct-horse-battery-12" },
        { provisionIdentity: async () => { throw new PasswordAuthProvisioningReconciliationError(); } },
      ),
    ).rejects.toMatchObject({ requiresReconciliation: true });
    await expect(prisma.patientAccessRequest.findUniqueOrThrow({
      where: { id: request.id },
      select: { status: true, completedAt: true },
    })).resolves.toEqual({ status: PatientAccessRequestStatus.ACTIVATION_ISSUED, completedAt: null });
  });

  it("records withdrawal requested through the Hospital before activation issuance", async () => {
    const hospital = await createHospital("CORE-ACCESS-WITHDRAW");
    const member = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.MEMBER });
    const request = await submitAccessRequest(nationalId, hospital.id);

    await withdrawPatientAccessRequestByHospital(member.actor, { requestId: request.id });
    await expect(prisma.patientAccessRequest.findUniqueOrThrow({ where: { id: request.id }, select: { status: true } })).resolves.toEqual({
      status: PatientAccessRequestStatus.WITHDRAWN,
    });
    await expect(submitAccessRequest(nationalId, hospital.id)).resolves.toMatchObject({
      status: PatientAccessRequestStatus.PENDING,
    });
  });

  it("enforces OWNER-only exact-Hospital catalog configuration and keeps Hospitals isolated", async () => {
    const hospitalA = await createHospital("CORE-CATALOG-A");
    const hospitalB = await createHospital("CORE-CATALOG-B");
    const ownerA = await createHospitalActor({ hospitalId: hospitalA.id, membershipType: MembershipType.OWNER });
    const memberA = await createHospitalActor({ hospitalId: hospitalA.id, membershipType: MembershipType.MEMBER });
    const ownerB = await createHospitalActor({ hospitalId: hospitalB.id, membershipType: MembershipType.OWNER });
    const admin = await createPlatformAdmin();
    const patient = await createActivePatient({ hospitalId: hospitalA.id });
    const osm = await createOsm({ hospitalId: hospitalA.id });
    const patientActor: ActorContext = {
      userId: patient.userId,
      personId: patient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };

    await expect(setHospitalServiceOffering(ownerA.actor, { hospitalId: hospitalA.id, code: "SCREENING", enabled: true })).resolves.toBeUndefined();
    await expect(setHospitalServiceOffering(memberA.actor, { hospitalId: hospitalA.id, code: "FOLLOW_UP", enabled: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setHospitalServiceOffering(ownerA.actor, { hospitalId: hospitalB.id, code: "FOLLOW_UP", enabled: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setHospitalServiceOffering(admin.actor, { hospitalId: hospitalA.id, code: "EMPOWERMENT", enabled: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setHospitalServiceOffering(patientActor, { hospitalId: hospitalA.id, code: "EMPOWERMENT", enabled: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setHospitalServiceOffering(osm.actor, { hospitalId: hospitalA.id, code: "EMPOWERMENT", enabled: true })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await setHospitalServiceOffering(ownerA.actor, { hospitalId: hospitalA.id, code: "SCREENING", enabled: false });
    await setHospitalServiceOffering(ownerA.actor, { hospitalId: hospitalA.id, code: "SCREENING", enabled: true });
    expect(await prisma.hospitalServiceOffering.count({ where: { hospitalId: hospitalA.id, code: PatientServiceCode.SCREENING } })).toBe(1);
    await expect(listManagedHospitalServiceCatalog(ownerA.actor)).resolves.toHaveLength(1);
    await expect(listManagedHospitalServiceCatalog(ownerB.actor)).resolves.toHaveLength(1);
    expect(await prisma.hospitalServiceOffering.count({ where: { hospitalId: hospitalB.id } })).toBe(0);
  });

  it("creates a Patient request only for an enabled offering under the Patient's exact Hospital relationship", async () => {
    const hospitalA = await createHospital("CORE-REQUEST-A");
    const hospitalB = await createHospital("CORE-REQUEST-B");
    const ownerA = await createHospitalActor({ hospitalId: hospitalA.id, membershipType: MembershipType.OWNER });
    const patient = await createActivePatient({ hospitalId: hospitalA.id });
    const unrelatedPatient = await createActivePatient({ hospitalId: hospitalB.id });
    const offeringA = await enableService(ownerA.actor, hospitalA.id);
    const ownerB = await createHospitalActor({ hospitalId: hospitalB.id, membershipType: MembershipType.OWNER });
    const offeringB = await enableService(ownerB.actor, hospitalB.id);
    const patientActor: ActorContext = {
      userId: patient.userId,
      personId: patient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    const unrelatedActor: ActorContext = {
      userId: unrelatedPatient.userId,
      personId: unrelatedPatient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };

    await expect(createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offeringA.id }))).resolves.toMatchObject({
      status: PatientServiceRequestStatus.PENDING,
    });
    await expect(createPatientServiceRequest(patientActor, requestInput({ relationshipId: unrelatedPatient.relationshipId, offeringId: offeringA.id }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offeringB.id }))).rejects.toMatchObject({ code: "VALIDATION" });

    const disabled = await prisma.hospitalServiceOffering.findUniqueOrThrow({ where: { id: offeringA.id }, select: { enabled: true } });
    expect(disabled.enabled).toBe(true);
    const disabledOffering = await prisma.hospitalServiceOffering.create({
      data: {
        hospitalId: hospitalA.id,
        code: PatientServiceCode.FOLLOW_UP,
        enabled: false,
        createdByUserId: ownerA.userId,
        updatedByUserId: ownerA.userId,
      },
      select: { id: true },
    });
    await expect(createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: disabledOffering.id }))).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createPatientServiceRequest(unrelatedActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offeringA.id }))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("validates preferred OSM against exact active Hospital scope and never creates an assignment or Program", async () => {
    const hospitalA = await createHospital("CORE-REQUEST-OSM-A");
    const hospitalB = await createHospital("CORE-REQUEST-OSM-B");
    const ownerA = await createHospitalActor({ hospitalId: hospitalA.id, membershipType: MembershipType.OWNER });
    const patient = await createActivePatient({ hospitalId: hospitalA.id });
    const offeringA = await enableService(ownerA.actor, hospitalA.id);
    const osmA = await createOsm({ hospitalId: hospitalA.id });
    const osmB = await createOsm({ hospitalId: hospitalB.id });
    const inactiveOsm = await createOsm({ hospitalId: hospitalA.id, relationshipStatus: MembershipStatus.SUSPENDED });

    const created = await createPatientServiceRequest(
      {
        userId: patient.userId,
        personId: patient.personId,
        roles: [Role.PATIENT],
        hospitalMemberships: [],
        osmHospitalRelationships: [],
      },
      requestInput({ relationshipId: patient.relationshipId, offeringId: offeringA.id, preferredOsmRelationshipId: osmA.relationshipId }),
    );
    await expect(createPatientServiceRequest(
      {
        userId: patient.userId,
        personId: patient.personId,
        roles: [Role.PATIENT],
        hospitalMemberships: [],
        osmHospitalRelationships: [],
      },
      requestInput({ relationshipId: patient.relationshipId, offeringId: offeringA.id, preferredOsmRelationshipId: osmB.relationshipId }),
    )).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createPatientServiceRequest(
      {
        userId: patient.userId,
        personId: patient.personId,
        roles: [Role.PATIENT],
        hospitalMemberships: [],
        osmHospitalRelationships: [],
      },
      requestInput({ relationshipId: patient.relationshipId, offeringId: offeringA.id, preferredOsmRelationshipId: inactiveOsm.relationshipId }),
    )).rejects.toMatchObject({ code: "VALIDATION" });

    const stored = await prisma.patientServiceRequest.findUniqueOrThrow({
      where: { id: created.requestId },
      select: { preferredOsmUserId: true, hospitalId: true },
    });
    expect(stored).toEqual({ preferredOsmUserId: osmA.userId, hospitalId: hospitalA.id });
    expect(await prisma.patientOsmAssignment.count()).toBe(0);
    expect(await prisma.patientProgram.count()).toBe(0);
    const projection = await listOwnPatientServiceRequests({
      userId: patient.userId,
      personId: patient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    });
    expect(JSON.stringify(projection)).toContain("สมใจ อสม.");
    expect(JSON.stringify(projection)).not.toContain(osmA.userId);
    expect(JSON.stringify(projection)).not.toContain("osmUserId");
    expect(JSON.stringify(projection)).not.toContain("authSubject");
  });

  it("keeps Patient request history self-scoped and Hospital lists exact direct membership scopes", async () => {
    const hospitalA = await createHospital("CORE-REQUEST-SCOPE-A");
    const hospitalB = await createHospital("CORE-REQUEST-SCOPE-B");
    const ownerA = await createHospitalActor({ hospitalId: hospitalA.id, membershipType: MembershipType.OWNER });
    const ownerB = await createHospitalActor({ hospitalId: hospitalB.id, membershipType: MembershipType.OWNER });
    const memberA = await createHospitalActor({ hospitalId: hospitalA.id, membershipType: MembershipType.MEMBER });
    const patientA = await createActivePatient({ hospitalId: hospitalA.id });
    const patientB = await createActivePatient({ hospitalId: hospitalA.id });
    const offeringA = await enableService(ownerA.actor, hospitalA.id);
    const patientActorA: ActorContext = {
      userId: patientA.userId,
      personId: patientA.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    const patientActorB: ActorContext = {
      userId: patientB.userId,
      personId: patientB.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    const requestA = await createPatientServiceRequest(patientActorA, requestInput({ relationshipId: patientA.relationshipId, offeringId: offeringA.id }));
    await createPatientServiceRequest(patientActorB, requestInput({ relationshipId: patientB.relationshipId, offeringId: offeringA.id }));

    const own = await listOwnPatientServiceRequests(patientActorA);
    expect(own).toHaveLength(1);
    expect(own[0]?.requests.map(({ requestId }) => requestId)).toEqual([requestA.requestId]);
    const hospitalList = await listHospitalPatientServiceRequests(memberA.actor);
    expect(hospitalList).toHaveLength(2);
    await expect(listHospitalPatientServiceRequests(ownerB.actor)).resolves.toEqual([]);
  });

  it("enforces PENDING/APPROVED duplicate rules and allows a new request after STARTED", async () => {
    const hospital = await createHospital("CORE-REQUEST-LIFECYCLE");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const member = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.MEMBER });
    const patient = await createActivePatient({ hospitalId: hospital.id });
    const offering = await enableService(owner.actor, hospital.id);
    const patientActor: ActorContext = {
      userId: patient.userId,
      personId: patient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id }));

    await expect(createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id }))).rejects.toMatchObject({ code: "CONFLICT" });
    await reviewPatientServiceRequest(member.actor, { requestId: request.requestId }, "APPROVE");
    await expect(createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id }))).rejects.toMatchObject({ code: "CONFLICT" });
    await reviewPatientServiceRequest(member.actor, { requestId: request.requestId }, "START");
    await expect(withdrawOwnPatientServiceRequest(patientActor, { requestId: request.requestId })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id }))).resolves.toMatchObject({ status: PatientServiceRequestStatus.PENDING });
    expect(await prisma.patientProgram.count()).toBe(0);
  });

  it("allows Patient withdrawal from PENDING and APPROVED and rejects withdrawal after STARTED", async () => {
    const hospital = await createHospital("CORE-REQUEST-WITHDRAW");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const patient = await createActivePatient({ hospitalId: hospital.id });
    const offering = await enableService(owner.actor, hospital.id);
    const patientActor: ActorContext = {
      userId: patient.userId,
      personId: patient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    const pending = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id }));
    await withdrawOwnPatientServiceRequest(patientActor, { requestId: pending.requestId });
    const approved = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id }));
    await reviewPatientServiceRequest(owner.actor, { requestId: approved.requestId }, "APPROVE");
    await withdrawOwnPatientServiceRequest(patientActor, { requestId: approved.requestId });
    await expect(prisma.patientServiceRequest.findMany({ where: { patientHospitalRelationshipId: patient.relationshipId }, select: { status: true } })).resolves.toEqual([
      { status: PatientServiceRequestStatus.WITHDRAWN },
      { status: PatientServiceRequestStatus.WITHDRAWN },
    ]);
  });

  it("rejects service review by unrelated Hospital, OSM, and ADMIN and denies invalid lifecycle transitions", async () => {
    const hospital = await createHospital("CORE-REQUEST-REVIEW");
    const unrelated = await createHospital("CORE-REQUEST-REVIEW-OTHER");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const other = await createHospitalActor({ hospitalId: unrelated.id, membershipType: MembershipType.OWNER });
    const admin = await createPlatformAdmin();
    const osm = await createOsm({ hospitalId: hospital.id });
    const patient = await createActivePatient({ hospitalId: hospital.id });
    const offering = await enableService(owner.actor, hospital.id);
    const patientActor: ActorContext = {
      userId: patient.userId,
      personId: patient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id }));

    for (const deniedActor of [other.actor, osm.actor, admin.actor]) {
      await expect(reviewPatientServiceRequest(deniedActor, { requestId: request.requestId }, "APPROVE")).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(reviewPatientServiceRequest(owner.actor, { requestId: request.requestId }, "START")).rejects.toMatchObject({ code: "CONFLICT" });
    await reviewPatientServiceRequest(owner.actor, { requestId: request.requestId }, "REJECT");
    await expect(reviewPatientServiceRequest(owner.actor, { requestId: request.requestId }, "APPROVE")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("serializes a concurrent approval/withdraw race into an allowed final state", async () => {
    const hospital = await createHospital("CORE-REQUEST-CONCURRENT-REVIEW");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const patient = await createActivePatient({ hospitalId: hospital.id });
    const offering = await enableService(owner.actor, hospital.id);
    const patientActor: ActorContext = {
      userId: patient.userId,
      personId: patient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id }));
    const results = await Promise.allSettled([
      reviewPatientServiceRequest(owner.actor, { requestId: request.requestId }, "APPROVE"),
      withdrawOwnPatientServiceRequest(patientActor, { requestId: request.requestId }),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    expect(await prisma.patientServiceRequest.findUniqueOrThrow({ where: { id: request.requestId }, select: { status: true } })).toMatchObject({
      status: expect.stringMatching(/^(APPROVED|WITHDRAWN)$/),
    });
  });

  it("fails a concurrent start/withdraw race safely with one final state", async () => {
    const hospital = await createHospital("CORE-REQUEST-CONCURRENT-START");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const patient = await createActivePatient({ hospitalId: hospital.id });
    const offering = await enableService(owner.actor, hospital.id);
    const patientActor: ActorContext = {
      userId: patient.userId,
      personId: patient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id }));
    await reviewPatientServiceRequest(owner.actor, { requestId: request.requestId }, "APPROVE");

    const results = await Promise.allSettled([
      reviewPatientServiceRequest(owner.actor, { requestId: request.requestId }, "START"),
      withdrawOwnPatientServiceRequest(patientActor, { requestId: request.requestId }),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(await prisma.patientServiceRequest.findUniqueOrThrow({ where: { id: request.requestId }, select: { status: true } })).toMatchObject({
      status: expect.stringMatching(/^(STARTED|WITHDRAWN)$/),
    });
  });

  it("enforces the partial unique unresolved-request index for concurrent Patient creates", async () => {
    const hospital = await createHospital("CORE-REQUEST-CONCURRENT-DUP");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const patient = await createActivePatient({ hospitalId: hospital.id });
    const offering = await enableService(owner.actor, hospital.id);
    const patientActor: ActorContext = {
      userId: patient.userId,
      personId: patient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };

    const results = await Promise.allSettled([
      createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id })),
      createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id })),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(await prisma.patientServiceRequest.count({ where: { patientHospitalRelationshipId: patient.relationshipId, status: { in: [PatientServiceRequestStatus.PENDING, PatientServiceRequestStatus.APPROVED] } } })).toBe(1);
  });
});
