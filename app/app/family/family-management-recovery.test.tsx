// @vitest-environment jsdom

import { CaregiverInvitationStatus } from "@prisma/client";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createInvitation: vi.fn<(_previous: unknown, formData: FormData) => Promise<unknown>>(),
  revokeInvitation: vi.fn<(_previous: unknown, formData: FormData) => Promise<unknown>>(),
  revokeRelationship: vi.fn<(_previous: unknown, formData: FormData) => Promise<unknown>>(),
  withdrawRelationship: vi.fn<(_previous: unknown, formData: FormData) => Promise<unknown>>(),
  reissueInvitation: vi.fn<(_previous: unknown, formData: FormData) => Promise<unknown>>(),
  updateRelationshipLabel: vi.fn<(_previous: unknown, formData: FormData) => Promise<unknown>>(),
}));

vi.mock("@/modules/family/transport/server-actions", () => ({
  createCaregiverInvitationAction: mocks.createInvitation,
  revokePendingCaregiverInvitationAction: mocks.revokeInvitation,
  revokeCaregiverRelationshipAction: mocks.revokeRelationship,
  withdrawOwnCaregiverRelationshipAction: mocks.withdrawRelationship,
  reissueCaregiverInvitationLinkAction: mocks.reissueInvitation,
  updateCaregiverRelationshipLabelAction: mocks.updateRelationshipLabel,
}));

import type { FamilyManagementOverview } from "@/modules/family/services/caregiver-relationship-query-service";
import { installDialogSupport, restoreDialogSupport, settle, submitForm } from "../workforce/[kind]/[relationshipId]/controls-test-support";
import { FamilyManagementWorkspace } from "./family-management-workspace";

const emptyOverview: FamilyManagementOverview = {
  patient: { invitations: [], relationships: [], nextInvitationsCursor: null, nextRelationshipsCursor: null },
  caregiver: { invitations: [], relationships: [], nextInvitationsCursor: null, nextRelationshipsCursor: null },
};

let container: HTMLDivElement;
let root: Root;
let committedInvitations: Map<string, { invitationId: string; tokenHash: string }>;
const generatedToken = "plaintext-caregiver-token-that-is-lost";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installDialogSupport();
});

afterAll(() => restoreDialogSupport());

beforeEach(() => {
  committedInvitations = new Map();
  mocks.createInvitation.mockReset().mockImplementation(async (_previous, formData) => {
    const nationalId = String(formData.get("nationalId"));
    if (committedInvitations.has(nationalId)) {
      return {
        status: "ERROR",
        message: "ไม่สามารถสร้างคำเชิญได้ กรุณาตรวจสอบรายการคำเชิญที่รอตอบรับ",
      };
    }

    committedInvitations.set(nationalId, {
      invitationId: "invitation-1",
      tokenHash: "one-way-token-hash",
    });
    throw new TypeError(`Failed to fetch after committing ${generatedToken}`);
  });
  mocks.revokeInvitation.mockReset().mockResolvedValue({ status: "SUCCESS", message: "ยกเลิกคำเชิญแล้ว" });
  mocks.revokeRelationship.mockReset().mockResolvedValue({ status: "SUCCESS", message: "ยุติความสัมพันธ์ผู้ดูแลแล้ว" });
  mocks.withdrawRelationship.mockReset().mockResolvedValue({ status: "SUCCESS", message: "หยุดการเป็นผู้ดูแลแล้ว" });
  mocks.reissueInvitation.mockReset().mockResolvedValue({ status: "SUCCESS", invitationUrl: `https://canonical.example/app/family/invitations#${"b".repeat(43)}`, expiresAt: "2026-10-17T00:00:00.000Z" });
  mocks.updateRelationshipLabel.mockReset().mockResolvedValue({ status: "SUCCESS", message: "บันทึกความสัมพันธ์แล้ว" });

  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent?.trim() === text,
  );
  if (!button) throw new Error(`Missing button: ${text}`);
  return button;
}

