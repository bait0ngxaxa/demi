// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateCaregiverInvitationActionState } from "@/modules/family/transport/action-state";
import type { FamilyManagementOverview } from "@/modules/family/services/caregiver-relationship-query-service";

const harness = vi.hoisted(() => ({
  creation: { status: "IDLE" } as CreateCaregiverInvitationActionState,
  png: vi.fn(),
  writeText: vi.fn(),
}));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useActionState: (_action: unknown, initial: unknown) => [
    initial === initialCreateCaregiverInvitationActionState ? harness.creation : initial,
    undefined, false,
  ],
}));
vi.mock("@/lib/qr/branded-qr-png.client", () => ({ createBrandedQrPngDataUrl: harness.png }));

import { initialCreateCaregiverInvitationActionState } from "@/modules/family/transport/action-state";
import { FamilyManagementWorkspace } from "./family-management-workspace";

const overview: FamilyManagementOverview = {
  patient: { invitations: [], relationships: [], nextInvitationsCursor: null, nextRelationshipsCursor: null },
  caregiver: { invitations: [], relationships: [], nextInvitationsCursor: null, nextRelationshipsCursor: null },
};
const token = "a".repeat(43);
const link = `https://canonical.example/app/family/invitations#${token}`;
let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});

async function render(): Promise<void> {
  await act(async () => root.render(<FamilyManagementWorkspace overview={overview} />));
  await act(async () => { await Promise.resolve(); });
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

describe("Family issuance-only QR and copy transport", () => {
  beforeEach(() => {
    harness.creation = { status: "SUCCESS", invitationUrl: link, expiresAt: "2026-10-02T00:00:00Z" };
    harness.png.mockReset().mockRejectedValue(new Error("No canvas"));
    harness.writeText.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { clipboard: { writeText: harness.writeText } }));
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => { throw new Error("No secret storage"); }), setItem: vi.fn(() => { throw new Error("No secret storage"); }) });
    vi.stubGlobal("sessionStorage", { getItem: vi.fn(() => { throw new Error("No secret storage"); }), setItem: vi.fn(() => { throw new Error("No secret storage"); }) });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it("hands the issued link over in the shared dialog with its expiry, QR and copy action", async () => {
    await render();

    const dialog = container.querySelector("dialog[open]");
    expect(dialog?.querySelector("h2")?.textContent).toBe("สร้างคำเชิญแล้ว");
    expect(dialog?.querySelector<HTMLInputElement>("input[readonly]")?.value).toBe(link);
    expect(dialog?.textContent).toContain("ลิงก์หมดอายุ");
    expect(dialog?.textContent).toContain("บันทึกรูป QR Code");
    expect(container.textContent).toContain("ผู้รับต้องเข้าสู่ระบบด้วยเลขบัตรประชาชนนี้จึงตอบรับได้");
    await vi.waitFor(async () => {
      await act(async () => { await Promise.resolve(); });
      expect(dialog?.querySelector('img[alt="QR Code คำเชิญผู้ดูแล DEMI"]')).not.toBeNull();
    });
    expect(harness.png).toHaveBeenCalledWith(link, { size: 720 });

    await act(async () => button("คัดลอกลิงก์").click());
    expect(harness.writeText).toHaveBeenCalledWith(link);
    expect(dialog?.textContent).toContain("คัดลอกลิงก์แล้ว");
  });

  it("never renders the link on the server or without an issuance SUCCESS", async () => {
    expect(renderToStaticMarkup(<FamilyManagementWorkspace overview={overview} />)).not.toContain(token);
    harness.creation = { status: "IDLE" };
    await render();
    expect(container.innerHTML).not.toContain(token);
    expect(harness.png).not.toHaveBeenCalled();
  });

  it("uses the new issuance URL instead of retaining the previous secret", async () => {
    await render();
    const replacementLink = `https://canonical.example/app/family/invitations#${"b".repeat(43)}`;
    harness.creation = { status: "SUCCESS", invitationUrl: replacementLink, expiresAt: "2026-10-03T00:00:00Z" };
    await render();
    expect(container.querySelector<HTMLInputElement>("dialog[open] input[readonly]")?.value).toBe(replacementLink);
    expect(container.innerHTML).not.toContain(token);
  });
});
