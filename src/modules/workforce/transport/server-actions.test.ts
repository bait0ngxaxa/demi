import { MembershipStatus, UserStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { signOutCurrentSession } from "@/modules/auth/services/authentication-service";

import {
  completeWorkforceActivation,
  provisionHospitalMember,
} from "../services/workforce-service";
import {
  initialWorkforceCompletionActionState,
  initialWorkforceProvisionActionState,
} from "./action-state";
import {
  completeWorkforceActivationAction,
  provisionHospitalMemberAction,
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
  provisionHospitalMember: vi.fn(),
  provisionOsm: vi.fn(),
  regenerateWorkforceActivation: vi.fn(),
  revokeWorkforceActivation: vi.fn(),
}));

const mockedGetProtectedApplicationActor = vi.mocked(getProtectedApplicationActor);
const mockedSignOutCurrentSession = vi.mocked(signOutCurrentSession);
const mockedCompleteWorkforceActivation = vi.mocked(completeWorkforceActivation);
const mockedProvisionHospitalMember = vi.mocked(provisionHospitalMember);

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

  it("passes the ephemeral activation token to the completion service and redirects to login", async () => {
    mockedCompleteWorkforceActivation.mockResolvedValue({ userId: "user-1" });
    const formData = new FormData();
    formData.set("password", "target-owned-workforce-password");
    formData.set("passwordConfirmation", "target-owned-workforce-password");

    await completeWorkforceActivationAction(
      "one-time-token",
      initialWorkforceCompletionActionState,
      formData,
    );

    expect(mockedCompleteWorkforceActivation).toHaveBeenCalledWith(
      "one-time-token",
      {
        password: "target-owned-workforce-password",
        passwordConfirmation: "target-owned-workforce-password",
      },
    );
    expect(mockedRedirect).toHaveBeenCalledWith("/login?activated=1");
    expect(mockedSignOutCurrentSession).not.toHaveBeenCalled();
  });
});
