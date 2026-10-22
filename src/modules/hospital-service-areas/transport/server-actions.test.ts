import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  issueChildOwnerLink: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mocks.actor,
}));
vi.mock("../services/child-facility-service", () => ({
  acceptChildOwnerInvitation: vi.fn(),
  cancelPendingChildFacility: vi.fn(),
  changeChildOwnerInvitee: vi.fn(),
  createChildFacility: vi.fn(),
  declineChildOwnerInvitation: vi.fn(),
  inviteReplacementChildOwner: vi.fn(),
  issueChildOwnerLink: mocks.issueChildOwnerLink,
  renameChildFacility: vi.fn(),
  revokeChildOwnerLink: vi.fn(),
}));

import { issueChildOwnerLinkAction } from "./server-actions";

describe("Child OWNER invitation activation URL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "https://demi.example");
    mocks.actor.mockResolvedValue({ userId: "parent-owner" });
    mocks.issueChildOwnerLink.mockResolvedValue({
      status: "ACTIVATION_LINK",
      activationToken: "child-owner-token",
      activationExpiresAt: new Date("2026-10-23T00:00:00.000Z"),
      activationMode: "REMOTE",
    });
  });

  it("returns a canonical server-built URL with the token in the fragment", async () => {
    const formData = new FormData();
    formData.set("parentHospitalId", "11111111-1111-4111-8111-111111111111");
    formData.set("childHospitalId", "22222222-2222-4222-8222-222222222222");
    formData.set("mode", "REMOTE");

    const result = await issueChildOwnerLinkAction({ status: "IDLE" }, formData);

    expect(result).toMatchObject({
      status: "SUCCESS",
      invitation: {
        kind: "ACTIVATION_LINK",
        activationToken: "child-owner-token",
        activationUrl: "https://demi.example/activate/workforce#child-owner-token",
      },
    });
  });

  it("returns the configured-origin error without issuing when the public origin is missing", async () => {
    vi.stubEnv("DEMI_LINE_PUBLIC_ORIGIN", "");
    const formData = new FormData();
    formData.set("parentHospitalId", "11111111-1111-4111-8111-111111111111");
    formData.set("childHospitalId", "22222222-2222-4222-8222-222222222222");
    formData.set("mode", "REMOTE");

    const result = await issueChildOwnerLinkAction({ status: "IDLE" }, formData);

    expect(result).toMatchObject({
      status: "ERROR",
      code: "UNAVAILABLE",
      message: "ระบบยังไม่ได้ตั้งค่าที่อยู่สำหรับลิงก์เปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
    });
    expect(mocks.issueChildOwnerLink).not.toHaveBeenCalled();
  });
});
