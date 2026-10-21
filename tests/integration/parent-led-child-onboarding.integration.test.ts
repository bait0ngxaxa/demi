import { randomInt, randomUUID } from "node:crypto";
import { HospitalStatus, MembershipStatus, Role, UserStatus, WorkforceActivationPurpose, type HospitalServiceAreaFacilityKind } from "@prisma/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  applyHospitalBulkRegistration,
  HospitalBulkRegistrationRejectedError,
  HospitalRetirementIneligibleError,
  previewHospitalBulkRegistration,
  retireHospitals,
} from "@/modules/hospital-governance/services/hospital-governance-service";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { approveHospitalOnboarding, submitHospitalOnboarding } from "@/modules/hospital-onboarding/services/hospital-onboarding-service";
import { findOnboardingHospitalByCode, listOnboardingHospitals } from "@/modules/hospital-onboarding/services/onboarding-hospital-service";
import {
  acceptChildOwnerInvitation,
  cancelPendingChildFacility,
  changeChildOwnerInvitee,
  createChildFacility,
  declineChildOwnerInvitation,
  inviteReplacementChildOwner,
  issueChildOwnerLink,
  listChildOwnerInvitationsForActor,
  listManagedChildFacilities,
  renameChildFacility,
  revokeChildOwnerLink,
  type ChildOwnerInvitationIssue,
} from "@/modules/hospital-service-areas/services/child-facility-service";
import { findNetworkChild, findNetworkPatientReadParent, listNetworkScopes } from "@/modules/hospital-service-areas/services/hospital-network-access";
import { setHospitalNetworkRole, transferHospitalServiceArea } from "@/modules/hospital-service-areas/services/hospital-network-governance-service";
import { endHospitalServiceArea } from "@/modules/hospital-service-areas/services/hospital-service-area-service";
import { completeWorkforceActivation, previewWorkforceActivation } from "@/modules/workforce/services/workforce-service";

// ADR-0018 / Phase O1: ADMIN bulk Parent registration and Parent-led Child onboarding.
const db = getPrisma();
const PASSWORD = "integration-child-owner-password";
const hospitalIds: string[] = [];
const userIds: string[] = [];
const personIds: string[] = [];
const nationalIds: string[] = [];
let admin: ActorContext;

beforeAll(() => {
  const url = process.env.DEMI_TEST_DATABASE_URL;
  if (!url || process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url ||
      process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) {
    throw new Error("Verified local disposable PostgreSQL required");
  }
});

// Valid Thai national IDs (checksum included), random so files never collide on Person identity.
function nationalId(): string {
  const base = `1${String(randomInt(1, 99_999_999_999)).padStart(11, "0")}`;
  const sum = Array.from(base, Number).reduce((total, digit, index) => total + digit * (13 - index), 0);
  const value = `${base}${(11 - (sum % 11)) % 10}`;
  nationalIds.push(value);
  return value;
}

async function user(roles: Role[], options: { status?: UserStatus; nationalId?: string } = {}): Promise<ActorContext> {
  const person = await db.person.create({
    data: {
      identityKeyHash: options.nationalId
        ? hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: options.nationalId })
        : `child-onboarding-${randomUUID()}`,
      givenName: "ทดสอบ", familyName: "ลูกข่าย",
    },
  });
  personIds.push(person.id);
  const status = options.status ?? UserStatus.ACTIVE;
  const created = await db.user.create({
    data: {
      personId: person.id, status, authSubject: status === UserStatus.PROVISIONED ? null : randomUUID(),
      roles: { create: roles.map((role) => ({ role })) },
    },
  });
  userIds.push(created.id);
  return { userId: created.id, personId: person.id, roles, hospitalMemberships: [], osmHospitalRelationships: [] };
}

async function hospital(
  status: HospitalStatus = HospitalStatus.ACTIVE, kind: HospitalServiceAreaFacilityKind | null = "PARENT",
): Promise<{ id: string; hospitalCode: string; name: string }> {
  const row = await db.hospital.create({
    data: {
      hospitalCode: `CO${randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`, name: `รพ.แม่ข่าย ${hospitalIds.length}`, status,
      ...(kind ? { serviceAreaEligibility: { create: { kind, verifiedAt: new Date(), classifiedByUserId: admin.userId } } } : {}),
    },
    select: { id: true, hospitalCode: true, name: true },
  });
  hospitalIds.push(row.id);
  return row;
}

async function member(
  hospitalId: string, membershipType: "OWNER" | "MEMBER" = "OWNER", status: MembershipStatus = MembershipStatus.ACTIVE,
): Promise<ActorContext> {
  const actor = await user([Role.HOSPITAL]);
  const hospitalStatus = (await db.hospital.findUniqueOrThrow({ where: { id: hospitalId }, select: { status: true } })).status;
  await db.hospitalMembership.create({ data: { hospitalId, userId: actor.userId, status, membershipType } });
  return { ...actor, hospitalMemberships: [{ hospitalId, hospitalStatus, status, membershipType, profession: null }] };
}

function childInput(parentHospitalId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    parentHospitalId, name: `รพ.สต.ทดสอบ ${randomUUID().slice(0, 6)}`, nationalId: nationalId(),
    givenName: "สมหญิง", familyName: "ดูแลดี", mode: "REMOTE", submissionNonce: randomUUID(), ...overrides,
  };
}

function token(issue: ChildOwnerInvitationIssue): string {
  if (issue.status !== "ACTIVATION_LINK") throw new Error(`expected an activation link, got ${issue.status}`);
  return issue.activationToken;
}

