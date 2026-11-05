import {
  HospitalStatus,
  LineReachability,
  MembershipStatus,
  MembershipType,
  PatientServiceCode,
  PatientServiceRequestStatus,
  Role,
  UserStatus,
  type Prisma,
} from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import {
  acceptAppointmentAssignment,
  acknowledgeAppointmentOnBehalfOfPatient,
  cancelAppointment,
  completeAppointment,
  createAppointment,
  recordAppointmentCoordination,
  rescheduleAppointment,
  submitAppointmentRescheduleRequest,
} from "@/modules/appointments/services/appointment-service";
import { getOwnPatientAppointmentDetail, listOwnPatientAppointmentHub } from "@/modules/patient-self/services/patient-self-care-query-service";
import {
  getAppointmentCreateContext,
  getAppointmentDetail,
  getAppointmentHistory,
  searchAppointmentOsmCandidates,
  searchAppointmentResponsibleMembers,
} from "@/modules/appointments/services/appointment-query-service";
import {
  countWorkAppointmentsAwaitingMyAcceptance,
  listWorkAppointments,
} from "@/modules/appointments/services/work-appointment-query-service";
import { drainAppointmentLineNotificationOutbox } from "@/modules/appointments/services/appointment-line-notification-delivery-service";
import { setOwnAppointmentLineNotificationPreference } from "@/modules/appointments/services/appointment-line-notification-preference-service";
import { getFollowupHistory } from "@/modules/followups/services/followup-query-service";
import { assignOsmToPatient } from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import { getPatientDirectoryDetail } from "@/modules/patient-directory/services/patient-directory-query-service";
import { getStaffPatientHospitalProfile } from "@/modules/patient-hospital-profile/services/patient-hospital-profile-service";
import { getPatientProgramPageContext } from "@/modules/patient-program/services/patient-program-query-service";
import { getScreeningHistory } from "@/modules/screening/services/screening-query-service";
import { serviceDateToUtcDate, toServiceDateOnly } from "@/shared/time/service-date";
import {
  DUPLICATE_OPEN_SERVICE_REQUEST_MESSAGE,
  confirmPatientServiceRequest,
  createPatientServiceRequest,
  listHospitalPatientServiceRequests,
  listOwnPatientServiceRequests,
  rejectPatientServiceRequest,
  searchOwnServiceRequestOsmChoices,
  searchServiceRequestOsmCandidates,
  withdrawOwnPatientServiceRequest,
} from "@/modules/patient-service-requests/services/patient-service-request-service";

const prisma = getPrisma();
let sequence = 0;

