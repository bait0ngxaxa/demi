import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

import {
  HospitalContentStatus,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
} from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  listEligibleHospitalContactOwnerHospitals,
  listOwnPatientHospitalContacts,
  readHospitalContactForOwner,
  readOwnPatientHospitalContact,
  updateHospitalContact,
} from "@/modules/hospital-contact/services/hospital-contact-service";
import {
  archiveHospitalContent,
  createHospitalContent,
  listEligibleHospitalContentOwnerHospitals,
  listHospitalContentForOwner,
  publishHospitalContent,
  readHospitalContentForOwner,
} from "@/modules/hospital-content/services/hospital-content-service";
import {
  getPatientHospitalContent,
  listPatientHospitalContent,
} from "@/modules/hospital-content/services/hospital-content-patient-query-service";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

const database = getPrisma();
const execFileAsync = promisify(execFile);
const seedScript = "scripts/seed-hospital-master.mjs";
const fixedNow = new Date("2026-10-06T06:00:00.000Z");
const users: string[] = [];
const persons: string[] = [];
const patientProfileIds: string[] = [];
const hospitalIds: string[] = [];
const contactIds: string[] = [];
const contentIds: string[] = [];
let databaseConnected = false;
let sequence = 0;

type ContactState = {
  addressText: string | null;
  phoneNumber: string | null;
  expectedUpdatedAt: string | null;
};

async function createActor(roles: readonly Role[]): Promise<ActorContext> {
  sequence += 1;
  const person = await database.person.create({
    data: { identityKeyHash: randomUUID(), givenName: "ผู้ใช้สังเคราะห์", familyName: `ทดสอบ ${sequence}` },
    select: { id: true },
  });
  persons.push(person.id);
  const user = await database.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE, roles: { create: roles.map((role) => ({ role })) } },
    select: { id: true },
  });
  users.push(user.id);
  if (roles.includes(Role.PATIENT)) {
    const profile = await database.patientProfile.create({ data: { personId: person.id }, select: { id: true } });
    patientProfileIds.push(profile.id);
  }
  return {
    userId: user.id,
    personId: person.id,
    roles,
    hospitalMemberships: [],
    osmHospitalRelationships: [],
  };
}

async function addOwner(actor: ActorContext, hospitalId: string): Promise<{ actor: ActorContext; membershipId: string }> {
  const hospital = await database.hospital.findUniqueOrThrow({ where: { id: hospitalId }, select: { status: true } });
  const membership = await database.hospitalMembership.create({
    data: { userId: actor.userId, hospitalId, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE },
    select: { id: true },
  });
  return {
    actor: {
      ...actor,
      hospitalMemberships: [
        ...actor.hospitalMemberships,
        { hospitalId, membershipType: MembershipType.OWNER, status: MembershipStatus.ACTIVE, hospitalStatus: hospital.status, profession: null },
      ],
    },
    membershipId: membership.id,
  };
}

async function createHospital(parentHospitalId?: string): Promise<string> {
  sequence += 1;
  const hospital = await database.hospital.create({
    data: {
      hospitalCode: `I4A-${randomUUID().slice(0, 12)}`,
      name: `โรงพยาบาลสังเคราะห์ ${sequence}`,
      status: HospitalStatus.ACTIVE,
      parentHospitalId,
    },
    select: { id: true },
  });
  hospitalIds.push(hospital.id);
  return hospital.id;
}

async function relatePatient(actor: ActorContext, hospitalId: string): Promise<string> {
  const profile = await database.patientProfile.findUniqueOrThrow({ where: { personId: actor.personId }, select: { id: true } });
  const relationship = await database.patientHospitalRelationship.create({
    data: { patientProfileId: profile.id, hospitalId },
    select: { id: true },
  });
  return relationship.id;
}

async function saveContact(
  actor: ActorContext,
  hospitalId: string,
  expectedUpdatedAt: string | null,
  addressText: string | null,
  phoneNumber: string | null,
  at = fixedNow,
): Promise<ContactState> {
  const result = await updateHospitalContact(
    actor,
    { hospitalId, expectedUpdatedAt, addressText, phoneNumber },
    { database, now: () => at },
  );
  if (result.outcome === "UNCONFIRMED") throw new Error("Hospital Contact result was unconfirmed");
  return result.contact;
}