function dialogButtonByText(text: string): HTMLButtonElement {
  const dialog = container.querySelector<HTMLDialogElement>("dialog[open]");
  const button = Array.from(dialog?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(
    (item) => item.textContent?.trim() === text,
  );
  if (!button) throw new Error(`Missing dialog button: ${text}`);
  return button;
}

describe("Caregiver invitation lost-response recovery", () => {
  it("does not repeat CREATE after a committed invitation response is lost", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    act(() => root.render(createElement(FamilyManagementWorkspace, { overview: emptyOverview })));

    container.querySelector<HTMLInputElement>('input[name="nationalId"]')!.value = "1000000000009";
    const label = container.querySelector<HTMLSelectElement>('select[name="relationshipLabel"]')!;
    await act(async () => {
      label.value = "CHILD";
      label.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => buttonByText("สร้างลิงก์คำเชิญ").click());

    expect(committedInvitations.size).toBe(1);
    expect(committedInvitations.get("1000000000009")).toEqual({
      invitationId: "invitation-1",
      tokenHash: "one-way-token-hash",
    });
    expect(mocks.createInvitation).toHaveBeenCalledOnce();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("ระบบอาจสร้างคำเชิญแล้ว");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("ลิงก์เดิมแสดงซ้ำไม่ได้");
    expect(container.innerHTML).not.toContain(generatedToken);

    await act(async () => buttonByText("ตรวจสอบคำเชิญล่าสุด").click());

    expect(reload).toHaveBeenCalledOnce();
    expect(mocks.createInvitation).toHaveBeenCalledOnce();
    expect(committedInvitations.size).toBe(1);
  });

  it("shows a pending invitation in the existing management list with its authorized revoke action", () => {
    const overview: FamilyManagementOverview = {
      ...emptyOverview,
      patient: {
        invitations: [
          {
            invitationId: "invitation-1",
            participant: { givenName: "ผู้ดูแล", familyName: "ทดสอบ", nameIsSelfAsserted: false },
            status: CaregiverInvitationStatus.PENDING,
            issuedAt: new Date("2026-10-16T00:00:00.000Z"),
            expiresAt: new Date("2026-10-17T00:00:00.000Z"),
          },
        ],
        relationships: [],
        nextInvitationsCursor: null,
        nextRelationshipsCursor: null,
      },
    };

    act(() => root.render(createElement(FamilyManagementWorkspace, { overview })));

    expect(container.textContent).toContain("คำเชิญที่คุณสร้าง");
    expect(container.textContent).toContain("ผู้ดูแล ทดสอบ");
    expect(container.querySelector('input[name="invitationId"]')?.getAttribute("value")).toBe("invitation-1");
    expect(buttonByText("ยกเลิกคำเชิญ")).toBeDefined();
    expect(buttonByText("แสดงคิวอาร์โค้ด")).toBeDefined();
  });

  it("shows a pending invitation as a QR of its reissued acceptance link and expiry (E2)", async () => {
    const overview: FamilyManagementOverview = {
      ...emptyOverview,
      patient: {
        invitations: [
          {
            invitationId: "invitation-1",
            participant: { givenName: "ผู้ดูแล", familyName: "ทดสอบ", nameIsSelfAsserted: false },
            status: CaregiverInvitationStatus.PENDING,
            issuedAt: new Date("2026-10-16T00:00:00.000Z"),
            expiresAt: new Date("2026-10-17T00:00:00.000Z"),
          },
        ],
        relationships: [],
        nextInvitationsCursor: null,
        nextRelationshipsCursor: null,
      },
    };

    act(() => root.render(createElement(FamilyManagementWorkspace, { overview })));
    expect(container.textContent).toContain("ลิงก์หรือ QR ที่เคยส่งไปจะใช้ไม่ได้อีก");
    await act(async () => buttonByText("แสดงคิวอาร์โค้ด").click());

    expect(mocks.reissueInvitation).not.toHaveBeenCalled();
    expect(container.querySelector("dialog[open]")?.textContent).toContain("ลิงก์และ QR เดิมจะใช้ไม่ได้ทันที");
    await act(async () => dialogButtonByText("สร้างลิงก์ใหม่").click());

    expect(mocks.reissueInvitation).toHaveBeenCalledOnce();
    expect(mocks.reissueInvitation.mock.calls[0]?.[1].get("invitationId")).toBe("invitation-1");
    const link = Array.from(container.querySelectorAll<HTMLInputElement>("input[readonly]")).map((input) => input.value);
    expect(link).toEqual([`https://canonical.example/app/family/invitations#${"b".repeat(43)}`]);
    expect(container.textContent).toContain("คิวอาร์โค้ดคำเชิญ");
    expect(container.textContent).toContain("ลิงก์ก่อนหน้าของคำเชิญนี้ใช้ไม่ได้แล้ว");
    expect(buttonByText("สร้างคิวอาร์โค้ดใหม่")).toBeDefined();
    expect(container.querySelector("dialog[open]")).toBeNull();
    expect(container.querySelector<HTMLInputElement>('input[readonly]')?.value).toContain("#" + "b".repeat(43));
  });

  it("requires confirmation to revoke the exact pending invitation and leaves cancel mutation-free", async () => {
    const overview: FamilyManagementOverview = {
      ...emptyOverview,
      patient: {
        invitations: [{
          invitationId: "invitation-selected",
          participant: { givenName: "ผู้ดูแล", familyName: "ทดสอบ", nameIsSelfAsserted: false },
          status: CaregiverInvitationStatus.PENDING,
          issuedAt: new Date("2026-10-16T00:00:00.000Z"),
          expiresAt: new Date("2026-10-17T00:00:00.000Z"),
        }],
        relationships: [],
        nextInvitationsCursor: null,
        nextRelationshipsCursor: null,
      },
    };
    act(() => root.render(createElement(FamilyManagementWorkspace, { overview })));
    const trigger = buttonByText("ยกเลิกคำเชิญ");

    await act(async () => trigger.click());
    expect(mocks.revokeInvitation).not.toHaveBeenCalled();
    expect(container.querySelector("dialog[open]")?.textContent).toContain("ผู้ดูแล ทดสอบ");
    expect(container.querySelector("dialog[open]")?.textContent).toContain("ประวัติคำเชิญยังคงอยู่");
    await act(async () => dialogButtonByText("ยกเลิก").click());
    expect(mocks.revokeInvitation).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);

    await act(async () => trigger.click());
    await act(async () => dialogButtonByText("ยกเลิกคำเชิญ").click());
    await settle();

    expect(mocks.revokeInvitation).toHaveBeenCalledOnce();
    expect(mocks.revokeInvitation.mock.calls[0]?.[1].get("invitationId")).toBe("invitation-selected");
    expect(container.querySelector("dialog[open]")).toBeNull();
    expect(container.querySelector('button[aria-label^="ยกเลิกคำเชิญ:"]')).toBeNull();
  });

  it("keeps an uncertain invitation revocation locked until the user reloads", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    const overview: FamilyManagementOverview = {
      ...emptyOverview,
      patient: {
        invitations: [{
          invitationId: "invitation-uncertain",
          participant: { givenName: "ผู้ดูแล", familyName: "ทดสอบ", nameIsSelfAsserted: false },
          status: CaregiverInvitationStatus.PENDING,
          issuedAt: new Date("2026-10-16T00:00:00.000Z"),
          expiresAt: new Date("2026-10-17T00:00:00.000Z"),
        }],
        relationships: [],
        nextInvitationsCursor: null,
        nextRelationshipsCursor: null,
      },
    };
    mocks.revokeInvitation.mockReset().mockRejectedValue(new TypeError("network response was lost"));
    act(() => root.render(createElement(FamilyManagementWorkspace, { overview })));
    await act(async () => buttonByText("ยกเลิกคำเชิญ").click());
    await act(async () => dialogButtonByText("ยกเลิกคำเชิญ").click());
    await settle();

    expect(mocks.revokeInvitation).toHaveBeenCalledOnce();
    const confirm = dialogButtonByText("ยกเลิกคำเชิญ");
    expect(confirm.disabled).toBe(true);
    expect(container.querySelector("dialog[open]")?.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    await act(async () => confirm.click());
    expect(mocks.revokeInvitation).toHaveBeenCalledOnce();
    await act(async () => dialogButtonByText("ปิดหน้าต่าง").click());
    expect(container.querySelector("dialog[open]")).toBeNull();
    await act(async () => buttonByText("โหลดข้อมูลล่าสุด").click());
    expect(reload).toHaveBeenCalledOnce();
    expect(mocks.revokeInvitation).toHaveBeenCalledOnce();
  });

  it("separates patient revocation from caregiver withdrawal and restores focus after the terminal action", async () => {
    const patientRelationship = {
      relationshipId: "patient-owned-relationship",
      participant: { givenName: "ผู้ดูแล", familyName: "ทดสอบ", nameIsSelfAsserted: false },
      status: "ACTIVE" as const,
      activatedAt: new Date("2026-10-16T00:00:00.000Z"),
      revokedAt: null,
      withdrawnAt: null,
      relationshipLabel: "CHILD" as const,
      relationshipLabelOther: null,
      relationshipLabelVersion: 1,
    };
    const caregiverRelationship = {
      ...patientRelationship,
      relationshipId: "caregiver-owned-relationship",
      participant: { givenName: "ผู้ป่วย", familyName: "ทดสอบ", nameIsSelfAsserted: false },
    };
    const overview: FamilyManagementOverview = {
      patient: { invitations: [], relationships: [patientRelationship], nextInvitationsCursor: null, nextRelationshipsCursor: null },
      caregiver: { invitations: [], relationships: [caregiverRelationship], nextInvitationsCursor: null, nextRelationshipsCursor: null },
    };
    act(() => root.render(createElement(FamilyManagementWorkspace, { overview })));

    const revoke = buttonByText("ยุติความสัมพันธ์ผู้ดูแล");
    await act(async () => revoke.click());
    expect(mocks.revokeRelationship).not.toHaveBeenCalled();
    expect(container.querySelector("dialog[open]")?.textContent).toContain("ผู้ดูแล ทดสอบ");
    expect(container.querySelector("dialog[open]")?.textContent).toContain("สิทธิ์ดูนัดหมายหรือข้อมูลสุขภาพ");
    await act(async () => dialogButtonByText("ยกเลิก").click());
    expect(mocks.revokeRelationship).not.toHaveBeenCalled();
    await act(async () => revoke.click());
    await act(async () => dialogButtonByText("ยุติความสัมพันธ์").click());
    await settle();
    expect(mocks.revokeRelationship.mock.calls[0]?.[1].get("relationshipId")).toBe("patient-owned-relationship");
    expect(container.querySelector('button[aria-label^="ยุติความสัมพันธ์ผู้ดูแล:"]')).toBeNull();
    expect(document.activeElement).toBe(container.querySelector("#patient-relationships-heading"));

    const withdraw = buttonByText("หยุดการเป็นผู้ดูแล");
    await act(async () => withdraw.click());
    expect(mocks.withdrawRelationship).not.toHaveBeenCalled();
    expect(container.querySelector("dialog[open]")?.textContent).toContain("ผู้ป่วยต้องส่งคำเชิญใหม่");
    await act(async () => dialogButtonByText("ยืนยันหยุดการเป็นผู้ดูแล").click());
    await settle();
    expect(mocks.withdrawRelationship).toHaveBeenCalledOnce();
    expect(mocks.withdrawRelationship.mock.calls[0]?.[1].get("relationshipId")).toBe("caregiver-owned-relationship");
    expect(container.querySelector("dialog[open]")).toBeNull();
    expect(document.activeElement).toBe(container.querySelector("#caregiver-relationships-heading"));
  });

  it("keeps the relationship label draft and submits its snapshotted version", async () => {
    const relationship = {
      relationshipId: "relationship-selected",
      participant: { givenName: "ผู้ดูแล", familyName: "ทดสอบ", nameIsSelfAsserted: false },
      status: "ACTIVE" as const,
      activatedAt: new Date("2026-10-16T00:00:00.000Z"),
      revokedAt: null,
      withdrawnAt: null,
      relationshipLabel: "CHILD" as const,
      relationshipLabelOther: null,
      relationshipLabelVersion: 7,
    };
    const overview: FamilyManagementOverview = {
      ...emptyOverview,
      patient: { invitations: [], relationships: [relationship], nextInvitationsCursor: null, nextRelationshipsCursor: null },
    };
    mocks.updateRelationshipLabel.mockReset()
      .mockResolvedValueOnce({ status: "ERROR", message: "บันทึกไม่ได้ กรุณาตรวจสอบข้อมูลล่าสุด" })
      .mockResolvedValueOnce({ status: "SUCCESS", message: "บันทึกความสัมพันธ์แล้ว" });
    act(() => root.render(createElement(FamilyManagementWorkspace, { overview })));
    const trigger = buttonByText("แก้ไขความสัมพันธ์");
    await act(async () => trigger.click());

    const label = container.querySelector<HTMLDialogElement>("dialog[open]")!.querySelector<HTMLSelectElement>('select[name="relationshipLabel"]')!;
    await act(async () => {
      label.value = "OTHER";
      label.dispatchEvent(new Event("change", { bubbles: true }));
    });
    let other = container.querySelector<HTMLDialogElement>("dialog[open]")!.querySelector<HTMLInputElement>('input[name="relationshipLabelOther"]')!;
    other.value = "ญาติ";
    other.dispatchEvent(new Event("input", { bubbles: true }));

    await act(async () => dialogButtonByText("ยกเลิก").click());
    expect(mocks.updateRelationshipLabel).not.toHaveBeenCalled();
    await act(async () => trigger.click());
    expect(container.querySelector<HTMLDialogElement>("dialog[open]")?.querySelector<HTMLSelectElement>('select[name="relationshipLabel"]')?.value).toBe("OTHER");
    other = container.querySelector<HTMLDialogElement>("dialog[open]")!.querySelector<HTMLInputElement>('input[name="relationshipLabelOther"]')!;
    expect(other.value).toBe("ญาติ");

    await act(async () => submitForm(container, "บันทึกความสัมพันธ์"));
    expect(mocks.updateRelationshipLabel.mock.calls[0]?.[1].get("relationshipId")).toBe("relationship-selected");
    expect(mocks.updateRelationshipLabel.mock.calls[0]?.[1].get("expectedVersion")).toBe("7");
    expect(mocks.updateRelationshipLabel.mock.calls[0]?.[1].get("relationshipLabel")).toBe("OTHER");
    expect(mocks.updateRelationshipLabel.mock.calls[0]?.[1].get("relationshipLabelOther")).toBe("ญาติ");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("ตรวจสอบข้อมูลล่าสุด");
    expect(container.querySelector<HTMLDialogElement>("dialog[open]")?.querySelector<HTMLInputElement>('input[name="relationshipLabelOther"]')?.value).toBe("ญาติ");

    other = container.querySelector<HTMLDialogElement>("dialog[open]")!.querySelector<HTMLInputElement>('input[name="relationshipLabelOther"]')!;
    other.value = "ผู้ดูแลใกล้ชิด";
    other.dispatchEvent(new Event("input", { bubbles: true }));
    await act(async () => submitForm(container, "บันทึกความสัมพันธ์"));
    expect(mocks.updateRelationshipLabel).toHaveBeenCalledTimes(2);
    expect(mocks.updateRelationshipLabel.mock.calls[1]?.[1].get("relationshipLabelOther")).toBe("ผู้ดูแลใกล้ชิด");
    expect(container.querySelector("dialog[open]")).toBeNull();
    expect(container.textContent).toContain("บันทึกความสัมพันธ์แล้ว");
    expect(document.activeElement).toBe(trigger);
  });

  it.each([CaregiverInvitationStatus.ACCEPTED, CaregiverInvitationStatus.EXPIRED, CaregiverInvitationStatus.REVOKED])(
    "offers no QR for a %s invitation",
    (status) => {
      const overview: FamilyManagementOverview = {
        ...emptyOverview,
        patient: {
          invitations: [{
            invitationId: "invitation-1",
            participant: { givenName: "ผู้ดูแล", familyName: "ทดสอบ", nameIsSelfAsserted: false },
            status,
            issuedAt: new Date("2026-10-16T00:00:00.000Z"),
            expiresAt: new Date("2026-10-17T00:00:00.000Z"),
          }],
          relationships: [],
          nextInvitationsCursor: null,
          nextRelationshipsCursor: null,
        },
      };

      act(() => root.render(createElement(FamilyManagementWorkspace, { overview })));
      expect(container.textContent).not.toContain("แสดงคิวอาร์โค้ด");
    },
  );
});