async function clearDatabase(): Promise<void> {
  await prisma.appointmentLineNotification.deleteMany();
  await prisma.lineAppointmentNotificationPreference.deleteMany();
  await prisma.lineAccountBinding.deleteMany();
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

const DAY_MS = 24 * 60 * 60 * 1000;

/** SR-D6: a week ahead on the Bangkok calendar is inside the tomorrow..+60 days window. */
function preferredDateAhead(days = 7): string {
  return toServiceDateOnly(new Date(Date.now() + days * DAY_MS));
}

function requestInput(input: {
  relationshipId: string;
  serviceCode?: PatientServiceCode;
  preferredOsmRelationshipId?: string | null;
  preferredDate?: string;
  preferredSlot?: "MORNING" | "AFTERNOON" | "ANY";
  note?: string;
}) {
  return {
    relationshipId: input.relationshipId,
    serviceCode: input.serviceCode ?? PatientServiceCode.SCREENING,
    preferredOsmRelationshipId: input.preferredOsmRelationshipId ?? null,
    preferredDate: input.preferredDate ?? preferredDateAhead(),
    preferredSlot: input.preferredSlot ?? "MORNING",
    ...(input.note === undefined ? {} : { note: input.note }),
  };
}

function confirmInput(requestId: string, osmUserId: string, overrides: Record<string, unknown> = {}) {
  return {
    requestId,
    osmUserId,
    scheduledAt: new Date(Date.now() + 3 * DAY_MS).toISOString(),
    durationMinutes: 30,
    submissionNonce: randomUUID(),
    ...overrides,
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

  it("lets a Patient of any ACTIVE Hospital request each native service with no Hospital setup (ADR-0029)", async () => {
    const hospitalA = await createHospital("CORE-REQUEST-A");
    const hospitalB = await createHospital("CORE-REQUEST-B");
    const patient = await createActivePatient({ hospitalId: hospitalA.id });
    const unrelatedPatient = await createActivePatient({ hospitalId: hospitalB.id });
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

    const [view] = await listOwnPatientServiceRequests(patientActor);
    expect(view).toMatchObject({ relationshipId: patient.relationshipId, hospitalActive: true, careEnded: false, services: ["SCREENING", "FOLLOW_UP", "EMPOWERMENT"] });
    for (const serviceCode of Object.values(PatientServiceCode)) {
      await expect(createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, serviceCode })))
        .resolves.toMatchObject({ status: PatientServiceRequestStatus.PENDING });
    }
    expect((await prisma.patientServiceRequest.findMany({ where: { patientHospitalRelationshipId: patient.relationshipId }, select: { serviceCode: true, hospitalId: true } }))
      .map(({ serviceCode, hospitalId }) => [serviceCode, hospitalId]).sort())
      .toEqual(Object.values(PatientServiceCode).map((serviceCode) => [serviceCode, hospitalA.id]).sort());

    // Another person's relationship, an unknown service, an invalid preferred date.
    await expect(createPatientServiceRequest(patientActor, requestInput({ relationshipId: unrelatedPatient.relationshipId }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createPatientServiceRequest(unrelatedActor, requestInput({ relationshipId: patient.relationshipId, serviceCode: PatientServiceCode.FOLLOW_UP }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createPatientServiceRequest(unrelatedActor, { ...requestInput({ relationshipId: unrelatedPatient.relationshipId }), serviceCode: "HOME_CARE" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createPatientServiceRequest(unrelatedActor, { ...requestInput({ relationshipId: unrelatedPatient.relationshipId }), legacyServiceId: randomUUID() })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createPatientServiceRequest(unrelatedActor, requestInput({ relationshipId: unrelatedPatient.relationshipId, preferredDate: toServiceDateOnly(new Date()) }))).rejects.toMatchObject({ code: "VALIDATION" });

    // An inactive Hospital takes no request and lists no service; an ended relationship neither.
    await prisma.hospital.update({ where: { id: hospitalB.id }, data: { status: HospitalStatus.SUSPENDED } });
    await expect(createPatientServiceRequest(unrelatedActor, requestInput({ relationshipId: unrelatedPatient.relationshipId }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(listOwnPatientServiceRequests(unrelatedActor)).resolves.toMatchObject([{ hospitalActive: false, services: [] }]);
    await prisma.hospital.update({ where: { id: hospitalB.id }, data: { status: HospitalStatus.ACTIVE } });
    const ownerB = await createHospitalActor({ hospitalId: hospitalB.id, membershipType: MembershipType.OWNER });
    await prisma.patientHospitalRelationship.update({
      where: { id: unrelatedPatient.relationshipId },
      data: { endedAt: new Date(), endedByUserId: ownerB.userId, endReason: "ย้ายไปรับการดูแลที่อื่น" },
    });
    await expect(createPatientServiceRequest(unrelatedActor, requestInput({ relationshipId: unrelatedPatient.relationshipId }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(listOwnPatientServiceRequests(unrelatedActor)).resolves.toMatchObject([{ careEnded: true, services: [] }]);
    expect(await prisma.patientServiceRequest.count({ where: { patientHospitalRelationshipId: unrelatedPatient.relationshipId } })).toBe(0);
  });

  it("allows one open request per service: a duplicate conflicts, another service is fine, and a closed request frees the service", async () => {
    const hospital = await createHospital("NATIVE-DUPLICATE");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const osm = await createOsm({ hospitalId: hospital.id });
    const patient = await createActivePatient({ hospitalId: hospital.id });
    const patientActor: ActorContext = { userId: patient.userId, personId: patient.personId, roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] };
    const request = (serviceCode: PatientServiceCode) =>
      createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, serviceCode }));

    const screening = await request(PatientServiceCode.SCREENING);
    await expect(request(PatientServiceCode.SCREENING)).rejects.toMatchObject({ code: "CONFLICT", message: DUPLICATE_OPEN_SERVICE_REQUEST_MESSAGE });
    const followUp = await request(PatientServiceCode.FOLLOW_UP);
    const empowerment = await request(PatientServiceCode.EMPOWERMENT);

    // The partial unique index holds without the service's own check, for PENDING and legacy APPROVED.
    await expect(prisma.patientServiceRequest.create({ data: {
      patientHospitalRelationshipId: patient.relationshipId, hospitalId: hospital.id, serviceCode: PatientServiceCode.SCREENING, requestedByUserId: patient.userId,
    } })).rejects.toMatchObject({ code: "P2002" });
    await prisma.patientServiceRequest.update({ where: { id: followUp.requestId }, data: { status: PatientServiceRequestStatus.APPROVED } });
    await expect(prisma.patientServiceRequest.create({ data: {
      patientHospitalRelationshipId: patient.relationshipId, hospitalId: hospital.id, serviceCode: PatientServiceCode.FOLLOW_UP, requestedByUserId: patient.userId,
    } })).rejects.toMatchObject({ code: "P2002" });
    await expect(request(PatientServiceCode.FOLLOW_UP)).rejects.toMatchObject({ message: DUPLICATE_OPEN_SERVICE_REQUEST_MESSAGE });

    // WITHDRAWN, REJECTED and STARTED requests free their service again.
    await rejectPatientServiceRequest(owner.actor, { requestId: screening.requestId, reason: "ไม่มี อสม. ว่าง" });
    await withdrawOwnPatientServiceRequest(patientActor, { requestId: followUp.requestId });
    await confirmPatientServiceRequest(owner.actor, confirmInput(empowerment.requestId, osm.userId));
    for (const serviceCode of Object.values(PatientServiceCode)) {
      await expect(request(serviceCode)).resolves.toMatchObject({ status: PatientServiceRequestStatus.PENDING });
    }
  });

  it("books every service as its mapped appointment type", async () => {
    const hospital = await createHospital("NATIVE-TYPES");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const osm = await createOsm({ hospitalId: hospital.id });
    const patient = await createActivePatient({ hospitalId: hospital.id });
    const patientActor: ActorContext = { userId: patient.userId, personId: patient.personId, roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] };
    const expectedType = { SCREENING: "ASSESSMENT", FOLLOW_UP: "FOLLOW_UP", EMPOWERMENT: "EDUCATION" } as const;

    for (const serviceCode of Object.values(PatientServiceCode)) {
      const created = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, serviceCode }));
      const confirmed = await confirmPatientServiceRequest(owner.actor, confirmInput(created.requestId, osm.userId));
      expect(await prisma.patientAppointment.findUniqueOrThrow({ where: { id: confirmed.appointmentId }, select: { serviceCode: true, type: true } }))
        .toEqual({ serviceCode, type: expectedType[serviceCode] });
    }
  });

  it("validates preferred OSM against exact active Hospital scope and never creates an assignment or Program", async () => {
    const hospitalA = await createHospital("CORE-REQUEST-OSM-A");
    const hospitalB = await createHospital("CORE-REQUEST-OSM-B");
    const patient = await createActivePatient({ hospitalId: hospitalA.id });
    const serviceA = PatientServiceCode.SCREENING;
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
      requestInput({ relationshipId: patient.relationshipId, serviceCode: serviceA, preferredOsmRelationshipId: osmA.relationshipId }),
    );
    await expect(createPatientServiceRequest(
      {
        userId: patient.userId,
        personId: patient.personId,
        roles: [Role.PATIENT],
        hospitalMemberships: [],
        osmHospitalRelationships: [],
      },
      requestInput({ relationshipId: patient.relationshipId, serviceCode: serviceA, preferredOsmRelationshipId: osmB.relationshipId }),
    )).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createPatientServiceRequest(
      {
        userId: patient.userId,
        personId: patient.personId,
        roles: [Role.PATIENT],
        hospitalMemberships: [],
        osmHospitalRelationships: [],
      },
      requestInput({ relationshipId: patient.relationshipId, serviceCode: serviceA, preferredOsmRelationshipId: inactiveOsm.relationshipId }),
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
    // SR-D3: no Hospital roster travels with the view; osmA is not the patient's assigned อสม.
    expect(projection[0]?.assignedOsm).toBeNull();
    expect(projection[0]).not.toHaveProperty("osmChoices");
    expect(JSON.stringify(projection)).not.toContain(osmA.relationshipId);
  });

  it("ships no Hospital อสม. roster with the request lists; the pickers search one page for the right actor only", async () => {
    const hospitalA = await createHospital("CORE-ROSTER-A");
    const hospitalB = await createHospital("CORE-ROSTER-B");
    const ownerA = await createHospitalActor({ hospitalId: hospitalA.id, membershipType: MembershipType.OWNER });
    const ownerB = await createHospitalActor({ hospitalId: hospitalB.id, membershipType: MembershipType.OWNER });
    const patient = await createActivePatient({ hospitalId: hospitalA.id });
    const otherPatient = await createActivePatient({ hospitalId: hospitalB.id });
    const assigned = await createOsm({ hospitalId: hospitalA.id });
    const roster = [];
    for (let index = 0; index < 12; index += 1) roster.push(await createOsm({ hospitalId: hospitalA.id }));
    await createOsm({ hospitalId: hospitalA.id, relationshipStatus: MembershipStatus.SUSPENDED });
    const osmB = await createOsm({ hospitalId: hospitalB.id });
    await assignOsmToPatient(ownerA.actor, { patientHospitalRelationshipId: patient.relationshipId, osmUserId: assigned.userId });
    const patientActor = { userId: patient.userId, personId: patient.personId, roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] };
    await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, preferredOsmRelationshipId: roster[0]!.relationshipId }));

    // The patient view carries the assigned อสม. only, never the Hospital roster.
    const own = await listOwnPatientServiceRequests(patientActor);
    expect(own[0]?.assignedOsm).toEqual({ relationshipId: assigned.relationshipId, displayName: "สมใจ อสม." });
    expect(own[0]).not.toHaveProperty("osmChoices");
    for (const osm of roster.slice(1)) expect(JSON.stringify(own)).not.toContain(osm.relationshipId);

    // The inbox loads O(page) rows: no roster, only whether the preferred and current อสม. are still eligible.
    const inbox = await listHospitalPatientServiceRequests(ownerA.actor);
    expect(inbox.requests[0]).toMatchObject({ preferredOsmUserId: roster[0]!.userId, preferredOsmEligible: true, currentOsmUserId: assigned.userId, currentOsmEligible: true });
    expect(inbox.requests[0]).not.toHaveProperty("osmChoices");
    for (const osm of roster.slice(1)) expect(JSON.stringify(inbox)).not.toContain(osm.userId);

    // Patient search: one page of 10 by name, the assigned อสม. left out (it is pinned), names only.
    const ownFirst = await searchOwnServiceRequestOsmChoices(patientActor, { relationshipId: patient.relationshipId, page: 1 });
    expect(ownFirst).toMatchObject({ page: 1, totalPages: 2, hasNextPage: true });
    expect(ownFirst.items).toHaveLength(10);
    expect(Object.keys(ownFirst.items[0] ?? {}).sort()).toEqual(["displayName", "relationshipId"]);
    const ownAll = [...ownFirst.items, ...(await searchOwnServiceRequestOsmChoices(patientActor, { relationshipId: patient.relationshipId, page: 2 })).items];
    expect(new Set(ownAll.map(({ relationshipId }) => relationshipId))).toEqual(new Set(roster.map(({ relationshipId }) => relationshipId)));
    await expect(searchOwnServiceRequestOsmChoices(patientActor, { relationshipId: otherPatient.relationshipId, page: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(searchOwnServiceRequestOsmChoices(ownerA.actor, { relationshipId: patient.relationshipId, page: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Reviewer search: scoped to the request's Hospital and to its reviewers.
    const requestId = inbox.requests[0]!.requestId;
    const reviewFirst = await searchServiceRequestOsmCandidates(ownerA.actor, { requestId, page: 1 });
    expect(reviewFirst).toMatchObject({ page: 1, totalPages: 2 });
    expect(reviewFirst.items).toHaveLength(10);
    const reviewAll = [...reviewFirst.items, ...(await searchServiceRequestOsmCandidates(ownerA.actor, { requestId, page: 2 })).items];
    expect(reviewAll.map(({ userId }) => userId)).toContain(assigned.userId);
    expect(reviewAll.map(({ userId }) => userId)).not.toContain(osmB.userId);
    expect(reviewAll).toHaveLength(13);
    await expect(searchServiceRequestOsmCandidates(ownerB.actor, { requestId, page: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // A request that does not exist answers like a forbidden one.
    await expect(searchServiceRequestOsmCandidates(ownerA.actor, { requestId: randomUUID(), page: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Confirm still re-validates the chosen อสม.: another Hospital's อสม. is refused.
    await expect(confirmPatientServiceRequest(ownerA.actor, confirmInput(requestId, osmB.userId))).rejects.toMatchObject({ code: "VALIDATION" });

    // Appointment form: no roster in the context; staff and อสม. are searched for the relationship's Hospital only.
    const context = await getAppointmentCreateContext(ownerA.actor, patient.relationshipId);
    expect(context).toMatchObject({ selectedOsm: null, selectedResponsible: null });
    expect(JSON.stringify(context)).not.toContain(roster[1]!.userId);
    const osmPage = await searchAppointmentOsmCandidates(ownerA.actor, { relationshipId: patient.relationshipId, page: 1 });
    expect(osmPage.items).toHaveLength(10);
    expect(osmPage.items.map(({ userId }) => userId)).not.toContain(assigned.userId);
    expect((await searchAppointmentResponsibleMembers(ownerA.actor, { relationshipId: patient.relationshipId, page: 1 })).items)
      .toEqual([expect.objectContaining({ userId: ownerA.userId })]);
    await expect(searchAppointmentOsmCandidates(ownerB.actor, { relationshipId: patient.relationshipId, page: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps Patient request history self-scoped and Hospital lists exact direct membership scopes", async () => {
    const hospitalA = await createHospital("CORE-REQUEST-SCOPE-A");
    const hospitalB = await createHospital("CORE-REQUEST-SCOPE-B");
    const ownerA = await createHospitalActor({ hospitalId: hospitalA.id, membershipType: MembershipType.OWNER });
    const ownerB = await createHospitalActor({ hospitalId: hospitalB.id, membershipType: MembershipType.OWNER });
    const memberA = await createHospitalActor({ hospitalId: hospitalA.id, membershipType: MembershipType.MEMBER });
    const patientA = await createActivePatient({ hospitalId: hospitalA.id });
    const patientB = await createActivePatient({ hospitalId: hospitalA.id });
    const serviceA = PatientServiceCode.SCREENING;
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
    const requestA = await createPatientServiceRequest(patientActorA, requestInput({ relationshipId: patientA.relationshipId, serviceCode: serviceA }));
    await createPatientServiceRequest(patientActorB, requestInput({ relationshipId: patientB.relationshipId, serviceCode: serviceA }));

    const own = await listOwnPatientServiceRequests(patientActorA);
    expect(own).toHaveLength(1);
    expect(own[0]?.requests.map(({ requestId }) => requestId)).toEqual([requestA.requestId]);
    // ADR-0026: a MEMBER lists its own Hospital's requests like the OWNER.
    expect((await listHospitalPatientServiceRequests(memberA.actor)).requests).toHaveLength(2);
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
    const service = PatientServiceCode.SCREENING;
    const patientActor: ActorContext = { userId: patient.userId, personId: patient.personId, roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] };
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, serviceCode: service }));
    for (const denied of [inactive.actor, mixed.actor, patientActor]) {
      await expect(listHospitalPatientServiceRequests(denied)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(confirmPatientServiceRequest(denied, confirmInput(request.requestId, osm.userId))).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(rejectPatientServiceRequest(denied, { requestId: request.requestId, reason: "ไม่อนุมัติ" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await prisma.hospitalMembership.create({ data: { userId: member.userId, hospitalId: otherHospital.id, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE } });
    const otherPatient = await createActivePatient({ hospitalId: otherHospital.id });
    const otherService = PatientServiceCode.SCREENING;
    await prisma.patientServiceRequest.create({ data: { patientHospitalRelationshipId: otherPatient.relationshipId, hospitalId: otherHospital.id, serviceCode: otherService, requestedByUserId: otherPatient.userId } });
    const multi = await listHospitalPatientServiceRequests(member.actor);
    expect(new Set(multi.requests.map(({ hospitalId }) => hospitalId))).toEqual(new Set([hospital.id, otherHospital.id]));
    // Keep the original ACTIVE actor snapshot; persistence is authoritative for mutations.
    await prisma.hospitalMembership.updateMany({ where: { userId: owner.userId }, data: { status: MembershipStatus.SUSPENDED } });
    await expect(confirmPatientServiceRequest(owner.actor, confirmInput(request.requestId, osm.userId))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await prisma.hospital.update({ where: { id: hospital.id }, data: { status: HospitalStatus.SUSPENDED } });
    await expect(confirmPatientServiceRequest(member.actor, confirmInput(request.requestId, osm.userId))).rejects.toMatchObject({ code: "FORBIDDEN" });
    const stillEligible = await listHospitalPatientServiceRequests(member.actor);
    expect(stillEligible.requests.map(({ hospitalId }) => hospitalId)).toEqual([otherHospital.id]);
    await prisma.hospital.update({ where: { id: hospital.id }, data: { status: HospitalStatus.ACTIVE } });
    await prisma.userRole.create({ data: { userId: member.userId, role: Role.ADMIN } });
    await expect(confirmPatientServiceRequest(member.actor, confirmInput(request.requestId, osm.userId))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listHospitalPatientServiceRequests(member.actor)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await prisma.auditEvent.count({ where: { resourceId: request.requestId } })).toBe(0);
    expect(await prisma.patientAppointment.count()).toBe(0);
  });

  it("pages persisted status groups with tied timestamps and stable request/relationship associations", async () => {
    const hospital = await createHospital("CORE-REQUEST-PAGING");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const patient = await createActivePatient({ hospitalId: hospital.id });
    const service = PatientServiceCode.SCREENING;
    const createdAt = new Date("2026-10-01T00:00:00.000Z");
    await prisma.patientServiceRequest.createMany({ data: Array.from({ length: 25 }, () => ({
      patientHospitalRelationshipId: patient.relationshipId,
      hospitalId: hospital.id,
      serviceCode: service,
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

  it("confirms a request into its appointment atomically, without assigning the อสม.", async () => {
    const hospital = await createHospital("CORE-REQUEST-LIFECYCLE");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const member = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.MEMBER });
    const osm = await createOsm({ hospitalId: hospital.id });
    const patient = await createActivePatient({ hospitalId: hospital.id });
    const service = PatientServiceCode.SCREENING;
    const patientActor: ActorContext = {
      userId: patient.userId,
      personId: patient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, serviceCode: service, preferredOsmRelationshipId: osm.relationshipId }));

    await expect(createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, serviceCode: service }))).rejects.toMatchObject({ code: "CONFLICT" });
    // ADR-0026: an OSM never reviews; a MEMBER confirms like the OWNER (below).
    await expect(confirmPatientServiceRequest(osm.actor, confirmInput(request.requestId, osm.userId))).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Booking from a request is only possible through the confirmation.
    await expect(createAppointment(owner.actor, {
      patientHospitalRelationshipId: patient.relationshipId,
      submissionNonce: randomUUID(),
      sourceServiceRequestId: request.requestId,
      assignedOsmUserId: osm.userId,
      scheduledAt: "2030-01-01T10:30:00+07:00",
      type: "ASSESSMENT",
      locationType: "HOME_VISIT",
    })).rejects.toMatchObject({ code: "VALIDATION" });
    const memberConfirmation = confirmInput(request.requestId, osm.userId);
    const confirmed = await confirmPatientServiceRequest(member.actor, memberConfirmation);
    // The appointment nonce makes a retry return the same appointment.
    await expect(confirmPatientServiceRequest(member.actor, memberConfirmation)).resolves.toMatchObject({ appointmentId: confirmed.appointmentId });
    expect(await prisma.patientAppointment.count({ where: { sourceServiceRequestId: request.requestId } })).toBe(1);
    expect(await prisma.patientAppointment.findUniqueOrThrow({ where: { id: confirmed.appointmentId }, select: { sourceServiceRequestId: true, serviceCode: true, type: true } }))
      .toEqual({ sourceServiceRequestId: request.requestId, serviceCode: PatientServiceCode.SCREENING, type: "ASSESSMENT" });
    expect(await prisma.patientServiceRequest.findUniqueOrThrow({ where: { id: request.requestId }, select: { status: true, reviewedByUserId: true, startedByUserId: true } }))
      .toEqual({ status: PatientServiceRequestStatus.STARTED, reviewedByUserId: member.userId, startedByUserId: member.userId });
    await expect(withdrawOwnPatientServiceRequest(patientActor, { requestId: request.requestId })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, serviceCode: service }))).resolves.toMatchObject({ status: PatientServiceRequestStatus.PENDING });
    expect(await prisma.patientProgram.count()).toBe(0);
    expect(await prisma.patientOsmAssignment.count({ where: { patientHospitalRelationshipId: patient.relationshipId } })).toBe(0);
    expect(await prisma.screeningAssessment.count()).toBe(0);
    expect(await prisma.patientFollowup.count()).toBe(0);
    expect(await prisma.auditEvent.count({ where: { resourceId: request.requestId, action: "PATIENT_SERVICE_REQUEST_STARTED", actorUserId: member.userId } })).toBe(1);
  });

  it("allows Patient withdrawal from PENDING and legacy APPROVED", async () => {
    const hospital = await createHospital("CORE-REQUEST-WITHDRAW");
    const patient = await createActivePatient({ hospitalId: hospital.id });
    const service = PatientServiceCode.SCREENING;
    const patientActor: ActorContext = {
      userId: patient.userId,
      personId: patient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    const pending = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, serviceCode: service }));
    await withdrawOwnPatientServiceRequest(patientActor, { requestId: pending.requestId });
    const approved = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, serviceCode: service }));
    // ADR-0023: APPROVED is legacy; no service writes it any more.
    await prisma.patientServiceRequest.update({ where: { id: approved.requestId }, data: { status: PatientServiceRequestStatus.APPROVED } });
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
    const service = PatientServiceCode.SCREENING;
    const patientActor: ActorContext = {
      userId: patient.userId,
      personId: patient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, serviceCode: service }));

    for (const deniedActor of [other.actor, osm.actor, admin.actor]) {
      await expect(confirmPatientServiceRequest(deniedActor, confirmInput(request.requestId, osm.userId))).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await confirmPatientServiceRequest(owner.actor, confirmInput(request.requestId, osm.userId));
    await expect(rejectPatientServiceRequest(owner.actor, { requestId: request.requestId, reason: "ไม่อนุมัติ" })).rejects.toMatchObject({ code: "CONFLICT" });

    const secondPatient = await createActivePatient({ hospitalId: hospital.id });
    const secondPatientActor: ActorContext = {
      userId: secondPatient.userId,
      personId: secondPatient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    const rejected = await createPatientServiceRequest(secondPatientActor, requestInput({ relationshipId: secondPatient.relationshipId, serviceCode: service }));
    await rejectPatientServiceRequest(owner.actor, { requestId: rejected.requestId, reason: "ไม่อนุมัติ" });
    await expect(confirmPatientServiceRequest(owner.actor, confirmInput(rejected.requestId, osm.userId))).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("serializes concurrent confirmations into exactly one appointment and no assignment", async () => {
    const hospital = await createHospital("CORE-REQUEST-CONCURRENT-REVIEW");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const patient = await createActivePatient({ hospitalId: hospital.id });
    const service = PatientServiceCode.SCREENING;
    const patientActor: ActorContext = {
      userId: patient.userId,
      personId: patient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    const osm = await createOsm({ hospitalId: hospital.id });
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, serviceCode: service }));
    const results = await Promise.allSettled([
      confirmPatientServiceRequest(owner.actor, confirmInput(request.requestId, osm.userId)),
      confirmPatientServiceRequest(owner.actor, confirmInput(request.requestId, osm.userId)),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled").length).toBe(1);
    expect(await prisma.patientServiceRequest.findUniqueOrThrow({ where: { id: request.requestId }, select: { status: true } }))
      .toEqual({ status: PatientServiceRequestStatus.STARTED });
    expect(await prisma.patientAppointment.count({ where: { sourceServiceRequestId: request.requestId } })).toBe(1);
    expect(await prisma.patientOsmAssignment.count({ where: { patientHospitalRelationshipId: patient.relationshipId } })).toBe(0);
  });

  it("does not confirm a request without an อสม.", async () => {
    const hospital = await createHospital("CORE-REQUEST-UNASSIGNED-APPROVAL");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const patient = await createActivePatient({ hospitalId: hospital.id });
    const service = PatientServiceCode.SCREENING;
    const patientActor: ActorContext = {
      userId: patient.userId,
      personId: patient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, serviceCode: service }));
    const withoutOsm = { ...confirmInput(request.requestId, randomUUID()), osmUserId: undefined };
    await expect(confirmPatientServiceRequest(owner.actor, withoutOsm))
      .rejects.toMatchObject({ code: "VALIDATION" });
    expect(await prisma.patientServiceRequest.findUniqueOrThrow({ where: { id: request.requestId }, select: { status: true } }))
      .toEqual({ status: PatientServiceRequestStatus.PENDING });
  });

  it("enforces the partial unique unresolved-request index for concurrent Patient creates", async () => {
    const hospital = await createHospital("CORE-REQUEST-CONCURRENT-DUP");
    const patient = await createActivePatient({ hospitalId: hospital.id });
    const service = PatientServiceCode.SCREENING;
    const patientActor: ActorContext = {
      userId: patient.userId,
      personId: patient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };

    const results = await Promise.allSettled([
      createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, serviceCode: service })),
      createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, serviceCode: service })),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(await prisma.patientServiceRequest.count({ where: { patientHospitalRelationshipId: patient.relationshipId, status: { in: [PatientServiceRequestStatus.PENDING, PatientServiceRequestStatus.APPROVED] } } })).toBe(1);
  });
});

describe("Service request appointments (ADR-0023, SR-B)", () => {
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

  async function setupVisit(code: string) {
    const hospital = await createHospital(code);
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const assignedOsm = await createOsm({ hospitalId: hospital.id });
    const visitOsm = await createOsm({ hospitalId: hospital.id });
    const otherOsm = await createOsm({ hospitalId: hospital.id });
    const patient = await createActivePatient({ hospitalId: hospital.id });
    const service = PatientServiceCode.EMPOWERMENT;
    const patientActor: ActorContext = {
      userId: patient.userId,
      personId: patient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    await assignOsmToPatient(owner.actor, { patientHospitalRelationshipId: patient.relationshipId, osmUserId: assignedOsm.userId });
    return { hospital, owner, assignedOsm, visitOsm, otherOsm, patient, patientActor, service };
  }

  async function assignmentSnapshot(relationshipId: string) {
    return prisma.patientOsmAssignment.findMany({
      where: { patientHospitalRelationshipId: relationshipId },
      orderBy: { createdAt: "asc" },
      select: { id: true, osmUserId: true, endedAt: true },
    });
  }

  it("stores the preference, notifies the preferred อสม. once and confirms a one-off visit without touching the assignment", async () => {
    const { owner, assignedOsm, visitOsm, patient, patientActor, service } = await setupVisit("SRB-CONFIRM");
    const preferredDate = preferredDateAhead(5);
    const request = await createPatientServiceRequest(patientActor, requestInput({
      relationshipId: patient.relationshipId,
      serviceCode: service,
      preferredOsmRelationshipId: visitOsm.relationshipId,
      preferredDate,
      preferredSlot: "AFTERNOON",
      note: "  สะดวกหลังบ่ายสอง  ",
    }));
    const stored = await prisma.patientServiceRequest.findUniqueOrThrow({
      where: { id: request.requestId },
      select: { preferredDate: true, preferredSlot: true, note: true, preferredOsmUserId: true, createdAt: true },
    });
    expect(stored).toMatchObject({ preferredSlot: "AFTERNOON", note: "สะดวกหลังบ่ายสอง", preferredOsmUserId: visitOsm.userId });
    expect(stored.preferredDate?.toISOString().slice(0, 10)).toBe(preferredDate);
    expect(await prisma.appointmentLineNotification.findMany({
      where: { patientServiceRequestId: request.requestId },
      select: { eventKind: true, recipientKind: true, recipientUserId: true, eventKey: true, appointmentId: true, sourceUpdatedAt: true },
    })).toEqual([{
      eventKind: "OSM_SERVICE_REQUESTED",
      recipientKind: "OSM",
      recipientUserId: visitOsm.userId,
      eventKey: `OSM_SERVICE_REQUESTED:${request.requestId}`,
      appointmentId: null,
      sourceUpdatedAt: stored.createdAt,
    }]);

    const before = await assignmentSnapshot(patient.relationshipId);
    expect(before).toEqual([{ id: expect.any(String), osmUserId: assignedOsm.userId, endedAt: null }]);
    const input = confirmInput(request.requestId, visitOsm.userId, { locationDetail: "บ้านเลขที่ 12", note: "นำแบบประเมินไปด้วย" });
    const confirmed = await confirmPatientServiceRequest(owner.actor, input);
    expect(await prisma.patientAppointment.findUniqueOrThrow({
      where: { id: confirmed.appointmentId },
      select: { type: true, serviceCode: true, locationType: true, assignedOsmUserId: true, sourceServiceRequestId: true, status: true, locationDetail: true },
    })).toEqual({
      type: "EDUCATION",
      serviceCode: PatientServiceCode.EMPOWERMENT,
      locationType: "HOME_VISIT",
      assignedOsmUserId: visitOsm.userId,
      sourceServiceRequestId: request.requestId,
      status: "SCHEDULED",
      locationDetail: "บ้านเลขที่ 12",
    });
    expect(await prisma.patientServiceRequest.findUniqueOrThrow({ where: { id: request.requestId }, select: { status: true, reviewedByUserId: true, startedByUserId: true } }))
      .toEqual({ status: PatientServiceRequestStatus.STARTED, reviewedByUserId: owner.userId, startedByUserId: owner.userId });
    const ownRequests = await listOwnPatientServiceRequests(patientActor);
    expect(ownRequests[0]?.requests[0]).toMatchObject({ appointmentId: confirmed.appointmentId, relationshipId: patient.relationshipId, status: "STARTED" });
    const patientDetail = await getOwnPatientAppointmentDetail(patientActor, patient.relationshipId, confirmed.appointmentId);
    expect(patientDetail).toMatchObject({ serviceCode: "EMPOWERMENT", source: "PATIENT_REQUEST" });
    expect(patientDetail).not.toHaveProperty("sourceServiceRequestId");
    expect(patientDetail).not.toHaveProperty("isOneOffVisit");
    const hub = await listOwnPatientAppointmentHub(patientActor, {});
    expect(hub.appointments[0]).toMatchObject({ serviceCode: "EMPOWERMENT", source: "PATIENT_REQUEST" });
    for (const projected of [
      await getAppointmentDetail(owner.actor, patient.relationshipId, confirmed.appointmentId),
      (await getAppointmentHistory(owner.actor, patient.relationshipId)).items[0],
      (await listWorkAppointments(owner.actor, { hospitalId: owner.actor.hospitalMemberships[0]?.hospitalId })).items[0],
    ]) expect(projected).toMatchObject({ serviceCode: "EMPOWERMENT", source: "PATIENT_REQUEST", isOneOffVisit: true });
    // SR-D2: the patient's assignment is unchanged.
    expect(await assignmentSnapshot(patient.relationshipId)).toEqual(before);
    // The staff-booked appointment notifications fire, the visiting อสม. hears about the visit.
    expect(await prisma.appointmentLineNotification.count({
      where: { appointmentId: confirmed.appointmentId, eventKind: "OSM_APPOINTMENT_ASSIGNED", recipientUserId: visitOsm.userId },
    })).toBe(1);
    expect(await prisma.appointmentLineNotification.count({
      where: { appointmentId: confirmed.appointmentId, recipientUserId: assignedOsm.userId },
    })).toBe(0);

    // Idempotent by nonce: the retry returns the same appointment and writes nothing.
    await expect(confirmPatientServiceRequest(owner.actor, input)).resolves.toEqual(confirmed);
    expect(await prisma.patientAppointment.count({ where: { sourceServiceRequestId: request.requestId } })).toBe(1);
    await expect(confirmPatientServiceRequest(owner.actor, { ...input, scheduledAt: new Date(Date.now() + 4 * DAY_MS).toISOString() }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    await expect(confirmPatientServiceRequest(owner.actor, confirmInput(request.requestId, visitOsm.userId)))
      .rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("SR-C paginates pending requests by preferred date, then recency/id, with legacy dates last", async () => {
    const { hospital, owner, service } = await setupVisit("SRC-QUEUE");
    const rows: Array<{ id: string; date: string | null; createdAt: Date }> = [];
    // Enough equal dates and legacy rows to cross both date and null-date page boundaries.
    for (let index = 0; index < 43; index += 1) {
      const patient = await createActivePatient({ hospitalId: hospital.id });
      const date = index < 21 ? preferredDateAhead(2) : index < 24 ? preferredDateAhead(6) : null;
      const createdAt = new Date(Date.UTC(2026, 9, 1, 0, index % 3));
      const row = await prisma.patientServiceRequest.create({ data: {
        patientHospitalRelationshipId: patient.relationshipId, hospitalId: hospital.id, serviceCode: service,
        requestedByUserId: patient.userId, preferredDate: date ? serviceDateToUtcDate(date) : null,
        preferredSlot: date ? "ANY" : null, createdAt,
      }, select: { id: true } });
      rows.push({ id: row.id, date, createdAt });
    }
    const expected = [...rows].sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
    const first = await listHospitalPatientServiceRequests(owner.actor);
    const second = await listHospitalPatientServiceRequests(owner.actor, {}, { group: "PENDING", after: first.nextCursor ?? undefined });
    const third = await listHospitalPatientServiceRequests(owner.actor, {}, { group: "PENDING", after: second.nextCursor ?? undefined });
    expect(first.nextCursor?.preferredDate).toBe(preferredDateAhead(2));
    expect(second.nextCursor?.preferredDate).toBeNull();
    expect(third.nextCursor).toBeNull();
    expect([...first.requests, ...second.requests, ...third.requests].map((row) => row.requestId)).toEqual(expected.map((row) => row.id));
  });

  it("notifies the assigned อสม. when the patient leaves the choice to the hospital, and nobody when there is none", async () => {
    const { assignedOsm, patient, patientActor, service, hospital } = await setupVisit("SRB-NOTIFY");
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, serviceCode: service }));
    expect(await prisma.appointmentLineNotification.findMany({
      where: { patientServiceRequestId: request.requestId },
      select: { recipientUserId: true },
    })).toEqual([{ recipientUserId: assignedOsm.userId }]);

    const unassigned = await createActivePatient({ hospitalId: hospital.id });
    const unassignedActor: ActorContext = { userId: unassigned.userId, personId: unassigned.personId, roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] };
    const silent = await createPatientServiceRequest(unassignedActor, requestInput({ relationshipId: unassigned.relationshipId, serviceCode: service }));
    expect(await prisma.appointmentLineNotification.count({ where: { patientServiceRequestId: silent.requestId } })).toBe(0);
  });

  it("validates the preferred date on the server clock and rejects a second open request for the service", async () => {
    const { patient, patientActor, service } = await setupVisit("SRB-WINDOW");
    // 2026-11-01 10:00 Asia/Bangkok: the window is 2026-11-02 .. 2026-12-31.
    const now = () => new Date("2026-11-01T03:00:00.000Z");
    for (const preferredDate of ["2026-11-01", "2027-01-01"]) {
      await expect(createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, serviceCode: service, preferredDate }), { now }))
        .rejects.toMatchObject({ code: "VALIDATION" });
    }
    await expect(createPatientServiceRequest(patientActor, { relationshipId: patient.relationshipId, serviceCode: service, preferredOsmRelationshipId: null }, { now }))
      .rejects.toMatchObject({ code: "VALIDATION" });
    await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, serviceCode: service, preferredDate: "2026-12-31" }), { now });
    await expect(createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, serviceCode: service, preferredDate: "2026-11-02" }), { now }))
      .rejects.toMatchObject({ code: "CONFLICT", message: DUPLICATE_OPEN_SERVICE_REQUEST_MESSAGE });
    expect(await prisma.patientServiceRequest.count({ where: { patientHospitalRelationshipId: patient.relationshipId } })).toBe(1);
  });

  it("gives the visiting อสม. that appointment only, while it is SCHEDULED and until 24 hours after its time", async () => {
    const { owner, hospital, visitOsm, otherOsm, patient, patientActor, service } = await setupVisit("SRB-ACCESS");
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, serviceCode: service }));
    const { appointmentId } = await confirmPatientServiceRequest(owner.actor, confirmInput(request.requestId, visitOsm.userId));
    const relationshipId = patient.relationshipId;

    const detail = await getAppointmentDetail(visitOsm.actor, relationshipId, appointmentId);
    expect(detail).toMatchObject({
      appointmentId,
      patient: { displayName: "สมชาย ผู้ป่วย" },
      canAcceptAssignment: true,
      canProxyPatientActions: true,
      canManage: false,
      canHospitalManage: false,
      serviceCode: PatientServiceCode.EMPOWERMENT,
      fromServiceRequest: true,
      source: "PATIENT_REQUEST",
      isOneOffVisit: true,
    });
    const upcoming = await listWorkAppointments(visitOsm.actor, { hospitalId: hospital.id, tab: "UPCOMING" });
    expect(upcoming.items.map((item) => item.appointmentId)).toEqual([appointmentId]);
    expect(upcoming.items[0]).toMatchObject({ serviceCode: "EMPOWERMENT", source: "PATIENT_REQUEST", isOneOffVisit: true });
    expect(upcoming.items[0]?.osmAcceptanceStatus).toBe("WAITING");
    const awaiting = await listWorkAppointments(visitOsm.actor, { hospitalId: hospital.id, tab: "AWAITING_MY_ACCEPTANCE" });
    expect(awaiting.items.map((item) => item.appointmentId)).toEqual([appointmentId]);
    await expect(countWorkAppointmentsAwaitingMyAcceptance(visitOsm.actor)).resolves.toBe(1);

    // Another อสม. of the same Hospital sees nothing.
    await expect(getAppointmentDetail(otherOsm.actor, relationshipId, appointmentId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await listWorkAppointments(otherOsm.actor, { hospitalId: hospital.id, tab: "UPCOMING" })).items).toEqual([]);

    // Nothing beyond the appointment: no patient directory, profile, Program, screening, follow-ups or history.
    for (const read of [
      () => getAppointmentHistory(visitOsm.actor, relationshipId),
      () => getPatientDirectoryDetail(visitOsm.actor, relationshipId),
      () => getStaffPatientHospitalProfile(visitOsm.actor, relationshipId),
      () => getPatientProgramPageContext(visitOsm.actor, relationshipId),
      () => getScreeningHistory(visitOsm.actor, relationshipId),
      () => getFollowupHistory(visitOsm.actor, relationshipId),
    ]) {
      await expect(read()).rejects.toMatchObject({ code: expect.stringMatching(/^(FORBIDDEN|NOT_FOUND)$/u) });
    }
    // Nor managing it: editing and staff transitions stay with the Hospital.
    const current = await prisma.patientAppointment.findUniqueOrThrow({ where: { id: appointmentId } });
    await expect(rescheduleAppointment(visitOsm.actor, {
      patientHospitalRelationshipId: relationshipId,
      appointmentId,
      expectedUpdatedAt: current.updatedAt.toISOString(),
      scheduledAt: new Date(current.scheduledAt.getTime() + DAY_MS).toISOString(),
      type: "EDUCATION",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    // The appointment actions of its อสม.
    await expect(acceptAppointmentAssignment(visitOsm.actor, {
      patientHospitalRelationshipId: relationshipId,
      appointmentId,
      sourceAppointmentUpdatedAt: current.updatedAt.toISOString(),
      submissionNonce: randomUUID(),
    })).resolves.toMatchObject({ appointmentId });
    await expect(acknowledgeAppointmentOnBehalfOfPatient(visitOsm.actor, {
      patientHospitalRelationshipId: relationshipId,
      appointmentId,
      expectedUpdatedAt: current.updatedAt.toISOString(),
    })).resolves.toMatchObject({ appointmentId, source: "OSM_PROXY" });
    await expect(recordAppointmentCoordination(visitOsm.actor, {
      patientHospitalRelationshipId: relationshipId,
      appointmentId,
      submissionNonce: randomUUID(),
    })).resolves.toMatchObject({ appointmentId });
    await expect(submitAppointmentRescheduleRequest(visitOsm.actor, {
      patientHospitalRelationshipId: relationshipId,
      appointmentId,
      expectedUpdatedAt: current.updatedAt.toISOString(),
      submissionNonce: randomUUID(),
      preferredDatetimes: [new Date(Date.now() + 5 * DAY_MS).toISOString()],
      reason: "ติดธุระวันนั้น",
    })).resolves.toMatchObject({ appointmentId });
    expect(await prisma.appointmentLineNotification.count({
      where: { appointmentId, eventKind: "OSM_RESCHEDULE_REQUESTED", recipientUserId: owner.userId },
    })).toBe(1);
    await expect(acceptAppointmentAssignment(otherOsm.actor, {
      patientHospitalRelationshipId: relationshipId,
      appointmentId,
      sourceAppointmentUpdatedAt: current.updatedAt.toISOString(),
      submissionNonce: randomUUID(),
    })).rejects.toMatchObject({ code: "FORBIDDEN" });

    // The window: up to 24 hours after the scheduled time.
    await prisma.patientAppointment.update({ where: { id: appointmentId }, data: { scheduledAt: new Date(Date.now() - 23 * 60 * 60 * 1000) } });
    await expect(getAppointmentDetail(visitOsm.actor, relationshipId, appointmentId)).resolves.toMatchObject({ appointmentId });
    expect((await listWorkAppointments(visitOsm.actor, { hospitalId: hospital.id, tab: "HISTORY" })).items.map((item) => item.appointmentId)).toEqual([appointmentId]);
    await prisma.patientAppointment.update({ where: { id: appointmentId }, data: { scheduledAt: new Date(Date.now() - 25 * 60 * 60 * 1000) } });
    await expect(getAppointmentDetail(visitOsm.actor, relationshipId, appointmentId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await listWorkAppointments(visitOsm.actor, { hospitalId: hospital.id, tab: "HISTORY" })).items).toEqual([]);

    // And only while SCHEDULED.
    await prisma.patientAppointment.update({ where: { id: appointmentId }, data: { scheduledAt: new Date(Date.now() + DAY_MS) } });
    await expect(getAppointmentDetail(visitOsm.actor, relationshipId, appointmentId)).resolves.toMatchObject({ appointmentId });
    const scheduled = await prisma.patientAppointment.findUniqueOrThrow({ where: { id: appointmentId } });
    await completeAppointment(owner.actor, { patientHospitalRelationshipId: relationshipId, appointmentId, expectedUpdatedAt: scheduled.updatedAt.toISOString() });
    await expect(getAppointmentDetail(visitOsm.actor, relationshipId, appointmentId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await listWorkAppointments(visitOsm.actor, { hospitalId: hospital.id, tab: "HISTORY" })).items).toEqual([]);
    await expect(countWorkAppointmentsAwaitingMyAcceptance(visitOsm.actor)).resolves.toBe(0);
  });

  it("ends the visiting อสม.'s access when the appointment is cancelled", async () => {
    const { owner, visitOsm, patient, patientActor, service } = await setupVisit("SRB-CANCEL");
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, serviceCode: service }));
    const { appointmentId } = await confirmPatientServiceRequest(owner.actor, confirmInput(request.requestId, visitOsm.userId));
    const current = await prisma.patientAppointment.findUniqueOrThrow({ where: { id: appointmentId } });
    await cancelAppointment(owner.actor, { patientHospitalRelationshipId: patient.relationshipId, appointmentId, expectedUpdatedAt: current.updatedAt.toISOString() });
    await expect(getAppointmentDetail(visitOsm.actor, patient.relationshipId, appointmentId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("books any อสม. of the Hospital for a hospital appointment and sets the type from an optional service (ADR-0027)", async () => {
    const { owner, assignedOsm, visitOsm, patient, patientActor, service } = await setupVisit("SRB-HOSPITAL");
    const booking = {
      patientHospitalRelationshipId: patient.relationshipId,
      scheduledAt: new Date(Date.now() + 3 * DAY_MS).toISOString(),
      locationType: "HOME_VISIT",
      responsibleUserId: null,
    };
    const oneOff = await createAppointment(owner.actor, { ...booking, submissionNonce: randomUUID(), type: "FOLLOW_UP", assignedOsmUserId: visitOsm.userId });
    await expect(getAppointmentDetail(visitOsm.actor, patient.relationshipId, oneOff.appointmentId))
      .resolves.toMatchObject({ source: "HOSPITAL", isOneOffVisit: true });
    const booked = await createAppointment(owner.actor, { ...booking, submissionNonce: randomUUID(), serviceCode: "SCREENING", assignedOsmUserId: assignedOsm.userId });
    expect(await prisma.patientAppointment.findUniqueOrThrow({ where: { id: booked.appointmentId }, select: { type: true, serviceCode: true, sourceServiceRequestId: true } }))
      .toEqual({ type: "ASSESSMENT", serviceCode: "SCREENING", sourceServiceRequestId: null });
    await expect(createAppointment(owner.actor, { ...booking, submissionNonce: randomUUID(), serviceCode: "SCREENING", type: "FOLLOW_UP" }))
      .rejects.toMatchObject({ code: "VALIDATION" });

    // Staff may still edit a confirmed visit: its อสม. stays, its type follows the service.
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, serviceCode: service }));
    const { appointmentId } = await confirmPatientServiceRequest(owner.actor, confirmInput(request.requestId, visitOsm.userId));
    const current = await prisma.patientAppointment.findUniqueOrThrow({ where: { id: appointmentId } });
    const edit = {
      patientHospitalRelationshipId: patient.relationshipId,
      appointmentId,
      expectedUpdatedAt: current.updatedAt.toISOString(),
      scheduledAt: new Date(current.scheduledAt.getTime() + DAY_MS).toISOString(),
      assignedOsmUserId: visitOsm.userId,
      locationType: "HOME_VISIT",
      responsibleUserId: null,
    };
    await expect(rescheduleAppointment(owner.actor, { ...edit, type: "FOLLOW_UP" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(rescheduleAppointment(owner.actor, { ...edit, type: "EDUCATION" })).resolves.toMatchObject({ appointmentId });
    expect(await prisma.patientAppointment.findUniqueOrThrow({ where: { id: appointmentId }, select: { assignedOsmUserId: true, serviceCode: true } }))
      .toEqual({ assignedOsmUserId: visitOsm.userId, serviceCode: PatientServiceCode.EMPOWERMENT });
  });

  it("rejects only with a reason, which the patient sees", async () => {
    const { owner, visitOsm, patient, patientActor, service } = await setupVisit("SRB-REJECT");
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, serviceCode: service }));
    for (const reason of [undefined, "   ", "ก".repeat(501)]) {
      await expect(rejectPatientServiceRequest(owner.actor, { requestId: request.requestId, reason })).rejects.toMatchObject({ code: "VALIDATION" });
    }
    await expect(rejectPatientServiceRequest(owner.actor, { requestId: request.requestId, reason: "  ช่วงนี้ไม่มี อสม. ว่าง  " }))
      .resolves.toBe(PatientServiceRequestStatus.REJECTED);
    expect(await prisma.patientServiceRequest.findUniqueOrThrow({ where: { id: request.requestId }, select: { status: true, rejectionReason: true, reviewedByUserId: true } }))
      .toEqual({ status: PatientServiceRequestStatus.REJECTED, rejectionReason: "ช่วงนี้ไม่มี อสม. ว่าง", reviewedByUserId: owner.userId });
    const own = await listOwnPatientServiceRequests(patientActor);
    expect(own[0]?.requests).toEqual([expect.objectContaining({ requestId: request.requestId, status: "REJECTED", rejectionReason: "ช่วงนี้ไม่มี อสม. ว่าง" })]);
    await expect(rejectPatientServiceRequest(owner.actor, { requestId: request.requestId, reason: "อีกครั้ง" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(confirmPatientServiceRequest(owner.actor, confirmInput(request.requestId, visitOsm.userId))).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("confirms a legacy APPROVED request too", async () => {
    const { owner, visitOsm, patient, patientActor, service } = await setupVisit("SRB-LEGACY");
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, serviceCode: service }));
    await prisma.patientServiceRequest.update({ where: { id: request.requestId }, data: { status: PatientServiceRequestStatus.APPROVED, reviewedByUserId: owner.userId, reviewedAt: new Date() } });
    await expect(rejectPatientServiceRequest(owner.actor, { requestId: request.requestId, reason: "ไม่อนุมัติ" })).rejects.toMatchObject({ code: "CONFLICT" });
    const { appointmentId } = await confirmPatientServiceRequest(owner.actor, confirmInput(request.requestId, visitOsm.userId));
    expect(await prisma.patientServiceRequest.findUniqueOrThrow({ where: { id: request.requestId }, select: { status: true } }))
      .toEqual({ status: PatientServiceRequestStatus.STARTED });
    expect(await prisma.patientAppointment.count({ where: { id: appointmentId, sourceServiceRequestId: request.requestId } })).toBe(1);
  });

  it("sends the request and visit notifications to the visiting อสม. over LINE, and nothing for a closed request", async () => {
    const { owner, visitOsm, patient, patientActor, service, hospital } = await setupVisit("SRB-LINE");
    const lineUserId = `U${randomUUID().replace(/-/gu, "")}`;
    await prisma.lineAccountBinding.create({
      data: {
        userId: visitOsm.userId,
        lineUserId,
        lineSubjectFingerprint: createHash("sha256").update(lineUserId).digest("hex"),
        lineSubjectFingerprintKeyId: "srb-integration-v1",
        reachability: LineReachability.FRIEND,
        reachabilityObservedAt: new Date(),
      },
    });
    await setOwnAppointmentLineNotificationPreference(visitOsm.actor, true, { database: prisma });
    const calls: Array<{ lineUserId: string; text: string }> = [];
    const drain = () => drainAppointmentLineNotificationOutbox({
      database: prisma,
      push: async (to: string, text: string) => {
        calls.push({ lineUserId: to, text });
        return { kind: "ACCEPTED" as const };
      },
      batchSize: 10,
      logSummary: () => undefined,
    });

    const preferredDate = preferredDateAhead(6);
    const request = await createPatientServiceRequest(patientActor, requestInput({
      relationshipId: patient.relationshipId,
      serviceCode: service,
      preferredOsmRelationshipId: visitOsm.relationshipId,
      preferredDate,
      preferredSlot: "AFTERNOON",
    }));
    const other = await createActivePatient({ hospitalId: hospital.id });
    const otherActor: ActorContext = { userId: other.userId, personId: other.personId, roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] };
    const withdrawn = await createPatientServiceRequest(otherActor, requestInput({
      relationshipId: other.relationshipId,
      serviceCode: service,
      preferredOsmRelationshipId: visitOsm.relationshipId,
    }));
    await withdrawOwnPatientServiceRequest(otherActor, { requestId: withdrawn.requestId });
    await drain();
    const thaiDate = new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeZone: "UTC" }).format(serviceDateToUtcDate(preferredDate));
    expect(calls).toEqual([{ lineUserId, text: `มีคำขอรับบริการเสริมพลังใจ วันที่ ${thaiDate} บ่าย กรุณาเข้าสู่ระบบ DEMI เพื่อตรวจสอบ` }]);
    expect(await prisma.appointmentLineNotification.findFirstOrThrow({ where: { patientServiceRequestId: withdrawn.requestId }, select: { state: true, safeOutcome: true } }))
      .toEqual({ state: "SUPPRESSED", safeOutcome: "STALE_SOURCE" });
    expect(JSON.stringify(calls)).not.toContain("สมชาย");

    await confirmPatientServiceRequest(owner.actor, confirmInput(request.requestId, visitOsm.userId));
    await drain();
    expect(calls.slice(1)).toEqual([{ lineUserId, text: "มีนัดเยี่ยมบ้านที่ได้รับมอบหมายให้คุณ กรุณาเข้าสู่ระบบ DEMI เพื่อตรวจสอบ" }]);
  });

  it("is idempotent for a concurrent retry and safe against a concurrent withdrawal", async () => {
    const { owner, visitOsm, patient, patientActor, service, hospital } = await setupVisit("SRB-RACE");
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, serviceCode: service }));
    const input = confirmInput(request.requestId, visitOsm.userId);
    const retried = await Promise.allSettled([
      confirmPatientServiceRequest(owner.actor, input),
      confirmPatientServiceRequest(owner.actor, input),
    ]);
    const fulfilled = retried.filter((result) => result.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    expect(new Set(fulfilled.map((result) => result.value.appointmentId)).size).toBe(1);
    expect(await prisma.patientAppointment.count({ where: { sourceServiceRequestId: request.requestId } })).toBe(1);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const other = await createActivePatient({ hospitalId: hospital.id });
      const otherActor: ActorContext = { userId: other.userId, personId: other.personId, roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] };
      const raced = await createPatientServiceRequest(otherActor, requestInput({ relationshipId: other.relationshipId, serviceCode: service }));
      const results = await Promise.allSettled([
        confirmPatientServiceRequest(owner.actor, confirmInput(raced.requestId, visitOsm.userId)),
        withdrawOwnPatientServiceRequest(otherActor, { requestId: raced.requestId }),
      ]);
      expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
      const final = await prisma.patientServiceRequest.findUniqueOrThrow({ where: { id: raced.requestId }, select: { status: true } });
      const appointments = await prisma.patientAppointment.count({ where: { sourceServiceRequestId: raced.requestId } });
      expect(results[0]?.status === "fulfilled"
        ? { status: PatientServiceRequestStatus.STARTED, appointments: 1 }
        : { status: PatientServiceRequestStatus.WITHDRAWN, appointments: 0 }).toEqual({ status: final.status, appointments });
    }
  });
});