async function createDraft(actor: ActorContext, hospitalId: string, title: string) {
  const result = await createHospitalContent(actor, {
    hospitalId,
    submissionNonce: randomUUID(),
    title,
    body: "ข้อมูลสังเคราะห์\nบรรทัดที่สอง",
    category: "NCD",
    sourceText: "https://example.test/source",
  }, { database, now: () => fixedNow });
  if (result.outcome !== "CREATED") throw new Error(`Expected CREATED, received ${result.outcome}`);
  contentIds.push(result.content.id);
  return result.content;
}

async function publishDraft(actor: ActorContext, contentId: string, expectedUpdatedAt: string, at = fixedNow) {
  const result = await publishHospitalContent(actor, { contentId, expectedUpdatedAt }, { database, now: () => at });
  if (result.outcome !== "PUBLISHED") throw new Error(`Expected PUBLISHED, received ${result.outcome}`);
  return result.content;
}

async function runHospitalMasterSeed(): Promise<void> {
  await execFileAsync(process.execPath, [seedScript], { cwd: process.cwd(), env: process.env });
}

async function cleanup(): Promise<void> {
  if (!databaseConnected) return;
  await database.hospitalContent.deleteMany({ where: { id: { in: contentIds } } });
  await database.hospitalContact.deleteMany({ where: { id: { in: contactIds } } });
  await database.patientHospitalRelationship.deleteMany({ where: { patientProfileId: { in: patientProfileIds } } });
  await database.hospitalMembership.deleteMany({ where: { userId: { in: users } } });
  await database.auditEvent.deleteMany({ where: { actorUserId: { in: users } } });
  await database.patientProfile.deleteMany({ where: { personId: { in: persons } } });
  await database.userRole.deleteMany({ where: { userId: { in: users } } });
  await database.user.deleteMany({ where: { id: { in: users } } });
  if (hospitalIds.length > 0) {
    await database.hospital.updateMany({ where: { id: { in: hospitalIds } }, data: { parentHospitalId: null } });
    await database.hospital.deleteMany({ where: { id: { in: hospitalIds } } });
  }
  await database.person.deleteMany({ where: { id: { in: persons } } });
  users.length = 0;
  persons.length = 0;
  patientProfileIds.length = 0;
  hospitalIds.length = 0;
  contactIds.length = 0;
  contentIds.length = 0;
}

