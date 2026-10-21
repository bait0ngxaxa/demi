import { randomUUID } from "node:crypto";
import { HospitalStatus, MembershipStatus, MembershipType, Role, UserStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { resolvePatientImportTemplateTarget } from "@/modules/patient-provisioning/services/patient-import-template-service";
import { importPatientRoster, previewPatientRosterImport } from "@/modules/patient-provisioning/services/patient-roster-import-service";
import { provisionPatient } from "@/modules/patient-provisioning/services/patient-provisioning-service";
import { assertPatientActivationActorInDatabase } from "@/modules/patient-activation/services/patient-activation-service";
import { locateHospitalPatientAccessRequest, reviewPatientAccessRequest } from "@/modules/patient-access-requests/services/patient-access-request-service";
import { listHospitalPatientServiceRequests, reviewPatientServiceRequest } from "@/modules/patient-service-requests/services/patient-service-request-service";
import { HOSPITAL_REPORT_CAPABILITIES } from "@/modules/reporting/policies/hospital-report-policy";
import { resolveHospitalReportingAccessContext } from "@/modules/reporting/services/hospital-report-access-service";
import { listWorkforce, listWorkforceHospitals, previewWorkforceActivation, provisionOsm, regenerateWorkforceActivation } from "@/modules/workforce/services/workforce-service";
import { readTemplateCandidates, type ImportTestHospital } from "./support/patient-import-template-upload";

const db = getPrisma();
const users: string[] = [];
const people: string[] = [];
const hospitals: string[] = [];
let hospital: ImportTestHospital;
let owner: ActorContext;
let member: ActorContext;
let osm: ActorContext;

async function createActor(membershipType: MembershipType | null): Promise<ActorContext> {
  const person = await db.person.create({ data: { identityKeyHash: randomUUID() } });
  people.push(person.id);
  const user = await db.user.create({ data: { personId: person.id, status: UserStatus.ACTIVE, authSubject: randomUUID(), roles: { create: [{ role: membershipType ? Role.HOSPITAL : Role.OSM }] } } });
  users.push(user.id);
  if (membershipType) {
    await db.hospitalMembership.create({ data: { userId: user.id, hospitalId: hospital.id, membershipType, status: MembershipStatus.ACTIVE } });
  } else {
    await db.osmHospitalRelationship.create({ data: { userId: user.id, hospitalId: hospital.id, status: MembershipStatus.ACTIVE } });
  }
  return {
    userId: user.id, personId: person.id, roles: membershipType ? [Role.HOSPITAL] : [Role.OSM],
    hospitalMemberships: membershipType ? [{ hospitalId: hospital.id, membershipType, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }] : [],
    osmHospitalRelationships: membershipType ? [] : [{ hospitalId: hospital.id, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }],
  };
}

beforeAll(async () => {
  const leftovers = await db.hospital.findMany({ where: { hospitalCode: { startsWith: "OWN-" }, name: "โรงพยาบาลทดสอบสิทธิ์เจ้าของ" }, select: { id: true } });
  hospitals.push(...leftovers.map(({ id }) => id));
  await cleanupFixtures();
  hospitals.length = 0;
  users.length = 0;
  people.length = 0;
  hospital = await db.hospital.create({ data: { hospitalCode: `OWN-${randomUUID().slice(0, 8)}`, name: "โรงพยาบาลทดสอบสิทธิ์เจ้าของ", status: HospitalStatus.ACTIVE } });
  hospitals.push(hospital.id);
  owner = await createActor(MembershipType.OWNER);
  member = await createActor(MembershipType.MEMBER);
  osm = await createActor(null);
});

async function cleanupFixtures(): Promise<void> {
  const workforce = await db.user.findMany({ where: { OR: [{ memberships: { some: { hospitalId: { in: hospitals } } } }, { osmHospitalRelationships: { some: { hospitalId: { in: hospitals } } } }] }, select: { id: true, personId: true } });
  users.push(...workforce.map(({ id }) => id));
  people.push(...workforce.map(({ personId }) => personId));
  // Remove only synthetic fixtures created by this file, on the guarded local integration database.
  const relationships = await db.patientHospitalRelationship.findMany({ where: { hospitalId: { in: hospitals } }, select: { patientProfile: { select: { id: true, personId: true } } } });
  const profiles = relationships.map(({ patientProfile }) => patientProfile.id);
  people.push(...relationships.map(({ patientProfile }) => patientProfile.personId));
  const patientUsers = await db.user.findMany({ where: { personId: { in: people } }, select: { id: true } });
  users.push(...patientUsers.map(({ id }) => id));
  await db.patientClassificationHistory.deleteMany({ where: { patientProfileId: { in: profiles } } });
  await db.patientClassification.deleteMany({ where: { patientProfileId: { in: profiles } } });
  await db.patientBaseline.deleteMany({ where: { patientHospitalRelationship: { hospitalId: { in: hospitals } } } });
  await db.auditEvent.deleteMany({ where: { actorUserId: { in: users } } });
  await db.patientServiceRequest.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.hospitalServiceOffering.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.patientAccessRequest.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.patientHospitalRelationship.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.patientProfile.deleteMany({ where: { id: { in: profiles } } });
  await db.workforceActivation.deleteMany({ where: { userId: { in: users } } });
  await db.osmHospitalRelationship.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.hospitalMembership.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.userRole.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.person.deleteMany({ where: { id: { in: people } } });
  await db.hospital.deleteMany({ where: { id: { in: hospitals } } });
}

afterAll(async () => {
  await cleanupFixtures();
  await db.$disconnect();
});

describe("persisted Owner administration", () => {
  it("imports a strict v2 workbook containing exactly one patient for a multi-role OWNER", async () => {
    await db.userRole.createMany({ data: [Role.OSM, Role.PATIENT].map((role) => ({ userId: owner.userId, role })) });
    owner = { ...owner, roles: [Role.HOSPITAL, Role.OSM, Role.PATIENT] };
    const candidates = await readTemplateCandidates(hospital, [{ nationalId: "1000000000106", givenName: "ผู้ป่วย", familyName: "ทดสอบเจ้าของ" }]);
    await expect(previewPatientRosterImport(owner, hospital.id, candidates)).resolves.toMatchObject({ rows: [{ classification: "READY" }] });
    await expect(importPatientRoster(owner, hospital.id, candidates)).resolves.toMatchObject({ imported: 1, failed: 0 });
  });

  it("preserves OWNER workforce provisioning, listing and regeneration", async () => {
    const result = await provisionOsm(owner, { nationalId: "1000000000092", givenName: "อสม", familyName: "ทดสอบเจ้าของ", targetHospitalId: hospital.id });
    users.push(result.userId);
    const user = await db.user.findUniqueOrThrow({ where: { id: result.userId }, select: { personId: true } });
    people.push(user.personId);
    await expect(listWorkforce(owner, { targetHospitalId: hospital.id })).resolves.toMatchObject({ viewerScope: "OWNER" });
    const regenerated = await regenerateWorkforceActivation(owner, { userId: result.userId, targetHospitalId: hospital.id, kind: "OSM", mode: "REMOTE" });
    // A historical MEMBER-issued invitation remains claimable by its target. New issuance is denied below.
    await db.workforceActivation.update({ where: { id: regenerated.activationId }, data: { createdByUserId: member.userId } });
    await expect(previewWorkforceActivation(regenerated.activationToken)).resolves.toMatchObject({ purpose: "ACTIVATION" });
  });

  it.each(["MEMBER", "OSM"])("denies %s at import, workforce and activation boundaries", async (kind) => {
    const subject = kind === "MEMBER" ? member : osm;
    await expect(resolvePatientImportTemplateTarget(subject, hospital.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(previewPatientRosterImport(subject, hospital.id, [])).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(importPatientRoster(subject, hospital.id, [])).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(provisionOsm(subject, { nationalId: "1000000000009", givenName: "ห้าม", familyName: "สร้าง", targetHospitalId: hospital.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listWorkforce(subject, { targetHospitalId: hospital.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(regenerateWorkforceActivation(subject, { userId: osm.userId, targetHospitalId: hospital.id, kind: "OSM", mode: "REMOTE" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(assertPatientActivationActorInDatabase(db, subject.userId, hospital.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects stale OWNER snapshots and persisted historical export grants", async () => {
    await db.hospitalMembership.updateMany({ where: { userId: member.userId }, data: { reportExportGrantedAt: new Date(), reportExportGrantedByUserId: owner.userId } });
    const staleOwner = { ...member, hospitalMemberships: owner.hospitalMemberships };
    await expect(resolvePatientImportTemplateTarget(staleOwner, hospital.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(provisionOsm(staleOwner, { nationalId: "1000000000009", givenName: "ห้าม", familyName: "สร้าง", targetHospitalId: hospital.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(regenerateWorkforceActivation(staleOwner, { userId: osm.userId, targetHospitalId: hospital.id, kind: "OSM", mode: "REMOTE" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listWorkforce(staleOwner, { targetHospitalId: hospital.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(listWorkforceHospitals(staleOwner)).resolves.toEqual([]);
    await expect(locateHospitalPatientAccessRequest(staleOwner, { hospitalId: hospital.id, nationalId: "1000000000009" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listHospitalPatientServiceRequests(staleOwner)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(resolveHospitalReportingAccessContext(staleOwner, hospital.id, HOSPITAL_REPORT_CAPABILITIES.export)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("revalidates user, membership and Hospital suspension against the database", async () => {
    for (const boundary of ["user", "membership", "hospital"]) {
      if (boundary === "user") await db.user.update({ where: { id: owner.userId }, data: { status: UserStatus.SUSPENDED } });
      if (boundary === "membership") await db.hospitalMembership.updateMany({ where: { userId: owner.userId }, data: { status: MembershipStatus.SUSPENDED } });
      if (boundary === "hospital") await db.hospital.update({ where: { id: hospital.id }, data: { status: HospitalStatus.SUSPENDED } });
      try {
        await expect(resolvePatientImportTemplateTarget(owner, hospital.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
        await expect(assertPatientActivationActorInDatabase(db, owner.userId, hospital.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
      } finally {
        await db.user.update({ where: { id: owner.userId }, data: { status: UserStatus.ACTIVE } });
        await db.hospitalMembership.updateMany({ where: { userId: owner.userId }, data: { status: MembershipStatus.ACTIVE } });
        await db.hospital.update({ where: { id: hospital.id }, data: { status: HospitalStatus.ACTIVE } });
      }
    }
  });

  it("rejects stale-owner review mutations and preserves valid Owner reviews", async () => {
    const relationship = await db.patientHospitalRelationship.findFirstOrThrow({ where: { hospitalId: hospital.id }, select: { id: true, patientProfile: { select: { person: { select: { user: { select: { id: true } } } } } } } });
    const requester = relationship.patientProfile.person.user;
    if (!requester) throw new Error("Missing synthetic patient account");
    const offering = await db.hospitalServiceOffering.create({ data: { hospitalId: hospital.id, code: "SCREENING", enabled: true, createdByUserId: owner.userId, updatedByUserId: owner.userId } });
    const serviceRequest = await db.patientServiceRequest.create({ data: { hospitalId: hospital.id, patientHospitalRelationshipId: relationship.id, offeringId: offering.id, requestedByUserId: requester.id } });
    const accessRequest = await db.patientAccessRequest.create({ data: { hospitalId: hospital.id, identityKeyHash: randomUUID() } });
    const staleOwner = { ...member, hospitalMemberships: owner.hospitalMemberships };
    for (const subject of [member, osm, staleOwner]) {
      await expect(reviewPatientServiceRequest(subject, { requestId: serviceRequest.id }, "APPROVE")).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(reviewPatientAccessRequest(subject, { requestId: accessRequest.id, decision: "REJECT" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(await db.patientServiceRequest.findUniqueOrThrow({ where: { id: serviceRequest.id } })).toMatchObject({ status: "PENDING" });
    expect(await db.patientAccessRequest.findUniqueOrThrow({ where: { id: accessRequest.id } })).toMatchObject({ status: "PENDING" });
    await expect(reviewPatientServiceRequest(owner, { requestId: serviceRequest.id }, "APPROVE")).resolves.toBe("APPROVED");
    await expect(reviewPatientAccessRequest(owner, { requestId: accessRequest.id, decision: "REJECT" })).resolves.toMatchObject({ status: "REJECTED" });
  });

  it("disables legacy manual patient creation even for OWNER", async () => {
    const count = await db.patientHospitalRelationship.count({ where: { hospitalId: hospital.id } });
    await expect(provisionPatient(owner, { identity: { namespace: "thai-national-id", value: "1000000000009" }, givenName: "ห้าม", familyName: "สร้าง", targetHospitalId: hospital.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.patientHospitalRelationship.count({ where: { hospitalId: hospital.id } })).toBe(count);
  });
});