function provisioner(authSubject = randomUUID()) {
  return async ({ userId }: { userId: string; password: string }) => {
    await db.user.update({ where: { id: userId }, data: { authSubject } });
    return { userId, authSubject };
  };
}

async function complete(activationToken: string, nid: string) {
  return completeWorkforceActivation(activationToken, { nationalId: nid, password: PASSWORD, passwordConfirmation: PASSWORD }, {
    provisionIdentity: provisioner(),
    deleteProviderIdentity: async () => undefined,
  });
}

async function setup(): Promise<{ parent: { id: string; hospitalCode: string; name: string }; parentOwner: ActorContext }> {
  const parent = await hospital();
  return { parent, parentOwner: await member(parent.id) };
}

beforeEach(async () => {
  admin = await user([Role.ADMIN]);
});

afterEach(async () => {
  // Disposable integration DB only (runner validates local URL); triggers and FKs are bypassed in this cleanup only.
  const hashes = nationalIds.map((value) => hashIdentityReference({ namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value }));
  const invitees = await db.user.findMany({ where: { person: { identityKeyHash: { in: hashes } } }, select: { id: true, personId: true } });
  const allUserIds = [...userIds, ...invitees.map(({ id }) => id)];
  const allPersonIds = [...personIds, ...invitees.map(({ personId }) => personId)];
  const created = await db.hospital.findMany({
    where: { OR: [{ id: { in: hospitalIds } }, { registeredByUserId: { in: allUserIds } }] }, select: { id: true },
  });
  const allHospitalIds = created.map(({ id }) => id);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.auditEvent.deleteMany({ where: { OR: [{ actorUserId: { in: allUserIds } }, { resourceId: { in: allHospitalIds } }] } });
    await tx.workforceActivation.deleteMany({ where: { OR: [{ userId: { in: allUserIds } }, { hospitalId: { in: allHospitalIds } }] } });
    await tx.hospitalMembership.deleteMany({ where: { OR: [{ userId: { in: allUserIds } }, { hospitalId: { in: allHospitalIds } }] } });
    await tx.hospitalServiceArea.deleteMany({ where: { OR: [{ parentHospitalId: { in: allHospitalIds } }, { childHospitalId: { in: allHospitalIds } }] } });
    await tx.hospitalRetirementEvent.deleteMany({ where: { hospitalId: { in: allHospitalIds } } });
    await tx.hospitalServiceAreaEligibility.deleteMany({ where: { hospitalId: { in: allHospitalIds } } });
    await tx.hospitalOnboardingApplication.deleteMany({ where: { hospitalId: { in: allHospitalIds } } });
    await tx.hospital.deleteMany({ where: { id: { in: allHospitalIds } } });
    await tx.userRole.deleteMany({ where: { userId: { in: allUserIds } } });
    await tx.user.deleteMany({ where: { id: { in: allUserIds } } });
    await tx.person.deleteMany({ where: { id: { in: allPersonIds } } });
  });
  hospitalIds.length = 0; userIds.length = 0; personIds.length = 0; nationalIds.length = 0;
});

