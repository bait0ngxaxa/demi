import { randomUUID } from "node:crypto";
import { HospitalStatus, MembershipStatus, MembershipType, Role, UserStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { getCareTrackingPage } from "@/modules/care-tracking/services/care-tracking-query-service";
import { getHospitalHierarchyContext } from "@/modules/hospital-hierarchy/services/hospital-hierarchy-service";
import { createHospitalContent } from "@/modules/hospital-content/services/hospital-content-service";
import {
  issueChildOwnerLink,
  renameChildFacility,
} from "@/modules/hospital-service-areas/services/child-facility-service";
import {
  attachHospitalServiceArea,
  endHospitalServiceArea,
} from "@/modules/hospital-service-areas/services/hospital-service-area-service";
import { setHospitalSelfRegistrationEnabled } from "@/modules/hospital-settings/services/hospital-self-registration-settings-service";
import { issuePatientActivation } from "@/modules/patient-activation/services/patient-activation-service";
import {
  assignOsmToPatient,
  assignOsmToPatients,
  unassignOsmFromPatient,
} from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import { findPatientsAssignedToOsmInHospital } from "@/modules/patient-directory/services/patient-directory-query-service";
import {
  correctPatientName,
  correctWorkforcePersonName,
} from "@/modules/patient-hospital-profile/services/patient-name-correction-service";
import { endPatientHospitalRelationship } from "@/modules/patient-hospital-relationship/services/patient-hospital-relationship-end-service";
import { HOSPITAL_NETWORK_CHILD_REPORT_CAPABILITIES } from "@/modules/reporting/policies/hospital-network-child-report-policy";
import { HOSPITAL_REPORT_CAPABILITIES } from "@/modules/reporting/policies/hospital-report-policy";
import {
  listHospitalReportingHospitals,
  resolveHospitalReportingAccessContext,
} from "@/modules/reporting/services/hospital-report-access-service";
import {
  listParentChildHospitalReportTargetGroups,
  resolveParentChildHospitalReportAccessContext,
} from "@/modules/reporting/services/parent-child-hospital-report-access-service";
import {
  demoteHospitalOwner,
  releaseWorkforceRelationship,
  suspendHospitalMembership,
  suspendOsmRelationship,
  updateWorkforceContactPhone,
} from "@/modules/workforce/services/workforce-service";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

import { provisionPatientFixture as provisionPatient } from "./support/patient-provisioning";

/**
 * ADR-0026 (MEMBER operational parity): an ACTIVE MEMBER holds every OWNER capability except Hospital management
 * and user management. Each switched capability: MEMBER allowed; OSM, PATIENT, a MEMBER of another Hospital and a
 * SUSPENDED MEMBER (persisted state, stale ACTIVE session) denied. Each OWNER-only capability: MEMBER denied.
 */
const db = getPrisma();
const hospitals: string[] = [];
const users: string[] = [];
const people: string[] = [];

type Staff = ActorContext & { membershipId: string };

async function hospital(kind: "PARENT" | "CHILD", name: string): Promise<string> {
  const row = await db.hospital.create({
    data: {
      hospitalCode: `MP-${randomUUID().slice(0, 20)}`,
      name,
      status: HospitalStatus.ACTIVE,
      serviceAreaEligibility: { create: { kind, verifiedAt: new Date() } },
    },
  });
  hospitals.push(row.id);
  return row.id;
}

async function user(roles: Role[], familyName: string): Promise<{ userId: string; personId: string }> {
  const person = await db.person.create({ data: { identityKeyHash: randomUUID(), givenName: "ทดสอบ", familyName } });
  people.push(person.id);
  const created = await db.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE, authSubject: randomUUID(), roles: { create: roles.map((role) => ({ role })) } },
  });
  users.push(created.id);
  return { userId: created.id, personId: person.id };
}

async function staff(hospitalId: string, membershipType: MembershipType, status: MembershipStatus = MembershipStatus.ACTIVE): Promise<Staff> {
  const { userId, personId } = await user([Role.HOSPITAL], "บุคลากร");
  const membership = await db.hospitalMembership.create({ data: { userId, hospitalId, membershipType, status } });
  // The session snapshot always claims ACTIVE: every check below must come from persisted state.
  return {
    membershipId: membership.id,
    userId,
    personId,
    roles: [Role.HOSPITAL],
    hospitalMemberships: [{ hospitalId, membershipType, profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }],
    osmHospitalRelationships: [],
  };
}

