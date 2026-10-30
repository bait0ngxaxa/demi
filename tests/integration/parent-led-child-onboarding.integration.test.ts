import { randomInt, randomUUID } from "node:crypto";
import { HospitalStatus, IdentityAssurance, MembershipStatus, Role, UserStatus, UserTakeoverProviderState, WorkforceActivationPurpose, type HospitalServiceAreaFacilityKind } from "@prisma/client";
import { AuthApiError } from "@supabase/supabase-js";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import { createActorContextStore } from "@/modules/auth/services/actor-context-service";
import { authenticateWithPassword } from "@/modules/auth/services/authentication-service";
import { createProviderResetLoginAlias } from "@/modules/auth/services/provider-login-alias";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { completeMediatedPasswordReset, issueMediatedPasswordReset, searchMediatedPasswordResetTargets } from "@/modules/account-security/services/mediated-password-reset-service";
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
import { provisionPatientFixture } from "./support/patient-provisioning";

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

async function user(roles: Role[], options: { status?: UserStatus; nationalId?: string; identityAssurance?: IdentityAssurance } = {}): Promise<ActorContext> {
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
      ...(options.identityAssurance ? { identityAssurance: options.identityAssurance } : {}),
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
    await tx.auditEvent.deleteMany({ where: { OR: [{ actorUserId: { in: allUserIds } }, { resourceId: { in: [...allHospitalIds, ...allUserIds] } }] } });
    await tx.providerIdentityCleanup.deleteMany({ where: { userId: { in: allUserIds } } });
    await tx.userTakeoverLock.deleteMany({ where: { OR: [{ userId: { in: allUserIds } }, { lockedByUserId: { in: allUserIds } }] } });
    await tx.workforceActivation.deleteMany({ where: { OR: [{ userId: { in: allUserIds } }, { hospitalId: { in: allHospitalIds } }] } });
    await tx.hospitalMembership.deleteMany({ where: { OR: [{ userId: { in: allUserIds } }, { hospitalId: { in: allHospitalIds } }] } });
    await tx.patientHospitalRelationship.deleteMany({ where: { hospitalId: { in: allHospitalIds } } });
    await tx.patientProfile.deleteMany({ where: { personId: { in: allPersonIds } } });
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
  it("previews and applies a 3-row file as PENDING Parents with generated codes on the public list; a replay creates nothing", async () => {
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    const csvText = `﻿name\r\n"โรงพยาบาลบี, สาขา ${suffix}"\r\nโรงพยาบาลเอ ${suffix}\r\nโรงพยาบาลซี ${suffix}\r\n`;
    const preview = await previewHospitalBulkRegistration(admin, { csvText });
    expect(preview.map(({ rowNumber, status }) => [rowNumber, status])).toEqual([[2, "OK"], [3, "OK"], [4, "OK"]]);
    expect(preview[0]).toEqual({ rowNumber: 2, name: `โรงพยาบาลบี, สาขา ${suffix}`, status: "OK", similarTo: [] });

    const submissionNonce = randomUUID();
    const applied = await applyHospitalBulkRegistration(admin, { csvText, submissionNonce, confirmedRowNumbers: [] });
    expect(applied.replayed).toBe(false);
    expect(applied.hospitals).toHaveLength(3);
    for (const hospital of applied.hospitals) expect(hospital.hospitalCode).toMatch(/^H-[2-9A-HJKMNP-Z]{6}$/u);
    expect(new Set(applied.hospitals.map(({ hospitalCode }) => hospitalCode)).size).toBe(3);
    const ids = applied.hospitals.map(({ id }) => id);
    expect(await db.hospital.findMany({
      where: { id: { in: ids } }, orderBy: { name: "asc" },
      select: { status: true, registeredByUserId: true, serviceAreaEligibility: { select: { kind: true } } },
    })).toEqual(Array(3).fill({ status: "PENDING_VERIFICATION", registeredByUserId: admin.userId, serviceAreaEligibility: { kind: "PARENT" } }));
    // ADR-0023 (SR-D5): every new Hospital offers every service, recorded as set by the registering ADMIN.
    // (hospitalId, code) is unique, so nine matching rows are the three services of each Hospital.
    expect(await db.hospitalServiceOffering.count({
      where: { hospitalId: { in: ids }, enabled: true, createdByUserId: admin.userId, updatedByUserId: admin.userId },
    })).toBe(9);
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
      csvText: `name\nอื่น ${suffix}\n`, submissionNonce, confirmedRowNumbers: [],
    })).rejects.toMatchObject({ code: "CONFLICT" });
    // Same nonce, another ADMIN.
    await expect(applyHospitalBulkRegistration(await user([Role.ADMIN]), { csvText, submissionNonce, confirmedRowNumbers: [] }))
      .rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("changes nothing for a file with an invalid row or a wrong header", async () => {
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    for (const csvText of [`name\nดี ${suffix}\n${"ก".repeat(201)}\n`, `name\nดี ${suffix}\nมีรหัส ${suffix},X-1\n`]) {
      const error = await applyHospitalBulkRegistration(admin, { csvText, submissionNonce: randomUUID(), confirmedRowNumbers: [2, 3] })
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(HospitalBulkRegistrationRejectedError);
      expect((error as HospitalBulkRegistrationRejectedError).rows.map((row) => row.status)).toEqual(["OK", "INVALID"]);
    }
    expect(await db.hospital.count({ where: { registeredByUserId: admin.userId } })).toBe(0);
    // Codes are always generated: the earlier two-column layout is a header error.
    await expect(applyHospitalBulkRegistration(admin, { csvText: "name,hospitalCode\nx,y\n", submissionNonce: randomUUID(), confirmedRowNumbers: [] }))
      .rejects.toMatchObject({ fileError: "HEADER" });
    await expect(applyHospitalBulkRegistration(admin, { csvText: "name\n\"unterminated\n", submissionNonce: randomUUID(), confirmedRowNumbers: [] }))
      .rejects.toMatchObject({ fileError: "MALFORMED" });
  });

  it("requires explicit confirmation for a name similar to an existing Hospital or another row", async () => {
    const existing = await hospital(HospitalStatus.ACTIVE);
    const spaced = existing.name.replace("แม่ข่าย", "แม่ข่าย  ").toUpperCase();
    const csvText = `name\n${spaced}\nเดี่ยว ${randomUUID().slice(0, 6)}\n`;
    const preview = await previewHospitalBulkRegistration(admin, { csvText });
    expect(preview[0]).toMatchObject({ status: "SIMILAR_NAME", similarTo: [{ source: "EXISTING", name: existing.name, hospitalCode: existing.hospitalCode }] });
    expect(preview[1]?.status).toBe("OK");

    await expect(applyHospitalBulkRegistration(admin, { csvText, submissionNonce: randomUUID(), confirmedRowNumbers: [] }))
      .rejects.toMatchObject({ unconfirmedRowNumbers: [2] });
    expect(await db.hospital.count({ where: { registeredByUserId: admin.userId } })).toBe(0);
    const applied = await applyHospitalBulkRegistration(admin, { csvText, submissionNonce: randomUUID(), confirmedRowNumbers: [2] });
    expect(applied.hospitals).toHaveLength(2);

    const twinName = `แฝด ${randomUUID().slice(0, 4)}`;
    expect((await previewHospitalBulkRegistration(admin, { csvText: `name\n${twinName}\n ${twinName} \n` }))
      .map(({ status, similarTo }) => [status, similarTo.map(({ source }) => source)])).toEqual([["SIMILAR_NAME", ["FILE"]], ["SIMILAR_NAME", ["FILE"]]]);
  });

  it("is ADMIN-only", async () => {
    const { parentOwner } = await setup();
    const csvText = "name\nห้าม\n";
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
    const input = childInput(parent.id);
    // The code is always generated; the Parent cannot choose one.
    await expect(createChildFacility(parentOwner, { ...input, submissionNonce: randomUUID(), hospitalCode: "MINE-1" })).rejects.toMatchObject({ code: "VALIDATION" });
    const created = await createChildFacility(parentOwner, input);
    const activationToken = token(created.invitation);
    // ADR-0023 (SR-D5): the Child offers every service, recorded as set by the Parent OWNER who created it.
    expect(await db.hospitalServiceOffering.findMany({
      where: { hospitalId: created.child.id },
      orderBy: { code: "asc" },
      select: { code: true, enabled: true, createdByUserId: true, updatedByUserId: true },
    })).toEqual(["SCREENING", "FOLLOW_UP", "EMPOWERMENT"].map((code) => ({
      code, enabled: true, createdByUserId: parentOwner.userId, updatedByUserId: parentOwner.userId,
    })));
    expect(created.child).toMatchObject({ hospitalCode: expect.stringMatching(/^H-[2-9A-HJKMNP-Z]{6}$/u), name: input.name });

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

  it.each(["IN_PERSON", "ONLINE"] as const)("holds a caregiver-claimed child OWNER invitation until platform ADMIN completes the verified %s reset", async (mode) => {
    const { parent, parentOwner } = await setup();
    const targetNationalId = nationalId();
    const invitee = await user([Role.CAREGIVER], { nationalId: targetNationalId, identityAssurance: IdentityAssurance.CAREGIVER_INVITATION });
    const originalAuthSubject = (await db.user.findUniqueOrThrow({ where: { id: invitee.userId } })).authSubject;
    if (!originalAuthSubject) throw new Error("Expected caregiver provider identity");
    const childInputValue = childInput(parent.id, { nationalId: targetNationalId });
    const revokedSubjects: string[] = [];
    const created = await createChildFacility(parentOwner, childInputValue, {
      database: db,
      revokeProviderSessions: async (authSubject) => {
        revokedSubjects.push(authSubject);
        return "CONFIRMED";
      },
    });
    const membership = await db.hospitalMembership.findFirstOrThrow({ where: { hospitalId: created.child.id } });

    expect(created.invitation).toEqual({ status: "ADMIN_RESET_REQUIRED" });
    expect(membership).toMatchObject({ userId: invitee.userId, membershipType: "OWNER", status: MembershipStatus.PROVISIONED });
    expect(await db.user.findUniqueOrThrow({ where: { id: invitee.userId } })).toMatchObject({
      status: UserStatus.SUSPENDED,
      identityAssurance: IdentityAssurance.CAREGIVER_INVITATION,
      authSubject: originalAuthSubject,
    });
    expect(await db.userTakeoverLock.findUniqueOrThrow({ where: { userId: invitee.userId } })).toMatchObject({
      hospitalId: created.child.id,
      providerState: UserTakeoverProviderState.CONFIRMED,
      heldOwnerMembershipIds: [membership.id],
    });
    expect(revokedSubjects).toEqual([originalAuthSubject]);
    expect(await listChildOwnerInvitationsForActor(invitee, { database: db })).toEqual([]);
    expect(await listManagedChildFacilities(parentOwner, { parentHospitalId: parent.id }, { database: db }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ child: expect.objectContaining({ id: created.child.id }), invitation: expect.objectContaining({ delivery: "ADMIN_RESET_REQUIRED" }) })]));
    await expect(acceptChildOwnerInvitation(invitee, { membershipId: membership.id }, { database: db }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });

    let acceptedPassword = "caregiver-claimed-password-2026";
    let providerSubject = originalAuthSubject;
    let sessionSubject: string | null = null;
    const loginProvider = {
      signInWithPassword: async ({ password }: { email: string; password: string }) => {
        if (password !== acceptedPassword) {
          return { data: { user: null }, error: new AuthApiError("Invalid login credentials", 400, "invalid_credentials") };
        }
        sessionSubject = providerSubject;
        return { data: { user: { id: providerSubject } }, error: null };
      },
      getUser: async () => ({ data: { user: sessionSubject ? { id: sessionSubject } : null }, error: null }),
      signOut: async () => ({ error: null }),
    };
    await expect(authenticateWithPassword({ nationalId: targetNationalId, password: acceptedPassword }, {
      provider: loginProvider,
      actorStore: createActorContextStore(db),
    })).resolves.toEqual({ status: "APPLICATION_ACCESS_DENIED", reason: "ACCOUNT_NOT_ACTIVE" });

    const resetInput = {
      targetKind: "staff" as const,
      hospitalId: created.child.id,
      relationshipId: membership.id,
      mode,
      verificationMethod: "IN_PERSON_ID_CARD" as const,
    };
    await expect(issueMediatedPasswordReset(parentOwner, resetInput, { database: db }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    const [candidate] = await searchMediatedPasswordResetTargets(admin, { nationalId: targetNationalId }, db);
    expect(candidate).toMatchObject({ targetKind: "staff", hospitalId: created.child.id, relationshipId: membership.id, relationshipStatus: MembershipStatus.PROVISIONED });
    const issued = await issueMediatedPasswordReset(admin, resetInput, { database: db });
    const replacementSubject = randomUUID();
    const createReplacementIdentity = async ({ userId, resetId }: { userId: string; resetId: string; newPassword: string }) => ({
      authSubject: replacementSubject,
      providerLoginAlias: createProviderResetLoginAlias(userId, resetId),
    });
    await completeMediatedPasswordReset({
      token: issued.token,
      nationalId: targetNationalId,
      newPassword: "hospital-verified-password-2026",
      passwordConfirmation: "hospital-verified-password-2026",
    }, { database: db, createReplacementIdentity, deleteProviderIdentity: async () => undefined });

    expect(await db.user.findUniqueOrThrow({ where: { id: invitee.userId } })).toMatchObject({
      status: UserStatus.ACTIVE,
      identityAssurance: IdentityAssurance.HOSPITAL_PROOFED,
      authSubject: replacementSubject,
    });
    expect(await db.hospitalMembership.findUniqueOrThrow({ where: { id: membership.id } })).toMatchObject({ status: MembershipStatus.INVITED });
    expect(await db.userTakeoverLock.findUniqueOrThrow({ where: { userId: invitee.userId } })).toMatchObject({ providerState: UserTakeoverProviderState.RESOLVED });

    acceptedPassword = "hospital-verified-password-2026";
    providerSubject = replacementSubject;
    await expect(authenticateWithPassword({ nationalId: targetNationalId, password: "caregiver-claimed-password-2026" }, {
      provider: loginProvider,
      actorStore: createActorContextStore(db),
    })).resolves.toEqual({ status: "INVALID_CREDENTIALS" });
    await expect(authenticateWithPassword({ nationalId: targetNationalId, password: acceptedPassword }, {
      provider: loginProvider,
      actorStore: createActorContextStore(db),
    })).resolves.toMatchObject({ status: "AUTHORIZED", actor: { userId: invitee.userId } });

    const invitations = await listChildOwnerInvitationsForActor(invitee, { database: db });
    expect(invitations).toEqual([expect.objectContaining({ membershipId: membership.id })]);
    await acceptChildOwnerInvitation(invitee, { membershipId: membership.id }, { database: db });
    expect(await db.hospitalMembership.findUniqueOrThrow({ where: { id: membership.id } })).toMatchObject({ status: MembershipStatus.ACTIVE });
    expect(await db.hospital.findUniqueOrThrow({ where: { id: created.child.id } })).toMatchObject({ status: HospitalStatus.ACTIVE });
  });

  it.each([UserTakeoverProviderState.PENDING, UserTakeoverProviderState.CONFIRMED])("holds a child OWNER invitation for an identity already locked (%s) by patient provisioning at another Hospital", async (lockState) => {
    const { parent, parentOwner } = await setup();
    const patientHospital = await hospital(HospitalStatus.ACTIVE, null);
    const patientHospitalOwner = await member(patientHospital.id);
    const targetNationalId = nationalId();
    const invitee = await user([Role.CAREGIVER], { nationalId: targetNationalId, identityAssurance: IdentityAssurance.CAREGIVER_INVITATION });
    const patient = await provisionPatientFixture(patientHospitalOwner, {
      identity: { namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: targetNationalId },
      givenName: "ทดสอบ", familyName: "ลูกข่าย", targetHospitalId: patientHospital.id,
    }, { database: db, revokeProviderSessions: async () => "CONFIRMED" });
    expect(patient).toMatchObject({ userId: invitee.userId, accountStatus: UserStatus.SUSPENDED });
    if (lockState === UserTakeoverProviderState.PENDING) {
      // The post-commit provider revocation never recorded its outcome.
      await db.userTakeoverLock.update({ where: { userId: invitee.userId }, data: { providerState: lockState, providerCheckedAt: null } });
    }

    const revokedSubjects: string[] = [];
    const created = await createChildFacility(parentOwner, childInput(parent.id, { nationalId: targetNationalId }), {
      database: db,
      revokeProviderSessions: async (authSubject) => {
        revokedSubjects.push(authSubject);
        return "CONFIRMED";
      },
    });
    const membership = await db.hospitalMembership.findFirstOrThrow({ where: { hospitalId: created.child.id, userId: invitee.userId } });
    expect(created.invitation).toEqual({ status: "ADMIN_RESET_REQUIRED" });
    expect(membership).toMatchObject({ membershipType: "OWNER", status: MembershipStatus.PROVISIONED });
    expect(revokedSubjects).toHaveLength(lockState === UserTakeoverProviderState.CONFIRMED ? 0 : 1);
    expect(await db.userTakeoverLock.findUniqueOrThrow({ where: { userId: invitee.userId } })).toMatchObject({
      hospitalId: patientHospital.id,
      providerState: UserTakeoverProviderState.CONFIRMED,
      heldOwnerMembershipIds: [membership.id],
    });
    expect(await listManagedChildFacilities(parentOwner, { parentHospitalId: parent.id }, { database: db }))
      .toEqual(expect.arrayContaining([expect.objectContaining({
        child: expect.objectContaining({ id: created.child.id }),
        invitation: expect.objectContaining({ membershipId: membership.id, delivery: "ADMIN_RESET_REQUIRED" }),
      })]));
    expect(await listChildOwnerInvitationsForActor(invitee, { database: db })).toEqual([]);

    const resetInput = {
      targetKind: "staff" as const,
      hospitalId: created.child.id,
      relationshipId: membership.id,
      mode: "IN_PERSON" as const,
      verificationMethod: "IN_PERSON_ID_CARD" as const,
    };
    await expect(issueMediatedPasswordReset(parentOwner, resetInput, { database: db })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await searchMediatedPasswordResetTargets(admin, { nationalId: targetNationalId }, db))
      .toEqual(expect.arrayContaining([expect.objectContaining({ targetKind: "staff", hospitalId: created.child.id, relationshipId: membership.id })]));
    const issued = await issueMediatedPasswordReset(admin, resetInput, { database: db });
    const replacementSubject = randomUUID();
    await completeMediatedPasswordReset({
      token: issued.token,
      nationalId: targetNationalId,
      newPassword: "hospital-verified-password-2026",
      passwordConfirmation: "hospital-verified-password-2026",
    }, {
      database: db,
      createReplacementIdentity: async ({ userId, resetId }) => ({
        authSubject: replacementSubject,
        providerLoginAlias: createProviderResetLoginAlias(userId, resetId),
      }),
      deleteProviderIdentity: async () => undefined,
    });

    expect(await db.user.findUniqueOrThrow({ where: { id: invitee.userId } })).toMatchObject({
      status: UserStatus.ACTIVE,
      identityAssurance: IdentityAssurance.HOSPITAL_PROOFED,
      authSubject: replacementSubject,
    });
    expect(await db.hospitalMembership.findUniqueOrThrow({ where: { id: membership.id } })).toMatchObject({ status: MembershipStatus.INVITED });
    expect(await db.patientHospitalRelationship.findUniqueOrThrow({ where: { id: patient.relationshipId } })).toMatchObject({ endedAt: null });
    expect(await listChildOwnerInvitationsForActor(invitee, { database: db })).toEqual([expect.objectContaining({ membershipId: membership.id })]);
    await acceptChildOwnerInvitation(invitee, { membershipId: membership.id }, { database: db });
    expect(await db.hospitalMembership.findUniqueOrThrow({ where: { id: membership.id } })).toMatchObject({ status: MembershipStatus.ACTIVE });
    expect(await db.hospital.findUniqueOrThrow({ where: { id: created.child.id } })).toMatchObject({ status: HospitalStatus.ACTIVE });
  });

  it("releases the identity after the Parent ends its held invitation without reviving that OWNER membership", async () => {
    const { parent, parentOwner } = await setup();
    const targetNationalId = nationalId();
    const invitee = await user([Role.CAREGIVER], { nationalId: targetNationalId, identityAssurance: IdentityAssurance.CAREGIVER_INVITATION });
    const created = await createChildFacility(parentOwner, childInput(parent.id, { nationalId: targetNationalId }), {
      database: db,
      revokeProviderSessions: async () => "CONFIRMED",
    });
    const held = await db.hospitalMembership.findFirstOrThrow({ where: { hospitalId: created.child.id, userId: invitee.userId } });

    await revokeChildOwnerLink(parentOwner, { parentHospitalId: parent.id, childHospitalId: created.child.id }, { database: db });
    expect(await db.hospitalMembership.findUniqueOrThrow({ where: { id: held.id }, select: { status: true } }))
      .toEqual({ status: MembershipStatus.ENDED });

    const resetInput = {
      targetKind: "staff" as const,
      hospitalId: created.child.id,
      relationshipId: held.id,
      mode: "ONLINE" as const,
      verificationMethod: "IN_PERSON_ID_CARD" as const,
    };
    const [candidate] = await searchMediatedPasswordResetTargets(admin, { nationalId: targetNationalId }, db);
    expect(candidate).toMatchObject({ relationshipId: held.id, hospitalId: created.child.id, relationshipStatus: MembershipStatus.ENDED });
    const issued = await issueMediatedPasswordReset(admin, resetInput, { database: db });
    const replacementSubject = randomUUID();
    await completeMediatedPasswordReset({
      token: issued.token,
      nationalId: targetNationalId,
      newPassword: "hospital-verified-password-2026",
      passwordConfirmation: "hospital-verified-password-2026",
    }, {
      database: db,
      createReplacementIdentity: async ({ userId, resetId }) => ({
        authSubject: replacementSubject,
        providerLoginAlias: createProviderResetLoginAlias(userId, resetId),
      }),
      deleteProviderIdentity: async () => undefined,
    });

    expect(await db.user.findUniqueOrThrow({ where: { id: invitee.userId } })).toMatchObject({
      status: UserStatus.ACTIVE,
      identityAssurance: IdentityAssurance.HOSPITAL_PROOFED,
      authSubject: replacementSubject,
    });
    expect(await db.hospitalMembership.findUniqueOrThrow({ where: { id: held.id }, select: { status: true } }))
      .toEqual({ status: MembershipStatus.ENDED });
    const lockAudit = await db.auditEvent.findFirstOrThrow({
      where: { resourceType: "User", resourceId: invitee.userId, action: "user.takeover_lock_resolved" },
      orderBy: { createdAt: "desc" },
      select: { metadata: true },
    });
    expect(lockAudit.metadata).toMatchObject({
      heldOwnerMembershipsRestored: "",
      heldOwnerMembershipsNotRestored: `${held.id}:STATUS_ENDED`,
    });
  });

  it("does not expose or allow an ADMIN reset for an ordinary invitee at a PENDING child", async () => {
    const { parent, parentOwner } = await setup();
    const targetNationalId = nationalId();
    const invitee = await user([Role.HOSPITAL], { nationalId: targetNationalId });
    const created = await createChildFacility(parentOwner, childInput(parent.id, { nationalId: targetNationalId }), { database: db });
    const membership = await db.hospitalMembership.findFirstOrThrow({ where: { hospitalId: created.child.id, userId: invitee.userId } });

    expect(await searchMediatedPasswordResetTargets(admin, { nationalId: targetNationalId }, db)).toEqual([]);
    await expect(issueMediatedPasswordReset(admin, {
      targetKind: "staff",
      hospitalId: created.child.id,
      relationshipId: membership.id,
      mode: "ONLINE",
      verificationMethod: "IN_PERSON_ID_CARD",
    }, { database: db })).rejects.toMatchObject({ code: "NOT_FOUND" });
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

  it.each([MembershipStatus.ACTIVE, MembershipStatus.PROVISIONED, MembershipStatus.INVITED, MembershipStatus.SUSPENDED])("denies Child OWNER issuance to an existing OSM across Hospitals: %s", async (status) => {
    const { parent, parentOwner } = await setup();
    const other = await hospital();
    const nid = nationalId();
    const invitee = await user([Role.OSM], { nationalId: nid });
    await db.osmHospitalRelationship.create({ data: { hospitalId: other.id, userId: invitee.userId, status } });
    const before = { hospitals: await db.hospital.count(), memberships: await db.hospitalMembership.count(), activations: await db.workforceActivation.count(), audits: await db.auditEvent.count(), users: await db.user.count(), people: await db.person.count() };
    const error = await createChildFacility(parentOwner, childInput(parent.id, { nationalId: nid })).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "CONFLICT", name: "ConflictError" });
    const serialized = JSON.stringify({ ...(error as object), message: (error as Error).message });
    for (const secret of [other.id, nid, "อสม.", "บุคลากรโรงพยาบาล", status]) expect(serialized).not.toContain(secret);
    expect({ hospitals: await db.hospital.count(), memberships: await db.hospitalMembership.count(), activations: await db.workforceActivation.count(), audits: await db.auditEvent.count(), users: await db.user.count(), people: await db.person.count() }).toEqual(before);
    expect(await db.userRole.findMany({ where: { userId: invitee.userId }, select: { role: true } })).toEqual([{ role: Role.OSM }]);
  });

  it("rechecks OSM relationships acquired after Child OWNER invitation before acceptance", async () => {
    const { parent, parentOwner } = await setup();
    const nid = nationalId();
    const invitee = await user([Role.PATIENT], { nationalId: nid });
    const created = await createChildFacility(parentOwner, childInput(parent.id, { nationalId: nid }));
    const invitation = await db.hospitalMembership.findFirstOrThrow({ where: { hospitalId: created.child.id } });
    await db.userRole.create({ data: { userId: invitee.userId, role: Role.OSM } });
    await db.osmHospitalRelationship.create({ data: { userId: invitee.userId, hospitalId: parent.id, status: MembershipStatus.ACTIVE } });
    const audits = await db.auditEvent.count();
    await expect(acceptChildOwnerInvitation(invitee, { membershipId: invitation.id })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await db.hospitalMembership.findUniqueOrThrow({ where: { id: invitation.id } })).toEqual(invitation);
    expect(await db.hospital.findUniqueOrThrow({ where: { id: created.child.id } })).toMatchObject({ status: HospitalStatus.PENDING_VERIFICATION });
    expect(await db.userRole.count({ where: { userId: invitee.userId, role: Role.HOSPITAL } })).toBe(0);
    expect(await db.auditEvent.count()).toBe(audits);
  });

  it("denies Child OWNER first activation and link regeneration for a legacy mixed pending account", async () => {
    const { parent, parentOwner } = await setup();
    const nid = nationalId();
    const created = await createChildFacility(parentOwner, childInput(parent.id, { nationalId: nid }));
    const invitation = await db.hospitalMembership.findFirstOrThrow({ where: { hospitalId: created.child.id } });
    await db.userRole.create({ data: { userId: invitation.userId, role: Role.OSM } });
    await db.osmHospitalRelationship.create({ data: { userId: invitation.userId, hospitalId: parent.id, status: MembershipStatus.SUSPENDED } });
    const provider = vi.fn();
    const credential = await db.workforceActivation.findFirstOrThrow({ where: { userId: invitation.userId } });
    await expect(completeWorkforceActivation(token(created.invitation), { nationalId: nid, password: PASSWORD, passwordConfirmation: PASSWORD }, { provisionIdentity: provider })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(issueChildOwnerLink(parentOwner, { parentHospitalId: parent.id, childHospitalId: created.child.id, mode: "REMOTE" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(provider).not.toHaveBeenCalled();
    expect(await db.workforceActivation.findUniqueOrThrow({ where: { id: credential.id } })).toEqual(credential);
    expect(await db.hospitalMembership.findUniqueOrThrow({ where: { id: invitation.id } })).toEqual(invitation);
  });


  it("denies public OWNER approval with a non-ended OSM relationship atomically", async () => {
    const pending = await hospital(HospitalStatus.PENDING_VERIFICATION, "PARENT");
    const other = await hospital();
    const applicant = await user([Role.OSM], { status: UserStatus.PROVISIONED });
    await db.user.update({ where: { id: applicant.userId }, data: { authSubject: randomUUID() } });
    await db.osmHospitalRelationship.create({ data: { userId: applicant.userId, hospitalId: other.id, status: MembershipStatus.SUSPENDED } });
    const application = await db.hospitalOnboardingApplication.create({ data: { hospitalId: pending.id, applicantUserId: applicant.userId, status: "PENDING" } });
    const audits = await db.auditEvent.count();
    await expect(approveHospitalOnboarding({ applicationId: application.id, reviewerUserId: admin.userId })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await db.hospitalOnboardingApplication.findUniqueOrThrow({ where: { id: application.id } })).toEqual(application);
    expect(await db.hospital.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({ status: HospitalStatus.PENDING_VERIFICATION });
    expect(await db.user.findUniqueOrThrow({ where: { id: applicant.userId } })).toMatchObject({ status: UserStatus.PROVISIONED });
    expect(await db.hospitalMembership.count({ where: { userId: applicant.userId } })).toBe(0);
    expect(await db.userRole.count({ where: { userId: applicant.userId, role: Role.HOSPITAL } })).toBe(0);
    expect(await db.auditEvent.count()).toBe(audits);
  });

});