describe("Phase 17I.4A Hospital Knowledge / Contact PostgreSQL integration", () => {
  beforeAll(async () => {
    const url = process.env.DEMI_TEST_DATABASE_URL;
    if (!url || process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url || process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
      throw new Error("Verified local disposable PostgreSQL required");
    }
    await database.$connect();
    databaseConnected = true;
  });
  afterEach(cleanup);
  afterAll(async () => {
    if (databaseConnected) {
      await cleanup();
      await database.$disconnect();
    }
  });

  it("confirms the physical Contact and Content field shapes and PostgreSQL time precision", async () => {
    const columns = await database.$queryRaw<Array<{
      table_name: string;
      column_name: string;
      data_type: string;
      maximum_length: number | null;
      time_precision: number | null;
      udt_name: string;
    }>>(Prisma.sql`
      SELECT "table_name", "column_name", "data_type",
        "character_maximum_length" AS "maximum_length",
        "datetime_precision" AS "time_precision", "udt_name"
      FROM information_schema.columns
      WHERE "table_schema" = current_schema()
        AND "table_name" IN ('HospitalContact', 'HospitalContent')
      ORDER BY "table_name", "ordinal_position"
    `);
    const byTable = new Map<string, typeof columns>();
    for (const column of columns) {
      const current = byTable.get(column.table_name) ?? [];
      current.push(column);
      byTable.set(column.table_name, current);
    }
    expect(byTable.get("HospitalContact")?.map(({ column_name }) => column_name)).toEqual([
      "id", "hospitalId", "addressText", "phoneNumber", "createdAt", "updatedAt",
    ]);
    expect(byTable.get("HospitalContent")?.map(({ column_name }) => column_name)).toEqual([
      "id", "hospitalId", "submissionNonce", "title", "body", "category", "sourceText", "status",
      "firstPublishedAt", "latestPublishedAt", "createdAt", "updatedAt",
    ]);
    const contact = new Map((byTable.get("HospitalContact") ?? []).map((column) => [column.column_name, column]));
    const content = new Map((byTable.get("HospitalContent") ?? []).map((column) => [column.column_name, column]));
    expect(contact.get("id")).toMatchObject({ data_type: "uuid", udt_name: "uuid" });
    expect(contact.get("hospitalId")).toMatchObject({ data_type: "uuid", udt_name: "uuid" });
    expect(contact.get("addressText")).toMatchObject({ data_type: "character varying", maximum_length: 500 });
    expect(contact.get("phoneNumber")).toMatchObject({ data_type: "character varying", maximum_length: 32 });
    expect(contact.get("createdAt")).toMatchObject({ data_type: "timestamp without time zone", time_precision: 3 });
    expect(contact.get("updatedAt")).toMatchObject({ data_type: "timestamp without time zone", time_precision: 3 });
    expect(content.get("id")).toMatchObject({ data_type: "uuid", udt_name: "uuid" });
    expect(content.get("hospitalId")).toMatchObject({ data_type: "uuid", udt_name: "uuid" });
    expect(content.get("submissionNonce")).toMatchObject({ data_type: "uuid", udt_name: "uuid" });
    expect(content.get("title")).toMatchObject({ data_type: "character varying", maximum_length: 200 });
    expect(content.get("body")).toMatchObject({ data_type: "text", udt_name: "text" });
    expect(content.get("sourceText")).toMatchObject({ data_type: "character varying", maximum_length: 1000 });
    for (const name of ["firstPublishedAt", "latestPublishedAt", "createdAt", "updatedAt"]) {
      expect(content.get(name)).toMatchObject({ data_type: "timestamp with time zone", time_precision: 3 });
    }

    const enumRows = await database.$queryRaw<Array<{ type_name: string; enum_value: string }>>(Prisma.sql`
      SELECT t."typname" AS "type_name", e."enumlabel" AS "enum_value"
      FROM pg_type t JOIN pg_enum e ON e."enumtypid" = t."oid"
      WHERE t."typnamespace" = current_schema()::regnamespace
        AND t."typname" IN ('HospitalContentStatus', 'HospitalContentCategory')
      ORDER BY t."typname", e."enumsortorder"
    `);
    expect(enumRows.filter(({ type_name }) => type_name === "HospitalContentStatus").map(({ enum_value }) => enum_value)).toEqual([
      "DRAFT", "PUBLISHED", "ARCHIVED",
    ]);
    expect(enumRows.filter(({ type_name }) => type_name === "HospitalContentCategory").map(({ enum_value }) => enum_value)).toEqual([
      "NCD", "FOOD", "EXERCISE", "OTHER",
    ]);

    const foreignKeys = await database.$queryRaw<Array<{ conname: string; confdeltype: string; confupdtype: string }>>(Prisma.sql`
      SELECT "conname", "confdeltype"::text, "confupdtype"::text
      FROM pg_constraint
      WHERE "conrelid" IN ('public."HospitalContact"'::regclass, 'public."HospitalContent"'::regclass)
        AND "contype" = 'f'
    `);
    expect(foreignKeys).toEqual(expect.arrayContaining([
      { conname: "HospitalContact_hospitalId_fkey", confdeltype: "r", confupdtype: "c" },
      { conname: "HospitalContent_hospitalId_fkey", confdeltype: "r", confupdtype: "r" },
    ]));
  });

  it("keeps Contact and Content independent through Patient reads and the complete Content lifecycle", async () => {
    const hospitalId = await createHospital();
    const owner = await addOwner(await createActor([Role.HOSPITAL]), hospitalId);
    const patient = await createActor([Role.PATIENT]);
    await relatePatient(patient, hospitalId);
    const initialContact = await saveContact(owner.actor, hospitalId, null, "ที่อยู่เดิม", "02-123-4567");
    const draft = await createDraft(owner.actor, hospitalId, "ข่าวทดสอบแยกโดเมน");
    const contactRow = await database.hospitalContact.findUniqueOrThrow({ where: { hospitalId } });
    contactIds.push(contactRow.id);
    const draftRow = await database.hospitalContent.findUniqueOrThrow({ where: { id: draft.id } });

    const updatedContact = await saveContact(owner.actor, hospitalId, initialContact.expectedUpdatedAt, "ที่อยู่ใหม่", "02-765-4321", new Date(fixedNow.getTime() + 1));
    expect(await database.hospitalContent.findUniqueOrThrow({ where: { id: draft.id } })).toEqual(draftRow);
    expect((await listOwnPatientHospitalContacts(patient)).map((read) => read.availability === "AVAILABLE" ? read.contact.addressText : null)).toEqual(["ที่อยู่ใหม่"]);
    expect((await listPatientHospitalContent(patient, {}, database)).items).toEqual([]);

    const published = await publishDraft(owner.actor, draft.id, draft.expectedUpdatedAt, new Date(fixedNow.getTime() + 2));
    expect(await database.hospitalContact.findUniqueOrThrow({ where: { hospitalId } })).toEqual(await database.hospitalContact.findUniqueOrThrow({ where: { id: contactRow.id } }));
    expect((await listPatientHospitalContent(patient, {}, database)).items.map(({ id }) => id)).toEqual([draft.id]);
    expect(await getPatientHospitalContent(patient, draft.id, database)).toMatchObject({
      body: "ข้อมูลสังเคราะห์\nบรรทัดที่สอง",
      sourceText: "https://example.test/source",
      latestPublishedAt: published.latestPublishedAt,
    });

    const emptyAuditCount = await database.auditEvent.count({ where: { actorUserId: patient.userId } });
    const archived = await archiveHospitalContent(owner.actor, {
      contentId: draft.id,
      expectedUpdatedAt: published.expectedUpdatedAt,
    }, { database, now: () => new Date(fixedNow.getTime() + 3) });
    expect(archived.outcome).toBe("ARCHIVED");
    const persistedContact = await database.hospitalContact.findUniqueOrThrow({ where: { id: contactRow.id } });
    if (!updatedContact.expectedUpdatedAt) throw new Error("Expected a Contact version after update");
    expect(persistedContact).toMatchObject({
      addressText: updatedContact.addressText,
      phoneNumber: updatedContact.phoneNumber,
      updatedAt: new Date(updatedContact.expectedUpdatedAt),
    });
    expect((await listPatientHospitalContent(patient, {}, database)).items).toEqual([]);
    await expect(getPatientHospitalContent(patient, draft.id, database)).rejects.toBeInstanceOf(NotFoundError);
    expect(await database.auditEvent.count({ where: { actorUserId: patient.userId } })).toBe(emptyAuditCount);

    const contactAudit = await database.auditEvent.findMany({
      where: { resourceId: contactRow.id },
      select: { action: true, resourceType: true, resourceId: true, metadata: true },
      orderBy: { createdAt: "asc" },
    });
    expect(contactAudit.map(({ action }) => action).sort()).toEqual(["hospital_contact.created", "hospital_contact.updated"].sort());
    expect(contactAudit.every((event) => event.resourceType === "HospitalContact" && event.resourceId === contactRow.id && JSON.stringify(event.metadata) === JSON.stringify({ hospitalId }))).toBe(true);
    const contentAudit = await database.auditEvent.findMany({
      where: { resourceId: draft.id },
      select: { action: true, resourceType: true, resourceId: true, metadata: true },
      orderBy: { createdAt: "asc" },
    });
    expect(contentAudit.map(({ action }) => action).sort()).toEqual([
      "hospital_content.created", "hospital_content.published", "hospital_content.archived",
    ].sort());
    expect(contentAudit.every((event) => event.resourceType === "HospitalContent" && event.resourceId === draft.id && JSON.stringify(event.metadata) === JSON.stringify({ hospitalId }))).toBe(true);
    expect(JSON.stringify([...contactAudit, ...contentAudit])).not.toContain("ที่อยู่");
    expect(JSON.stringify([...contactAudit, ...contentAudit])).not.toContain("ข่าวทดสอบแยกโดเมน");
  });

  it("removes Patient Contact and Content access with the relationship while direct Owner scope remains", async () => {
    const hospitalId = await createHospital();
    const owner = await addOwner(await createActor([Role.HOSPITAL]), hospitalId);
    const patient = await createActor([Role.PATIENT]);
    const relationshipId = await relatePatient(patient, hospitalId);
    const contact = await saveContact(owner.actor, hospitalId, null, "ที่อยู่สัมพันธ์", null);
    const contactRow = await database.hospitalContact.findUniqueOrThrow({ where: { hospitalId } });
    contactIds.push(contactRow.id);
    const draft = await createDraft(owner.actor, hospitalId, "เนื้อหาก่อนถอนความสัมพันธ์");
    const published = await publishDraft(owner.actor, draft.id, draft.expectedUpdatedAt);

    await database.patientHospitalRelationship.delete({ where: { id: relationshipId } });
    await expect(readOwnPatientHospitalContact(patient, relationshipId)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listOwnPatientHospitalContacts(patient)).toEqual([]);
    expect((await listPatientHospitalContent(patient, {}, database)).emptyState).toBe("EMPTY_A");
    await expect(getPatientHospitalContent(patient, draft.id, database)).rejects.toBeInstanceOf(NotFoundError);

    expect(await readHospitalContactForOwner(owner.actor, hospitalId)).toMatchObject({ addressText: contact.addressText });
    expect((await listEligibleHospitalContactOwnerHospitals(owner.actor)).map(({ id }) => id)).toEqual([hospitalId]);
    expect((await listEligibleHospitalContentOwnerHospitals(owner.actor)).map(({ id }) => id)).toEqual([hospitalId]);
    expect((await listHospitalContentForOwner(owner.actor, hospitalId)).items.map(({ id }) => id)).toContain(draft.id);
    expect((await readHospitalContentForOwner(owner.actor, draft.id)).status).toBe(HospitalContentStatus.PUBLISHED);
    expect(published.status).toBe(HospitalContentStatus.PUBLISHED);
  });

  it("keeps Patient SELF access independent from Owner demotion and withholds both domains after Hospital suspension", async () => {
    const hospitalId = await createHospital();
    const patientOwner = await addOwner(await createActor([Role.PATIENT, Role.HOSPITAL]), hospitalId);
    const independentOwner = await addOwner(await createActor([Role.HOSPITAL]), hospitalId);
    const relationshipId = await relatePatient(patientOwner.actor, hospitalId);
    const contact = await saveContact(patientOwner.actor, hospitalId, null, "ข้อมูลที่ยังเป็นของ Patient", "02-555-0101");
    const contactRow = await database.hospitalContact.findUniqueOrThrow({ where: { hospitalId } });
    contactIds.push(contactRow.id);
    const draft = await createDraft(patientOwner.actor, hospitalId, "ข่าวของ Hospital");
    await publishDraft(patientOwner.actor, draft.id, draft.expectedUpdatedAt);

    await database.hospitalMembership.update({
      where: { id: patientOwner.membershipId },
      data: { membershipType: MembershipType.MEMBER },
    });
    await expect(saveContact(patientOwner.actor, hospitalId, contact.expectedUpdatedAt, "ต้องถูกปฏิเสธ", null)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(archiveHospitalContent(patientOwner.actor, {
      contentId: draft.id,
      expectedUpdatedAt: (await database.hospitalContent.findUniqueOrThrow({ where: { id: draft.id }, select: { updatedAt: true } })).updatedAt.toISOString(),
    }, { database })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await listOwnPatientHospitalContacts(patientOwner.actor)).map((read) => read.availability === "AVAILABLE" ? read.contact.addressText : null)).toEqual(["ข้อมูลที่ยังเป็นของ Patient"]);
    expect((await listPatientHospitalContent(patientOwner.actor, {}, database)).items.map(({ id }) => id)).toEqual([draft.id]);
    expect((await readOwnPatientHospitalContact(patientOwner.actor, relationshipId)).availability).toBe("AVAILABLE");

    await database.hospital.update({ where: { id: hospitalId }, data: { status: HospitalStatus.SUSPENDED } });
    const unavailable = await readOwnPatientHospitalContact(patientOwner.actor, relationshipId);
    expect(unavailable).toEqual({ relationshipId, availability: "UNAVAILABLE" });
    expect((await listOwnPatientHospitalContacts(patientOwner.actor)).every(({ availability }) => availability === "UNAVAILABLE")).toBe(true);
    expect((await listPatientHospitalContent(patientOwner.actor, {}, database)).items).toEqual([]);
    await expect(getPatientHospitalContent(patientOwner.actor, draft.id, database)).rejects.toBeInstanceOf(NotFoundError);
    expect(await listEligibleHospitalContactOwnerHospitals(independentOwner.actor)).toEqual([]);
    expect(await listEligibleHospitalContentOwnerHospitals(independentOwner.actor)).toEqual([]);
    await expect(saveContact(independentOwner.actor, hospitalId, contact.expectedUpdatedAt, "ต้องถูกปฏิเสธ", null)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(publishHospitalContent(independentOwner.actor, {
      contentId: draft.id,
      expectedUpdatedAt: (await database.hospitalContent.findUniqueOrThrow({ where: { id: draft.id }, select: { updatedAt: true } })).updatedAt.toISOString(),
    }, { database })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("keeps PATIENT+OWNER Work Hospital A separate from Patient Hospital B", async () => {
    const hospitalA = await createHospital();
    const hospitalB = await createHospital();
    const multiRole = await addOwner(await createActor([Role.PATIENT, Role.HOSPITAL]), hospitalA);
    const hospitalBOwner = await addOwner(await createActor([Role.HOSPITAL]), hospitalB);
    await relatePatient(multiRole.actor, hospitalB);
    const contactA = await saveContact(multiRole.actor, hospitalA, null, "Work A", null);
    const contactRowA = await database.hospitalContact.findUniqueOrThrow({ where: { hospitalId: hospitalA } });
    contactIds.push(contactRowA.id);
    const contactB = await saveContact(hospitalBOwner.actor, hospitalB, null, "Patient B", null);
    const contactRowB = await database.hospitalContact.findUniqueOrThrow({ where: { hospitalId: hospitalB } });
    contactIds.push(contactRowB.id);
    const draftA = await createDraft(multiRole.actor, hospitalA, "Work A content");
    const publishedA = await publishDraft(multiRole.actor, draftA.id, draftA.expectedUpdatedAt);
    const draftB = await createDraft(hospitalBOwner.actor, hospitalB, "Patient B content");
    await publishDraft(hospitalBOwner.actor, draftB.id, draftB.expectedUpdatedAt);

    expect((await listEligibleHospitalContactOwnerHospitals(multiRole.actor)).map(({ id }) => id)).toEqual([hospitalA]);
    expect((await listEligibleHospitalContentOwnerHospitals(multiRole.actor)).map(({ id }) => id)).toEqual([hospitalA]);
    expect((await readHospitalContactForOwner(multiRole.actor, hospitalA)).addressText).toBe(contactA.addressText);
    await expect(readHospitalContactForOwner(multiRole.actor, hospitalB)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await listHospitalContentForOwner(multiRole.actor, hospitalA)).items.map(({ id }) => id)).toContain(draftA.id);
    await expect(listHospitalContentForOwner(multiRole.actor, hospitalB)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveContact(multiRole.actor, hospitalB, contactB.expectedUpdatedAt, "ไม่ใช่ Work scope", null)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createHospitalContent(multiRole.actor, {
      hospitalId: hospitalB,
      submissionNonce: randomUUID(),
      title: "ห้ามเผยแพร่ข้าม Hospital",
      body: "ข้อมูลทดสอบ",
      category: "OTHER",
      sourceText: null,
    }, { database })).rejects.toBeInstanceOf(ForbiddenError);

    expect((await listOwnPatientHospitalContacts(multiRole.actor)).map((read) => read.availability === "AVAILABLE" ? read.contact.addressText : null)).toEqual(["Patient B"]);
    expect((await listPatientHospitalContent(multiRole.actor, {}, database)).items.map(({ id }) => id)).toEqual([draftB.id]);
    await expect(getPatientHospitalContent(multiRole.actor, draftA.id, database)).rejects.toBeInstanceOf(NotFoundError);
    expect(await readHospitalContactForOwner(hospitalBOwner.actor, hospitalB)).toMatchObject({ addressText: "Patient B" });
    expect(publishedA.status).toBe(HospitalContentStatus.PUBLISHED);
  });

  it("does not inherit Contact or Content authority through either Hospital hierarchy direction", async () => {
    const parentId = await createHospital();
    const childId = await createHospital(parentId);
    const parentOwner = await addOwner(await createActor([Role.HOSPITAL]), parentId);
    const childOwner = await addOwner(await createActor([Role.HOSPITAL]), childId);
    const parentPatient = await createActor([Role.PATIENT]);
    const childPatient = await createActor([Role.PATIENT]);
    await relatePatient(parentPatient, parentId);
    await relatePatient(childPatient, childId);

    await saveContact(parentOwner.actor, parentId, null, "Parent contact", null);
    const parentContactRow = await database.hospitalContact.findUniqueOrThrow({ where: { hospitalId: parentId } });
    contactIds.push(parentContactRow.id);
    await saveContact(childOwner.actor, childId, null, "Child contact", null);
    const childContactRow = await database.hospitalContact.findUniqueOrThrow({ where: { hospitalId: childId } });
    contactIds.push(childContactRow.id);
    const parentDraft = await createDraft(parentOwner.actor, parentId, "Parent content");
    await publishDraft(parentOwner.actor, parentDraft.id, parentDraft.expectedUpdatedAt);
    const childDraft = await createDraft(childOwner.actor, childId, "Child content");
    await publishDraft(childOwner.actor, childDraft.id, childDraft.expectedUpdatedAt);

    expect((await listEligibleHospitalContactOwnerHospitals(parentOwner.actor)).map(({ id }) => id)).toEqual([parentId]);
    expect((await listEligibleHospitalContactOwnerHospitals(childOwner.actor)).map(({ id }) => id)).toEqual([childId]);
    await expect(readHospitalContactForOwner(parentOwner.actor, childId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(readHospitalContactForOwner(childOwner.actor, parentId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listHospitalContentForOwner(parentOwner.actor, childId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listHospitalContentForOwner(childOwner.actor, parentId)).rejects.toBeInstanceOf(ForbiddenError);

    expect((await listOwnPatientHospitalContacts(parentPatient)).map((read) => read.availability === "AVAILABLE" ? read.contact.addressText : null)).toEqual(["Parent contact"]);
    expect((await listOwnPatientHospitalContacts(childPatient)).map((read) => read.availability === "AVAILABLE" ? read.contact.addressText : null)).toEqual(["Child contact"]);
    expect((await listPatientHospitalContent(parentPatient, {}, database)).items.map(({ id }) => id)).toEqual([parentDraft.id]);
    expect((await listPatientHospitalContent(childPatient, {}, database)).items.map(({ id }) => id)).toEqual([childDraft.id]);
    await expect(getPatientHospitalContent(parentPatient, childDraft.id, database)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getPatientHospitalContent(childPatient, parentDraft.id, database)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("preserves a published Content row and Contact value/version across a real Master seed rerun", async () => {
    await runHospitalMasterSeed();
    const hospital = await database.hospital.findUniqueOrThrow({
      where: { hospitalCode: "KHON" },
      select: { id: true, hospitalCode: true, name: true, parentHospitalId: true, status: true },
    });
    await database.hospital.update({ where: { id: hospital.id }, data: { status: HospitalStatus.ACTIVE } });
    const owner = await addOwner(await createActor([Role.HOSPITAL]), hospital.id);
    const beforeSeedIdentity = await database.hospital.findUniqueOrThrow({ where: { id: hospital.id }, select: { id: true, hospitalCode: true, name: true, parentHospitalId: true, status: true } });
    const contact = await saveContact(owner.actor, hospital.id, null, "ที่อยู่คงเดิมหลัง seed", "02-222-3333");
    const contactRow = await database.hospitalContact.findUniqueOrThrow({ where: { hospitalId: hospital.id } });
    contactIds.push(contactRow.id);
    const draft = await createDraft(owner.actor, hospital.id, "บทความที่เผยแพร่ก่อน seed");
    const published = await publishDraft(owner.actor, draft.id, draft.expectedUpdatedAt);
    const beforeContact = await database.hospitalContact.findUniqueOrThrow({ where: { id: contactRow.id } });
    const beforeContent = await database.hospitalContent.findUniqueOrThrow({ where: { id: draft.id } });
    const beforeContactCount = await database.hospitalContact.count();
    const beforeContentCount = await database.hospitalContent.count();
    expect(beforeContent.status).toBe(HospitalContentStatus.PUBLISHED);

    await runHospitalMasterSeed();

    expect(await database.hospital.findUniqueOrThrow({ where: { id: hospital.id }, select: { id: true, hospitalCode: true, name: true, parentHospitalId: true, status: true } })).toEqual(beforeSeedIdentity);
    expect(await database.hospitalContact.findUniqueOrThrow({ where: { id: contactRow.id } })).toEqual(beforeContact);
    expect(await database.hospitalContent.findUniqueOrThrow({ where: { id: draft.id } })).toEqual(beforeContent);
    expect(await database.hospitalContact.count()).toBe(beforeContactCount);
    expect(await database.hospitalContent.count()).toBe(beforeContentCount);
    expect(await database.hospitalContact.count({ where: { hospitalId: hospital.id } })).toBe(1);
    expect(await database.hospitalContent.count({ where: { hospitalId: hospital.id } })).toBe(1);
    expect(published.status).toBe(HospitalContentStatus.PUBLISHED);
    expect(beforeContact.addressText).toBe(contact.addressText);
  });
});
