import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  PatientServiceCode,
  PatientServiceRequestStatus,
  Role,
  UserStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { createAppointment } from "@/modules/appointments/services/appointment-service";
import { assignOsmToPatient } from "@/modules/patient-assignment/services/patient-osm-assignment-service";
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

const prisma = getPrisma();
const nationalId = "1000000000009";
let sequence = 0;

async function clearDatabase(): Promise<void> {
  await prisma.appointmentLineNotification.deleteMany();
  await prisma.patientAppointmentAssigneeAcceptance.deleteMany();
  await prisma.patientAppointmentAcknowledgement.deleteMany();
  await prisma.patientAppointmentRescheduleRequest.deleteMany();
  await prisma.patientAppointmentCancellationRequest.deleteMany();
  await prisma.patientAppointmentCoordinationEvent.deleteMany();
  await prisma.patientAppointment.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.patientServiceRequest.deleteMany();
  await prisma.patientActivation.deleteMany();
  await prisma.patientAccessRequest.deleteMany();
  await prisma.hospitalServiceOffering.deleteMany();
  await prisma.patientOsmAssignment.deleteMany();
  await prisma.patientHospitalHealthHistory.deleteMany();
  await prisma.patientHospitalRelationship.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.osmHospitalRelationship.deleteMany();
  await prisma.hospitalMembership.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.$transaction([
    prisma.$executeRaw`SELECT set_config('demi.service_area_purge', 'demo-reset', true)`,
    prisma.hospitalServiceArea.deleteMany(),
  ]);
  await prisma.hospitalServiceAreaEligibility.deleteMany();
  await prisma.workforceActivation.deleteMany();
  await prisma.user.deleteMany();
  await prisma.hospital.deleteMany();
  await prisma.person.deleteMany();
}

