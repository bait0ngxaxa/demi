// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  searchHospitals: vi.fn(),
  controlProps: null as {
    eligibility: string;
    hospitalId: string | null;
    hospitalName: string | null;
    relationshipId: string | null;
    targetUserId?: string;
    targetKind: string;
    targetName: string;
  } | null,
}));

vi.mock("@/modules/account-security/transport/server-actions", () => ({
  searchMediatedPasswordResetTargetsAction: mocks.search,
  searchMediatedPasswordResetHospitalsAction: mocks.searchHospitals,
}));
vi.mock("../../users/mediated-password-reset-control", () => ({
  MediatedPasswordResetControl: (props: {
    eligibility: string;
    hospitalId: string | null;
    hospitalName: string | null;
    relationshipId: string | null;
    targetUserId?: string;
    targetKind: string;
    targetName: string;
  }) => {
    mocks.controlProps = props;
    return null;
  },
}));

import { AdminMediatedPasswordResetSearch } from "./reset-search";

let container: HTMLDivElement;
let root: Root;

const customAdminCandidate = {
  userId: "11111111-1111-4111-8111-111111111111",
  displayName: "ผู้ดูแลระบบ",
  targetKind: "platform_admin" as const,
  hospitalId: null,
  hospitalName: null,
  relationshipId: null,
  relationshipStatus: "PLATFORM_ADMIN" as const,
};

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.controlProps = null;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderSearch(): Promise<void> {
  await act(async () => root.render(createElement(AdminMediatedPasswordResetSearch)));
}

async function submit(identifier: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>('input[name="nationalId"]');
  const form = container.querySelector("form");
  if (!input || !form) throw new Error("Missing recovery search form");
  input.value = identifier;
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

async function selectCandidate(index: number): Promise<void> {
  const select = container.querySelector<HTMLSelectElement>("select");
  if (!select) throw new Error("Missing account selection");
  await act(async () => {
    select.value = String(index);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("Platform ADMIN recovery search", () => {
  it("offers one caregiver target and lets the ADMIN choose the Hospital from a bounded search before issuing", async () => {
    vi.useFakeTimers();
    try {
      mocks.search.mockResolvedValue({ status: "MATCH", candidates: [{
        userId: "22222222-2222-4222-8222-222222222222", displayName: "ญาติ ก", targetKind: "caregiver",
        hospitalId: null, hospitalName: null, relationshipId: null, relationshipStatus: "CAREGIVER",
      }] });
      mocks.searchHospitals.mockResolvedValue({
        status: "OK", page: 1, totalPages: 1, hasPreviousPage: false, hasNextPage: false,
        items: [{ id: "33333333-3333-4333-8333-333333333333", hospitalCode: "H-1", name: "โรงพยาบาลหนึ่ง" }],
      });
      await renderSearch();
      await submit("1101700203451");
      const select = container.querySelector<HTMLSelectElement>("select")!;
      expect(select.options).toHaveLength(2);
      expect(select.options[1]?.textContent).toBe("ญาติ ก · ญาติหรือผู้ดูแล");
      await selectCandidate(0);

      // No Hospital yet: no reset control, and nothing is asked until the ADMIN types.
      expect(mocks.controlProps).toBeNull();
      expect(container.textContent).toContain("เลือกโรงพยาบาลก่อนออกลิงก์รีเซ็ต");
      expect(mocks.searchHospitals).not.toHaveBeenCalled();

      const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
      await act(async () => {
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        setValue.call(input, "หนึ่ง");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => { await vi.advanceTimersByTimeAsync(400); });
      expect(mocks.searchHospitals).toHaveBeenCalledWith("หนึ่ง");

      const radio = container.querySelector<HTMLInputElement>('input[name="caregiver-reset-hospital"]')!;
      await act(async () => radio.click());
      expect(mocks.controlProps).toMatchObject({
        eligibility: "ADMIN_ALLOWED",
        targetKind: "caregiver",
        targetUserId: "22222222-2222-4222-8222-222222222222",
        hospitalId: "33333333-3333-4333-8333-333333333333",
        hospitalName: "โรงพยาบาลหนึ่ง",
        relationshipId: null,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows one Hospital-free Platform ADMIN target and passes its null scope to issuance", async () => {
    mocks.search.mockResolvedValue({ status: "MATCH", candidates: [customAdminCandidate] });
    await renderSearch();

    expect(container.textContent).toContain("รหัสเข้าสู่ระบบของผู้ดูแลระบบ DEMI ที่ลงทะเบียนไว้");
    await submit("demi-admin.custom-01");
    expect(mocks.search).toHaveBeenCalledWith("demi-admin.custom-01");

    const select = container.querySelector<HTMLSelectElement>("select");
    if (!select) throw new Error("Missing account selection");
    expect(select.options[1]?.textContent).toContain("ผู้ดูแลระบบ DEMI");
    expect(select.options[1]?.textContent).not.toContain("โรงพยาบาล");
    await act(async () => {
      select.value = "0";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(mocks.controlProps).toMatchObject({
      targetKind: "platform_admin",
      targetUserId: customAdminCandidate.userId,
      hospitalId: null,
      hospitalName: null,
      relationshipId: null,
    });
    expect(container.textContent).not.toContain("โรงพยาบาล");
  });

});
