// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children?: React.ReactNode }) => createElement("a", { ...props, href }, children),
}));

import { LinePasswordRecoveryNudge } from "./line-password-recovery-nudge";
import type { LineRecoveryReadiness } from "@/modules/line/domain/line-recovery-readiness";

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderNotice(readiness: LineRecoveryReadiness, soleOwnerHospitalCount: number | null = 0): Promise<void> {
  await act(async () => root.render(createElement(LinePasswordRecoveryNudge, {
    readiness,
    soleOwnerHospitalCount,
    userId: "owner-1",
    href: "/line/account",
  })));
}

describe("Hospital OWNER LINE recovery readiness notice", () => {
  it("offers optional linking and the Platform ADMIN fallback to a sole OWNER", async () => {
    await renderNotice({ status: "UNLINKED", recoveryConfigured: true }, 1);

    expect(container.textContent).toContain("การผูก LINE เป็นทางเลือก");
    expect(container.textContent).toContain("OWNER ที่ใช้งานได้เพียงคนเดียวใน 1 โรงพยาบาล");
    expect(container.textContent).toContain("Platform ADMIN");
    expect(container.querySelector('a[href="/line/account"]')?.textContent).toContain("(ทางเลือก)");
    expect(container.querySelector('button[aria-label="ปิดคำแนะนำความพร้อมกู้คืนผ่าน LINE"]')).not.toBeNull();
  });

  it("reports a recently verified friendship as ready and includes when it was observed", async () => {
    const observedAt = "2026-10-26T04:00:00.000Z";
    await renderNotice({ status: "READY", recoveryConfigured: true, observedAt });

    expect(container.textContent).toContain("พร้อมสำหรับการขอลิงก์กู้คืน");
    expect(container.querySelector("time")?.getAttribute("dateTime")).toBe(observedAt);
  });

  it.each([
    [{ status: "UNCONFIRMED", recoveryConfigured: true, reason: "STALE_OBSERVATION", observedAt: "2026-10-24T00:00:00.000Z", reachability: "FRIEND" }, "เก่ากว่า 24 ชั่วโมง"],
    [{ status: "UNCONFIRMED", recoveryConfigured: true, reason: "FRIENDSHIP_UNCONFIRMED", observedAt: "2026-10-26T04:00:00.000Z", reachability: "NOT_FRIEND" }, "ยังไม่ยืนยันว่าเป็นเพื่อน"],
  ] as const)("does not describe an unconfirmed LINE status as ready", async (readiness, expectedCopy) => {
    await renderNotice(readiness);

    expect(container.textContent).toContain(expectedCopy);
    expect(container.textContent).not.toContain("พร้อมสำหรับการขอลิงก์กู้คืน");
  });

  it("explains configuration unavailability and preserves assisted recovery", async () => {
    await renderNotice({ status: "UNAVAILABLE", recoveryConfigured: false });

    expect(container.textContent).toContain("ยังตั้งค่าช่องทางกู้คืนผ่าน LINE ไม่ครบ");
    expect(container.textContent).toContain("Platform ADMIN");
  });

  it("remembers dismissal for this user and readiness state", async () => {
    const readiness: LineRecoveryReadiness = { status: "UNLINKED", recoveryConfigured: true };
    await renderNotice(readiness);
    const dismiss = container.querySelector<HTMLButtonElement>('button[aria-label="ปิดคำแนะนำความพร้อมกู้คืนผ่าน LINE"]');
    if (!dismiss) throw new Error("Missing dismiss action");
    await act(async () => dismiss.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(container.textContent).toBe("");
    expect(window.localStorage.getItem("demi-hospital-owner-recovery-readiness-dismissed:owner-1:UNLINKED")).toBe("1");
  });
});