async function createHospital(
  code: string,
  status: HospitalStatus = HospitalStatus.ACTIVE,
): Promise<{ id: string; status: HospitalStatus }> {
  return prisma.hospital.create({
    data: {
      hospitalCode: code,
      name: `โรงพยาบาล ${code}`,
      status,
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
  const membershipType = input.membershipType ?? MembershipType.OWNER;
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

describe("Patient service requests PostgreSQL workflow", () => {
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
    expect(projection[0]?.osmChoices).toEqual([{ relationshipId: osmA.relationshipId, displayName: "สมใจ อสม." }]);
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
    await expect(listHospitalPatientServiceRequests(memberA.actor)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const hospitalList = await listHospitalPatientServiceRequests(ownerA.actor);
    expect(hospitalList.requests).toHaveLength(2);
    await expect(listHospitalPatientServiceRequests(ownerB.actor)).resolves.toMatchObject({ requests: [], nextCursor: null });
  });

  it("rechecks persisted reviewer membership, Hospital and ADMIN exclusions without granting stale actor authority", async () => {
    const hospital = await createHospital("CORE-REQUEST-REVOKED");
    const otherHospital = await createHospital("CORE-REQUEST-MULTI");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const member = await createHospitalActor({ hospitalId: hospital.id });
    const inactive = await createHospitalActor({ hospitalId: hospital.id, membershipStatus: MembershipStatus.SUSPENDED });
    const mixed = await createHospitalActor({ hospitalId: hospital.id, extraRoles: [Role.ADMIN] });
    const osm = await createOsm({ hospitalId: hospital.id });
    const patient = await createActivePatient({ hospitalId: hospital.id });
    const offering = await enableService(owner.actor, hospital.id);
    const patientActor: ActorContext = { userId: patient.userId, personId: patient.personId, roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] };
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id }));
    for (const denied of [inactive.actor, mixed.actor, patientActor]) {
      await expect(listHospitalPatientServiceRequests(denied)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(reviewPatientServiceRequest(denied, { requestId: request.requestId, osmUserId: osm.userId }, "APPROVE")).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await prisma.hospitalMembership.create({ data: { userId: member.userId, hospitalId: otherHospital.id, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE } });
    const otherPatient = await createActivePatient({ hospitalId: otherHospital.id });
    const otherOwner = await createHospitalActor({ hospitalId: otherHospital.id, membershipType: MembershipType.OWNER });
    const otherOffering = await enableService(otherOwner.actor, otherHospital.id);
    await prisma.patientServiceRequest.create({ data: { patientHospitalRelationshipId: otherPatient.relationshipId, hospitalId: otherHospital.id, offeringId: otherOffering.id, requestedByUserId: otherPatient.userId } });
    const multi = await listHospitalPatientServiceRequests(member.actor);
    expect(new Set(multi.requests.map(({ hospitalId }) => hospitalId))).toEqual(new Set([hospital.id, otherHospital.id]));
    // Keep the original ACTIVE actor snapshot; persistence is authoritative for mutations.
    await prisma.hospitalMembership.updateMany({ where: { userId: owner.userId }, data: { status: MembershipStatus.SUSPENDED } });
    await expect(reviewPatientServiceRequest(owner.actor, { requestId: request.requestId, osmUserId: osm.userId }, "APPROVE")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await prisma.hospital.update({ where: { id: hospital.id }, data: { status: HospitalStatus.SUSPENDED } });
    await expect(reviewPatientServiceRequest(member.actor, { requestId: request.requestId, osmUserId: osm.userId }, "APPROVE")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const stillEligible = await listHospitalPatientServiceRequests(member.actor);
    expect(stillEligible.requests.map(({ hospitalId }) => hospitalId)).toEqual([otherHospital.id]);
    await prisma.hospital.update({ where: { id: hospital.id }, data: { status: HospitalStatus.ACTIVE } });
    await prisma.userRole.create({ data: { userId: member.userId, role: Role.ADMIN } });
    await expect(reviewPatientServiceRequest(member.actor, { requestId: request.requestId, osmUserId: osm.userId }, "APPROVE")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listHospitalPatientServiceRequests(member.actor)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await prisma.auditEvent.count({ where: { resourceId: request.requestId } })).toBe(0);
  });

  it("pages persisted status groups with tied timestamps and stable request/relationship associations", async () => {
    const hospital = await createHospital("CORE-REQUEST-PAGING");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const patient = await createActivePatient({ hospitalId: hospital.id });
    const offering = await enableService(owner.actor, hospital.id);
    const createdAt = new Date("2026-10-01T00:00:00.000Z");
    await prisma.patientServiceRequest.createMany({ data: Array.from({ length: 25 }, () => ({
      patientHospitalRelationshipId: patient.relationshipId,
      hospitalId: hospital.id,
      offeringId: offering.id,
      requestedByUserId: patient.userId,
      status: PatientServiceRequestStatus.REJECTED,
      createdAt,
    })) });
    const first = await listHospitalPatientServiceRequests(owner.actor, {}, { group: "HISTORY" });
    expect(first.requests).toHaveLength(20);
    expect(first.nextCursor).toEqual({ createdAt: createdAt.toISOString(), requestId: first.requests.at(-1)?.requestId });
    expect(first.requests.every((request) => request.status === "REJECTED" && request.relationshipId === patient.relationshipId)).toBe(true);
    // Keyset navigation still works when the boundary row changes status.
    await prisma.patientServiceRequest.update({ where: { id: first.nextCursor?.requestId }, data: { status: PatientServiceRequestStatus.APPROVED } });
    const second = await listHospitalPatientServiceRequests(owner.actor, {}, { group: "HISTORY", after: first.nextCursor });
    expect(second.requests).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    const ids = [...first.requests, ...second.requests].map(({ requestId }) => requestId);
    expect(new Set(ids).size).toBe(25);
    const approved = await listHospitalPatientServiceRequests(owner.actor, {}, { group: "APPROVED" });
    expect(approved.requests.map(({ requestId }) => requestId)).toEqual([first.nextCursor?.requestId]);
    await expect(listHospitalPatientServiceRequests(owner.actor)).resolves.toMatchObject({ group: "PENDING", requests: [], nextCursor: null });
  });

  it("approves with an OSM assignment and starts the request atomically from its linked appointment", async () => {
    const hospital = await createHospital("CORE-REQUEST-LIFECYCLE");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const member = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.MEMBER });
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
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id, preferredOsmRelationshipId: osm.relationshipId }));

    await expect(createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id }))).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(reviewPatientServiceRequest(member.actor, { requestId: request.requestId, osmUserId: osm.userId }, "APPROVE")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await reviewPatientServiceRequest(owner.actor, { requestId: request.requestId, osmUserId: osm.userId }, "APPROVE");
    expect(await prisma.patientServiceRequest.findUniqueOrThrow({ where: { id: request.requestId }, select: { status: true } }))
      .toEqual({ status: PatientServiceRequestStatus.APPROVED });
    expect(await prisma.patientOsmAssignment.count({ where: { patientHospitalRelationshipId: patient.relationshipId, endedAt: null, osmUserId: osm.userId } })).toBe(1);
    await expect(createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id }))).rejects.toMatchObject({ code: "CONFLICT" });
    const appointment = await createAppointment(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      submissionNonce: randomUUID(),
      sourceServiceRequestId: request.requestId,
      assignedOsmUserId: osm.userId,
      scheduledAt: "2030-01-01T10:30:00+07:00",
      type: "FOLLOW_UP",
      responsibleUserId: null,
      durationMinutes: 30,
      locationType: "HOME_VISIT",
      locationDetail: null,
      note: null,
    });
    expect(await prisma.patientAppointment.findUniqueOrThrow({ where: { id: appointment.appointmentId }, select: { sourceServiceRequestId: true } }))
      .toEqual({ sourceServiceRequestId: request.requestId });
    await expect(withdrawOwnPatientServiceRequest(patientActor, { requestId: request.requestId })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id }))).resolves.toMatchObject({ status: PatientServiceRequestStatus.PENDING });
    expect(await prisma.patientProgram.count()).toBe(0);
    expect(await prisma.patientOsmAssignment.count({ where: { patientHospitalRelationshipId: patient.relationshipId, endedAt: null } })).toBe(1);
    expect(await prisma.screeningAssessment.count()).toBe(0);
    expect(await prisma.patientFollowup.count()).toBe(0);
    expect(await prisma.auditEvent.count({ where: { resourceId: request.requestId, action: "PATIENT_SERVICE_REQUEST_STARTED" } })).toBe(1);
  });

  it("allows Patient withdrawal from PENDING and APPROVED and rejects withdrawal after STARTED", async () => {
    const hospital = await createHospital("CORE-REQUEST-WITHDRAW");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
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
    const pending = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id }));
    await withdrawOwnPatientServiceRequest(patientActor, { requestId: pending.requestId });
    const approved = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id }));
    await reviewPatientServiceRequest(owner.actor, { requestId: approved.requestId, osmUserId: osm.userId }, "APPROVE");
    await withdrawOwnPatientServiceRequest(patientActor, { requestId: approved.requestId });
    await expect(prisma.patientServiceRequest.findMany({ where: { patientHospitalRelationshipId: patient.relationshipId }, select: { status: true } })).resolves.toEqual([
      { status: PatientServiceRequestStatus.WITHDRAWN },
      { status: PatientServiceRequestStatus.WITHDRAWN },
    ]);
  });

  it("requires explicit confirmation before approval replaces the current OSM", async () => {
    const hospital = await createHospital("CORE-REQUEST-OSM-CHANGE");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const currentOsm = await createOsm({ hospitalId: hospital.id });
    const selectedOsm = await createOsm({ hospitalId: hospital.id });
    const patient = await createActivePatient({ hospitalId: hospital.id });
    const offering = await enableService(owner.actor, hospital.id);
    const patientActor: ActorContext = { userId: patient.userId, personId: patient.personId, roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] };
    await assignOsmToPatient(owner.actor, { patientHospitalRelationshipId: patient.relationshipId, osmUserId: currentOsm.userId });
    const request = await createPatientServiceRequest(patientActor, requestInput({
      relationshipId: patient.relationshipId,
      offeringId: offering.id,
      preferredOsmRelationshipId: selectedOsm.relationshipId,
    }));

    await expect(reviewPatientServiceRequest(owner.actor, { requestId: request.requestId, osmUserId: selectedOsm.userId }, "APPROVE"))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(await prisma.patientServiceRequest.findUniqueOrThrow({ where: { id: request.requestId }, select: { status: true } }))
      .toEqual({ status: PatientServiceRequestStatus.PENDING });
    expect(await prisma.patientOsmAssignment.count({ where: { patientHospitalRelationshipId: patient.relationshipId, osmUserId: currentOsm.userId, endedAt: null } })).toBe(1);

    await reviewPatientServiceRequest(owner.actor, {
      requestId: request.requestId,
      osmUserId: selectedOsm.userId,
      confirmReassignment: true,
    }, "APPROVE");
    expect(await prisma.patientOsmAssignment.count({ where: { patientHospitalRelationshipId: patient.relationshipId, osmUserId: currentOsm.userId, endedAt: null } })).toBe(0);
    expect(await prisma.patientOsmAssignment.count({ where: { patientHospitalRelationshipId: patient.relationshipId, osmUserId: selectedOsm.userId, endedAt: null } })).toBe(1);
    expect(await prisma.patientServiceRequest.findUniqueOrThrow({ where: { id: request.requestId }, select: { status: true } }))
      .toEqual({ status: PatientServiceRequestStatus.APPROVED });
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
      await expect(reviewPatientServiceRequest(deniedActor, { requestId: request.requestId, osmUserId: osm.userId }, "APPROVE")).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await reviewPatientServiceRequest(owner.actor, { requestId: request.requestId, osmUserId: osm.userId }, "APPROVE");
    await expect(reviewPatientServiceRequest(owner.actor, { requestId: request.requestId }, "REJECT")).rejects.toMatchObject({ code: "CONFLICT" });

    const secondPatient = await createActivePatient({ hospitalId: hospital.id });
    const secondPatientActor: ActorContext = {
      userId: secondPatient.userId,
      personId: secondPatient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    const rejected = await createPatientServiceRequest(secondPatientActor, requestInput({ relationshipId: secondPatient.relationshipId, offeringId: offering.id }));
    await reviewPatientServiceRequest(owner.actor, { requestId: rejected.requestId }, "REJECT");
    await expect(reviewPatientServiceRequest(owner.actor, { requestId: rejected.requestId, osmUserId: osm.userId }, "APPROVE")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("serializes concurrent approvals into exactly one assignment", async () => {
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
    const osm = await createOsm({ hospitalId: hospital.id });
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id }));
    const results = await Promise.allSettled([
      reviewPatientServiceRequest(owner.actor, { requestId: request.requestId, osmUserId: osm.userId }, "APPROVE"),
      reviewPatientServiceRequest(owner.actor, { requestId: request.requestId, osmUserId: osm.userId }, "APPROVE"),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled").length).toBe(1);
    expect(await prisma.patientServiceRequest.findUniqueOrThrow({ where: { id: request.requestId }, select: { status: true } }))
      .toEqual({ status: PatientServiceRequestStatus.APPROVED });
    expect(await prisma.patientOsmAssignment.count({ where: { patientHospitalRelationshipId: patient.relationshipId, endedAt: null } })).toBe(1);
  });

  it("does not allow unassigned requests to be approved", async () => {
    const hospital = await createHospital("CORE-REQUEST-UNASSIGNED-APPROVAL");
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
    await expect(reviewPatientServiceRequest(owner.actor, { requestId: request.requestId }, "APPROVE"))
      .rejects.toMatchObject({ code: "VALIDATION" });
    expect(await prisma.patientServiceRequest.findUniqueOrThrow({ where: { id: request.requestId }, select: { status: true } }))
      .toEqual({ status: PatientServiceRequestStatus.PENDING });
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
