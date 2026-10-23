import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  createInvitation: vi.fn(),
  reissueInvitation: vi.fn(),
  previewInvitation: vi.fn(),
  previewPublicInvitation: vi.fn(),
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
  reissueCaregiverInvitationLink: mocks.reissueInvitation,
  previewCaregiverInvitation: mocks.previewInvitation,
  previewPublicCaregiverInvitation: mocks.previewPublicInvitation,
  acceptCaregiverInvitation: mocks.acceptInvitation,
  rejectCaregiverInvitation: mocks.rejectInvitation,
  revokePendingCaregiverInvitation: mocks.revokeInvitation,
  revokeCaregiverRelationship: mocks.revokeRelationship,
  withdrawOwnCaregiverRelationship: mocks.withdrawRelationship,
}));

import { ForbiddenError, ConflictError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import {
  acceptCaregiverInvitationAction,
  createCaregiverInvitationAction,
  previewCaregiverInvitationAction,
  reissueCaregiverInvitationLinkAction,
  revokePendingCaregiverInvitationAction,
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
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://canonical.example");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("returns a caregiver invitation URL from the configured public origin", async () => {
    const token = "a".repeat(43);
    const expiresAt = new Date("2026-10-02T00:00:00.000Z");
    mocks.createInvitation.mockResolvedValue({ plaintextToken: token, expiresAt });

    const result = await createCaregiverInvitationAction(
      initialCreateCaregiverInvitationActionState,
      createFormData({ nationalId: "1000000000009", relationshipLabel: "CHILD" }),
    );

    expect(result).toEqual({
      status: "SUCCESS",
      invitationUrl: `https://canonical.example/app/family/invitations#${token}`,
      expiresAt: "2026-10-02T00:00:00.000Z",
    });
  });

  it("returns a reissued invitation URL from the configured public origin", async () => {
    const token = "b".repeat(43);
    const expiresAt = new Date("2026-10-03T00:00:00.000Z");
    mocks.reissueInvitation.mockResolvedValue({ plaintextToken: token, expiresAt });

    const result = await reissueCaregiverInvitationLinkAction(
      initialCreateCaregiverInvitationActionState,
      createFormData({ invitationId: "33333333-3333-4333-8333-333333333333" }),
    );

    expect(result).toEqual({
      status: "SUCCESS",
      invitationUrl: `https://canonical.example/app/family/invitations#${token}`,
      expiresAt: "2026-10-03T00:00:00.000Z",
    });
  });

  it("returns the approved generic recipient failure without echoing National ID", async () => {
    const nationalId = "1000000000009";
    mocks.createInvitation.mockRejectedValue(new ConflictError("recipient state is private"));

    const result = await createCaregiverInvitationAction(
      initialCreateCaregiverInvitationActionState,
      createFormData({ nationalId, relationshipLabel: "CHILD" }),
    );

    expect(result).toEqual({
      status: "ERROR",
      message:
        "ไม่สามารถสร้างคำเชิญได้ กรุณาตรวจสอบรายการคำเชิญที่รอตอบรับ หากพบคำเชิญเดิม ให้ยกเลิกก่อนสร้างใหม่",
    });
    expect(JSON.stringify(result)).not.toContain(nationalId);
    expect(JSON.stringify(result)).not.toContain("recipient state is private");
  });

  it("rejects malformed National ID before resolving the actor or recipient", async () => {
    const result = await createCaregiverInvitationAction(
      initialCreateCaregiverInvitationActionState,
      createFormData({ nationalId: "not-an-id", relationshipLabel: "CHILD" }),
    );

    expect(result).toEqual({ status: "ERROR", message: "กรุณาตรวจสอบเลขบัตรประชาชนและความสัมพันธ์ให้ถูกต้อง" });
    expect(mocks.getActor).not.toHaveBeenCalled();
    expect(mocks.createInvitation).not.toHaveBeenCalled();
  });

  it("AF-5: requires a relationship label and forwards exactly the chosen scopes", async () => {
    expect(await createCaregiverInvitationAction(initialCreateCaregiverInvitationActionState, createFormData({ nationalId: "1000000000009" })))
      .toEqual({ status: "ERROR", message: "กรุณาตรวจสอบเลขบัตรประชาชนและความสัมพันธ์ให้ถูกต้อง" });
    expect(mocks.createInvitation).not.toHaveBeenCalled();

    mocks.createInvitation.mockResolvedValue({ plaintextToken: "a".repeat(43), expiresAt: new Date("2026-10-02T00:00:00.000Z") });
    const form = createFormData({ nationalId: "1000000000009", relationshipLabel: "OTHER", relationshipLabelOther: " เพื่อนบ้าน " });
    form.append("appointmentRelationshipIds", "33333333-3333-4333-8333-333333333333");
    form.append("resources", "PROFILE_SUMMARY");
    form.append("patientProfileId", "untrusted");
    expect(await createCaregiverInvitationAction(initialCreateCaregiverInvitationActionState, form)).toMatchObject({ status: "SUCCESS" });
    expect(mocks.createInvitation).toHaveBeenCalledWith(actor, {
      nationalId: "1000000000009", relationshipLabel: "OTHER", relationshipLabelOther: "เพื่อนบ้าน",
      appointmentRelationshipIds: ["33333333-3333-4333-8333-333333333333"], resources: ["PROFILE_SUMMARY"],
    });
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

  it("rechecks the authenticated actor before explicitly revoking a pending invitation", async () => {
    const formData = createFormData({ invitationId: "33333333-3333-4333-8333-333333333333" });

    const result = await revokePendingCaregiverInvitationAction(
      initialFamilyMutationActionState,
      formData,
    );

    expect(result).toEqual({ status: "SUCCESS", message: "ยกเลิกคำเชิญแล้ว" });
    expect(mocks.getActor).toHaveBeenCalledOnce();
    expect(mocks.revokeInvitation).toHaveBeenCalledWith(
      actor,
      "33333333-3333-4333-8333-333333333333",
    );
  });
});