describe("Service request appointments schema (ADR-0023, SR-A)", () => {
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

  it("keeps legacy requests valid and enforces the preference, note, rejection reason and appointment service CHECKs", async () => {
    const hospital = await createHospital("SR-A-CHECKS");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const requestIds = new Map<PatientServiceRequestStatus, string>();
    for (const status of Object.values(PatientServiceRequestStatus)) {
      const patient = await createActivePatient({ hospitalId: hospital.id });
      const created = await prisma.patientServiceRequest.create({
        data: {
          patientHospitalRelationshipId: patient.relationshipId,
          hospitalId: hospital.id,
          serviceCode: PatientServiceCode.SCREENING,
          requestedByUserId: patient.userId,
          status,
        },
        select: { id: true, preferredDate: true, preferredSlot: true, note: true, rejectionReason: true },
      });
      expect(created).toMatchObject({ preferredDate: null, preferredSlot: null, note: null, rejectionReason: null });
      requestIds.set(status, created.id);
    }
    const pendingId = requestIds.get(PatientServiceRequestStatus.PENDING);
    const rejectedId = requestIds.get(PatientServiceRequestStatus.REJECTED);
    if (!pendingId || !rejectedId) throw new Error("fixture needs PENDING and REJECTED requests");

    await expect(prisma.$executeRaw`
      UPDATE "PatientServiceRequest" SET "preferredSlot" = 'MORNING' WHERE "id" = ${pendingId}::uuid`)
      .rejects.toThrow(/PatientServiceRequest_preference_check/u);
    await expect(prisma.$executeRaw`
      UPDATE "PatientServiceRequest" SET "preferredDate" = '2026-11-02' WHERE "id" = ${pendingId}::uuid`)
      .rejects.toThrow(/PatientServiceRequest_preference_check/u);
    await expect(prisma.patientServiceRequest.update({
      where: { id: pendingId },
      data: { preferredDate: new Date("2026-11-02T00:00:00.000Z"), preferredSlot: "ANY", note: "ขอช่วงบ่าย" },
      select: { preferredDate: true, preferredSlot: true, note: true },
    })).resolves.toEqual({ preferredDate: new Date("2026-11-02T00:00:00.000Z"), preferredSlot: "ANY", note: "ขอช่วงบ่าย" });
    for (const note of ["", "  ", " ขอช่วงบ่าย"]) {
      await expect(prisma.$executeRaw`
        UPDATE "PatientServiceRequest" SET "note" = ${note} WHERE "id" = ${pendingId}::uuid`)
        .rejects.toThrow(/PatientServiceRequest_note_check/u);
    }

    await expect(prisma.$executeRaw`
      UPDATE "PatientServiceRequest" SET "rejectionReason" = 'ไม่อยู่ในพื้นที่' WHERE "id" = ${pendingId}::uuid`)
      .rejects.toThrow(/PatientServiceRequest_rejection_reason_check/u);
    await expect(prisma.$executeRaw`
      UPDATE "PatientServiceRequest" SET "rejectionReason" = ' ' WHERE "id" = ${rejectedId}::uuid`)
      .rejects.toThrow(/PatientServiceRequest_rejection_reason_check/u);
    await expect(prisma.$executeRaw`
      UPDATE "PatientServiceRequest" SET "rejectionReason" = 'ไม่อยู่ในพื้นที่' WHERE "id" = ${rejectedId}::uuid`)
      .resolves.toBe(1);
    await expect(prisma.$executeRaw`
      UPDATE "PatientServiceRequest" SET "status" = 'PENDING' WHERE "id" = ${rejectedId}::uuid`)
      .rejects.toThrow(/PatientServiceRequest_rejection_reason_check/u);

    const sourced = await prisma.patientServiceRequest.findUniqueOrThrow({
      where: { id: pendingId },
      select: { id: true, patientHospitalRelationshipId: true },
    });
    const appointment = {
      patientHospitalRelationshipId: sourced.patientHospitalRelationshipId,
      createdByUserId: owner.userId,
      type: "ASSESSMENT" as const,
      scheduledAt: new Date("2030-01-01T03:30:00.000Z"),
    };
    await expect(prisma.patientAppointment.create({
      data: { ...appointment, sourceServiceRequestId: sourced.id, submissionNonce: randomUUID() },
    })).rejects.toThrow(/PatientAppointment_source_request_service_check/u);
    await expect(prisma.patientAppointment.create({
      data: { ...appointment, sourceServiceRequestId: sourced.id, serviceCode: "SCREENING", submissionNonce: randomUUID() },
      select: { serviceCode: true },
    })).resolves.toEqual({ serviceCode: "SCREENING" });
    await expect(prisma.patientAppointment.create({
      data: { ...appointment, submissionNonce: randomUUID() },
      select: { serviceCode: true },
    })).resolves.toEqual({ serviceCode: null });
  });
});

