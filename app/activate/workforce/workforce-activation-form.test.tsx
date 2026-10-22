// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ preview: vi.fn(), complete: vi.fn() }));
vi.mock("@/modules/workforce/transport/server-actions", () => ({
  completeWorkforceActivationAction: mocks.complete,
  previewWorkforceActivationAction: mocks.preview,
}));

import { WorkforceActivationForm } from "./workforce-activation-form";

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  mocks.preview.mockReset().mockResolvedValue({ status: "SUCCESS", maskedName: "ส***", purpose: "ACTIVATION" });
  mocks.complete.mockReset().mockResolvedValue({ status: "IDLE" });
  window.history.replaceState(null, "", "/activate/workforce");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("workforce activation token transport", () => {
  it("explains the one-open link recovery when no hash token is present", async () => {
    await act(async () => root.render(createElement(WorkforceActivationForm)));

    expect(container.textContent).toContain("ไม่พบลิงก์เปิดใช้งาน");
    expect(container.textContent).toContain("ใช้ได้ครั้งเดียวต่อการเปิดลิงก์");
    expect(container.textContent).toContain("เปิดลิงก์ต้นฉบับ");
    expect(container.textContent).toContain("ขอลิงก์ใหม่จากโรงพยาบาล");
  });

  it("keeps removing the one-time token hash from the address bar after reading it", async () => {
    window.history.replaceState(null, "", "/activate/workforce#single-use-token");
    await act(async () => {
      root.render(createElement(WorkforceActivationForm));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(window.location.hash).toBe("");
    expect(window.location.search).toBe("");
    expect(mocks.preview).toHaveBeenCalledWith("single-use-token");
  });
});