describe("O1-A: ADMIN bulk Parent registration", () => {
  it("previews and applies a 3-row file as PENDING Parents on the public list; a replay creates nothing", async () => {
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    const csvText = `﻿name,hospitalCode\r\n"โรงพยาบาลบี, สาขา ${suffix}",B-${suffix}\r\nโรงพยาบาลเอ ${suffix},\r\nโรงพยาบาลซี ${suffix},C-${suffix}\r\n`;
    const preview = await previewHospitalBulkRegistration(admin, { csvText });
    expect(preview.map(({ rowNumber, status }) => [rowNumber, status])).toEqual([[2, "OK"], [3, "OK"], [4, "OK"]]);
    expect(preview[0]).toMatchObject({ name: `โรงพยาบาลบี, สาขา ${suffix}`, hospitalCode: `B-${suffix}` });

    const submissionNonce = randomUUID();
    const applied = await applyHospitalBulkRegistration(admin, { csvText, submissionNonce, confirmedRowNumbers: [] });
    expect(applied.replayed).toBe(false);
    expect(applied.hospitals).toHaveLength(3);
    expect(applied.hospitals[1]?.hospitalCode).toMatch(/^H-[2-9A-HJKMNP-Z]{6}$/u);
    const ids = applied.hospitals.map(({ id }) => id);
    expect(await db.hospital.findMany({
      where: { id: { in: ids } }, orderBy: { name: "asc" },
      select: { status: true, registeredByUserId: true, serviceAreaEligibility: { select: { kind: true } } },
    })).toEqual(Array(3).fill({ status: "PENDING_VERIFICATION", registeredByUserId: admin.userId, serviceAreaEligibility: { kind: "PARENT" } }));
    const listed = (await listOnboardingHospitals()).map(({ id }) => id);
    for (const id of ids) expect(listed).toContain(id);

    expect(await db.auditEvent.count({ where: { action: "hospital.created", resourceId: { in: ids } } })).toBe(3);
    expect(await db.auditEvent.findMany({ where: { action: "hospital.bulk_registered", actorUserId: admin.userId }, select: { resourceId: true, metadata: true } }))
      .toEqual([{ resourceId: submissionNonce, metadata: { rowCount: 3 } }]);

    const replay = await applyHospitalBulkRegistration(admin, { csvText, submissionNonce, confirmedRowNumbers: [] });
    expect(replay).toMatchObject({ replayed: true });
    expect(replay.hospitals.map(({ id }) => id)).toEqual(ids);
    expect(await db.hospital.count({ where: { registeredByUserId: admin.userId } })).toBe(3);
    // Same nonce, different content.
    await expect(applyHospitalBulkRegistration(admin, {
      csvText: `name,hospitalCode\nอื่น ${suffix},\n`, submissionNonce, confirmedRowNumbers: [],
    })).rejects.toMatchObject({ code: "CONFLICT" });
    // Same nonce, another ADMIN.
    await expect(applyHospitalBulkRegistration(await user([Role.ADMIN]), { csvText, submissionNonce, confirmedRowNumbers: [] }))
      .rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("changes nothing for a file with an invalid row, a repeated code or an existing code", async () => {
    const existing = await hospital(HospitalStatus.PENDING_VERIFICATION);
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    const cases = [
      [`name,hospitalCode\nดี ${suffix},\n,X-${suffix}\n`, "INVALID"],
      [`name,hospitalCode\nหนึ่ง ${suffix},D-${suffix}\nสอง ${suffix},d-${suffix}\n`, "DUPLICATE_CODE_IN_FILE"],
      [`name,hospitalCode\nสาม ${suffix},${existing.hospitalCode}\n`, "CODE_EXISTS"],
    ] as const;
    for (const [csvText, status] of cases) {
      const error = await applyHospitalBulkRegistration(admin, { csvText, submissionNonce: randomUUID(), confirmedRowNumbers: [2, 3] })
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(HospitalBulkRegistrationRejectedError);
      expect((error as HospitalBulkRegistrationRejectedError).rows.map((row) => row.status)).toContain(status);
    }
    expect(await db.hospital.count({ where: { registeredByUserId: admin.userId } })).toBe(0);
    await expect(applyHospitalBulkRegistration(admin, { csvText: "code,name\nx,y\n", submissionNonce: randomUUID(), confirmedRowNumbers: [] }))
      .rejects.toMatchObject({ fileError: "HEADER" });
    await expect(applyHospitalBulkRegistration(admin, { csvText: "name,hospitalCode\n\"unterminated,\n", submissionNonce: randomUUID(), confirmedRowNumbers: [] }))
      .rejects.toMatchObject({ fileError: "MALFORMED" });
  });

  it("requires explicit confirmation for a name similar to an existing Hospital or another row", async () => {
    const existing = await hospital(HospitalStatus.ACTIVE);
    const spaced = existing.name.replace("แม่ข่าย", "แม่ข่าย  ").toUpperCase();
    const csvText = `name,hospitalCode\n${spaced},\nเดี่ยว ${randomUUID().slice(0, 6)},\n`;
    const preview = await previewHospitalBulkRegistration(admin, { csvText });
    expect(preview[0]).toMatchObject({ status: "SIMILAR_NAME", similarTo: [{ source: "EXISTING", name: existing.name, hospitalCode: existing.hospitalCode }] });
    expect(preview[1]?.status).toBe("OK");

    await expect(applyHospitalBulkRegistration(admin, { csvText, submissionNonce: randomUUID(), confirmedRowNumbers: [] }))
      .rejects.toMatchObject({ unconfirmedRowNumbers: [2] });
    expect(await db.hospital.count({ where: { registeredByUserId: admin.userId } })).toBe(0);
    const applied = await applyHospitalBulkRegistration(admin, { csvText, submissionNonce: randomUUID(), confirmedRowNumbers: [2] });
    expect(applied.hospitals).toHaveLength(2);

    const twinName = `แฝด ${randomUUID().slice(0, 4)}`;
    expect((await previewHospitalBulkRegistration(admin, { csvText: `name,hospitalCode\n${twinName},\n ${twinName} ,\n` }))
      .map(({ status, similarTo }) => [status, similarTo.map(({ source }) => source)])).toEqual([["SIMILAR_NAME", ["FILE"]], ["SIMILAR_NAME", ["FILE"]]]);
  });

  it("is ADMIN-only", async () => {
    const { parentOwner } = await setup();
    const csvText = "name,hospitalCode\nห้าม,\n";
    await expect(previewHospitalBulkRegistration(parentOwner, { csvText })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(applyHospitalBulkRegistration(parentOwner, { csvText, submissionNonce: randomUUID(), confirmedRowNumbers: [] }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("O1-B: public onboarding is for Parents only", () => {
  it("never offers a Child or any Hospital that was ever a Child of an area; submit and approval refuse it", async () => {
    const { parent, parentOwner } = await setup();
    const created = await createChildFacility(parentOwner, childInput(parent.id));
    const adminChild = await hospital(HospitalStatus.PENDING_VERIFICATION, "CHILD");
    const pendingParent = await hospital(HospitalStatus.PENDING_VERIFICATION, "PARENT");
    const unclassified = await hospital(HospitalStatus.PENDING_VERIFICATION, null);
    // A former Child (area ended) reclassified as PARENT still never takes the public path.
    const formerChild = await hospital(HospitalStatus.ACTIVE, "CHILD");
    await db.hospitalServiceArea.create({ data: { parentHospitalId: parent.id, childHospitalId: formerChild.id, createdByUserId: parentOwner.userId } });
    const formerArea = await db.hospitalServiceArea.findFirstOrThrow({ where: { childHospitalId: formerChild.id } });
    await endHospitalServiceArea(parentOwner, { parentHospitalId: parent.id, areaId: formerArea.id, confirm: true, endReason: "ทดสอบ" });
    await setHospitalNetworkRole(admin, { hospitalId: formerChild.id, kind: "PARENT" });
    await db.hospital.update({ where: { id: formerChild.id }, data: { status: HospitalStatus.PENDING_VERIFICATION } });

    const listed = (await listOnboardingHospitals()).map(({ id }) => id);
    expect(listed).toContain(pendingParent.id);
    for (const id of [created.child.id, adminChild.id, unclassified.id, formerChild.id]) expect(listed).not.toContain(id);

    for (const target of [created.child, adminChild, formerChild]) {
      await expect(findOnboardingHospitalByCode(target.hospitalCode)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(submitHospitalOnboarding({
        hospitalCode: target.hospitalCode, nationalId: nationalId(), givenName: "สมชาย", familyName: "ใจดี",
        password: "correct-horse-battery-staple", passwordConfirmation: "correct-horse-battery-staple",
      })).rejects.toMatchObject({ code: "CONFLICT" });
      // Even a leftover application cannot activate it.
      const applicant = await user([], { status: UserStatus.PROVISIONED });
      await db.user.update({ where: { id: applicant.userId }, data: { authSubject: randomUUID() } });
      const application = await db.hospitalOnboardingApplication.create({ data: { hospitalId: target.id, applicantUserId: applicant.userId, status: "PENDING" } });
      await expect(approveHospitalOnboarding({ applicationId: application.id, reviewerUserId: admin.userId })).rejects.toMatchObject({ code: "CONFLICT" });
      expect((await db.hospital.findUniqueOrThrow({ where: { id: target.id } })).status).toBe(HospitalStatus.PENDING_VERIFICATION);
    }
  });
});

describe("O1-C: Parent creates a Child and invites its first OWNER", () => {
  it("creates, attaches and invites in one transaction; activation makes the Child ACTIVE and only then readable", async () => {
    const { parent, parentOwner } = await setup();
    const input = childInput(parent.id, { hospitalCode: ` co-${randomUUID().slice(0, 6)} ` });
    const created = await createChildFacility(parentOwner, input);
    const activationToken = token(created.invitation);
    expect(created.child).toMatchObject({ hospitalCode: String(input.hospitalCode).trim().toUpperCase(), name: input.name });

    const child = await db.hospital.findUniqueOrThrow({
      where: { id: created.child.id },
      select: { status: true, registeredByUserId: true, registeredForParentHospitalId: true, serviceAreaEligibility: { select: { kind: true, classifiedByUserId: true } } },
    });
    expect(child).toEqual({
      status: "PENDING_VERIFICATION", registeredByUserId: parentOwner.userId, registeredForParentHospitalId: parent.id,
      serviceAreaEligibility: { kind: "CHILD", classifiedByUserId: parentOwner.userId },
    });
    const area = await db.hospitalServiceArea.findFirstOrThrow({ where: { childHospitalId: created.child.id } });
    expect(area).toMatchObject({ parentHospitalId: parent.id, createdByUserId: parentOwner.userId, endedAt: null });
    const membership = await db.hospitalMembership.findFirstOrThrow({ where: { hospitalId: created.child.id } });
    expect(membership).toMatchObject({ membershipType: "OWNER", status: "PROVISIONED", invitedByUserId: parentOwner.userId, invitedViaServiceAreaId: area.id });
    const activation = await db.workforceActivation.findFirstOrThrow({ where: { relationshipId: membership.id } });
    expect(activation).toMatchObject({ purpose: "CHILD_OWNER_ONBOARDING", relationshipKind: "CHILD_OWNER", hospitalId: created.child.id, mode: "REMOTE" });
    expect(activation.expiresAt.getTime() - activation.createdAt.getTime()).toBeGreaterThan(23.9 * 3600_000);
    expect(activation.expiresAt.getTime() - activation.createdAt.getTime()).toBeLessThanOrEqual(24 * 3600_000 + 5_000);
    expect(activation.tokenHash).not.toBe(activationToken);

    const audits = await db.auditEvent.findMany({ where: { resourceId: created.child.id }, orderBy: { createdAt: "asc" }, select: { action: true, metadata: true } });
    expect(audits.map(({ action }) => action)).toEqual(["hospital.child_created", "hospital.child_owner_invited"]);
    expect(JSON.stringify(await db.auditEvent.findMany({ where: { actorUserId: parentOwner.userId } })))
      .not.toMatch(new RegExp(`${String(input.nationalId)}|${activationToken}`, "u"));

    // Both sides see รอเปิดใช้งาน; the Parent has no Patient read and no report scope yet (O-D3).
    const [managed] = await listManagedChildFacilities(parentOwner, { parentHospitalId: parent.id });
    expect(managed).toMatchObject({ state: "PENDING_ACTIVATION", registeredByThisParent: true, invitation: { delivery: "ACTIVATION_LINK", inviteeName: "สมหญิง ดูแลดี", link: { status: "OPEN", mode: "REMOTE" } } });
    for (const authority of ["PATIENT_READ", "OWNER"] as const) {
      expect(await findNetworkChild(db, parentOwner.userId, parent.id, created.child.id, authority)).toBeNull();
    }
    expect(await findNetworkPatientReadParent(db, parentOwner.userId, created.child.id)).toBeNull();
    expect((await listNetworkScopes(db, parentOwner.userId, "OWNER"))[0]?.children).toEqual([]);

    expect(await previewWorkforceActivation(activationToken)).toMatchObject({ purpose: "CHILD_OWNER_ONBOARDING" });
    await expect(complete(activationToken, nationalId())).rejects.toMatchObject({ code: "CONFLICT" });
    await complete(activationToken, String(input.nationalId));

    expect((await db.hospital.findUniqueOrThrow({ where: { id: created.child.id } })).status).toBe(HospitalStatus.ACTIVE);
    expect(await db.hospitalMembership.findUniqueOrThrow({ where: { id: membership.id }, select: { status: true, user: { select: { status: true } } } }))
      .toEqual({ status: "ACTIVE", user: { status: "ACTIVE" } });
    expect((await db.hospitalServiceArea.findUniqueOrThrow({ where: { id: area.id } })).endedAt).toBeNull();
    expect(await db.auditEvent.count({ where: { resourceId: created.child.id, action: "hospital.child_onboarded" } })).toBe(1);
    expect(await findNetworkChild(db, parentOwner.userId, parent.id, created.child.id, "PATIENT_READ")).not.toBeNull();
    expect((await listManagedChildFacilities(parentOwner, { parentHospitalId: parent.id }))[0]).toMatchObject({ state: "ACTIVE", invitation: null });
    await expect(complete(activationToken, String(input.nationalId))).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("replays the same submission without creating anything; the same nonce with other content conflicts", async () => {
    const { parent, parentOwner } = await setup();
    const input = childInput(parent.id);
    const created = await createChildFacility(parentOwner, input);
    const replay = await createChildFacility(parentOwner, input);
    expect(replay).toEqual({ child: created.child, invitation: { status: "ALREADY_ISSUED" } });
    expect(await db.hospital.count({ where: { registeredForParentHospitalId: parent.id } })).toBe(1);
    await expect(createChildFacility(parentOwner, { ...input, name: "ชื่ออื่น" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(createChildFacility(parentOwner, { ...input, nationalId: nationalId() })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(createChildFacility(await member(parent.id), input)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("never issues a token to an ACTIVE account: it accepts or declines in its own session", async () => {
    const { parent, parentOwner } = await setup();
    const acceptingId = nationalId();
    const invitee = await user([Role.PATIENT], { nationalId: acceptingId });
    const created = await createChildFacility(parentOwner, childInput(parent.id, { nationalId: acceptingId }));
    expect(created.invitation).toEqual({ status: "AWAITING_ACCEPTANCE" });
    const membership = await db.hospitalMembership.findFirstOrThrow({ where: { hospitalId: created.child.id } });
    expect(membership).toMatchObject({ userId: invitee.userId, status: "INVITED" });
    expect(await db.workforceActivation.count({ where: { userId: invitee.userId } })).toBe(0);
    expect(await db.userRole.findMany({ where: { userId: invitee.userId }, select: { role: true } })).toEqual([{ role: "PATIENT" }]);
    expect((await listManagedChildFacilities(parentOwner, { parentHospitalId: parent.id }))[0]?.invitation).toMatchObject({ delivery: "ACCOUNT_ACCEPTANCE" });

    expect(await listChildOwnerInvitationsForActor(invitee)).toEqual([
      expect.objectContaining({ membershipId: membership.id, child: created.child, parent: { id: parent.id, hospitalCode: parent.hospitalCode, name: parent.name } }),
    ]);
    // Somebody else cannot answer it.
    await expect(acceptChildOwnerInvitation(parentOwner, { membershipId: membership.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await acceptChildOwnerInvitation(invitee, { membershipId: membership.id });
    expect((await db.hospital.findUniqueOrThrow({ where: { id: created.child.id } })).status).toBe(HospitalStatus.ACTIVE);
    expect((await db.hospitalMembership.findUniqueOrThrow({ where: { id: membership.id } })).status).toBe("ACTIVE");
    expect((await db.userRole.findMany({ where: { userId: invitee.userId }, select: { role: true }, orderBy: { role: "asc" } })).map(({ role }) => role).sort())
      .toEqual(["HOSPITAL", "PATIENT"]);

    const decliningId = nationalId();
    const decliner = await user([Role.HOSPITAL], { nationalId: decliningId });
    const second = await createChildFacility(parentOwner, childInput(parent.id, { nationalId: decliningId }));
    const pending = await db.hospitalMembership.findFirstOrThrow({ where: { hospitalId: second.child.id } });
    await declineChildOwnerInvitation(decliner, { membershipId: pending.id });
    expect(await db.hospitalMembership.findUniqueOrThrow({ where: { id: pending.id }, select: { status: true, invitationDeclinedAt: true } }))
      .toEqual({ status: "ENDED", invitationDeclinedAt: expect.any(Date) });
    expect((await db.hospital.findUniqueOrThrow({ where: { id: second.child.id } })).status).toBe(HospitalStatus.PENDING_VERIFICATION);
    const declined = (await listManagedChildFacilities(parentOwner, { parentHospitalId: parent.id })).find(({ child }) => child.id === second.child.id);
    expect(declined).toMatchObject({ state: "PENDING_ACTIVATION", invitation: null, lastDeclinedAt: expect.any(Date) });
    await expect(acceptChildOwnerInvitation(decliner, { membershipId: pending.id })).rejects.toMatchObject({ code: "NOT_FOUND" });

    // After a decline the Parent invites someone else for the still-pending Child.
    const nextId = nationalId();
    const next = await changeChildOwnerInvitee(parentOwner, {
      parentHospitalId: parent.id, childHospitalId: second.child.id, nationalId: nextId, givenName: "สมใจ", familyName: "รับแทน", mode: "REMOTE",
    });
    await complete(token(next), nextId);
    expect((await db.hospital.findUniqueOrThrow({ where: { id: second.child.id } })).status).toBe(HospitalStatus.ACTIVE);
  });

  it("fails closed for PROVISIONED accounts with pending scope elsewhere, SUSPENDED accounts and ADMINs", async () => {
    const { parent, parentOwner } = await setup();
    const elsewhere = await hospital(HospitalStatus.ACTIVE, null);
    const pendingId = nationalId();
    const pendingUser = await user([Role.HOSPITAL], { status: UserStatus.PROVISIONED, nationalId: pendingId });
    await db.hospitalMembership.create({ data: { hospitalId: elsewhere.id, userId: pendingUser.userId, membershipType: "MEMBER", status: "PROVISIONED", profession: "NURSE" } });
    const suspendedId = nationalId();
    await user([Role.HOSPITAL], { status: UserStatus.SUSPENDED, nationalId: suspendedId });
    const adminId = nationalId();
    await user([Role.ADMIN], { nationalId: adminId });
    for (const id of [pendingId, suspendedId, adminId]) {
      await expect(createChildFacility(parentOwner, childInput(parent.id, { nationalId: id }))).rejects.toMatchObject({ code: "CONFLICT" });
    }
    expect(await db.hospital.count({ where: { registeredForParentHospitalId: parent.id } })).toBe(0);
  });
});

describe("O1-C/O1-E: completion re-checks the invitation context", () => {
  it("fails when the area ended, the Child was cancelled or the invitee changed between issue and completion", async () => {
    const { parent, parentOwner } = await setup();
    const endedInput = childInput(parent.id);
    const ended = await createChildFacility(parentOwner, endedInput);
    const area = await db.hospitalServiceArea.findFirstOrThrow({ where: { childHospitalId: ended.child.id } });
    await endHospitalServiceArea(parentOwner, { parentHospitalId: parent.id, areaId: area.id, confirm: true, endReason: "ย้าย" });
    await expect(previewWorkforceActivation(token(ended.invitation))).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(complete(token(ended.invitation), String(endedInput.nationalId))).rejects.toMatchObject({ code: "CONFLICT" });

    const cancelledInput = childInput(parent.id);
    const cancelled = await createChildFacility(parentOwner, cancelledInput);
    await cancelPendingChildFacility(parentOwner, { parentHospitalId: parent.id, childHospitalId: cancelled.child.id, confirm: true, reason: "สร้างผิด" });
    await expect(complete(token(cancelled.invitation), String(cancelledInput.nationalId))).rejects.toMatchObject({ code: "CONFLICT" });

    const changedInput = childInput(parent.id);
    const changed = await createChildFacility(parentOwner, changedInput);
    const nextId = nationalId();
    const next = await changeChildOwnerInvitee(parentOwner, {
      parentHospitalId: parent.id, childHospitalId: changed.child.id, nationalId: nextId, givenName: "สมปอง", familyName: "แทนที่", mode: "ASSISTED",
    });
    await expect(complete(token(changed.invitation), String(changedInput.nationalId))).rejects.toMatchObject({ code: "CONFLICT" });
    const assisted = await db.workforceActivation.findFirstOrThrow({ where: { hospitalId: changed.child.id, revokedAt: null } });
    expect(assisted.expiresAt.getTime() - assisted.createdAt.getTime()).toBeLessThanOrEqual(15 * 60_000 + 5_000);
    await complete(token(next), nextId);
    expect((await db.hospital.findUniqueOrThrow({ where: { id: changed.child.id } })).status).toBe(HospitalStatus.ACTIVE);
    expect(await db.hospitalMembership.findMany({ where: { hospitalId: changed.child.id }, orderBy: { createdAt: "asc" }, select: { status: true } }))
      .toEqual([{ status: "ENDED" }, { status: "ACTIVE" }]);
  });

  it("fails when the inviting Parent lost its OWNER authority, and allows exactly one of two concurrent completions", async () => {
    const { parent, parentOwner } = await setup();
    const lostInput = childInput(parent.id);
    const lost = await createChildFacility(parentOwner, lostInput);
    await db.hospital.update({ where: { id: parent.id }, data: { status: HospitalStatus.SUSPENDED } });
    await expect(complete(token(lost.invitation), String(lostInput.nationalId))).rejects.toMatchObject({ code: "CONFLICT" });
    await db.hospital.update({ where: { id: parent.id }, data: { status: HospitalStatus.ACTIVE } });

    const raceInput = childInput(parent.id);
    const race = await createChildFacility(parentOwner, raceInput);
    const results = await Promise.allSettled([
      complete(token(race.invitation), String(raceInput.nationalId)),
      complete(token(race.invitation), String(raceInput.nationalId)),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(await db.auditEvent.count({ where: { resourceId: race.child.id, action: "hospital.child_onboarded" } })).toBe(1);
  });
});

describe("O1-D: Parent management per O-D5", () => {
  it("regenerates and revokes the link, renames (Parent only, optimistic) and cancels a pending Child", async () => {
    const { parent, parentOwner } = await setup();
    const input = childInput(parent.id);
    const created = await createChildFacility(parentOwner, input);
    const target = { parentHospitalId: parent.id, childHospitalId: created.child.id };

    const regenerated = await issueChildOwnerLink(parentOwner, { ...target, mode: "REMOTE" });
    await expect(previewWorkforceActivation(token(created.invitation))).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await previewWorkforceActivation(token(regenerated))).toMatchObject({ purpose: "CHILD_OWNER_ONBOARDING" });
    await revokeChildOwnerLink(parentOwner, target);
    await expect(previewWorkforceActivation(token(regenerated))).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await listManagedChildFacilities(parentOwner, { parentHospitalId: parent.id }))[0]?.invitation?.link.status).toBe("NONE");

    const before = await db.hospital.findUniqueOrThrow({ where: { id: created.child.id } });
    const renamed = await renameChildFacility(parentOwner, { ...target, name: "รพ.สต.ชื่อใหม่", expectedUpdatedAt: before.updatedAt.toISOString() });
    expect(renamed.name).toBe("รพ.สต.ชื่อใหม่");
    await expect(renameChildFacility(parentOwner, { ...target, name: "ซ้ำ", expectedUpdatedAt: before.updatedAt.toISOString() }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(await db.auditEvent.findFirst({ where: { resourceId: created.child.id, action: "hospital.renamed" }, select: { actorUserId: true, metadata: true } }))
      .toEqual({ actorUserId: parentOwner.userId, metadata: { fromName: input.name, toName: "รพ.สต.ชื่อใหม่", parentHospitalId: parent.id, source: "parent_owner" } });

    await expect(cancelPendingChildFacility(parentOwner, { ...target, confirm: true, reason: " " })).rejects.toMatchObject({ code: "VALIDATION" });
    await cancelPendingChildFacility(parentOwner, { ...target, confirm: true, reason: "ไม่ได้ใช้งาน" });
    expect(await db.hospital.findUniqueOrThrow({ where: { id: created.child.id }, select: { status: true, retiredByUserId: true, retiredReason: true } }))
      .toEqual({ status: "RETIRED", retiredByUserId: parentOwner.userId, retiredReason: "ไม่ได้ใช้งาน" });
    expect(await db.hospitalRetirementEvent.findMany({ where: { hospitalId: created.child.id }, select: { kind: true, actorUserId: true } }))
      .toEqual([{ kind: "RETIRED", actorUserId: parentOwner.userId }]);
    expect(await db.hospitalServiceArea.findFirstOrThrow({ where: { childHospitalId: created.child.id }, select: { endedAt: true, endReason: true, endedByUserId: true } }))
      .toEqual({ endedAt: expect.any(Date), endReason: "ไม่ได้ใช้งาน", endedByUserId: parentOwner.userId });
    expect((await db.hospitalMembership.findFirstOrThrow({ where: { hospitalId: created.child.id } })).status).toBe("ENDED");
    expect(await listManagedChildFacilities(parentOwner, { parentHospitalId: parent.id })).toEqual([]);
  });

  it("invites a replacement OWNER only for an ACTIVE Child without an ACTIVE OWNER", async () => {
    const { parent, parentOwner } = await setup();
    const input = childInput(parent.id);
    const created = await createChildFacility(parentOwner, input);
    await complete(token(created.invitation), String(input.nationalId));
    const target = { parentHospitalId: parent.id, childHospitalId: created.child.id };
    const replacementId = nationalId();
    const invitee = { ...target, nationalId: replacementId, givenName: "สมศรี", familyName: "รับช่วง", mode: "REMOTE" };

    await expect(inviteReplacementChildOwner(parentOwner, invitee)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(issueChildOwnerLink(parentOwner, { ...target, mode: "REMOTE" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(cancelPendingChildFacility(parentOwner, { ...target, confirm: true, reason: "x" })).rejects.toMatchObject({ code: "CONFLICT" });
    await db.hospitalMembership.updateMany({ where: { hospitalId: created.child.id, status: "ACTIVE" }, data: { status: "ENDED" } });
    expect((await listManagedChildFacilities(parentOwner, { parentHospitalId: parent.id }))[0]?.state).toBe("NO_OWNER");

    const issued = await inviteReplacementChildOwner(parentOwner, invitee);
    await expect(inviteReplacementChildOwner(parentOwner, { ...invitee, nationalId: nationalId() })).rejects.toMatchObject({ code: "CONFLICT" });
    await complete(token(issued), replacementId);
    expect(await db.auditEvent.count({ where: { resourceId: created.child.id, action: "hospital.child_owner_replaced" } })).toBe(1);
    expect((await listManagedChildFacilities(parentOwner, { parentHospitalId: parent.id }))[0]?.state).toBe("ACTIVE");
  });
});

describe("O1-E: denials", () => {
  it("denies create and manage to everyone but the active persisted OWNER of an ACTIVE PARENT", async () => {
    const { parent, parentOwner } = await setup();
    const created = await createChildFacility(parentOwner, childInput(parent.id));
    const otherParent = await hospital();
    const otherOwner = await member(otherParent.id);
    const suspendedParent = await hospital();
    const suspendedParentOwner = await member(suspendedParent.id);
    await db.hospital.update({ where: { id: suspendedParent.id }, data: { status: HospitalStatus.SUSPENDED } });
    const notParent = await hospital(HospitalStatus.ACTIVE, null);
    const notParentOwner = await member(notParent.id);
    const activeChildInput = childInput(parent.id);
    const activeChild = await createChildFacility(parentOwner, activeChildInput);
    await complete(token(activeChild.invitation), String(activeChildInput.nationalId));
    const childOwnerActor = await member(activeChild.child.id);

    const deniedCreators: [ActorContext, string][] = [
      [await member(parent.id, "MEMBER"), parent.id],
      [await member(parent.id, "OWNER", MembershipStatus.SUSPENDED), parent.id],
      [await member(parent.id, "OWNER", MembershipStatus.ENDED), parent.id],
      [admin, parent.id],
      [otherOwner, parent.id],
      [childOwnerActor, activeChild.child.id],
      [suspendedParentOwner, suspendedParent.id],
      [notParentOwner, notParent.id],
    ];
    for (const [actor, parentHospitalId] of deniedCreators) {
      await expect(createChildFacility(actor, childInput(parentHospitalId))).rejects.toMatchObject({ code: expect.stringMatching(/^(FORBIDDEN|VALIDATION)$/u) });
    }
    // A retired Parent cannot hold an ACTIVE OWNER context.
    const retiredParent = await hospital(HospitalStatus.PENDING_VERIFICATION);
    const retiredOwner = await member(retiredParent.id);
    await retireHospitals(admin, { hospitalIds: [retiredParent.id], reason: "ไม่ใช้งาน" });
    await expect(createChildFacility(retiredOwner, childInput(retiredParent.id))).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.hospital.count({ where: { registeredByUserId: { in: deniedCreators.map(([actor]) => actor.userId) } } })).toBe(0);

    // Another Parent's OWNER manages nothing here, even naming its own Parent.
    for (const actor of [otherOwner, await member(parent.id, "MEMBER")]) {
      const parentHospitalId = actor === otherOwner ? otherParent.id : parent.id;
      const errors = await Promise.all([
        issueChildOwnerLink(actor, { parentHospitalId, childHospitalId: created.child.id, mode: "REMOTE" }).catch((error: { code: string }) => error.code),
        renameChildFacility(actor, { parentHospitalId, childHospitalId: created.child.id, name: "x", expectedUpdatedAt: new Date().toISOString() }).catch((error: { code: string }) => error.code),
        cancelPendingChildFacility(actor, { parentHospitalId, childHospitalId: created.child.id, confirm: true, reason: "x" }).catch((error: { code: string }) => error.code),
      ]);
      expect(errors.every((code) => code === "FORBIDDEN" || code === "NOT_FOUND")).toBe(true);
    }
    // The Child's own OWNER cannot rename it: it has no Parent authority over itself.
    const childRow = await db.hospital.findUniqueOrThrow({ where: { id: activeChild.child.id } });
    await expect(renameChildFacility(childOwnerActor, {
      parentHospitalId: activeChild.child.id, childHospitalId: activeChild.child.id, name: "ชื่อเอง", expectedUpdatedAt: childRow.updatedAt.toISOString(),
    })).rejects.toMatchObject({ code: expect.stringMatching(/^(FORBIDDEN|VALIDATION)$/u) });
    expect((await db.hospital.findUniqueOrThrow({ where: { id: activeChild.child.id } })).name).toBe(activeChild.child.name);
  });

  it("denies the former Parent once the Child was transferred or its area ended", async () => {
    const { parent, parentOwner } = await setup();
    const input = childInput(parent.id);
    const created = await createChildFacility(parentOwner, input);
    await complete(token(created.invitation), String(input.nationalId));
    const newParent = await hospital();
    const area = await db.hospitalServiceArea.findFirstOrThrow({ where: { childHospitalId: created.child.id, endedAt: null } });
    await transferHospitalServiceArea(admin, { areaId: area.id, toParentHospitalId: newParent.id, confirm: true, reason: "ย้ายเครือข่าย" });
    const row = await db.hospital.findUniqueOrThrow({ where: { id: created.child.id } });
    const target = { parentHospitalId: parent.id, childHospitalId: created.child.id };
    await expect(renameChildFacility(parentOwner, { ...target, name: "ห้าม", expectedUpdatedAt: row.updatedAt.toISOString() })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(inviteReplacementChildOwner(parentOwner, { ...target, nationalId: nationalId(), givenName: "ก", familyName: "ข", mode: "REMOTE" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });

    const endedInput = childInput(parent.id);
    const pending = await createChildFacility(parentOwner, endedInput);
    const pendingArea = await db.hospitalServiceArea.findFirstOrThrow({ where: { childHospitalId: pending.child.id } });
    await endHospitalServiceArea(parentOwner, { parentHospitalId: parent.id, areaId: pendingArea.id, confirm: true, endReason: "จบ" });
    const pendingTarget = { parentHospitalId: parent.id, childHospitalId: pending.child.id };
    await expect(issueChildOwnerLink(parentOwner, { ...pendingTarget, mode: "REMOTE" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(cancelPendingChildFacility(parentOwner, { ...pendingTarget, confirm: true, reason: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("ADMIN cannot retire a Hospital in an active area (ACTIVE_SERVICE_AREA)", async () => {
    const { parent, parentOwner } = await setup();
    const created = await createChildFacility(parentOwner, childInput(parent.id));
    const error = await retireHospitals(admin, { hospitalIds: [created.child.id], reason: "ล้าง" }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HospitalRetirementIneligibleError);
    expect((error as HospitalRetirementIneligibleError).ineligible).toEqual([
      { hospitalId: created.child.id, hospitalCode: created.child.hospitalCode, name: created.child.name, reason: "ACTIVE_SERVICE_AREA" },
    ]);
    expect((await db.hospital.findUniqueOrThrow({ where: { id: created.child.id } })).status).toBe(HospitalStatus.PENDING_VERIFICATION);
    expect(await db.workforceActivation.count({ where: { hospitalId: created.child.id, purpose: WorkforceActivationPurpose.CHILD_OWNER_ONBOARDING } })).toBe(1);
  });
});