describe("Native patient services migration (ADR-0029)", () => {
  const migrationSql = readFileSync(
    resolve(process.cwd(), "prisma/migrations/20261205100000_native_patient_services/migration.sql"),
    "utf8",
  );
  // Statements are separated by a blank line; the DO blocks have none inside.
  const statements = migrationSql
    .split(/;\s*\n\s*\n/u)
    .map((statement) => statement.replace(/^\s*--.*$/gmu, "").trim().replace(/;$/u, ""))
    .filter(Boolean);
  const rollback = new Error("roll back the ADR-0029 migration rehearsal");

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Temporary tables shadow the real ones for this transaction only, in their shape before the migration.
  // Unconstrained tables hold rows only a damaged database could have, to rehearse the migration's guards.
  async function createLegacyTables(transaction: Prisma.TransactionClient, options: { constrained: boolean }): Promise<void> {
    await transaction.$executeRawUnsafe(`
      CREATE TEMPORARY TABLE "HospitalServiceOffering" (
        "id" UUID PRIMARY KEY, "hospitalId" UUID NOT NULL, "code" "PatientServiceCode" NOT NULL,
        UNIQUE ("id", "hospitalId")${options.constrained ? ', UNIQUE ("hospitalId", "code")' : ""}
      ) ON COMMIT DROP`);
    await transaction.$executeRawUnsafe(`
      CREATE TEMPORARY TABLE "PatientServiceRequest" (
        "id" UUID PRIMARY KEY, "patientHospitalRelationshipId" UUID NOT NULL, "hospitalId" UUID NOT NULL,
        "offeringId" UUID NOT NULL, "status" "PatientServiceRequestStatus" NOT NULL
      ) ON COMMIT DROP`);
    if (options.constrained) {
      await transaction.$executeRawUnsafe(`
        ALTER TABLE "PatientServiceRequest" ADD CONSTRAINT "PatientServiceRequest_offeringId_hospitalId_fkey"
          FOREIGN KEY ("offeringId", "hospitalId") REFERENCES "HospitalServiceOffering"("id", "hospitalId")`);
    }
    await transaction.$executeRawUnsafe(`CREATE INDEX "PatientServiceRequest_offeringId_idx" ON "PatientServiceRequest"("offeringId")`);
    await transaction.$executeRawUnsafe(`
      CREATE UNIQUE INDEX "PatientServiceRequest_one_unresolved_key" ON "PatientServiceRequest"("patientHospitalRelationshipId", "offeringId")
        WHERE "status" IN ('PENDING', 'APPROVED')`);
  }

  async function runMigration(transaction: Prisma.TransactionClient): Promise<void> {
    for (const statement of statements) {
      await transaction.$executeRawUnsafe(statement);
    }
  }

  it("copies each request's service code, makes it required, and keys one open request per service", async () => {
    const [hospitalA, hospitalB, relationshipA, relationshipB] = Array.from({ length: 4 }, () => randomUUID());
    const offering = {
      aScreening: randomUUID(), aFollowUp: randomUUID(), aEmpowerment: randomUUID(), bScreening: randomUUID(),
    };
    const requests = [
      { id: randomUUID(), relationshipId: relationshipA, hospitalId: hospitalA, offeringId: offering.aScreening, status: "PENDING", code: "SCREENING" },
      { id: randomUUID(), relationshipId: relationshipA, hospitalId: hospitalA, offeringId: offering.aScreening, status: "REJECTED", code: "SCREENING" },
      { id: randomUUID(), relationshipId: relationshipA, hospitalId: hospitalA, offeringId: offering.aFollowUp, status: "APPROVED", code: "FOLLOW_UP" },
      { id: randomUUID(), relationshipId: relationshipA, hospitalId: hospitalA, offeringId: offering.aEmpowerment, status: "STARTED", code: "EMPOWERMENT" },
      { id: randomUUID(), relationshipId: relationshipB, hospitalId: hospitalB, offeringId: offering.bScreening, status: "WITHDRAWN", code: "SCREENING" },
    ] as const;

    await expect(prisma.$transaction(async (transaction) => {
      await createLegacyTables(transaction, { constrained: true });
      await transaction.$executeRaw`
        INSERT INTO "HospitalServiceOffering" ("id", "hospitalId", "code") VALUES
          (${offering.aScreening}::uuid, ${hospitalA}::uuid, 'SCREENING'),
          (${offering.aFollowUp}::uuid, ${hospitalA}::uuid, 'FOLLOW_UP'),
          (${offering.aEmpowerment}::uuid, ${hospitalA}::uuid, 'EMPOWERMENT'),
          (${offering.bScreening}::uuid, ${hospitalB}::uuid, 'SCREENING')`;
      for (const request of requests) {
        await transaction.$executeRaw`
          INSERT INTO "PatientServiceRequest" ("id", "patientHospitalRelationshipId", "hospitalId", "offeringId", "status")
          VALUES (${request.id}::uuid, ${request.relationshipId}::uuid, ${request.hospitalId}::uuid, ${request.offeringId}::uuid,
                  ${request.status}::"PatientServiceRequestStatus")`;
      }

      await runMigration(transaction);

      const migrated = await transaction.$queryRaw<Array<{ id: string; serviceCode: PatientServiceCode; status: PatientServiceRequestStatus }>>`
        SELECT "id"::text AS "id", "serviceCode", "status" FROM "PatientServiceRequest"`;
      expect(new Map(migrated.map(({ id, serviceCode, status }) => [id, [serviceCode, status]])))
        .toEqual(new Map(requests.map(({ id, code, status }) => [id, [code, status]])));
      const columns = await transaction.$queryRaw<Array<{ column: string; nullable: string }>>`
        SELECT "column_name" AS "column", "is_nullable" AS "nullable" FROM information_schema.columns
        WHERE "table_schema" = pg_my_temp_schema()::regnamespace::text AND "table_name" = 'PatientServiceRequest'
        ORDER BY "column_name"`;
      expect(columns).toContainEqual({ column: "serviceCode", nullable: "NO" });
      expect(columns.map(({ column }) => column)).not.toContain("offeringId");
      const [catalog] = await transaction.$queryRaw<Array<{ remaining: string | null }>>`
        SELECT to_regclass('pg_temp."HospitalServiceOffering"')::text AS "remaining"`;
      expect(catalog?.remaining).toBeNull();
      const indexes = await transaction.$queryRaw<Array<{ name: string; definition: string }>>`
        SELECT "indexname" AS "name", "indexdef" AS "definition" FROM pg_indexes
        WHERE "schemaname" = pg_my_temp_schema()::regnamespace::text AND "tablename" = 'PatientServiceRequest'`;
      expect(indexes.map(({ name }) => name).sort()).toEqual(["PatientServiceRequest_one_unresolved_key", "PatientServiceRequest_pkey"]);
      expect(indexes.find(({ name }) => name === "PatientServiceRequest_one_unresolved_key")?.definition)
        .toMatch(/UNIQUE INDEX .*\("patientHospitalRelationshipId", "serviceCode"\) WHERE .*PENDING.*APPROVED/u);

      // A WITHDRAWN request does not hold its service; an open one does (next rehearsal).
      await transaction.$executeRaw`
        INSERT INTO "PatientServiceRequest" ("id", "patientHospitalRelationshipId", "hospitalId", "serviceCode", "status")
        VALUES (gen_random_uuid(), ${relationshipB}::uuid, ${hospitalB}::uuid, 'SCREENING', 'PENDING')`;
      throw rollback;
    })).rejects.toBe(rollback);

    await expect(prisma.$transaction(async (transaction) => {
      await createLegacyTables(transaction, { constrained: true });
      await transaction.$executeRaw`
        INSERT INTO "HospitalServiceOffering" ("id", "hospitalId", "code") VALUES (${offering.aScreening}::uuid, ${hospitalA}::uuid, 'SCREENING')`;
      await transaction.$executeRaw`
        INSERT INTO "PatientServiceRequest" ("id", "patientHospitalRelationshipId", "hospitalId", "offeringId", "status")
        VALUES (gen_random_uuid(), ${relationshipA}::uuid, ${hospitalA}::uuid, ${offering.aScreening}::uuid, 'PENDING')`;
      await runMigration(transaction);
      await transaction.$executeRaw`
        INSERT INTO "PatientServiceRequest" ("id", "patientHospitalRelationshipId", "hospitalId", "serviceCode", "status")
        VALUES (gen_random_uuid(), ${relationshipA}::uuid, ${hospitalA}::uuid, 'SCREENING', 'APPROVED')`;
    })).rejects.toThrow(/Key \("patientHospitalRelationshipId", "serviceCode"\)=\(.*, SCREENING\) already exists/u);
  });

  it("refuses a request whose service cannot be resolved, reporting the count", async () => {
    await expect(prisma.$transaction(async (transaction) => {
      await createLegacyTables(transaction, { constrained: false });
      await transaction.$executeRaw`
        INSERT INTO "PatientServiceRequest" ("id", "patientHospitalRelationshipId", "hospitalId", "offeringId", "status")
        VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'PENDING')`;
      await runMigration(transaction);
    })).rejects.toThrow(/ADR-0029: 1 PatientServiceRequest\(s\) have no service code/u);
  });

  it("refuses two open requests that resolve to the same relationship and service", async () => {
    const [hospitalId, relationshipId, first, second] = Array.from({ length: 4 }, () => randomUUID());
    await expect(prisma.$transaction(async (transaction) => {
      await createLegacyTables(transaction, { constrained: false });
      await transaction.$executeRaw`
        INSERT INTO "HospitalServiceOffering" ("id", "hospitalId", "code") VALUES
          (${first}::uuid, ${hospitalId}::uuid, 'SCREENING'), (${second}::uuid, ${hospitalId}::uuid, 'SCREENING')`;
      await transaction.$executeRaw`
        INSERT INTO "PatientServiceRequest" ("id", "patientHospitalRelationshipId", "hospitalId", "offeringId", "status") VALUES
          (gen_random_uuid(), ${relationshipId}::uuid, ${hospitalId}::uuid, ${first}::uuid, 'PENDING'),
          (gen_random_uuid(), ${relationshipId}::uuid, ${hospitalId}::uuid, ${second}::uuid, 'APPROVED')`;
      await runMigration(transaction);
    })).rejects.toThrow(/ADR-0029: 1 relationship\/service pair\(s\) have more than one open PatientServiceRequest/u);
  });

  it("leaves the migrated database with a required service code, the per-service partial unique index and no catalog", async () => {
    const [catalog] = await prisma.$queryRaw<Array<{ remaining: string | null }>>`
      SELECT to_regclass('public."HospitalServiceOffering"')::text AS "remaining"`;
    expect(catalog?.remaining).toBeNull();
    const columns = await prisma.$queryRaw<Array<{ column: string; nullable: string }>>`
      SELECT "column_name" AS "column", "is_nullable" AS "nullable" FROM information_schema.columns
      WHERE "table_schema" = 'public' AND "table_name" = 'PatientServiceRequest' AND "column_name" IN ('serviceCode', 'offeringId')`;
    expect(columns).toEqual([{ column: "serviceCode", nullable: "NO" }]);
    const [index] = await prisma.$queryRaw<Array<{ definition: string }>>`
      SELECT "indexdef" AS "definition" FROM pg_indexes
      WHERE "schemaname" = 'public' AND "indexname" = 'PatientServiceRequest_one_unresolved_key'`;
    expect(index?.definition).toMatch(/UNIQUE INDEX .*\("patientHospitalRelationshipId", "serviceCode"\) WHERE .*PENDING.*APPROVED/u);
    // Historical audit rows keep their text; AuditEvent.resourceId never referenced the catalog.
    const auditForeignKeys = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT "conname" AS "name" FROM pg_constraint
      WHERE "conrelid" = 'public."AuditEvent"'::regclass AND "contype" = 'f'`;
    expect(auditForeignKeys.map(({ name }) => name)).toEqual(["AuditEvent_actorUserId_fkey"]);
  });
});
