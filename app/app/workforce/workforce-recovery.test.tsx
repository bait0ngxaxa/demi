// @vitest-environment jsdom

import { MembershipStatus, MembershipType, Profession, UserStatus } from "@prisma/client";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const harness = vi.hoisted(() => ({
  mutationStates: [] as Array<readonly [unknown, (formData: FormData) => void, boolean, boolean, () => void]>,
  mutationIndex: 0,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/ui/mutation-action-state", () => ({
  useMutationActionState: () => {
    const current = harness.mutationStates[harness.mutationIndex++] ?? harness.mutationStates[0];
    if (!current) throw new Error("Missing mutation state");
    return current;
  },
  submitPreservingInput: () => () => undefined,
}));
vi.mock("@/modules/workforce/transport/server-actions", () => ({
  provisionHospitalMemberAction: vi.fn(),
  provisionOsmAction: vi.fn(),
  provisionWorkforceBulkAction: vi.fn(),
  regenerateWorkforceActivationAction: vi.fn(),
  startAssistedWorkforceActivationAction: vi.fn(),
}));

import type { WorkforceListRow } from "@/modules/workforce/services/workforce-service";
import { WorkforceWorkspace } from "./workforce-workspace";

const hospital = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "โรงพยาบาลทดสอบ",
  hospitalCode: "H-001",
  scope: "OWNER" as const,
};
const pendingRow: WorkforceListRow = {
  id: "22222222-2222-4222-8222-222222222222",
  userId: "33333333-3333-4333-8333-333333333333",
  displayName: "บุคลากรรอเปิดใช้งาน",
  kind: "HOSPITAL_MEMBER",
  membershipType: MembershipType.MEMBER,
  profession: Profession.NURSE,
  relationshipStatus: MembershipStatus.PROVISIONED,
  accountStatus: UserStatus.PROVISIONED,
  activationRequired: true,
  activationStatus: "PENDING",
  activationExpiresAt: new Date("2026-10-17T00:00:00.000Z"),
  activationMode: "REMOTE",
};

let container: HTMLDivElement;
let root: Root;
let dispatches: Mock<(formData: FormData) => void>[];

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  harness.mutationIndex = 0;
  dispatches = Array.from({ length: 5 }, () => vi.fn<(formData: FormData) => void>());
  harness.mutationStates = dispatches.map((dispatch) => [
    { status: "IDLE" },
    dispatch,
    false,
    false,
    vi.fn(),
  ] as const);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function render(): void {
  act(() => root.render(createElement(WorkforceWorkspace, {
    hospitals: [hospital],
    selectedHospitalId: hospital.id,
    workforce: {
      hospital,
      viewerScope: "OWNER",
      rows: [pendingRow],
      pageInfo: {
        pageSize: 25,
        serverTime: 1791849600000,
        search: "",
        status: null,
        staffCursor: null,
        osmCursor: null,
        staffNextCursor: null,
        osmNextCursor: null,
      },
    },
  })));
}

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent?.trim() === text,
  );
  if (!button) throw new Error(`Missing button: ${text}`);
  return button;
}

describe("Workforce one-time activation recovery", () => {
  it("does not replay staff provisioning or activation regeneration after an unknown outcome", async () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    harness.mutationStates[0] = [
      { status: "IDLE" }, dispatches[0]!, false, true, vi.fn(),
    ];
    harness.mutationStates[2] = [
      { status: "IDLE" }, dispatches[2]!, false, true, vi.fn(),
    ];
    render();

    expect(container.textContent).toContain("บัญชีและความสัมพันธ์อาจถูกสร้างแล้ว");
    expect(container.textContent).toContain("ลิงก์เปิดใช้งานเดิมเรียกคืนไม่ได้");
    expect(container.textContent).toContain("ระบบอาจออกลิงก์ใหม่แล้ว");
    expect(container.textContent).not.toContain("ตรวจสอบผลด้วยคำขอเดิม");
    dispatches.forEach((dispatch) => expect(dispatch).not.toHaveBeenCalled());

    await act(async () => buttonByText("ตรวจสอบรายชื่อบุคลากร").click());
    expect(reload).toHaveBeenCalledOnce();
    dispatches.forEach((dispatch) => expect(dispatch).not.toHaveBeenCalled());
  });

  it("keeps link replacement as a distinct explicit action with revocation guidance", async () => {
    render();

    expect(container.textContent).toContain("การออกลิงก์ใหม่หรือเริ่มแบบช่วยเหลือจะยกเลิกลิงก์เดิม");
    await act(async () => buttonByText("ออกลิงก์ใหม่").click());
    expect(dispatches[2]).toHaveBeenCalledOnce();
  });

  it("does not offer replay for assisted activation after a lost handoff response", () => {
    harness.mutationStates[3] = [
      { status: "IDLE" }, dispatches[3]!, false, true, vi.fn(),
    ];
    render();

    const alert = container.querySelectorAll('[role="alert"]')[0];
    expect(alert?.textContent).toContain("ระบบยังยืนยันผลการเปิดใช้งานแบบช่วยเหลือไม่ได้");
    expect(alert?.textContent).toContain("หากถูกออกจากระบบ");
    expect(alert?.querySelector("button")).toBeNull();
    expect(container.textContent).not.toContain("ตรวจสอบผลด้วยคำขอเดิม");
    expect(dispatches[3]).not.toHaveBeenCalled();
  });
});
