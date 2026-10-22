// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ remote: vi.fn(), assisted: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/modules/workforce/transport/server-actions", () => ({ regenerateWorkforceActivationAction: mocks.remote, startAssistedWorkforceActivationAction: mocks.assisted }));

import { WorkforceActivationControl } from "./[kind]/[relationshipId]/workforce-activation-control";

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  mocks.remote.mockReset().mockResolvedValue({ status: "IDLE" });
  mocks.assisted.mockReset().mockResolvedValue({ status: "ERROR", code: "UNAVAILABLE", message: "ระบบไม่พร้อม" });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(): void {
  act(() => root.render(
    <WorkforceActivationControl
      activationLinkUsable={false}
      hospitalId="11111111-1111-4111-8111-111111111111"
      kind="HOSPITAL_MEMBER"
      maskedName="ส*** บ***"
      relationshipId="22222222-2222-4222-8222-222222222222"
      userId="33333333-3333-4333-8333-333333333333"
    />,
  ));
}

describe("workforce assisted activation recovery", () => {
  it("does not replay an assisted issuance after an unknown outcome", async () => {
    render();
    const button = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.trim() === "ช่วยเปิดใช้งานบนเครื่องนี้");
    if (!button) throw new Error("Missing assisted activation button");
    await act(async () => button.click());

    expect(mocks.assisted).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("ระบบยังยืนยันผลการออกลิงก์ไม่ได้");
    expect(container.textContent).toContain("โหลดรายละเอียดใหม่");
    expect(container.textContent).not.toContain("เสร็จแล้ว");
    expect(container.textContent).not.toContain("remote-one-time-token");
    expect(container.querySelector('[data-navigation-guard="unknown-outcome"]')).toBeNull();
  });
});
