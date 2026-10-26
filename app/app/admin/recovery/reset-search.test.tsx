// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
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

describe("Platform ADMIN recovery search", () => {
  it("shows one Hospital-free Platform ADMIN target and passes its null scope to issuance", async () => {
    mocks.search.mockResolvedValue({ status: "MATCH", candidates: [customAdminCandidate] });
    await renderSearch();

    expect(container.textContent).toContain("ตัวระบุเข้าสู่ระบบ ADMIN ที่ลงทะเบียนไว้");
    await submit("demi-admin.custom-01");
    expect(mocks.search).toHaveBeenCalledWith("demi-admin.custom-01");

    const select = container.querySelector<HTMLSelectElement>("select");
    if (!select) throw new Error("Missing account selection");
    expect(select.options[1]?.textContent).toContain("บัญชี ADMIN");
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
