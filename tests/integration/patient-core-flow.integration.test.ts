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
import {
  getAppointmentDetail,
  getAppointmentHistory,
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
  listManagedHospitalServiceCatalog,
  setHospitalServiceOffering,
} from "@/modules/patient-service-requests/services/patient-service-catalog-service";
import {
  DUPLICATE_OPEN_SERVICE_REQUEST_MESSAGE,
  confirmPatientServiceRequest,
  createPatientServiceRequest,
  listHospitalPatientServiceRequests,
  listOwnPatientServiceRequests,
  rejectPatientServiceRequest,
  withdrawOwnPatientServiceRequest,
} from "@/modules/patient-service-requests/services/patient-service-request-service";

const prisma = getPrisma();
const nationalId = "1000000000009";
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

const DAY_MS = 24 * 60 * 60 * 1000;

/** SR-D6: a week ahead on the Bangkok calendar is inside the tomorrow..+60 days window. */
function preferredDateAhead(days = 7): string {
  return toServiceDateOnly(new Date(Date.now() + days * DAY_MS));
}

function requestInput(input: {
  relationshipId: string;
  offeringId: string;
  preferredOsmRelationshipId?: string | null;
  preferredDate?: string;
  preferredSlot?: "MORNING" | "AFTERNOON" | "ANY";
  note?: string;
}) {
  return {
    relationshipId: input.relationshipId,
    offeringId: input.offeringId,
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
    expect(projection[0]?.osmChoices).toEqual([{ relationshipId: osmA.relationshipId, displayName: "สมใจ อสม.", assigned: false }]);
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
      await expect(confirmPatientServiceRequest(denied, confirmInput(request.requestId, osm.userId))).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(rejectPatientServiceRequest(denied, { requestId: request.requestId, reason: "ไม่อนุมัติ" })).rejects.toMatchObject({ code: "FORBIDDEN" });
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

  it("confirms a request into its appointment atomically, without assigning the อสม.", async () => {
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
    // ADR-0019: a MEMBER does not review service requests.
    await expect(confirmPatientServiceRequest(member.actor, confirmInput(request.requestId, osm.userId))).rejects.toMatchObject({ code: "FORBIDDEN" });
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
    const confirmed = await confirmPatientServiceRequest(owner.actor, confirmInput(request.requestId, osm.userId));
    expect(await prisma.patientAppointment.findUniqueOrThrow({ where: { id: confirmed.appointmentId }, select: { sourceServiceRequestId: true, serviceCode: true, type: true } }))
      .toEqual({ sourceServiceRequestId: request.requestId, serviceCode: PatientServiceCode.SCREENING, type: "ASSESSMENT" });
    expect(await prisma.patientServiceRequest.findUniqueOrThrow({ where: { id: request.requestId }, select: { status: true, reviewedByUserId: true, startedByUserId: true } }))
      .toEqual({ status: PatientServiceRequestStatus.STARTED, reviewedByUserId: owner.userId, startedByUserId: owner.userId });
    await expect(withdrawOwnPatientServiceRequest(patientActor, { requestId: request.requestId })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id }))).resolves.toMatchObject({ status: PatientServiceRequestStatus.PENDING });
    expect(await prisma.patientProgram.count()).toBe(0);
    expect(await prisma.patientOsmAssignment.count({ where: { patientHospitalRelationshipId: patient.relationshipId } })).toBe(0);
    expect(await prisma.screeningAssessment.count()).toBe(0);
    expect(await prisma.patientFollowup.count()).toBe(0);
    expect(await prisma.auditEvent.count({ where: { resourceId: request.requestId, action: "PATIENT_SERVICE_REQUEST_STARTED" } })).toBe(1);
  });

  it("allows Patient withdrawal from PENDING and legacy APPROVED", async () => {
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
    const rejected = await createPatientServiceRequest(secondPatientActor, requestInput({ relationshipId: secondPatient.relationshipId, offeringId: offering.id }));
    await rejectPatientServiceRequest(owner.actor, { requestId: rejected.requestId, reason: "ไม่อนุมัติ" });
    await expect(confirmPatientServiceRequest(owner.actor, confirmInput(rejected.requestId, osm.userId))).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("serializes concurrent confirmations into exactly one appointment and no assignment", async () => {
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
    const offering = await enableService(owner.actor, hospital.id);
    const patientActor: ActorContext = {
      userId: patient.userId,
      personId: patient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id }));
    const withoutOsm = { ...confirmInput(request.requestId, randomUUID()), osmUserId: undefined };
    await expect(confirmPatientServiceRequest(owner.actor, withoutOsm))
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
    const offering = await enableService(owner.actor, hospital.id, PatientServiceCode.EMPOWERMENT);
    const patientActor: ActorContext = {
      userId: patient.userId,
      personId: patient.personId,
      roles: [Role.PATIENT],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    };
    await assignOsmToPatient(owner.actor, { patientHospitalRelationshipId: patient.relationshipId, osmUserId: assignedOsm.userId });
    return { hospital, owner, assignedOsm, visitOsm, otherOsm, patient, patientActor, offering };
  }

  async function assignmentSnapshot(relationshipId: string) {
    return prisma.patientOsmAssignment.findMany({
      where: { patientHospitalRelationshipId: relationshipId },
      orderBy: { createdAt: "asc" },
      select: { id: true, osmUserId: true, endedAt: true },
    });
  }

  it("stores the preference, notifies the preferred อสม. once and confirms a one-off visit without touching the assignment", async () => {
    const { owner, assignedOsm, visitOsm, patient, patientActor, offering } = await setupVisit("SRB-CONFIRM");
    const preferredDate = preferredDateAhead(5);
    const request = await createPatientServiceRequest(patientActor, requestInput({
      relationshipId: patient.relationshipId,
      offeringId: offering.id,
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

  it("notifies the assigned อสม. when the patient leaves the choice to the hospital, and nobody when there is none", async () => {
    const { assignedOsm, patient, patientActor, offering, hospital } = await setupVisit("SRB-NOTIFY");
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id }));
    expect(await prisma.appointmentLineNotification.findMany({
      where: { patientServiceRequestId: request.requestId },
      select: { recipientUserId: true },
    })).toEqual([{ recipientUserId: assignedOsm.userId }]);

    const unassigned = await createActivePatient({ hospitalId: hospital.id });
    const unassignedActor: ActorContext = { userId: unassigned.userId, personId: unassigned.personId, roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] };
    const silent = await createPatientServiceRequest(unassignedActor, requestInput({ relationshipId: unassigned.relationshipId, offeringId: offering.id }));
    expect(await prisma.appointmentLineNotification.count({ where: { patientServiceRequestId: silent.requestId } })).toBe(0);
  });

  it("validates the preferred date on the server clock and rejects a second open request for the service", async () => {
    const { patient, patientActor, offering } = await setupVisit("SRB-WINDOW");
    // 2026-11-01 10:00 Asia/Bangkok: the window is 2026-11-02 .. 2026-12-31.
    const now = () => new Date("2026-11-01T03:00:00.000Z");
    for (const preferredDate of ["2026-11-01", "2027-01-01"]) {
      await expect(createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id, preferredDate }), { now }))
        .rejects.toMatchObject({ code: "VALIDATION" });
    }
    await expect(createPatientServiceRequest(patientActor, { relationshipId: patient.relationshipId, offeringId: offering.id, preferredOsmRelationshipId: null }, { now }))
      .rejects.toMatchObject({ code: "VALIDATION" });
    await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id, preferredDate: "2026-12-31" }), { now });
    await expect(createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id, preferredDate: "2026-11-02" }), { now }))
      .rejects.toMatchObject({ code: "CONFLICT", message: DUPLICATE_OPEN_SERVICE_REQUEST_MESSAGE });
    expect(await prisma.patientServiceRequest.count({ where: { patientHospitalRelationshipId: patient.relationshipId } })).toBe(1);
  });

  it("gives the visiting อสม. that appointment only, while it is SCHEDULED and until 24 hours after its time", async () => {
    const { owner, hospital, visitOsm, otherOsm, patient, patientActor, offering } = await setupVisit("SRB-ACCESS");
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id }));
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
    });
    const upcoming = await listWorkAppointments(visitOsm.actor, { hospitalId: hospital.id, tab: "UPCOMING" });
    expect(upcoming.items.map((item) => item.appointmentId)).toEqual([appointmentId]);
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
    const { owner, visitOsm, patient, patientActor, offering } = await setupVisit("SRB-CANCEL");
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id }));
    const { appointmentId } = await confirmPatientServiceRequest(owner.actor, confirmInput(request.requestId, visitOsm.userId));
    const current = await prisma.patientAppointment.findUniqueOrThrow({ where: { id: appointmentId } });
    await cancelAppointment(owner.actor, { patientHospitalRelationshipId: patient.relationshipId, appointmentId, expectedUpdatedAt: current.updatedAt.toISOString() });
    await expect(getAppointmentDetail(visitOsm.actor, patient.relationshipId, appointmentId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps the current-assignment rule for hospital-booked appointments and sets the type from an optional service", async () => {
    const { owner, assignedOsm, visitOsm, patient, patientActor, offering } = await setupVisit("SRB-HOSPITAL");
    const booking = {
      patientHospitalRelationshipId: patient.relationshipId,
      scheduledAt: new Date(Date.now() + 3 * DAY_MS).toISOString(),
      locationType: "HOME_VISIT",
      responsibleUserId: null,
    };
    await expect(createAppointment(owner.actor, { ...booking, submissionNonce: randomUUID(), type: "FOLLOW_UP", assignedOsmUserId: visitOsm.userId }))
      .rejects.toMatchObject({ code: "VALIDATION" });
    const booked = await createAppointment(owner.actor, { ...booking, submissionNonce: randomUUID(), serviceCode: "SCREENING", assignedOsmUserId: assignedOsm.userId });
    expect(await prisma.patientAppointment.findUniqueOrThrow({ where: { id: booked.appointmentId }, select: { type: true, serviceCode: true, sourceServiceRequestId: true } }))
      .toEqual({ type: "ASSESSMENT", serviceCode: "SCREENING", sourceServiceRequestId: null });
    await expect(createAppointment(owner.actor, { ...booking, submissionNonce: randomUUID(), serviceCode: "SCREENING", type: "FOLLOW_UP" }))
      .rejects.toMatchObject({ code: "VALIDATION" });

    // Staff may still edit a confirmed visit: its อสม. stays, its type follows the service.
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id }));
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
    const { owner, visitOsm, patient, patientActor, offering } = await setupVisit("SRB-REJECT");
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id }));
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
    const { owner, visitOsm, patient, patientActor, offering } = await setupVisit("SRB-LEGACY");
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id }));
    await prisma.patientServiceRequest.update({ where: { id: request.requestId }, data: { status: PatientServiceRequestStatus.APPROVED, reviewedByUserId: owner.userId, reviewedAt: new Date() } });
    await expect(rejectPatientServiceRequest(owner.actor, { requestId: request.requestId, reason: "ไม่อนุมัติ" })).rejects.toMatchObject({ code: "CONFLICT" });
    const { appointmentId } = await confirmPatientServiceRequest(owner.actor, confirmInput(request.requestId, visitOsm.userId));
    expect(await prisma.patientServiceRequest.findUniqueOrThrow({ where: { id: request.requestId }, select: { status: true } }))
      .toEqual({ status: PatientServiceRequestStatus.STARTED });
    expect(await prisma.patientAppointment.count({ where: { id: appointmentId, sourceServiceRequestId: request.requestId } })).toBe(1);
  });

  it("sends the request and visit notifications to the visiting อสม. over LINE, and nothing for a closed request", async () => {
    const { owner, visitOsm, patient, patientActor, offering, hospital } = await setupVisit("SRB-LINE");
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
      offeringId: offering.id,
      preferredOsmRelationshipId: visitOsm.relationshipId,
      preferredDate,
      preferredSlot: "AFTERNOON",
    }));
    const other = await createActivePatient({ hospitalId: hospital.id });
    const otherActor: ActorContext = { userId: other.userId, personId: other.personId, roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] };
    const withdrawn = await createPatientServiceRequest(otherActor, requestInput({
      relationshipId: other.relationshipId,
      offeringId: offering.id,
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
    const { owner, visitOsm, patient, patientActor, offering, hospital } = await setupVisit("SRB-RACE");
    const request = await createPatientServiceRequest(patientActor, requestInput({ relationshipId: patient.relationshipId, offeringId: offering.id }));
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
      const raced = await createPatientServiceRequest(otherActor, requestInput({ relationshipId: other.relationshipId, offeringId: offering.id }));
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
  const migrationSql = readFileSync(
    resolve(process.cwd(), "prisma/migrations/20261128100000_service_request_appointments/migration.sql"),
    "utf8",
  );
  // Data step statements are separated by a blank line; the DO block has none inside.
  const dataStepStatements = migrationSql
    .slice(migrationSql.indexOf("-- BEGIN SR-A data step"), migrationSql.indexOf("-- END SR-A data step"))
    .split(/;\s*\n\s*\n/u)
    .map((statement) => statement.replace(/^\s*--.*$/gmu, "").trim().replace(/;$/u, ""))
    .filter(Boolean);
  const rollback = new Error("roll back the SR-A data step rehearsal");

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

  // Temporary tables shadow the real ones for this transaction only (as in the FR-1 data step test).
  async function createShadowTables(transaction: Prisma.TransactionClient): Promise<void> {
    await transaction.$executeRaw`CREATE TEMPORARY TABLE "User" ("id" UUID PRIMARY KEY) ON COMMIT DROP`;
    await transaction.$executeRaw`
      CREATE TEMPORARY TABLE "Hospital" ("id" UUID PRIMARY KEY, "registeredByUserId" UUID) ON COMMIT DROP`;
    await transaction.$executeRaw`
      CREATE TEMPORARY TABLE "HospitalMembership" (
        "hospitalId" UUID NOT NULL, "userId" UUID NOT NULL, "membershipType" "MembershipType" NOT NULL,
        "status" "MembershipStatus" NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL
      ) ON COMMIT DROP`;
    await transaction.$executeRaw`
      CREATE TEMPORARY TABLE "HospitalServiceOffering" (
        "id" UUID PRIMARY KEY, "hospitalId" UUID NOT NULL, "code" "PatientServiceCode" NOT NULL, "enabled" BOOLEAN NOT NULL,
        "createdByUserId" UUID NOT NULL, "updatedByUserId" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL,
        "updatedAt" TIMESTAMP(3) NOT NULL, UNIQUE ("hospitalId", "code")
      ) ON COMMIT DROP`;
    await transaction.$executeRaw`
      CREATE TEMPORARY TABLE "PatientServiceRequest" (
        "id" UUID PRIMARY KEY, "offeringId" UUID NOT NULL, "status" "PatientServiceRequestStatus" NOT NULL
      ) ON COMMIT DROP`;
    await transaction.$executeRaw`
      CREATE TEMPORARY TABLE "PatientAppointment" (
        "id" UUID PRIMARY KEY, "sourceServiceRequestId" UUID, "serviceCode" "PatientServiceCode"
      ) ON COMMIT DROP`;
  }

  async function runDataStep(transaction: Prisma.TransactionClient): Promise<void> {
    for (const statement of dataStepStatements) {
      await transaction.$executeRawUnsafe(statement);
    }
  }

  it("backfills request appointments and adds only the missing offerings, attributed to the earliest ACTIVE OWNER or the registrar", async () => {
    const [endedOwner, laterOwner, earliestOwner, member, registrarOwned, registrarPending] =
      Array.from({ length: 6 }, () => randomUUID());
    const owned = randomUUID();
    const pending = randomUUID();
    const complete = randomUUID();
    const existingAt = new Date("2026-09-01T00:00:00.000Z");
    const offering = {
      ownedScreening: randomUUID(),
      completeScreening: randomUUID(),
      completeFollowUp: randomUUID(),
      completeEmpowerment: randomUUID(),
    };
    const requests = Object.values(PatientServiceRequestStatus).map((status) => ({ id: randomUUID(), status }));
    const startedRequest = requests.find(({ status }) => status === PatientServiceRequestStatus.STARTED);
    const approvedRequest = requests.find(({ status }) => status === PatientServiceRequestStatus.APPROVED);
    if (!startedRequest || !approvedRequest) throw new Error("fixture needs STARTED and APPROVED requests");
    const fromEmpowerment = randomUUID();
    const fromScreening = randomUUID();
    const hospitalBooked = randomUUID();

    await expect(
      prisma.$transaction(async (transaction) => {
        await createShadowTables(transaction);
        for (const id of [endedOwner, laterOwner, earliestOwner, member, registrarOwned, registrarPending]) {
          await transaction.$executeRaw`INSERT INTO "User" ("id") VALUES (${id}::uuid)`;
        }
        await transaction.$executeRaw`
          INSERT INTO "Hospital" ("id", "registeredByUserId") VALUES
            (${owned}::uuid, ${registrarOwned}::uuid), (${pending}::uuid, ${registrarPending}::uuid), (${complete}::uuid, NULL)`;
        await transaction.$executeRaw`
          INSERT INTO "HospitalMembership" ("hospitalId", "userId", "membershipType", "status", "createdAt") VALUES
            (${owned}::uuid, ${endedOwner}::uuid, 'OWNER', 'ENDED', '2025-01-01'),
            (${owned}::uuid, ${member}::uuid, 'MEMBER', 'ACTIVE', '2025-06-01'),
            (${owned}::uuid, ${laterOwner}::uuid, 'OWNER', 'ACTIVE', '2026-02-01'),
            (${owned}::uuid, ${earliestOwner}::uuid, 'OWNER', 'ACTIVE', '2026-01-01')`;
        await transaction.$executeRaw`
          INSERT INTO "HospitalServiceOffering" ("id", "hospitalId", "code", "enabled", "createdByUserId", "updatedByUserId", "createdAt", "updatedAt") VALUES
            (${offering.ownedScreening}::uuid, ${owned}::uuid, 'SCREENING', false, ${laterOwner}::uuid, ${laterOwner}::uuid, ${existingAt}, ${existingAt}),
            (${offering.completeScreening}::uuid, ${complete}::uuid, 'SCREENING', true, ${member}::uuid, ${member}::uuid, ${existingAt}, ${existingAt}),
            (${offering.completeFollowUp}::uuid, ${complete}::uuid, 'FOLLOW_UP', false, ${member}::uuid, ${member}::uuid, ${existingAt}, ${existingAt}),
            (${offering.completeEmpowerment}::uuid, ${complete}::uuid, 'EMPOWERMENT', true, ${member}::uuid, ${member}::uuid, ${existingAt}, ${existingAt})`;
        for (const request of requests) {
          const offeringId = request === approvedRequest ? offering.ownedScreening : offering.completeEmpowerment;
          await transaction.$executeRaw`
            INSERT INTO "PatientServiceRequest" ("id", "offeringId", "status")
            VALUES (${request.id}::uuid, ${offeringId}::uuid, ${request.status}::"PatientServiceRequestStatus")`;
        }
        await transaction.$executeRaw`
          INSERT INTO "PatientAppointment" ("id", "sourceServiceRequestId", "serviceCode") VALUES
            (${fromEmpowerment}::uuid, ${startedRequest.id}::uuid, NULL),
            (${fromScreening}::uuid, ${approvedRequest.id}::uuid, NULL),
            (${hospitalBooked}::uuid, NULL, NULL)`;

        await runDataStep(transaction);

        const appointments = await transaction.$queryRaw<Array<{ id: string; serviceCode: PatientServiceCode | null }>>`
          SELECT "id"::text AS "id", "serviceCode" FROM "PatientAppointment"`;
        expect(new Map(appointments.map(({ id, serviceCode }) => [id, serviceCode]))).toEqual(new Map([
          [fromEmpowerment, PatientServiceCode.EMPOWERMENT],
          [fromScreening, PatientServiceCode.SCREENING],
          [hospitalBooked, null],
        ]));

        const offerings = await transaction.$queryRaw<Array<{
          id: string; hospitalId: string; code: PatientServiceCode; enabled: boolean;
          createdByUserId: string; updatedByUserId: string; createdAt: Date;
        }>>`
          SELECT "id"::text AS "id", "hospitalId"::text AS "hospitalId", "code", "enabled",
                 "createdByUserId"::text AS "createdByUserId", "updatedByUserId"::text AS "updatedByUserId", "createdAt"
          FROM "HospitalServiceOffering" ORDER BY "hospitalId", "code"`;
        const byHospital = (hospitalId: string) => offerings
          .filter((row) => row.hospitalId === hospitalId)
          .map(({ code, enabled, createdByUserId, updatedByUserId }) => ({ code, enabled, createdByUserId, updatedByUserId }));

        expect(byHospital(owned)).toEqual([
          { code: "SCREENING", enabled: false, createdByUserId: laterOwner, updatedByUserId: laterOwner },
          { code: "FOLLOW_UP", enabled: true, createdByUserId: earliestOwner, updatedByUserId: earliestOwner },
          { code: "EMPOWERMENT", enabled: true, createdByUserId: earliestOwner, updatedByUserId: earliestOwner },
        ]);
        expect(byHospital(pending)).toEqual(Object.values(PatientServiceCode).map((code) => ({
          code, enabled: true, createdByUserId: registrarPending, updatedByUserId: registrarPending,
        })));
        expect(byHospital(complete)).toEqual([
          { code: "SCREENING", enabled: true, createdByUserId: member, updatedByUserId: member },
          { code: "FOLLOW_UP", enabled: false, createdByUserId: member, updatedByUserId: member },
          { code: "EMPOWERMENT", enabled: true, createdByUserId: member, updatedByUserId: member },
        ]);
        const existingIds: readonly string[] = Object.values(offering);
        expect(offerings.filter(({ id }) => existingIds.includes(id)).map(({ createdAt }) => createdAt.getTime()))
          .toEqual(Array(4).fill(existingAt.getTime()));

        const requestStatuses = await transaction.$queryRaw<Array<{ id: string; status: PatientServiceRequestStatus }>>`
          SELECT "id"::text AS "id", "status" FROM "PatientServiceRequest"`;
        expect(new Map(requestStatuses.map(({ id, status }) => [id, status])))
          .toEqual(new Map(requests.map(({ id, status }) => [id, status])));

        // Rerunning the data step adds nothing.
        await runDataStep(transaction);
        const [total] = await transaction.$queryRaw<Array<{ count: bigint }>>`
          SELECT count(*) AS "count" FROM "HospitalServiceOffering"`;
        expect(Number(total?.count)).toBe(9);

        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it("refuses Hospitals that need offerings but have no ACTIVE OWNER or registering user, reporting the count", async () => {
    const endedOwner = randomUUID();
    const missingRegistrar = randomUUID();
    const withEndedOwner = randomUUID();

    await expect(
      prisma.$transaction(async (transaction) => {
        await createShadowTables(transaction);
        await transaction.$executeRaw`INSERT INTO "User" ("id") VALUES (${endedOwner}::uuid)`;
        await transaction.$executeRaw`
          INSERT INTO "Hospital" ("id", "registeredByUserId") VALUES
            (${withEndedOwner}::uuid, NULL), (gen_random_uuid(), ${missingRegistrar}::uuid)`;
        await transaction.$executeRaw`
          INSERT INTO "HospitalMembership" ("hospitalId", "userId", "membershipType", "status", "createdAt")
          VALUES (${withEndedOwner}::uuid, ${endedOwner}::uuid, 'OWNER', 'ENDED', '2025-01-01')`;

        await runDataStep(transaction);
      }),
    ).rejects.toThrow(/SR-A: 2 Hospital\(s\) need service offerings/u);
  });

  it("keeps legacy requests valid and enforces the preference, note, rejection reason and appointment service CHECKs", async () => {
    const hospital = await createHospital("SR-A-CHECKS");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    const offering = await enableService(owner.actor, hospital.id);
    const requestIds = new Map<PatientServiceRequestStatus, string>();
    for (const status of Object.values(PatientServiceRequestStatus)) {
      const patient = await createActivePatient({ hospitalId: hospital.id });
      const created = await prisma.patientServiceRequest.create({
        data: {
          patientHospitalRelationshipId: patient.relationshipId,
          hospitalId: hospital.id,
          offeringId: offering.id,
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

  it("offers a service by default", async () => {
    const hospital = await createHospital("SR-A-DEFAULT");
    const owner = await createHospitalActor({ hospitalId: hospital.id, membershipType: MembershipType.OWNER });
    await expect(prisma.hospitalServiceOffering.create({
      data: { hospitalId: hospital.id, code: "FOLLOW_UP", createdByUserId: owner.userId, updatedByUserId: owner.userId },
      select: { enabled: true },
    })).resolves.toEqual({ enabled: true });
  });
});
