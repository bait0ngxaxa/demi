import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CaregiverInvitationPreviewActionState } from "@/modules/family/transport/action-state";

const harness = vi.hoisted(() => ({
  preview: { status: "LOADING" } as CaregiverInvitationPreviewActionState,
  snapshot: { status: "READY", token: "a".repeat(43) } as { status: string; token?: string },
  effects: [] as Array<() => unknown>,
  getSnapshot: undefined as (() => unknown) | undefined,
  previewAction: vi.fn(), accept: vi.fn(), reject: vi.fn(),
}));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: () => [harness.preview, vi.fn()],
  useEffect: (effect: () => unknown) => { harness.effects.push(effect); },
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => {
    harness.getSnapshot = getSnapshot;
    return harness.snapshot;
  },
}));
vi.mock("@/modules/family/transport/server-actions", () => ({
  previewCaregiverInvitationAction: harness.previewAction,
  acceptCaregiverInvitationAction: harness.accept,
  rejectCaregiverInvitationAction: harness.reject,
}));

import { FamilyInvitationPreview } from "./family-invitation-preview";
import { metadata } from "./page";

function render(): string { return renderToStaticMarkup(<FamilyInvitationPreview />); }

describe("invitation client fragment and preview boundary (Node/SSR)", () => {
  beforeEach(() => {
    vi.clearAllMocks(); harness.effects = [];
    harness.snapshot = { status: "READY", token: "a".repeat(43) };
    harness.preview = { status: "LOADING" };
    harness.previewAction.mockResolvedValue({ status: "INVALID", message: "ไม่พบคำเชิญหรือคำเชิญไม่พร้อมใช้งาน" });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(["a".repeat(43), "malformed", "%invalid"])("validates and strips the fragment once on hydration: %s", (fragment) => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", { location: { hash: `#${fragment}`, pathname: "/app/family/invitations", search: "" }, history: { replaceState } });
    render();
    harness.effects[0]?.();
    harness.effects[0]?.();
    expect(replaceState).toHaveBeenCalledExactlyOnceWith(null, "", "/app/family/invitations");
    expect(harness.getSnapshot?.()).toEqual(fragment === "a".repeat(43) ? { status: "READY", token: fragment } : { status: "INVALID" });
    expect(metadata).toMatchObject({ referrer: "no-referrer", robots: { index: false, follow: false } });
  });

  it("shows the same unavailable message for malformed fragment and generic server failure", () => {
    harness.snapshot = { status: "INVALID" };
    const malformed = render();
    expect(malformed).toContain("ไม่พบคำเชิญหรือคำเชิญไม่พร้อมใช้งาน");
    expect(malformed).not.toContain("กำลังตรวจสอบคำเชิญ");
    harness.snapshot = { status: "READY", token: "a".repeat(43) };
    harness.preview = { status: "INVALID", message: "ไม่พบคำเชิญหรือคำเชิญไม่พร้อมใช้งาน" };
    const unavailable = render();
    expect(unavailable).toContain("ไม่พบคำเชิญหรือคำเชิญไม่พร้อมใช้งาน");
    expect(unavailable).not.toContain("ยอมรับการเชื่อมความสัมพันธ์");
    expect(unavailable).not.toContain("สมชาย");
  });

  it("retains login guidance without Patient identity", () => {
    harness.preview = { status: "NEEDS_LOGIN", message: "กรุณาเข้าสู่ระบบด้วยบัญชีผู้รับคำเชิญ" };
    expect(render()).toContain(`href="/login#${"a".repeat(43)}"`);
    expect(render()).not.toContain("สมชาย");
  });

  it.each(["PENDING", "ACCEPTED", "REJECTED", "REVOKED", "EXPIRED"] as const)("keeps bounded recipient %s preview and never mutates on render/preview", async (invitationStatus) => {
    harness.preview = { status: "READY", invitation: { invitationStatus, patientDisplayName: "สมชาย ใจดี", expiresAt: "2026-10-02T00:00:00Z", acceptanceContractVersion: "family-delegation-v1" } };
    const markup = render();
    expect(markup).toContain("สมชาย ใจดี");
    expect(markup.includes("ยอมรับการเชื่อมความสัมพันธ์เป็นผู้ดูแล")).toBe(invitationStatus === "PENDING");
    harness.effects[1]?.();
    await Promise.resolve();
    expect(harness.previewAction).toHaveBeenCalledWith("a".repeat(43));
    expect(harness.accept).not.toHaveBeenCalled();
    expect(harness.reject).not.toHaveBeenCalled();
  });
});
