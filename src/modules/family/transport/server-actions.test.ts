import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  createInvitation: vi.fn(),
  previewInvitation: vi.fn(),
  acceptInvitation: vi.fn(),
  rejectInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  revokeRelationship: vi.fn(),
  withdrawRelationship: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mocks.getActor,
}));
vi.mock("../services/caregiver-relationship-service", () => ({
  createCaregiverInvitation: mocks.createInvitation,
  previewCaregiverInvitation: mocks.previewInvitation,
  acceptCaregiverInvitation: mocks.acceptInvitation,
  rejectCaregiverInvitation: mocks.rejectInvitation,
  revokePendingCaregiverInvitation: mocks.revokeInvitation,
  revokeCaregiverRelationship: mocks.revokeRelationship,
  withdrawOwnCaregiverRelationship: mocks.withdrawRelationship,
}));

import { ForbiddenError, ConflictError } from "@/shared/errors/application-error";

import {
  acceptCaregiverInvitationAction,
  createCaregiverInvitationAction,
  previewCaregiverInvitationAction,
} from "./server-actions";
import {
  initialCaregiverInvitationPreviewActionState,
  initialCreateCaregiverInvitationActionState,
  initialFamilyMutationActionState,
} from "./action-state";

const actor = {
  userId: "11111111-1111-4111-8111-111111111111",
  personId: "22222222-2222-4222-8222-222222222222",
  roles: ["PATIENT"],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
} as const;

function createFormData(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}

describe("Family Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActor.mockResolvedValue(actor);
  });

  it("returns the approved generic recipient failure without echoing National ID", async () => {
    const nationalId = "1000000000009";
    mocks.createInvitation.mockRejectedValue(new ConflictError("recipient state is private"));

    const result = await createCaregiverInvitationAction(
      initialCreateCaregiverInvitationActionState,
      createFormData({ nationalId }),
    );

    expect(result).toEqual({
      status: "ERROR",
      message: "ไม่สามารถสร้างคำเชิญสำหรับข้อมูลนี้ได้",
    });
    expect(JSON.stringify(result)).not.toContain(nationalId);
    expect(JSON.stringify(result)).not.toContain("recipient state is private");
  });

  it("rejects malformed National ID before resolving the actor or recipient", async () => {
    const result = await createCaregiverInvitationAction(
      initialCreateCaregiverInvitationActionState,
      createFormData({ nationalId: "not-an-id" }),
    );

    expect(result).toEqual({ status: "ERROR", message: "กรุณาตรวจสอบเลขบัตรประชาชนให้ถูกต้อง" });
    expect(mocks.getActor).not.toHaveBeenCalled();
    expect(mocks.createInvitation).not.toHaveBeenCalled();
  });

  it("does not expose invite identifiers or secrets in preview results", async () => {
    const token = "a".repeat(43);
    mocks.previewInvitation.mockResolvedValue({
      invitationId: "not-for-client",
      status: "PENDING",
      expiresAt: new Date("2026-10-02T00:00:00.000Z"),
      patientDisplayName: "สมชาย ใจดี",
      acceptanceContractVersion: "family-delegation-v1",
    });

    const result = await previewCaregiverInvitationAction(token);

    expect(result).toEqual({
      status: "READY",
      invitation: {
        invitationStatus: "PENDING",
        expiresAt: "2026-10-02T00:00:00.000Z",
        patientDisplayName: "สมชาย ใจดี",
        acceptanceContractVersion: "family-delegation-v1",
      },
    });
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain("not-for-client");
    expect(initialCaregiverInvitationPreviewActionState.status).toBe("LOADING");
  });

  it("maps an invite forwarded to the wrong account to a safe recipient error", async () => {
    mocks.acceptInvitation.mockRejectedValue(new ForbiddenError());
    const token = "b".repeat(43);

    const result = await acceptCaregiverInvitationAction(
      initialFamilyMutationActionState,
      createFormData({ token }),
    );

    expect(result).toEqual({ status: "ERROR", message: "บัญชีนี้ไม่ใช่ผู้รับคำเชิญนี้" });
    expect(JSON.stringify(result)).not.toContain(token);
  });
});