async function osm(hospitalId: string): Promise<ActorContext & { relationshipId: string }> {
  const { userId, personId } = await user([Role.OSM], "อสม");
  const relationship = await db.osmHospitalRelationship.create({ data: { userId, hospitalId, status: MembershipStatus.ACTIVE } });
  return {
    relationshipId: relationship.id,
    userId,
    personId,
    roles: [Role.OSM],
    hospitalMemberships: [],
    osmHospitalRelationships: [{ hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }],
  };
}

async function patient(owner: ActorContext, hospitalId: string, familyName: string): Promise<{ relationshipId: string; userId: string; personId: string }> {
  const provisioned = await provisionPatient(owner, {
    identity: { namespace: "member-parity", value: randomUUID() },
    targetHospitalId: hospitalId,
    givenName: "ผู้ป่วย",
    familyName,
    hospitalNumber: `HN-${randomUUID().slice(0, 8)}`,
  });
  users.push(provisioned.userId);
  people.push(provisioned.personId);
  return { relationshipId: provisioned.relationshipId, userId: provisioned.userId, personId: provisioned.personId };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function fixture() {
  const parentId = await hospital("PARENT", "โรงพยาบาลแม่ข่าย MP");
  const childId = await hospital("CHILD", "รพ.สต.ลูกข่าย MP");
  const otherId = await hospital("PARENT", "โรงพยาบาลอื่น MP");
  const owner = await staff(parentId, MembershipType.OWNER);
  const member = await staff(parentId, MembershipType.MEMBER);
  const suspendedMember = await staff(parentId, MembershipType.MEMBER, MembershipStatus.SUSPENDED);
  const otherMember = await staff(otherId, MembershipType.MEMBER);
  const childOwner = await staff(childId, MembershipType.OWNER);
  const childMember = await staff(childId, MembershipType.MEMBER);
  const parentOsm = await osm(parentId);
  const patientA = await patient(owner, parentId, "แม่ข่ายหนึ่ง");
  const patientB = await patient(owner, parentId, "แม่ข่ายสอง");
  await patient(childOwner, childId, "ลูกข่าย");
  const patientUser = await db.user.findUniqueOrThrow({ where: { id: patientA.userId }, select: { personId: true } });
  const patientActor: ActorContext = {
    userId: patientA.userId,
    personId: patientUser.personId,
    roles: [Role.PATIENT],
    hospitalMemberships: [],
    osmHospitalRelationships: [],
  };
  const area = await attachHospitalServiceArea(owner, { parentHospitalId: parentId, childHospitalId: childId });
  return {
    parentId, childId, otherId, owner, member, suspendedMember, otherMember, childOwner, childMember,
    parentOsm, patientA, patientB, patientActor, areaId: area.id,
  };
}

function deniedOperators(f: Fixture): [string, ActorContext][] {
  return [
    ["OSM", f.parentOsm],
    ["PATIENT", f.patientActor],
    ["MEMBER of another Hospital", f.otherMember],
    ["SUSPENDED MEMBER", f.suspendedMember],
  ];
}

const forbiddenOrHidden = (error: unknown): boolean => error instanceof ForbiddenError || error instanceof NotFoundError;

async function membershipVersion(membershipId: string): Promise<string> {
  return (await db.hospitalMembership.findUniqueOrThrow({ where: { id: membershipId } })).updatedAt.toISOString();
}

async function cleanup(): Promise<void> {
  if (hospitals.length === 0) return;
  const relationshipWhere = { hospitalId: { in: hospitals } };
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.hospitalServiceArea.deleteMany({ where: { parentHospitalId: { in: hospitals } } });
  });
  await db.hospitalContent.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.patientOsmAssignment.deleteMany({ where: { patientHospitalRelationship: relationshipWhere } });
  await db.patientHospitalProfile.deleteMany({ where: { relationship: relationshipWhere } });
  await db.patientActivation.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.auditEvent.deleteMany({ where: { actorUserId: { in: users } } });
  await db.patientHospitalHealthHistory.deleteMany({ where: { relationship: relationshipWhere } });
  await db.patientClassificationHistory.deleteMany({ where: { patientProfile: { personId: { in: people } } } });
  await db.patientClassification.deleteMany({ where: { patientProfile: { personId: { in: people } } } });
  await db.patientBaseline.deleteMany({ where: { patientHospitalRelationship: relationshipWhere } });
  await db.patientHospitalRelationship.deleteMany({ where: relationshipWhere });
  await db.patientProfile.deleteMany({ where: { personId: { in: people } } });
  await db.workforceActivation.deleteMany({ where: { userId: { in: users } } });
  await db.hospitalServiceAreaEligibility.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.hospitalMembership.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.osmHospitalRelationship.deleteMany({ where: { hospitalId: { in: hospitals } } });
  await db.userRole.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.person.deleteMany({ where: { id: { in: people } } });
  await db.hospital.deleteMany({ where: { id: { in: hospitals } } });
  hospitals.length = 0;
  users.length = 0;
  people.length = 0;
}

