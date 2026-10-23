// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  preview: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  accept: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  reject: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock("@/modules/family/transport/server-actions", () => ({
  acceptCaregiverInvitationAction: mocks.accept,
  previewCaregiverInvitationAction: mocks.preview,
  rejectCaregiverInvitationAction: mocks.reject,
}));

import { FamilyInvitationPreview } from "./family-invitation-preview";

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  mocks.preview.mockReset();
  mocks.accept.mockReset();
  mocks.reject.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

it("offers a retry when the invitation check cannot reach the server, keeping the stripped token in memory", async () => {
  window.history.replaceState(null, "", `/app/family/invitations#${"a".repeat(43)}`);
  mocks.preview.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce({
    status: "INVALID",
    message: "ไม่พบคำเชิญหรือคำเชิญไม่พร้อมใช้งาน",
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root.render(createElement(FamilyInvitationPreview));
  });

  expect(window.location.hash).toBe("");
  expect(container.textContent).toContain("ตรวจสอบคำเชิญไม่สำเร็จ");
  expect(container.textContent).not.toContain("กำลังตรวจสอบคำเชิญ");

  const retry = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "ลองอีกครั้ง")!;
  await act(async () => {
    retry.click();
  });

  expect(mocks.preview).toHaveBeenCalledTimes(2);
  expect(mocks.preview).toHaveBeenLastCalledWith("a".repeat(43));
  expect(container.textContent).toContain("ไม่พบคำเชิญหรือคำเชิญไม่พร้อมใช้งาน");
});

it("checks invitation status after a lost accept response without replaying the consumed token", async () => {
  const token = "b".repeat(43);
  window.history.replaceState(null, "", `/app/family/invitations#${token}`);
  mocks.preview.mockResolvedValueOnce({
    status: "READY",
    invitation: {
      invitationStatus: "PENDING",
      expiresAt: "2026-10-17T00:00:00.000Z",
      patientDisplayName: "สมชาย ใจดี",
      acceptanceContractVersion: "family-delegation-v1",
      requestedSharing: { relationshipLabel: null, appointmentHospitalCount: 0, appointmentHospitalNames: null, resources: [] },
    },
  }).mockResolvedValueOnce({
    status: "READY",
    invitation: {
      invitationStatus: "ACCEPTED",
      expiresAt: "2026-10-17T00:00:00.000Z",
      patientDisplayName: "สมชาย ใจดี",
      acceptanceContractVersion: "family-delegation-v1",
      requestedSharing: { relationshipLabel: null, appointmentHospitalCount: 0, appointmentHospitalNames: null, resources: [] },
    },
  });
  mocks.accept.mockRejectedValue(new TypeError("Failed to fetch after commit"));
  const reload = vi.fn();
  vi.stubGlobal("location", { ...window.location, reload });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root.render(createElement(FamilyInvitationPreview));
  });
  const accept = Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("ยอมรับการเชื่อมความสัมพันธ์เป็นผู้ดูแล"),
  );
  if (!accept) throw new Error("Missing invitation acceptance action");

  await act(async () => accept.click());

  expect(mocks.accept).toHaveBeenCalledOnce();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("ระบบอาจบันทึกคำตอบแล้ว");
  expect(container.querySelector('[role="alert"] button')?.textContent).toBe("ตรวจสอบสถานะคำเชิญ");
  expect(container.textContent).not.toContain("ตรวจสอบผลด้วยคำขอเดิม");
  const unloadWhileUnverified = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unloadWhileUnverified);
  expect(unloadWhileUnverified.defaultPrevented).toBe(true);

  const previewCallsBeforeVerification = mocks.preview.mock.calls.length;
  await act(async () => container.querySelector<HTMLButtonElement>('[role="alert"] button')?.click());

  expect(mocks.preview).toHaveBeenCalledTimes(previewCallsBeforeVerification + 1);
  expect(mocks.preview).toHaveBeenLastCalledWith(token);
  expect(reload).not.toHaveBeenCalled();
  expect(mocks.accept).toHaveBeenCalledOnce();
  expect(container.textContent).toContain("คำเชิญนี้เป็นสถานะสิ้นสุดแล้ว");
  expect(container.querySelector('[role="alert"] button')).toBeNull();
  const unloadAfterVerification = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unloadAfterVerification);
  expect(unloadAfterVerification.defaultPrevented).toBe(false);
});

it("allows a deliberate answer only after verification confirms the invitation is still pending", async () => {
  const token = "c".repeat(43);
  window.history.replaceState(null, "", `/app/family/invitations#${token}`);
  const pendingPreview = {
    status: "READY" as const,
    invitation: {
      invitationStatus: "PENDING" as const,
      expiresAt: "2026-10-17T00:00:00.000Z",
      patientDisplayName: "สมชาย ใจดี",
      acceptanceContractVersion: "family-delegation-v1" as const,
      requestedSharing: { relationshipLabel: null, appointmentHospitalCount: 0, appointmentHospitalNames: null, resources: [] },
    },
  };
  mocks.preview.mockResolvedValueOnce(pendingPreview).mockResolvedValueOnce(pendingPreview);
  mocks.accept.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  await act(async () => root.render(createElement(FamilyInvitationPreview)));
  const acceptButton = (): HTMLButtonElement | undefined =>
    Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("ยอมรับการเชื่อมความสัมพันธ์เป็นผู้ดูแล"),
    );
  const accept = acceptButton();
  if (!accept) throw new Error("Missing invitation acceptance action");
  await act(async () => accept.click());
  expect(acceptButton()?.disabled).toBe(true);

  const statusCheck = container.querySelector<HTMLButtonElement>('[role="alert"] button');
  if (!statusCheck) throw new Error("Missing invitation status check action");
  await act(async () => statusCheck.click());

  expect(mocks.accept).toHaveBeenCalledOnce();
  expect(mocks.preview).toHaveBeenLastCalledWith(token);
  expect(container.textContent).toContain("ตรวจสอบแล้วว่าคำเชิญยังรอตอบรับ");
  expect(acceptButton()?.disabled).toBe(false);
});
