import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CreateCaregiverInvitationActionState } from "@/modules/family/transport/action-state";
import type { FamilyManagementOverview } from "@/modules/family/services/caregiver-relationship-query-service";

const harness = vi.hoisted(() => ({
  creation: { status: "IDLE" } as CreateCaregiverInvitationActionState,
  qrFailure: false,
  qr: vi.fn(),
  copy: undefined as (() => Promise<void>) | undefined,
  writeText: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useActionState: (_action: unknown, initial: unknown) => [
    initial === initialCreateCaregiverInvitationActionState ? harness.creation : initial,
    undefined, false,
  ],
  useSyncExternalStore: () => "https://demi.example",
}));
vi.mock("./family-invitation-qr", () => ({
  FamilyInvitationQr: ({ invitationLink }: { invitationLink: string }) => {
    harness.qr(invitationLink);
    return <p>{harness.qrFailure ? "ไม่สามารถสร้างคิวอาร์โค้ดได้ กรุณาใช้ลิงก์คำเชิญแทน" : "กำลังสร้างคิวอาร์โค้ดคำเชิญ..."}</p>;
  },
}));
vi.mock("@/components/ui/button", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/ui/button")>();
  return { ...actual, Button: (props: React.ComponentProps<typeof actual.Button>) => {
    if (props.onClick) harness.copy = props.onClick as () => Promise<void>;
    return <actual.Button {...props} />;
  } };
});

import { initialCreateCaregiverInvitationActionState } from "@/modules/family/transport/action-state";
import { FamilyManagementWorkspace } from "./family-management-workspace";

const overview: FamilyManagementOverview = {
  patient: { invitations: [], relationships: [], nextInvitationsCursor: null, nextRelationshipsCursor: null },
  caregiver: { invitations: [], relationships: [], nextInvitationsCursor: null, nextRelationshipsCursor: null },
};
const token = "a".repeat(43);
const link = `https://demi.example/app/family/invitations#${token}`;
function render(): string { return renderToStaticMarkup(<FamilyManagementWorkspace overview={overview} />); }

describe("Family issuance-only QR and copy transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.creation = { status: "SUCCESS", token, expiresAt: "2026-10-02T00:00:00Z" };
    harness.qrFailure = false;
    harness.copy = undefined;
    vi.stubGlobal("navigator", { clipboard: { writeText: harness.writeText } });
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => { throw new Error("No secret storage"); }), setItem: vi.fn(() => { throw new Error("No secret storage"); }) });
    vi.stubGlobal("sessionStorage", { getItem: vi.fn(() => { throw new Error("No secret storage"); }), setItem: vi.fn(() => { throw new Error("No secret storage"); }) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([false, true])("preserves the exact copy-link fallback, expiry and warning (QR failure %s)", async (failure) => {
    harness.qrFailure = failure;
    const markup = render();
    expect(markup).toContain(`value="${link}"`);
    expect(harness.qr).toHaveBeenCalledWith(link);
    expect(markup).toContain("หมดอายุ");
    expect(markup).toContain("QR และลิงก์นี้แสดงครั้งเดียว");
    expect(markup).toContain("ผู้ที่ได้รับภาพ QR หรือลิงก์สามารถเปิดหน้าคำเชิญได้");
    expect(markup).toContain("แต่ต้องเข้าสู่ระบบด้วยบัญชีผู้รับที่ระบุไว้จึงจะตอบรับได้");
    expect(markup).toContain("คัดลอกลิงก์");
    expect(markup).not.toMatch(/download=|ดาวน์โหลด|พิมพ์ QR|แชร์ QR|<canvas/);
    if (!harness.copy) throw new Error("Missing copy action");
    await harness.copy();
    expect(harness.writeText).toHaveBeenCalledWith(link);
  });

  it("does not reconstruct QR on a fresh render without issuance SUCCESS", () => {
    harness.creation = { status: "IDLE" };
    expect(render()).not.toContain(link);
    expect(harness.qr).not.toHaveBeenCalled();
    harness.creation = { status: "ERROR", message: "สร้างคำเชิญไม่ได้" };
    render();
    expect(harness.qr).not.toHaveBeenCalled();
  });

  it("uses the new issuance URL instead of retaining the previous secret", () => {
    render();
    harness.creation = { status: "SUCCESS", token: "b".repeat(43), expiresAt: "2026-10-03T00:00:00Z" };
    const markup = render();
    expect(harness.qr).toHaveBeenLastCalledWith(link.replace(token, "b".repeat(43)));
    expect(markup).not.toContain(token);
  });
});
