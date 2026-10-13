import { MembershipStatus, MembershipType, UserStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { signOutCurrentSession } from "@/modules/auth/services/authentication-service";
import { ForbiddenError, ConflictError } from "@/shared/errors/application-error";

import {
  completeWorkforceActivation,
  completeWorkforcePasswordReset,
  demoteHospitalOwner,
  issueWorkforcePasswordReset,
  previewWorkforceActivation,
  promoteHospitalOwner,
  provisionHospitalMember,
  provisionWorkforceBulk,
  regenerateWorkforceActivation,
  restoreHospitalMembership,
  restoreOsmRelationship,
  revokeIssuedWorkforceActivation,
  suspendHospitalMembership,
  suspendOsmRelationship,
  updateHospitalMembershipProfession,
  WorkforceBulkDuplicateError,
} from "../services/workforce-service";
import {
  initialWorkforceCompletionActionState,
  initialWorkforceMembershipMutationActionState,
  initialWorkforceOwnerGovernanceMutationActionState,
  initialWorkforceProvisionActionState,
} from "./action-state";
import {
  completeWorkforceActivationAction,
  demoteHospitalOwnerAction,
  issueWorkforcePasswordResetAction,
  previewWorkforceActivationAction,
  provisionHospitalMemberAction,
  provisionWorkforceBulkAction,
  startAssistedWorkforceActivationAction,
  promoteHospitalOwnerAction,
  restoreHospitalMembershipAction,
  restoreOsmRelationshipAction,
  suspendHospitalMembershipAction,
  suspendOsmRelationshipAction,
  updateHospitalMembershipProfessionAction,
} from "./server-actions";

const mockedRedirect = vi.hoisted(() => vi.fn());
const mockedRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect: mockedRedirect }));
vi.mock("next/cache", () => ({ revalidatePath: mockedRevalidatePath }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: vi.fn(),
}));
vi.mock("@/modules/auth/services/authentication-service", () => ({
  signOutCurrentSession: vi.fn(),
}));
vi.mock("../services/workforce-service", () => ({
  completeWorkforceActivation: vi.fn(),
  completeWorkforcePasswordReset: vi.fn(),
  demoteHospitalOwner: vi.fn(),
  issueWorkforcePasswordReset: vi.fn(),
  previewWorkforceActivation: vi.fn(),
  promoteHospitalOwner: vi.fn(),
  provisionHospitalMember: vi.fn(),
  provisionOsm: vi.fn(),
  provisionWorkforceBulk: vi.fn(),
  regenerateWorkforceActivation: vi.fn(),
  revokeIssuedWorkforceActivation: vi.fn(),
  WorkforceBulkDuplicateError: class extends Error {
    constructor(readonly rowNumbers: number[]) {
      super("duplicate");
    }
  },
  restoreHospitalMembership: vi.fn(),
  restoreOsmRelationship: vi.fn(),
  suspendHospitalMembership: vi.fn(),
  suspendOsmRelationship: vi.fn(),
  updateHospitalMembershipProfession: vi.fn(),
}));

const mockedGetProtectedApplicationActor = vi.mocked(getProtectedApplicationActor);
const mockedSignOutCurrentSession = vi.mocked(signOutCurrentSession);
const mockedCompleteWorkforceActivation = vi.mocked(completeWorkforceActivation);
const mockedCompleteWorkforcePasswordReset = vi.mocked(completeWorkforcePasswordReset);
const mockedIssueWorkforcePasswordReset = vi.mocked(issueWorkforcePasswordReset);
const mockedPreviewWorkforceActivation = vi.mocked(previewWorkforceActivation);
const mockedProvisionWorkforceBulk = vi.mocked(provisionWorkforceBulk);
const mockedRegenerateWorkforceActivation = vi.mocked(regenerateWorkforceActivation);
const mockedRevokeIssuedWorkforceActivation = vi.mocked(revokeIssuedWorkforceActivation);
const mockedDemoteHospitalOwner = vi.mocked(demoteHospitalOwner);
const mockedPromoteHospitalOwner = vi.mocked(promoteHospitalOwner);
const mockedProvisionHospitalMember = vi.mocked(provisionHospitalMember);
const mockedRestoreHospitalMembership = vi.mocked(restoreHospitalMembership);
const mockedRestoreOsmRelationship = vi.mocked(restoreOsmRelationship);
const mockedSuspendHospitalMembership = vi.mocked(suspendHospitalMembership);
const mockedSuspendOsmRelationship = vi.mocked(suspendOsmRelationship);
const mockedUpdateHospitalMembershipProfession = vi.mocked(updateHospitalMembershipProfession);

