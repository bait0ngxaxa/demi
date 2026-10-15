// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ preview: vi.fn<(...args: unknown[]) => Promise<unknown>>() }));

vi.mock("@/modules/family/transport/server-actions", () => ({
  acceptCaregiverInvitationAction: vi.fn(),
  previewCaregiverInvitationAction: mocks.preview,
  rejectCaregiverInvitationAction: vi.fn(),
}));

import { FamilyInvitationPreview } from "./family-invitation-preview";

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
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