describe("ADR-0026 MEMBER operational parity / PostgreSQL", () => {
  let f: Fixture;

  beforeAll(async () => {
    await db.$connect();
    f = await fixture();
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await db.$disconnect();
  });

  it("reports: dashboard, rows and both export cohorts for a MEMBER, audited as MEMBER", async () => {
    for (const capability of Object.values(HOSPITAL_REPORT_CAPABILITIES)) {
      await expect(resolveHospitalReportingAccessContext(f.member, f.parentId, capability)).resolves.toMatchObject({ accessBasis: "MEMBER" });
      await expect(resolveHospitalReportingAccessContext(f.owner, f.parentId, capability)).resolves.toMatchObject({ accessBasis: "OWNER" });
    }
    expect((await listHospitalReportingHospitals(f.member)).map(({ id }) => id)).toEqual([f.parentId]);
    await expect(getHospitalHierarchyContext(f.member, f.parentId)).resolves.toMatchObject({ classification: "MAIN" });

    for (const [label, subject] of deniedOperators(f)) {
      await expect(
        resolveHospitalReportingAccessContext(subject, f.parentId, HOSPITAL_REPORT_CAPABILITIES.dashboardRead),
        label,
      ).rejects.toSatisfy(forbiddenOrHidden);
      await expect(getHospitalHierarchyContext(subject, f.parentId), label).rejects.toSatisfy(forbiddenOrHidden);
    }
    expect(await listHospitalReportingHospitals(f.suspendedMember)).toEqual([]);
  });

  it("Parent→Child summary (RPT-32): a Parent MEMBER reads and exports; the Child MEMBER never reaches the Parent", async () => {
    for (const capability of Object.values(HOSPITAL_NETWORK_CHILD_REPORT_CAPABILITIES)) {
      await expect(resolveParentChildHospitalReportAccessContext(f.member, f.parentId, f.childId, db, capability))
        .resolves.toMatchObject({ parentHospitalId: f.parentId, hospital: { id: f.childId } });
    }
    expect(await listParentChildHospitalReportTargetGroups(f.member, [f.parentId])).toEqual([
      { parent: { id: f.parentId, name: "โรงพยาบาลแม่ข่าย MP" }, children: [{ id: f.childId, name: "รพ.สต.ลูกข่าย MP" }] },
    ]);

    for (const [label, subject] of [...deniedOperators(f), ["Child MEMBER", f.childMember] as [string, ActorContext]]) {
      await expect(resolveParentChildHospitalReportAccessContext(subject, f.parentId, f.childId), label).rejects.toSatisfy(forbiddenOrHidden);
    }
    expect(await listParentChildHospitalReportTargetGroups(f.childMember, [f.parentId, f.childId])).toEqual([]);
    await expect(resolveHospitalReportingAccessContext(f.childMember, f.parentId, HOSPITAL_REPORT_CAPABILITIES.export))
      .rejects.toSatisfy(forbiddenOrHidden);
  });

  it("OSM assignment: a MEMBER assigns, unassigns and bulk-assigns; others are refused before any write", async () => {
    await assignOsmToPatient(f.member, { patientHospitalRelationshipId: f.patientA.relationshipId, osmUserId: f.parentOsm.userId });
    const assigned = await db.patientOsmAssignment.findFirstOrThrow({ where: { patientHospitalRelationshipId: f.patientA.relationshipId, endedAt: null } });
    expect(assigned).toMatchObject({ osmUserId: f.parentOsm.userId, assignedByUserId: f.member.userId });

    const page = await findPatientsAssignedToOsmInHospital(f.member, { hospitalId: f.parentId, osmUserId: f.parentOsm.userId, page: 1 });
    expect(page.items.map(({ patientHospitalRelationshipId }) => patientHospitalRelationshipId)).toEqual([f.patientA.relationshipId]);

    await unassignOsmFromPatient(f.member, { patientHospitalRelationshipId: f.patientA.relationshipId });
    expect(await db.patientOsmAssignment.count({ where: { patientHospitalRelationshipId: f.patientA.relationshipId, endedAt: null } })).toBe(0);

    await expect(assignOsmToPatients(f.member, {
      hospitalId: f.parentId,
      osmUserId: f.parentOsm.userId,
      patientHospitalRelationshipIds: [f.patientA.relationshipId, f.patientB.relationshipId],
      submissionNonce: randomUUID(),
    })).resolves.toMatchObject({ assignedCount: 2 });

    for (const [label, subject] of deniedOperators(f)) {
      await expect(unassignOsmFromPatient(subject, { patientHospitalRelationshipId: f.patientA.relationshipId }), label).rejects.toSatisfy(forbiddenOrHidden);
      await expect(assignOsmToPatients(subject, {
        hospitalId: f.parentId,
        osmUserId: f.parentOsm.userId,
        patientHospitalRelationshipIds: [f.patientA.relationshipId],
        submissionNonce: randomUUID(),
      }), label).rejects.toSatisfy(forbiddenOrHidden);
      await expect(
        findPatientsAssignedToOsmInHospital(subject, { hospitalId: f.parentId, osmUserId: f.parentOsm.userId, page: 1 }),
        label,
      ).rejects.toSatisfy(forbiddenOrHidden);
    }
    expect(await db.patientOsmAssignment.count({ where: { patientHospitalRelationship: { hospitalId: f.parentId }, endedAt: null } })).toBe(2);
  });

  it("Patient name correction (E3): a MEMBER corrects with its own audit basis; the staff/OSM variant stays OWNER-only", async () => {
    const before = await db.person.findUniqueOrThrow({ where: { id: f.patientB.personId } });
    await expect(correctPatientName(f.member, f.patientB.relationshipId, { expectedVersion: before.version, givenName: "แก้แล้ว", familyName: "แม่ข่ายสอง" }, db))
      .resolves.toEqual({ version: before.version + 1 });
    const audit = await db.auditEvent.findFirstOrThrow({ where: { actorUserId: f.member.userId, action: "patient.person_name.corrected" } });
    expect(audit.metadata).toMatchObject({ basis: "HOSPITAL_MEMBER_SINGLE_HOSPITAL", hospitalId: f.parentId });

    for (const [label, subject] of deniedOperators(f)) {
      await expect(
        correctPatientName(subject, f.patientB.relationshipId, { expectedVersion: before.version + 1, givenName: "ห้าม", familyName: "แก้" }, db),
        label,
      ).rejects.toSatisfy(forbiddenOrHidden);
    }
    await expect(correctWorkforcePersonName(f.member, { kind: "osm", relationshipId: f.parentOsm.relationshipId }, {
      expectedVersion: 1, givenName: "ห้าม", familyName: "แก้",
    }, db)).rejects.toSatisfy(forbiddenOrHidden);
  });

  it("care tracking: a MEMBER may include ended care relationships; a SUSPENDED MEMBER reads nothing", async () => {
    const ended = await patient(f.owner, f.parentId, "สิ้นสุดการดูแล");
    await db.patientHospitalRelationship.update({
      where: { id: ended.relationshipId },
      data: { endedAt: new Date(), endedByUserId: f.owner.userId, endReason: "สิ้นสุดการดูแลใน fixture" },
    });

    const active = await getCareTrackingPage(f.member, { hospitalId: f.parentId });
    const all = await getCareTrackingPage(f.member, { hospitalId: f.parentId, includeEnded: true });
    expect(all.total).toBe(active.total + 1);
    expect(all.items.map(({ relationshipId }) => relationshipId)).toContain(ended.relationshipId);
    expect(active.items.map(({ relationshipId }) => relationshipId)).not.toContain(ended.relationshipId);
    expect((await getCareTrackingPage(f.owner, { hospitalId: f.parentId, includeEnded: true })).total).toBe(all.total);

    for (const [label, subject] of [["MEMBER of another Hospital", f.otherMember], ["SUSPENDED MEMBER", f.suspendedMember]] as const) {
      await expect(getCareTrackingPage(subject, { hospitalId: f.parentId, includeEnded: true }), label).rejects.toSatisfy(forbiddenOrHidden);
    }
  });

  it("keeps Hospital management OWNER-only: a MEMBER is refused and nothing changes", async () => {
    await expect(createHospitalContent(f.member, {
      hospitalId: f.parentId, submissionNonce: randomUUID(), title: "ข่าว", body: "รายละเอียด", category: "NEWS", sourceText: null,
    })).rejects.toSatisfy(forbiddenOrHidden);
    await expect(setHospitalSelfRegistrationEnabled(f.member, { hospitalId: f.parentId, enabled: false })).rejects.toSatisfy(forbiddenOrHidden);
    await expect(attachHospitalServiceArea(f.member, { parentHospitalId: f.parentId, childHospitalId: f.otherId })).rejects.toSatisfy(forbiddenOrHidden);
    await expect(endHospitalServiceArea(f.member, { parentHospitalId: f.parentId, areaId: f.areaId, confirm: true, endReason: "ห้าม" }))
      .rejects.toSatisfy(forbiddenOrHidden);
    const child = await db.hospital.findUniqueOrThrow({ where: { id: f.childId } });
    await expect(renameChildFacility(f.member, {
      parentHospitalId: f.parentId, childHospitalId: f.childId, name: "ชื่อใหม่", expectedUpdatedAt: child.updatedAt.toISOString(),
    })).rejects.toSatisfy(forbiddenOrHidden);
    await expect(issueChildOwnerLink(f.member, { parentHospitalId: f.parentId, childHospitalId: f.childId, mode: "REMOTE" })).rejects.toSatisfy(forbiddenOrHidden);

    expect(await db.hospitalContent.count({ where: { hospitalId: f.parentId } })).toBe(0);
    expect(await db.hospitalServiceArea.count({ where: { parentHospitalId: f.parentId, endedAt: null } })).toBe(1);
    expect((await db.hospital.findUniqueOrThrow({ where: { id: f.childId } })).name).toBe("รพ.สต.ลูกข่าย MP");
  });

  it("keeps user management OWNER-only: a MEMBER is refused and nothing changes", async () => {
    await expect(suspendHospitalMembership(f.member, {
      relationshipId: f.suspendedMember.membershipId, targetHospitalId: f.parentId, expectedUpdatedAt: await membershipVersion(f.suspendedMember.membershipId),
    })).rejects.toSatisfy(forbiddenOrHidden);
    const osmRelationship = await db.osmHospitalRelationship.findUniqueOrThrow({ where: { id: f.parentOsm.relationshipId } });
    await expect(suspendOsmRelationship(f.member, {
      relationshipId: osmRelationship.id, targetHospitalId: f.parentId, expectedUpdatedAt: osmRelationship.updatedAt.toISOString(),
    })).rejects.toSatisfy(forbiddenOrHidden);
    await expect(demoteHospitalOwner(f.member, {
      relationshipId: f.owner.membershipId, targetHospitalId: f.parentId, expectedUpdatedAt: await membershipVersion(f.owner.membershipId),
    })).rejects.toSatisfy(forbiddenOrHidden);
    await expect(updateWorkforceContactPhone(f.member, {
      kind: "osm", relationshipId: osmRelationship.id, targetHospitalId: f.parentId, expectedUpdatedAt: osmRelationship.updatedAt.toISOString(), contactPhone: "021234567",
    })).rejects.toSatisfy(forbiddenOrHidden);
    await expect(releaseWorkforceRelationship(f.member, {
      kind: "osm", relationshipId: osmRelationship.id, targetHospitalId: f.parentId, expectedUpdatedAt: osmRelationship.updatedAt.toISOString(), confirmation: "นำออกจากโรงพยาบาลนี้อย่างถาวร",
    })).rejects.toSatisfy(forbiddenOrHidden);
    await expect(issuePatientActivation(f.member, { userId: f.patientA.userId, targetHospitalId: f.parentId, reissue: false }))
      .rejects.toSatisfy(forbiddenOrHidden);
    await expect(endPatientHospitalRelationship(f.member, {
      relationshipId: f.patientA.relationshipId, endReason: "ห้าม", confirmRetention: true,
    })).rejects.toSatisfy(forbiddenOrHidden);

    expect((await db.osmHospitalRelationship.findUniqueOrThrow({ where: { id: osmRelationship.id } })).status).toBe(MembershipStatus.ACTIVE);
    expect((await db.hospitalMembership.findUniqueOrThrow({ where: { id: f.owner.membershipId } })).membershipType).toBe(MembershipType.OWNER);
    expect(await db.patientActivation.count({ where: { hospitalId: f.parentId } })).toBe(0);
    expect((await db.patientHospitalRelationship.findUniqueOrThrow({ where: { id: f.patientA.relationshipId } })).endedAt).toBeNull();
  });
});
