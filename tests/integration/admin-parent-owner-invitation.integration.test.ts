import { randomInt, randomUUID } from "node:crypto";
import { HospitalStatus, IdentityAssurance, MembershipStatus, Prisma, Role, UserStatus, UserTakeoverProviderState, WorkforceActivationPurpose, type HospitalServiceAreaFacilityKind } from "@prisma/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { createProviderResetLoginAlias } from "@/modules/auth/services/provider-login-alias";
import { completeMediatedPasswordReset, issueMediatedPasswordReset, searchMediatedPasswordResetTargets } from "@/modules/account-security/services/mediated-password-reset-service";
import { HospitalRetirementIneligibleError, retireHospitals } from "@/modules/hospital-governance/services/hospital-governance-service";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { approveHospitalOnboarding, rejectHospitalOnboarding, submitHospitalOnboarding } from "@/modules/hospital-onboarding/services/hospital-onboarding-service";
import { findOnboardingHospitalByCode, listOnboardingHospitals } from "@/modules/hospital-onboarding/services/onboarding-hospital-service";
import {
  changeParentOwnerInvitee,
  getParentOwnerInvitationState,
  inviteParentOwner,
  issueParentOwnerLink,
  listParentOnboardingPaths,
  revokeParentOwnerLink,
} from "@/modules/hospital-onboarding/services/parent-owner-invitation-service";
import {
  acceptChildOwnerInvitation,
  createChildFacility,
  declineChildOwnerInvitation,
  listHospitalOwnerInvitationsForActor,
} from "@/modules/hospital-service-areas/services/child-facility-service";
import { endHospitalServiceArea } from "@/modules/hospital-service-areas/services/hospital-service-area-service";
import type { HospitalOwnerInvitationIssue } from "@/modules/workforce/services/hospital-owner-invitation";
import { completeWorkforceActivation, previewWorkforceActivation, revokeIssuedWorkforceActivation } from "@/modules/workforce/services/workforce-service";

// ADR-0024 / PO-1: platform ADMIN invites the first (or replacement) OWNER of a Parent Hospital.
const db = getPrisma();
const PASSWORD = "integration-parent-owner-password";
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
        : `parent-owner-${randomUUID()}`,
      givenName: "ทดสอบ", familyName: "แม่ข่าย",
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
  status: HospitalStatus = HospitalStatus.PENDING_VERIFICATION, kind: HospitalServiceAreaFacilityKind | null = "PARENT",
): Promise<{ id: string; hospitalCode: string; name: string }> {
  const row = await db.hospital.create({
    data: {
      hospitalCode: `PO${randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`, name: `รพ.แม่ข่ายเชิญ ${hospitalIds.length}`, status,
      ...(kind ? { serviceAreaEligibility: { create: { kind, verifiedAt: new Date(), classifiedByUserId: admin.userId } } } : {}),
    },
    select: { id: true, hospitalCode: true, name: true },
  });
  hospitalIds.push(row.id);
  return row;
}

async function owner(hospitalId: string, status: MembershipStatus = MembershipStatus.ACTIVE): Promise<ActorContext> {
  const actor = await user([Role.HOSPITAL]);
  const hospitalStatus = (await db.hospital.findUniqueOrThrow({ where: { id: hospitalId }, select: { status: true } })).status;
  await db.hospitalMembership.create({ data: { hospitalId, userId: actor.userId, status, membershipType: "OWNER" } });
  return { ...actor, hospitalMemberships: [{ hospitalId, hospitalStatus, status, membershipType: "OWNER", profession: null }] };
}

function inviteInput(hospitalId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    hospitalId, nationalId: nationalId(), givenName: "สมศักดิ์", familyName: "ผู้ดูแล", mode: "REMOTE", submissionNonce: randomUUID(), ...overrides,
  };
}

