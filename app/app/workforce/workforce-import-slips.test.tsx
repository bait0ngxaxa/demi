// @vitest-environment jsdom

import { MembershipStatus, MembershipType, Profession, UserStatus } from "@prisma/client";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ bulk: vi.fn(), push: vi.fn(), refresh: vi.fn(), confirm: vi.fn(() => false) }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn(), useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock("@/modules/workforce/transport/server-actions", () => ({ provisionWorkforceBulkAction: mocks.bulk }));

import type { WorkforceListRow } from "@/modules/workforce/services/workforce-service";
import { WorkforceImportWorkspace } from "./workforce-import-workspace";

const hospital = { id: "11111111-1111-4111-8111-111111111111", name: "โรงพยาบาลทดสอบ", hospitalCode: "H-001", scope: "OWNER" as const };
const rows: WorkforceListRow[] = [
  {
    id: "pending-relationship",
    userId: "pending-user",
    displayName: "บุคลากรรอลิงก์",
    kind: "HOSPITAL_MEMBER",
    membershipType: MembershipType.MEMBER,
    profession: Profession.NURSE,
    relationshipStatus: MembershipStatus.PROVISIONED,
    accountStatus: UserStatus.PROVISIONED,
    activationRequired: true,
    activationStatus: "PENDING",
    activationExpiresAt: new Date("2026-10-23T00:00:00.000Z"),
    activationMode: "REMOTE",
    selfRegisteredAt: null,
  },
  {
    id: "expired-relationship",
    userId: "expired-user",
    displayName: "บุคลากรลิงก์หมดอายุ",
    kind: "HOSPITAL_MEMBER",
    membershipType: MembershipType.MEMBER,
    profession: Profession.NURSE,
    relationshipStatus: MembershipStatus.PROVISIONED,
    accountStatus: UserStatus.PROVISIONED,
    activationRequired: true,
    activationStatus: "EXPIRED",
    activationExpiresAt: new Date("2026-10-20T00:00:00.000Z"),
    activationMode: "REMOTE",
    selfRegisteredAt: null,
  },
];

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  mocks.bulk.mockReset().mockResolvedValue({ status: "IDLE" });
  mocks.push.mockReset();
  mocks.refresh.mockReset();
  mocks.confirm.mockReset().mockReturnValue(false);
  vi.stubGlobal("confirm", mocks.confirm);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function render(): Promise<void> {
  await act(async () => {
    root.render(createElement(WorkforceImportWorkspace, {
      hospitals: [hospital],
      selectedHospitalId: hospital.id,
      hospitalName: hospital.name,
      serverTime: 1791849600000,
      rows,
      pageInfo: {
        pageSize: 25,
        serverTime: 1791849600000,
        search: "",
        status: null,
        selfRegistration: "ALL",
        staffCursor: null,
        osmCursor: null,
        staffNextCursor: null,
        osmNextCursor: null,
      },
    }));
    await Promise.resolve();
  });
}

function slipForm(): HTMLFormElement {
  const form = container.querySelector<HTMLFormElement>('#slip-form-HOSPITAL_MEMBER');
  if (!form) throw new Error("Missing slip printing form");
  return form;
}

function selectRow(userId: string): void {
  const input = container.querySelector<HTMLInputElement>(`input[name="userId"][value="${userId}"]`);
  if (!input) throw new Error(`Missing checkbox for ${userId}`);
  act(() => input.click());
}

function submitSlipForm(): SubmitEvent {
  const form = slipForm();
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!submit) throw new Error("Missing print submit button");
  const event = new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: submit });
  form.dispatchEvent(event);
  return event;
}

describe("workforce slip cancellation confirmation", () => {
  it("shows the selected usable-link cancellation count and requires confirmation before printing", async () => {
    await render();
    selectRow("pending-user");
    selectRow("expired-user");

    expect(container.textContent).toContain("มีลิงก์ที่ยังใช้ได้ 1 คน");
    expect(slipForm().getAttribute("action")).toBe("/app/workforce/slips");
    expect(slipForm().getAttribute("target")).toBe("_blank");

    const denied = submitSlipForm();
    expect(mocks.confirm).toHaveBeenCalledWith(expect.stringContaining("มี 1 คนที่ยังมีลิงก์ใช้ได้"));
    expect(denied.defaultPrevented).toBe(true);

    mocks.confirm.mockReturnValue(true);
    const accepted = submitSlipForm();
    expect(accepted.defaultPrevented).toBe(false);
  });

  it("does not ask for cancellation confirmation when selection has no usable link", async () => {
    await render();
    selectRow("expired-user");

    expect(container.textContent).not.toContain("มีลิงก์ที่ยังใช้ได้");
    submitSlipForm();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});
