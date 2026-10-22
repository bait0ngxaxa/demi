// @vitest-environment jsdom

import { CaregiverInvitationStatus } from "@prisma/client";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createInvitation: vi.fn<(_previous: unknown, formData: FormData) => Promise<unknown>>(),
  revokeInvitation: vi.fn<(_previous: unknown, formData: FormData) => Promise<unknown>>(),
  revokeRelationship: vi.fn<(_previous: unknown, formData: FormData) => Promise<unknown>>(),
  withdrawRelationship: vi.fn<(_previous: unknown, formData: FormData) => Promise<unknown>>(),
  reissueInvitation: vi.fn<(_previous: unknown, formData: FormData) => Promise<unknown>>(),
}));

vi.mock("@/modules/family/transport/server-actions", () => ({
  createCaregiverInvitationAction: mocks.createInvitation,
  revokePendingCaregiverInvitationAction: mocks.revokeInvitation,
  revokeCaregiverRelationshipAction: mocks.revokeRelationship,
  withdrawOwnCaregiverRelationshipAction: mocks.withdrawRelationship,
  reissueCaregiverInvitationLinkAction: mocks.reissueInvitation,
}));

import type { FamilyManagementOverview } from "@/modules/family/services/caregiver-relationship-query-service";
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
});

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

describe("Caregiver invitation lost-response recovery", () => {
  it("does not repeat CREATE after a committed invitation response is lost", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    act(() => root.render(createElement(FamilyManagementWorkspace, { overview: emptyOverview })));

    container.querySelector<HTMLInputElement>('input[name="nationalId"]')!.value = "1000000000009";
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
            participant: { givenName: "ผู้ดูแล", familyName: "ทดสอบ" },
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
            participant: { givenName: "ผู้ดูแล", familyName: "ทดสอบ" },
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

    expect(mocks.reissueInvitation).toHaveBeenCalledOnce();
    expect(mocks.reissueInvitation.mock.calls[0]?.[1].get("invitationId")).toBe("invitation-1");
    const link = Array.from(container.querySelectorAll<HTMLInputElement>("input[readonly]")).map((input) => input.value);
    expect(link).toEqual([`https://canonical.example/app/family/invitations#${"b".repeat(43)}`]);
    expect(container.textContent).toContain("คิวอาร์โค้ดคำเชิญ");
    expect(container.textContent).toContain("ลิงก์ก่อนหน้าของคำเชิญนี้ใช้ไม่ได้แล้ว");
    expect(buttonByText("สร้างคิวอาร์โค้ดใหม่")).toBeDefined();
  });

  it.each([CaregiverInvitationStatus.ACCEPTED, CaregiverInvitationStatus.EXPIRED, CaregiverInvitationStatus.REVOKED])(
    "offers no QR for a %s invitation",
    (status) => {
      const overview: FamilyManagementOverview = {
        ...emptyOverview,
        patient: {
          invitations: [{
            invitationId: "invitation-1",
            participant: { givenName: "ผู้ดูแล", familyName: "ทดสอบ" },
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