function createStaffFormData(): FormData {
  const formData = new FormData();
  formData.set("nationalId", "1000000000009");
  formData.set("givenName", "สมชาย");
  formData.set("familyName", "บุคลากร");
  formData.set("targetHospitalId", "11111111-1111-4111-8111-111111111111");
  formData.set("profession", "NURSE");
  formData.set("role", "ADMIN");
  formData.set("status", "ACTIVE");
  formData.set("scope", "GLOBAL");
  return formData;
}

function createOwnerGovernanceFormData(): FormData {
  const formData = new FormData();
  formData.set("relationshipId", "22222222-2222-4222-8222-222222222222");
  formData.set("targetHospitalId", "11111111-1111-4111-8111-111111111111");
  formData.set("expectedUpdatedAt", "2026-08-18T05:00:00.000Z");
  formData.set("role", "ADMIN");
  formData.set("membershipType", MembershipType.OWNER);
  formData.set("admin", "true");
  formData.set("status", MembershipStatus.SUSPENDED);
  return formData;
}

describe("workforce Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects malformed staff transport input before resolving the actor", async () => {
    const result = await provisionHospitalMemberAction(
      initialWorkforceProvisionActionState,
      new FormData(),
    );

    expect(result).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    expect(mockedGetProtectedApplicationActor).not.toHaveBeenCalled();
    expect(mockedProvisionHospitalMember).not.toHaveBeenCalled();
  });

  it("does not forward client role/status/scope as trusted workforce input", async () => {
    mockedGetProtectedApplicationActor.mockResolvedValue({
      userId: "owner-1",
      personId: "person-1",
      roles: [],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    });
    mockedProvisionHospitalMember.mockResolvedValue({
      kind: "HOSPITAL_MEMBER",
      userId: "user-1",
      personId: "person-1",
      hospitalId: "11111111-1111-4111-8111-111111111111",
      relationshipId: "22222222-2222-4222-8222-222222222222",
      accountStatus: UserStatus.PROVISIONED,
      relationshipStatus: MembershipStatus.PROVISIONED,
      activationRequired: true,
      activationToken: "one-time-token",
      activationExpiresAt: new Date("2026-08-14T12:00:00.000Z"),
      activationMode: "REMOTE",
      reusedExistingUser: false,
      idempotent: false,
    });

    const result = await provisionHospitalMemberAction(
      initialWorkforceProvisionActionState,
      createStaffFormData(),
    );

    expect(mockedProvisionHospitalMember).toHaveBeenCalledWith(
      expect.anything(),
      {
        nationalId: "1000000000009",
        givenName: "สมชาย",
        familyName: "บุคลากร",
        targetHospitalId: "11111111-1111-4111-8111-111111111111",
        profession: "NURSE",
      },
    );
    expect(result).toMatchObject({
      status: "SUCCESS",
      result: {
        activationToken: "one-time-token",
        accountStatus: UserStatus.PROVISIONED,
      },
    });
    expect(JSON.stringify(result)).not.toContain("ADMIN");
    expect(JSON.stringify(result)).not.toContain("GLOBAL");
  });

  it("passes the ephemeral token, national ID and purpose to the completion service and redirects to login", async () => {
    mockedCompleteWorkforceActivation.mockResolvedValue({ userId: "user-1" });
    const formData = new FormData();
    formData.set("nationalId", "1000000000009");
    formData.set("password", "target-owned-workforce-password");
    formData.set("passwordConfirmation", "target-owned-workforce-password");

    await completeWorkforceActivationAction(
      "one-time-token",
      "ACTIVATION",
      initialWorkforceCompletionActionState,
      formData,
    );

    expect(mockedCompleteWorkforceActivation).toHaveBeenCalledWith("one-time-token", {
      nationalId: "1000000000009",
      password: "target-owned-workforce-password",
      passwordConfirmation: "target-owned-workforce-password",
    });
    expect(mockedCompleteWorkforcePasswordReset).not.toHaveBeenCalled();
    expect(mockedRedirect).toHaveBeenCalledWith("/login?activated=1");
    expect(mockedSignOutCurrentSession).not.toHaveBeenCalled();
  });

  it("routes a RESET purpose to the password reset service only", async () => {
    mockedCompleteWorkforcePasswordReset.mockResolvedValue({ userId: "user-1" });
    const formData = new FormData();
    formData.set("nationalId", "1000000000009");
    formData.set("password", "target-owned-workforce-password");
    formData.set("passwordConfirmation", "target-owned-workforce-password");

    await completeWorkforceActivationAction(
      "one-time-token",
      "RESET",
      initialWorkforceCompletionActionState,
      formData,
    );

    expect(mockedCompleteWorkforcePasswordReset).toHaveBeenCalledTimes(1);
    expect(mockedCompleteWorkforceActivation).not.toHaveBeenCalled();
    expect(mockedRedirect).toHaveBeenCalledWith("/login?reset=1");
  });

  it("requires a valid national ID before any service call", async () => {
    const formData = new FormData();
    formData.set("nationalId", "123");
    formData.set("password", "target-owned-workforce-password");
    formData.set("passwordConfirmation", "target-owned-workforce-password");

    const result = await completeWorkforceActivationAction(
      "one-time-token",
      "ACTIVATION",
      initialWorkforceCompletionActionState,
      formData,
    );

    expect(result).toMatchObject({
      status: "ERROR",
      fieldErrors: { nationalId: expect.any(String) },
    });
    expect(mockedCompleteWorkforceActivation).not.toHaveBeenCalled();
  });

  it("returns the same generic message for every completion conflict and preview failure", async () => {
    mockedCompleteWorkforceActivation.mockRejectedValue(new ConflictError("anything specific"));
    mockedPreviewWorkforceActivation.mockRejectedValue(new ConflictError("missing"));
    const formData = new FormData();
    formData.set("nationalId", "1000000000009");
    formData.set("password", "target-owned-workforce-password");
    formData.set("passwordConfirmation", "target-owned-workforce-password");

    const result = await completeWorkforceActivationAction(
      "one-time-token",
      "ACTIVATION",
      initialWorkforceCompletionActionState,
      formData,
    );
    const preview = await previewWorkforceActivationAction("one-time-token");

    expect(result).toMatchObject({ status: "ERROR", code: "CONFLICT" });
    expect(JSON.stringify(result)).not.toContain("anything specific");
    expect(preview).toMatchObject({
      status: "ERROR",
      message: (result as { message: string }).message,
    });
  });

  it("exposes only the masked name and purpose from a preview", async () => {
    mockedPreviewWorkforceActivation.mockResolvedValue({
      maskedName: "สม*** ใจ***",
      purpose: "RESET",
    });

    await expect(previewWorkforceActivationAction("one-time-token")).resolves.toEqual({
      status: "SUCCESS",
      maskedName: "สม*** ใจ***",
      purpose: "RESET",
    });
  });

  it("rejects unsupported recovery without signing out or exposing issuer credentials", async () => {
    mockedGetProtectedApplicationActor.mockResolvedValue({ userId: "owner-1" } as never);
    mockedIssueWorkforcePasswordReset.mockRejectedValue(new ForbiddenError());
    const formData = new FormData();
    formData.set("userId", "33333333-3333-4333-8333-333333333333");
    formData.set("targetHospitalId", "11111111-1111-4111-8111-111111111111");
    formData.set("kind", "HOSPITAL_OWNER");
    const result = await issueWorkforcePasswordResetAction({ status: "IDLE" }, formData);
    expect(result).toMatchObject({ status: "ERROR", code: "FORBIDDEN" });
    expect(JSON.stringify(result)).toContain("เป็นอิสระจากผู้ดูแล");
    expect(mockedSignOutCurrentSession).not.toHaveBeenCalled();
    expect(mockedRevokeIssuedWorkforceActivation).not.toHaveBeenCalled();
  });

  it("compensates a failed assisted activation handoff with the internal revoke of its own token", async () => {
    mockedGetProtectedApplicationActor.mockResolvedValue({ userId: "member-1" } as never);
    mockedRegenerateWorkforceActivation.mockResolvedValue({
      activationId: "activation-2",
      userId: "33333333-3333-4333-8333-333333333333",
      hospitalId: "11111111-1111-4111-8111-111111111111",
      kind: "OSM",
      activationToken: "activation-token",
      activationExpiresAt: new Date("2026-10-14T00:15:00.000Z"),
      activationMode: "ASSISTED",
    });
    mockedSignOutCurrentSession.mockRejectedValue(new Error("sign out failed"));
    mockedRevokeIssuedWorkforceActivation.mockResolvedValue(undefined);
    const formData = new FormData();
    formData.set("userId", "33333333-3333-4333-8333-333333333333");
    formData.set("targetHospitalId", "11111111-1111-4111-8111-111111111111");
    formData.set("kind", "OSM");

    const result = await startAssistedWorkforceActivationAction({ status: "IDLE" }, formData);

    expect(mockedRevokeIssuedWorkforceActivation).toHaveBeenCalledWith(
      { userId: "member-1" },
      { activationId: "activation-2" },
    );
    expect(result.status).toBe("ERROR");
  });

  it("maps bulk rows back to their visible row numbers and never returns tokens", async () => {
    mockedGetProtectedApplicationActor.mockResolvedValue({ userId: "owner-1" } as never);
    mockedProvisionWorkforceBulk.mockResolvedValue({
      kind: "OSM",
      hospitalId: "11111111-1111-4111-8111-111111111111",
      rows: [
        {
          rowNumber: 1,
          status: "created",
          userId: "u1",
          relationshipId: "r1",
          activationRequired: true,
        },
        { rowNumber: 2, status: "invalid", reason: "INVALID_ROW" },
      ],
    });
    const formData = new FormData();
    formData.set("kind", "OSM");
    formData.set("targetHospitalId", "11111111-1111-4111-8111-111111111111");
    for (const [nationalId, givenName, familyName] of [
      ["1000000000009", "ก", "ข"],
      ["", "", ""],
      ["12", "ค", "ง"],
    ]) {
      formData.append("nationalId", nationalId);
      formData.append("givenName", givenName);
      formData.append("familyName", familyName);
    }

    const result = await provisionWorkforceBulkAction({ status: "IDLE" }, formData);

    expect(mockedProvisionWorkforceBulk).toHaveBeenCalledWith(
      { userId: "owner-1" },
      {
        submissionId: "",
        kind: "OSM",
        targetHospitalId: "11111111-1111-4111-8111-111111111111",
        rowNumbers: [1, 3],
        rows: [
          { nationalId: "1000000000009", givenName: "ก", familyName: "ข" },
          { nationalId: "12", givenName: "ค", familyName: "ง" },
        ],
      },
    );
    expect(result).toMatchObject({
      status: "SUCCESS",
      result: {
        rows: [
          { rowNumber: 1, status: "created" },
          { rowNumber: 3, status: "invalid", reason: "INVALID_ROW" },
        ],
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/token|userId|relationshipId/i);
  });

  it("reports in-batch duplicate national IDs against the visible rows without saving", async () => {
    mockedGetProtectedApplicationActor.mockResolvedValue({ userId: "owner-1" } as never);
    mockedProvisionWorkforceBulk.mockRejectedValue(new WorkforceBulkDuplicateError([1, 2]));
    const formData = new FormData();
    formData.set("kind", "OSM");
    formData.set("targetHospitalId", "11111111-1111-4111-8111-111111111111");
    for (const nationalId of ["1000000000009", "1000000000009"]) {
      formData.append("nationalId", nationalId);
      formData.append("givenName", "ก");
      formData.append("familyName", "ข");
    }

    const result = await provisionWorkforceBulkAction({ status: "IDLE" }, formData);

    expect(result).toMatchObject({ status: "ERROR", duplicateRowNumbers: [1, 2] });
  });

  it("validates and forwards only the bounded profession mutation input", async () => {
    const expectedUpdatedAt = "2026-08-18T05:00:00.000Z";
    const formData = new FormData();
    formData.set("relationshipId", "22222222-2222-4222-8222-222222222222");
    formData.set("targetHospitalId", "11111111-1111-4111-8111-111111111111");
    formData.set("expectedUpdatedAt", expectedUpdatedAt);
    formData.set("profession", "NURSE");
    formData.set("role", "ADMIN");
    formData.set("status", "SUSPENDED");
    formData.set("userId", "untrusted-user");
    mockedGetProtectedApplicationActor.mockResolvedValue({
      userId: "owner-1",
      personId: "person-1",
      roles: [],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    });
    mockedUpdateHospitalMembershipProfession.mockResolvedValue({
      relationshipId: "22222222-2222-4222-8222-222222222222",
      hospitalId: "11111111-1111-4111-8111-111111111111",
      membershipStatus: MembershipStatus.ACTIVE,
      profession: "NURSE",
      updatedAt: new Date(expectedUpdatedAt),
    });

    const result = await updateHospitalMembershipProfessionAction(
      initialWorkforceMembershipMutationActionState,
      formData,
    );

    expect(mockedUpdateHospitalMembershipProfession).toHaveBeenCalledWith(
      expect.anything(),
      {
        relationshipId: "22222222-2222-4222-8222-222222222222",
        targetHospitalId: "11111111-1111-4111-8111-111111111111",
        expectedUpdatedAt,
        profession: "NURSE",
      },
    );
    expect(result).toMatchObject({
      status: "SUCCESS",
      result: { membershipStatus: MembershipStatus.ACTIVE, profession: "NURSE" },
    });
    expect(JSON.stringify(result)).not.toContain("ADMIN");
    expect(JSON.stringify(result)).not.toContain("untrusted-user");
  });

  it("rejects lifecycle transport input before resolving the actor", async () => {
    const result = await suspendHospitalMembershipAction(
      initialWorkforceMembershipMutationActionState,
      new FormData(),
    );

    expect(result).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    expect(mockedGetProtectedApplicationActor).not.toHaveBeenCalled();
    expect(mockedSuspendHospitalMembership).not.toHaveBeenCalled();
  });

  it("uses the server action boundary for restore without accepting client status", async () => {
    const formData = new FormData();
    formData.set("relationshipId", "22222222-2222-4222-8222-222222222222");
    formData.set("targetHospitalId", "11111111-1111-4111-8111-111111111111");
    formData.set("expectedUpdatedAt", "2026-08-18T05:00:00.000Z");
    formData.set("status", "ACTIVE");
    mockedGetProtectedApplicationActor.mockResolvedValue({
      userId: "owner-1",
      personId: "person-1",
      roles: [],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    });
    mockedRestoreHospitalMembership.mockResolvedValue({
      relationshipId: "22222222-2222-4222-8222-222222222222",
      hospitalId: "11111111-1111-4111-8111-111111111111",
      membershipStatus: MembershipStatus.ACTIVE,
      profession: "NURSE",
      updatedAt: new Date("2026-08-18T05:00:01.000Z"),
    });

    const result = await restoreHospitalMembershipAction(
      initialWorkforceMembershipMutationActionState,
      formData,
    );

    expect(mockedRestoreHospitalMembership).toHaveBeenCalledWith(
      expect.anything(),
      {
        relationshipId: "22222222-2222-4222-8222-222222222222",
        targetHospitalId: "11111111-1111-4111-8111-111111111111",
        expectedUpdatedAt: "2026-08-18T05:00:00.000Z",
      },
    );
    expect(result).toMatchObject({ status: "SUCCESS" });
  });

  it("validates and forwards bounded OSM lifecycle input without trusting client state", async () => {
    const formData = new FormData();
    formData.set("relationshipId", "22222222-2222-4222-8222-222222222222");
    formData.set("targetHospitalId", "11111111-1111-4111-8111-111111111111");
    formData.set("expectedUpdatedAt", "2026-08-18T05:00:00.000Z");
    formData.set("status", "ACTIVE");
    formData.set("osmUserId", "untrusted-user");
    mockedGetProtectedApplicationActor.mockResolvedValue({
      userId: "owner-1",
      personId: "person-1",
      roles: [],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    });
    mockedSuspendOsmRelationship.mockResolvedValue({
      relationshipId: "22222222-2222-4222-8222-222222222222",
      hospitalId: "11111111-1111-4111-8111-111111111111",
      relationshipStatus: MembershipStatus.SUSPENDED,
      updatedAt: new Date("2026-08-18T05:00:01.000Z"),
    });

    const result = await suspendOsmRelationshipAction(
      { status: "IDLE" },
      formData,
    );

    expect(mockedSuspendOsmRelationship).toHaveBeenCalledWith(
      expect.anything(),
      {
        relationshipId: "22222222-2222-4222-8222-222222222222",
        targetHospitalId: "11111111-1111-4111-8111-111111111111",
        expectedUpdatedAt: "2026-08-18T05:00:00.000Z",
      },
    );
    expect(result).toMatchObject({
      status: "SUCCESS",
      result: { relationshipStatus: MembershipStatus.SUSPENDED },
    });
    expect(JSON.stringify(result)).not.toContain("untrusted-user");
  });

  it("uses the OSM restore server action and keeps client status out of service input", async () => {
    const formData = new FormData();
    formData.set("relationshipId", "22222222-2222-4222-8222-222222222222");
    formData.set("targetHospitalId", "11111111-1111-4111-8111-111111111111");
    formData.set("expectedUpdatedAt", "2026-08-18T05:00:00.000Z");
    formData.set("status", "SUSPENDED");
    mockedGetProtectedApplicationActor.mockResolvedValue({
      userId: "owner-1",
      personId: "person-1",
      roles: [],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    });
    mockedRestoreOsmRelationship.mockResolvedValue({
      relationshipId: "22222222-2222-4222-8222-222222222222",
      hospitalId: "11111111-1111-4111-8111-111111111111",
      relationshipStatus: MembershipStatus.ACTIVE,
      updatedAt: new Date("2026-08-18T05:00:01.000Z"),
    });

    const result = await restoreOsmRelationshipAction({ status: "IDLE" }, formData);

    expect(mockedRestoreOsmRelationship).toHaveBeenCalledWith(
      expect.anything(),
      {
        relationshipId: "22222222-2222-4222-8222-222222222222",
        targetHospitalId: "11111111-1111-4111-8111-111111111111",
        expectedUpdatedAt: "2026-08-18T05:00:00.000Z",
      },
    );
    expect(result).toMatchObject({
      status: "SUCCESS",
      result: { relationshipStatus: MembershipStatus.ACTIVE },
    });
  });

  it("keeps promotion transport bounded and ignores browser authority fields", async () => {
    const formData = createOwnerGovernanceFormData();
    const expectedUpdatedAt = "2026-08-18T05:00:00.000Z";

    mockedGetProtectedApplicationActor.mockResolvedValue({
      userId: "owner-1",
      personId: "person-1",
      roles: [],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    });
    mockedPromoteHospitalOwner.mockResolvedValue({
      relationshipId: "22222222-2222-4222-8222-222222222222",
      hospitalId: "11111111-1111-4111-8111-111111111111",
      membershipType: MembershipType.OWNER,
      updatedAt: new Date("2026-08-18T05:00:01.000Z"),
    });

    const result = await promoteHospitalOwnerAction(
      initialWorkforceOwnerGovernanceMutationActionState,
      formData,
    );

    expect(mockedPromoteHospitalOwner).toHaveBeenCalledWith(
      expect.anything(),
      {
        relationshipId: "22222222-2222-4222-8222-222222222222",
        targetHospitalId: "11111111-1111-4111-8111-111111111111",
        expectedUpdatedAt,
      },
    );
    expect(result).toMatchObject({
      status: "SUCCESS",
      result: { membershipType: MembershipType.OWNER },
    });
    expect(JSON.stringify(result)).not.toContain("ADMIN");
    expect(JSON.stringify(result)).not.toContain(MembershipStatus.SUSPENDED);
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/app/workforce");
    expect(mockedRevalidatePath).toHaveBeenCalledWith(
      "/app/workforce/staff/22222222-2222-4222-8222-222222222222",
    );
  });

  it("uses a separate bounded demotion action", async () => {
    const formData = createOwnerGovernanceFormData();

    mockedGetProtectedApplicationActor.mockResolvedValue({
      userId: "owner-1",
      personId: "person-1",
      roles: [],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    });
    mockedDemoteHospitalOwner.mockResolvedValue({
      relationshipId: "22222222-2222-4222-8222-222222222222",
      hospitalId: "11111111-1111-4111-8111-111111111111",
      membershipType: MembershipType.MEMBER,
      updatedAt: new Date("2026-08-18T05:00:01.000Z"),
    });

    const result = await demoteHospitalOwnerAction(
      initialWorkforceOwnerGovernanceMutationActionState,
      formData,
    );

    expect(mockedDemoteHospitalOwner).toHaveBeenCalledWith(
      expect.anything(),
      {
        relationshipId: "22222222-2222-4222-8222-222222222222",
        targetHospitalId: "11111111-1111-4111-8111-111111111111",
        expectedUpdatedAt: "2026-08-18T05:00:00.000Z",
      },
    );
    expect(result).toMatchObject({
      status: "SUCCESS",
      result: { membershipType: MembershipType.MEMBER },
    });
  });

  it("rejects malformed Owner governance input before resolving the actor", async () => {
    const result = await promoteHospitalOwnerAction(
      initialWorkforceOwnerGovernanceMutationActionState,
      new FormData(),
    );

    expect(result).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    expect(mockedGetProtectedApplicationActor).not.toHaveBeenCalled();
    expect(mockedPromoteHospitalOwner).not.toHaveBeenCalled();
  });
});