describe("invitation preview privacy boundary", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.getActor.mockResolvedValue(actor); });
  it("returns identical unavailable output for malformed, unknown and wrong-recipient tokens", async () => {
    const unavailable = { status: "INVALID", message: "ไม่พบคำเชิญหรือคำเชิญไม่พร้อมใช้งาน" };
    expect(await previewCaregiverInvitationAction("malformed")).toEqual(unavailable);
    for (const error of [new NotFoundError("private detail"), new ForbiddenError("private detail")]) {
      mocks.previewInvitation.mockRejectedValueOnce(error);
      const result = await previewCaregiverInvitationAction("a".repeat(43));
      expect(result).toEqual(unavailable);
      expect(result).not.toHaveProperty("invitation");
    }
  });
  it("keeps reachable unauthenticated handoff generic and usable", async () => {
    mocks.getActor.mockRejectedValueOnce(new UnauthenticatedError());
    mocks.previewPublicInvitation.mockResolvedValueOnce({ status: "NEEDS_LOGIN" });
    expect(await previewCaregiverInvitationAction("a".repeat(43))).toEqual({
      status: "NEEDS_LOGIN", message: "กรุณาเข้าสู่ระบบด้วยบัญชีผู้รับคำเชิญ",
    });
    expect(mocks.previewPublicInvitation).toHaveBeenCalledWith("a".repeat(43));
  });
  it("offers account creation only for a valid hash-bound invitation", async () => {
    mocks.getActor.mockRejectedValueOnce(new UnauthenticatedError());
    mocks.previewPublicInvitation.mockResolvedValueOnce({
      status: "NEEDS_ACCOUNT",
      expiresAt: new Date("2026-10-02T00:00:00Z"),
      patientDisplayName: "สมชาย ใจดี",
      acceptanceContractVersion: "family-delegation-v1",
    });

    expect(await previewCaregiverInvitationAction("a".repeat(43))).toEqual({
      status: "NEEDS_ACCOUNT",
      invitation: {
        expiresAt: "2026-10-02T00:00:00.000Z",
        patientDisplayName: "สมชาย ใจดี",
        acceptanceContractVersion: "family-delegation-v1",
      },
    });
  });
  it.each(["PENDING", "ACCEPTED", "REJECTED", "REVOKED", "EXPIRED"])("preserves bounded exact-recipient %s preview without mutation", async (status) => {
    mocks.previewInvitation.mockResolvedValueOnce({ status, expiresAt: new Date("2026-10-02T00:00:00Z"), patientDisplayName: "สมชาย ใจดี", acceptanceContractVersion: "family-delegation-v1" });
    expect(await previewCaregiverInvitationAction("a".repeat(43))).toEqual({ status: "READY", invitation: { invitationStatus: status, expiresAt: "2026-10-02T00:00:00.000Z", patientDisplayName: "สมชาย ใจดี", acceptanceContractVersion: "family-delegation-v1" } });
    expect(mocks.acceptInvitation).not.toHaveBeenCalled();
    expect(mocks.rejectInvitation).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