function token(issue: HospitalOwnerInvitationIssue): string {
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

async function pendingApplication(hospitalId: string): Promise<{ id: string }> {
  const applicant = await user([], { status: UserStatus.PROVISIONED });
  await db.user.update({ where: { id: applicant.userId }, data: { authSubject: randomUUID() } });
  return db.hospitalOnboardingApplication.create({
    data: { hospitalId, applicantUserId: applicant.userId, status: "PENDING" }, select: { id: true },
  });
}

const publicSubmission = (hospitalCode: string) => ({
  hospitalCode, nationalId: nationalId(), givenName: "สมชาย", familyName: "ใจดี",
  password: "correct-horse-battery-staple", passwordConfirmation: "correct-horse-battery-staple",
});

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
    await tx.accountRecovery.deleteMany({ where: { targetUserId: { in: allUserIds } } });
    await tx.userTakeoverLock.deleteMany({ where: { OR: [{ userId: { in: allUserIds } }, { lockedByUserId: { in: allUserIds } }] } });
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

describe("PO-1: ADMIN invites the first OWNER of a Parent Hospital", () => {
  it("issues a link for a new identity; activation makes the OWNER and the Parent ACTIVE; the public path stays closed meanwhile", async () => {
    const parent = await hospital();
    const input = inviteInput(parent.id);
    const issued = await inviteParentOwner(admin, input);
    expect(issued).toMatchObject({ status: "ACTIVATION_LINK", activationMode: "REMOTE" });
    const activation = await db.workforceActivation.findFirstOrThrow({ where: { hospitalId: parent.id } });
    expect(activation).toMatchObject({ purpose: WorkforceActivationPurpose.PARENT_OWNER_ONBOARDING, relationshipKind: "PARENT_OWNER", createdByUserId: admin.userId });
    expect(activation.expiresAt.getTime() - activation.createdAt.getTime()).toBeLessThanOrEqual(24 * 60 * 60_000 + 5_000);
    const membership = await db.hospitalMembership.findFirstOrThrow({ where: { hospitalId: parent.id } });
    expect(membership).toMatchObject({
      membershipType: "OWNER", status: "PROVISIONED", invitedByUserId: admin.userId, invitedViaServiceAreaId: null, invitationNonce: input.submissionNonce,
    });
    const invitedAudit = await db.auditEvent.findFirstOrThrow({ where: { resourceId: parent.id, action: "hospital.parent_owner_invited" } });
    expect(JSON.stringify(invitedAudit.metadata)).not.toContain(String(input.nationalId));
    expect(JSON.stringify(invitedAudit.metadata)).not.toContain(token(issued));

    // Q1: hidden from the public list and code lookup, and submission is refused.
    expect((await listOnboardingHospitals()).map(({ id }) => id)).not.toContain(parent.id);
    await expect(findOnboardingHospitalByCode(parent.hospitalCode)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(submitHospitalOnboarding(publicSubmission(parent.hospitalCode))).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await listParentOnboardingPaths(admin, [parent.id])).toEqual(new Map([[parent.id, "OPEN_INVITATION"]]));

    expect(await previewWorkforceActivation(token(issued))).toMatchObject({ purpose: "PARENT_OWNER_ONBOARDING", hospitalName: parent.name });
    await complete(token(issued), String(input.nationalId));
    expect((await db.hospital.findUniqueOrThrow({ where: { id: parent.id } })).status).toBe(HospitalStatus.ACTIVE);
    expect(await db.hospitalMembership.findUniqueOrThrow({ where: { id: membership.id } })).toMatchObject({ status: "ACTIVE" });
    expect(await db.user.findUniqueOrThrow({ where: { id: membership.userId } })).toMatchObject({ status: UserStatus.ACTIVE });
    const onboarded = await db.auditEvent.findFirstOrThrow({ where: { resourceId: parent.id, action: "hospital.parent_onboarded" } });
    expect(onboarded.metadata).toMatchObject({ via: "ADMIN_INVITATION", membershipId: membership.id });
    expect((await getParentOwnerInvitationState(admin, { hospitalId: parent.id })).availability).toBe("UNAVAILABLE");
  });

  it("never issues a token to an ACTIVE account: it accepts or declines in its own session", async () => {
    const parent = await hospital();
    const acceptingId = nationalId();
    const invitee = await user([Role.PATIENT], { nationalId: acceptingId });
    expect(await inviteParentOwner(admin, inviteInput(parent.id, { nationalId: acceptingId }))).toEqual({ status: "AWAITING_ACCEPTANCE" });
    const membership = await db.hospitalMembership.findFirstOrThrow({ where: { hospitalId: parent.id } });
    expect(membership).toMatchObject({ userId: invitee.userId, status: "INVITED" });
    expect(await db.workforceActivation.count({ where: { userId: invitee.userId } })).toBe(0);
    expect((await getParentOwnerInvitationState(admin, { hospitalId: parent.id })).invitation).toMatchObject({ delivery: "ACCOUNT_ACCEPTANCE" });

    expect(await listHospitalOwnerInvitationsForActor(invitee)).toEqual([
      { kind: "PARENT", membershipId: membership.id, hospital: parent, invitedAt: expect.any(Date) },
    ]);
    await expect(acceptChildOwnerInvitation(admin, { membershipId: membership.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await acceptChildOwnerInvitation(invitee, { membershipId: membership.id });
    expect((await db.hospital.findUniqueOrThrow({ where: { id: parent.id } })).status).toBe(HospitalStatus.ACTIVE);
    expect((await db.hospitalMembership.findUniqueOrThrow({ where: { id: membership.id } })).status).toBe("ACTIVE");
    expect(await db.auditEvent.count({ where: { resourceId: parent.id, action: "hospital.parent_onboarded" } })).toBe(1);

    const second = await hospital();
    const decliningId = nationalId();
    const decliner = await user([Role.HOSPITAL], { nationalId: decliningId });
    await inviteParentOwner(admin, inviteInput(second.id, { nationalId: decliningId }));
    const pending = await db.hospitalMembership.findFirstOrThrow({ where: { hospitalId: second.id } });
    await declineChildOwnerInvitation(decliner, { membershipId: pending.id });
    expect(await db.hospitalMembership.findUniqueOrThrow({ where: { id: pending.id }, select: { status: true, invitationDeclinedAt: true } }))
      .toEqual({ status: "ENDED", invitationDeclinedAt: expect.any(Date) });
    expect((await db.hospital.findUniqueOrThrow({ where: { id: second.id } })).status).toBe(HospitalStatus.PENDING_VERIFICATION);
    expect(await getParentOwnerInvitationState(admin, { hospitalId: second.id }))
      .toMatchObject({ availability: "FIRST_OWNER", invitation: null, lastDeclinedAt: expect.any(Date) });
    // After a decline the Parent is back on the public list and ADMIN may invite again.
    expect((await listOnboardingHospitals()).map(({ id }) => id)).toContain(second.id);
  });

  it("holds a caregiver-claimed invitee for an ADMIN reset; after the reset the invitee accepts in their own session", async () => {
    const parent = await hospital();
    const targetNationalId = nationalId();
    const invitee = await user([Role.CAREGIVER], { nationalId: targetNationalId, identityAssurance: IdentityAssurance.CAREGIVER_INVITATION });
    const revokedSubjects: string[] = [];
    const issued = await inviteParentOwner(admin, inviteInput(parent.id, { nationalId: targetNationalId }), {
      revokeProviderSessions: async (authSubject) => {
        revokedSubjects.push(authSubject);
        return "CONFIRMED";
      },
    });
    expect(issued).toEqual({ status: "ADMIN_RESET_REQUIRED" });
    const membership = await db.hospitalMembership.findFirstOrThrow({ where: { hospitalId: parent.id } });
    expect(membership).toMatchObject({ userId: invitee.userId, status: MembershipStatus.PROVISIONED });
    expect(await db.user.findUniqueOrThrow({ where: { id: invitee.userId } })).toMatchObject({ status: UserStatus.SUSPENDED });
    expect(await db.userTakeoverLock.findUniqueOrThrow({ where: { userId: invitee.userId } }))
      .toMatchObject({ hospitalId: parent.id, providerState: UserTakeoverProviderState.CONFIRMED, heldOwnerMembershipIds: [membership.id] });
    expect(revokedSubjects).toHaveLength(1);
    expect(await listHospitalOwnerInvitationsForActor(invitee)).toEqual([]);
    expect((await getParentOwnerInvitationState(admin, { hospitalId: parent.id })).invitation).toMatchObject({ delivery: "ADMIN_RESET_REQUIRED" });
    await expect(issueParentOwnerLink(admin, { hospitalId: parent.id, mode: "REMOTE" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(acceptChildOwnerInvitation(invitee, { membershipId: membership.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    // A held Parent invitation blocks ADMIN retire, as a held Child invitation blocks Parent cancellation.
    await expect(retireHospitals(admin, { hospitalIds: [parent.id], reason: "ทดสอบ" }))
      .rejects.toSatisfy((error: unknown) => error instanceof HospitalRetirementIneligibleError &&
        error.ineligible.some(({ reason }) => reason === "HELD_OWNER_INVITATION"));

    const resetInput = {
      targetKind: "staff" as const, hospitalId: parent.id, relationshipId: membership.id, mode: "IN_PERSON" as const, verificationMethod: "IN_PERSON_ID_CARD" as const,
    };
    expect(await searchMediatedPasswordResetTargets(admin, { nationalId: targetNationalId }, db))
      .toEqual(expect.arrayContaining([expect.objectContaining({ targetKind: "staff", hospitalId: parent.id, relationshipId: membership.id })]));
    const reset = await issueMediatedPasswordReset(admin, resetInput, { database: db });
    const replacementSubject = randomUUID();
    await completeMediatedPasswordReset({
      token: reset.token, nationalId: targetNationalId,
      newPassword: "hospital-verified-password-2026", passwordConfirmation: "hospital-verified-password-2026",
    }, {
      database: db,
      createReplacementIdentity: async ({ userId, resetId }) => ({ authSubject: replacementSubject, providerLoginAlias: createProviderResetLoginAlias(userId, resetId) }),
      deleteProviderIdentity: async () => undefined,
    });
    expect(await db.hospitalMembership.findUniqueOrThrow({ where: { id: membership.id } })).toMatchObject({ status: MembershipStatus.INVITED });
    expect(await listHospitalOwnerInvitationsForActor(invitee)).toEqual([expect.objectContaining({ kind: "PARENT", membershipId: membership.id })]);
    await acceptChildOwnerInvitation(invitee, { membershipId: membership.id });
    expect(await db.hospital.findUniqueOrThrow({ where: { id: parent.id } })).toMatchObject({ status: HospitalStatus.ACTIVE });
  });

  it("replays the same submission as ALREADY_ISSUED; the same nonce with another identity conflicts", async () => {
    const parent = await hospital();
    const input = inviteInput(parent.id);
    expect((await inviteParentOwner(admin, input)).status).toBe("ACTIVATION_LINK");
    expect(await inviteParentOwner(admin, input)).toEqual({ status: "ALREADY_ISSUED" });
    await expect(inviteParentOwner(admin, { ...input, nationalId: nationalId() })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await db.hospitalMembership.count({ where: { hospitalId: parent.id } })).toBe(1);
    expect(await db.workforceActivation.count({ where: { hospitalId: parent.id } })).toBe(1);
  });

  it("regenerates, revokes and changes the invitee; ended links stop working", async () => {
    const parent = await hospital();
    const input = inviteInput(parent.id);
    const first = await inviteParentOwner(admin, input);
    const regenerated = await issueParentOwnerLink(admin, { hospitalId: parent.id, mode: "ASSISTED" });
    await expect(previewWorkforceActivation(token(first))).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await previewWorkforceActivation(token(regenerated))).toMatchObject({ purpose: "PARENT_OWNER_ONBOARDING" });
    const assisted = await db.workforceActivation.findFirstOrThrow({ where: { hospitalId: parent.id, revokedAt: null } });
    expect(assisted.expiresAt.getTime() - assisted.createdAt.getTime()).toBeLessThanOrEqual(15 * 60_000 + 5_000);
    await revokeParentOwnerLink(admin, { hospitalId: parent.id });
    await expect(previewWorkforceActivation(token(regenerated))).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await getParentOwnerInvitationState(admin, { hospitalId: parent.id })).invitation?.link.status).toBe("NONE");
    await expect(revokeParentOwnerLink(admin, { hospitalId: parent.id })).rejects.toMatchObject({ code: "CONFLICT" });

    const nextId = nationalId();
    const next = await changeParentOwnerInvitee(admin, inviteInput(parent.id, { nationalId: nextId }));
    expect(await db.hospitalMembership.findMany({ where: { hospitalId: parent.id }, orderBy: { createdAt: "asc" }, select: { status: true } }))
      .toEqual([{ status: "ENDED" }, { status: "PROVISIONED" }]);
    await complete(token(next), nextId);
    expect((await db.hospital.findUniqueOrThrow({ where: { id: parent.id } })).status).toBe(HospitalStatus.ACTIVE);
    for (const action of ["hospital.parent_owner_link_issued", "hospital.parent_owner_link_revoked", "hospital.parent_owner_invitee_changed"]) {
      expect(await db.auditEvent.count({ where: { resourceId: parent.id, action } })).toBe(1);
    }
  });

  it("allows one open OWNER invitation per Hospital, in the service and in the database", async () => {
    const parent = await hospital();
    await inviteParentOwner(admin, inviteInput(parent.id));
    await expect(inviteParentOwner(admin, inviteInput(parent.id))).rejects.toMatchObject({ code: "CONFLICT" });
    const other = await user([Role.HOSPITAL], { status: UserStatus.PROVISIONED });
    await expect(db.hospitalMembership.create({
      data: { hospitalId: parent.id, userId: other.userId, membershipType: "OWNER", status: "INVITED", invitedByUserId: admin.userId },
    })).rejects.toSatisfy((error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002");
    // The CHECK binds the nonce to invitations only.
    await expect(db.hospitalMembership.create({
      data: { hospitalId: parent.id, userId: other.userId, membershipType: "MEMBER", status: "ACTIVE", invitationNonce: randomUUID() },
    })).rejects.toThrow();
  });

  it("refuses while a PENDING application exists; after ADMIN rejects it the invitation succeeds (Q1/Q2)", async () => {
    const parent = await hospital();
    const application = await pendingApplication(parent.id);
    await expect(inviteParentOwner(admin, inviteInput(parent.id))).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await getParentOwnerInvitationState(admin, { hospitalId: parent.id }))
      .toMatchObject({ availability: "PENDING_APPLICATION", pendingApplication: { id: application.id } });
    expect(await listParentOnboardingPaths(admin, [parent.id])).toEqual(new Map([[parent.id, "PENDING_APPLICATION"]]));
    await rejectHospitalOnboarding({ applicationId: application.id, reviewerUserId: admin.userId });
    // Q2: the decided application still blocks the public path; the ADMIN invitation is the way forward.
    await expect(submitHospitalOnboarding(publicSubmission(parent.hospitalCode))).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await inviteParentOwner(admin, inviteInput(parent.id))).status).toBe("ACTIVATION_LINK");
  });

  it("refuses ADMIN approval of an application while an OWNER invitation is open (race guard)", async () => {
    const parent = await hospital();
    const application = await pendingApplication(parent.id);
    const invitee = await user([Role.HOSPITAL], { status: UserStatus.PROVISIONED });
    // Only reachable by a concurrent write; the service itself refuses to invite over a PENDING application.
    await db.hospitalMembership.create({
      data: { hospitalId: parent.id, userId: invitee.userId, membershipType: "OWNER", status: "PROVISIONED", invitedByUserId: admin.userId },
    });
    await expect(approveHospitalOnboarding({ applicationId: application.id, reviewerUserId: admin.userId })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await db.hospital.findUniqueOrThrow({ where: { id: parent.id } })).status).toBe(HospitalStatus.PENDING_VERIFICATION);
    expect((await db.hospitalOnboardingApplication.findUniqueOrThrow({ where: { id: application.id } })).status).toBe("PENDING");
  });

  it("invites a replacement only for an ACTIVE Parent without an ACTIVE OWNER (Q3)", async () => {
    const parent = await hospital(HospitalStatus.ACTIVE);
    const current = await owner(parent.id);
    await expect(inviteParentOwner(admin, inviteInput(parent.id))).rejects.toMatchObject({ code: "CONFLICT" });
    await db.hospitalMembership.updateMany({ where: { hospitalId: parent.id, userId: current.userId }, data: { status: "ENDED" } });
    expect((await getParentOwnerInvitationState(admin, { hospitalId: parent.id })).availability).toBe("REPLACEMENT");
    const input = inviteInput(parent.id);
    const issued = await inviteParentOwner(admin, input);
    await complete(token(issued), String(input.nationalId));
    expect(await db.auditEvent.count({ where: { resourceId: parent.id, action: "hospital.parent_owner_replaced" } })).toBe(1);
    expect(await db.hospitalMembership.count({ where: { hospitalId: parent.id, membershipType: "OWNER", status: "ACTIVE" } })).toBe(1);
  });

  it("refuses a Child, a former Child and a RETIRED or SUSPENDED Parent", async () => {
    const parentNetwork = await hospital(HospitalStatus.ACTIVE);
    const parentOwner = await owner(parentNetwork.id);
    const created = await createChildFacility(parentOwner, {
      parentHospitalId: parentNetwork.id, name: `รพ.สต.ทดสอบ ${randomUUID().slice(0, 6)}`, nationalId: nationalId(),
      givenName: "สมหญิง", familyName: "ดูแลดี", mode: "REMOTE", submissionNonce: randomUUID(),
    });
    const formerChild = await hospital(HospitalStatus.ACTIVE, "CHILD");
    await db.hospitalServiceArea.create({ data: { parentHospitalId: parentNetwork.id, childHospitalId: formerChild.id, createdByUserId: parentOwner.userId } });
    const formerArea = await db.hospitalServiceArea.findFirstOrThrow({ where: { childHospitalId: formerChild.id } });
    await endHospitalServiceArea(parentOwner, { parentHospitalId: parentNetwork.id, areaId: formerArea.id, confirm: true, endReason: "ทดสอบ" });
    await db.hospitalServiceAreaEligibility.update({ where: { hospitalId: formerChild.id }, data: { kind: "PARENT" } });
    const retired = await hospital();
    await retireHospitals(admin, { hospitalIds: [retired.id], reason: "ทดสอบ" });
    const suspended = await hospital(HospitalStatus.SUSPENDED);
    for (const target of [created.child.id, formerChild.id, retired.id, suspended.id]) {
      await expect(inviteParentOwner(admin, inviteInput(target))).rejects.toMatchObject({ code: "CONFLICT" });
      expect((await getParentOwnerInvitationState(admin, { hospitalId: target })).availability).toBe("UNAVAILABLE");
    }
    await expect(inviteParentOwner(admin, inviteInput(randomUUID()))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is platform ADMIN only: a Hospital OWNER and a suspended ADMIN are refused", async () => {
    const parent = await hospital();
    const otherHospital = await hospital(HospitalStatus.ACTIVE);
    const hospitalOwner = await owner(otherHospital.id);
    const suspendedAdmin = await user([Role.ADMIN], { status: UserStatus.SUSPENDED });
    for (const actor of [hospitalOwner, suspendedAdmin, null]) {
      await expect(inviteParentOwner(actor, inviteInput(parent.id))).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(getParentOwnerInvitationState(actor, { hospitalId: parent.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    const issued = await inviteParentOwner(admin, inviteInput(parent.id));
    for (const actor of [hospitalOwner, suspendedAdmin]) {
      await expect(issueParentOwnerLink(actor, { hospitalId: parent.id, mode: "REMOTE" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(revokeParentOwnerLink(actor, { hospitalId: parent.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(changeParentOwnerInvitee(actor, inviteInput(parent.id))).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    // The assisted-handoff compensation follows the same ADMIN authority.
    const activation = await db.workforceActivation.findFirstOrThrow({ where: { hospitalId: parent.id, revokedAt: null } });
    await expect(revokeIssuedWorkforceActivation(hospitalOwner, { activationId: activation.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await revokeIssuedWorkforceActivation(admin, { activationId: activation.id });
    await expect(previewWorkforceActivation(token(issued))).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses completion and acceptance once the inviting ADMIN lost the role", async () => {
    const parent = await hospital();
    const input = inviteInput(parent.id);
    const issued = await inviteParentOwner(admin, input);
    await db.userRole.delete({ where: { userId_role: { userId: admin.userId, role: Role.ADMIN } } });
    await expect(previewWorkforceActivation(token(issued))).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(complete(token(issued), String(input.nationalId))).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await db.hospital.findUniqueOrThrow({ where: { id: parent.id } })).status).toBe(HospitalStatus.PENDING_VERIFICATION);

    const secondAdmin = await user([Role.ADMIN]);
    const second = await hospital();
    const acceptingId = nationalId();
    const invitee = await user([Role.HOSPITAL], { nationalId: acceptingId });
    await inviteParentOwner(secondAdmin, inviteInput(second.id, { nationalId: acceptingId }));
    await db.user.update({ where: { id: secondAdmin.userId }, data: { status: UserStatus.SUSPENDED } });
    const pending = await db.hospitalMembership.findFirstOrThrow({ where: { hospitalId: second.id } });
    await expect(acceptChildOwnerInvitation(invitee, { membershipId: pending.id })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await db.hospitalMembership.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("INVITED");
  });

  it("ADMIN retire of a pending Parent ends its open invitation and revokes the link", async () => {
    const parent = await hospital();
    const input = inviteInput(parent.id);
    const issued = await inviteParentOwner(admin, input);
    await retireHospitals(admin, { hospitalIds: [parent.id], reason: "ยกเลิก" });
    expect(await db.hospitalMembership.findFirstOrThrow({ where: { hospitalId: parent.id } })).toMatchObject({ status: "ENDED" });
    await expect(complete(token(issued), String(input.nationalId))).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await db.auditEvent.count({ where: { resourceId: parent.id, action: "hospital.owner_invitation_ended" } })).toBe(1);
  });
});
