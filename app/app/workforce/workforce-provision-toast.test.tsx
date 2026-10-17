// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  staffAction: vi.fn(),
  osmAction: vi.fn(),
  bulkAction: vi.fn(),
  remoteAction: vi.fn(),
  assistedAction: vi.fn(),
  routerPush: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn(),
  useRouter: () => ({ push: mocks.routerPush }),
}));
vi.mock("@/components/ui/notify", () => ({
  notify: {
    success: mocks.success,
    warning: mocks.warning,
    error: mocks.error,
    info: mocks.info,
  },
}));
vi.mock("@/modules/workforce/transport/server-actions", () => ({
  provisionHospitalMemberAction: mocks.staffAction,
  provisionOsmAction: mocks.osmAction,
  provisionWorkforceBulkAction: mocks.bulkAction,
  regenerateWorkforceActivationAction: mocks.remoteAction,
  startAssistedWorkforceActivationAction: mocks.assistedAction,
}));

import type { WorkforceListRow } from "@/modules/workforce/services/workforce-service";
import type {
  WorkforceProvisionActionState,
  WorkforceProvisionResultState,
} from "@/modules/workforce/transport/action-state";
import { WorkforceWorkspace } from "./workforce-workspace";

const hospitalA = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "โรงพยาบาล ก",
  hospitalCode: "H-001",
  scope: "OWNER" as const,
};
const hospitalB = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "โรงพยาบาล ข",
  hospitalCode: "H-002",
  scope: "OWNER" as const,
};
const rows: WorkforceListRow[] = [];

function resultFor(
  kind: "HOSPITAL_MEMBER" | "OSM",
  hospitalId = hospitalA.id,
): WorkforceProvisionActionState {
  const result: WorkforceProvisionResultState = {
    kind,
    userId: "private-user-id",
    hospitalId,
    relationshipId: "private-relationship-id",
    accountStatus: "PROVISIONED",
    relationshipStatus: "PROVISIONED",
    activationRequired: true,
    activationToken: "mock-one-time-activation-token",
    activationExpiresAt: "2026-10-18T12:00:00.000Z",
    activationMode: "REMOTE",
    reusedExistingUser: false,
    idempotent: false,
  };
  return { status: "SUCCESS", result };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void } {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (error: Error) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  mocks.staffAction.mockReset().mockResolvedValue(resultFor("HOSPITAL_MEMBER"));
  mocks.osmAction.mockReset().mockResolvedValue(resultFor("OSM"));
  mocks.bulkAction.mockReset().mockResolvedValue({ status: "IDLE" });
  mocks.remoteAction.mockReset().mockResolvedValue({ status: "IDLE" });
  mocks.assistedAction.mockReset().mockResolvedValue({ status: "IDLE" });
  mocks.routerPush.mockReset();
  mocks.success.mockReset();
  mocks.warning.mockReset();
  mocks.error.mockReset();
  mocks.info.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function renderWorkspace(selectedHospitalId = hospitalA.id): void {
  const hospital = [hospitalA, hospitalB].find((item) => item.id === selectedHospitalId);
  if (!hospital) throw new Error("Test Hospital is missing");
  act(() => {
    root.render(
      createElement(WorkforceWorkspace, {
        hospitals: [hospitalA, hospitalB],
        selectedHospitalId,
        workforce: {
          hospital,
          viewerScope: "OWNER",
          rows,
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
      }),
    );
  });
}

function provisionForm(kind: "HOSPITAL_MEMBER" | "OSM"): HTMLFormElement {
  const form = Array.from(container.querySelectorAll("form")).find((candidate) => {
    if (!candidate.querySelector('[name="givenName"]')) return false;
    return kind === "HOSPITAL_MEMBER"
      ? Boolean(candidate.querySelector('[name="profession"]'))
      : !candidate.querySelector('[name="profession"]');
  });
  if (!form) throw new Error(`Missing ${kind} provisioning form`);
  return form;
}

function setField(form: HTMLFormElement, name: string, value: string): void {
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement)) {
    throw new Error(`Missing form field ${name}`);
  }
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.dispatchEvent(new Event("change", { bubbles: true }));
}

function fillForm(form: HTMLFormElement, kind: "HOSPITAL_MEMBER" | "OSM"): void {
  setField(form, "givenName", kind === "HOSPITAL_MEMBER" ? "ชื่อบุคลากร" : "ชื่ออสม.");
  setField(form, "familyName", "นามสกุลทดสอบ");
  setField(form, "nationalId", "1234567890123");
  if (kind === "HOSPITAL_MEMBER") setField(form, "profession", "NURSE");
}

function submit(form: HTMLFormElement): void {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!button) throw new Error("Missing submit button");
  form.dispatchEvent(
    new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: button }),
  );
}

function toastCalls(): unknown[][] {
  return [...mocks.success.mock.calls, ...mocks.warning.mock.calls, ...mocks.error.mock.calls];
}

describe("Workforce single-record provisioning Toasts", () => {
  it("shows the staff success Toast only after the result and keeps the activation credential in ProvisionResult", async () => {
    const action = deferred<WorkforceProvisionActionState>();
    mocks.staffAction.mockReturnValueOnce(action.promise);
    renderWorkspace();
    const form = provisionForm("HOSPITAL_MEMBER");
    fillForm(form, "HOSPITAL_MEMBER");

    await act(async () => {
      submit(form);
      await Promise.resolve();
    });
    expect(mocks.staffAction).toHaveBeenCalledOnce();
    expect(mocks.success).not.toHaveBeenCalled();

    await act(async () => {
      action.resolve(resultFor("HOSPITAL_MEMBER"));
      await action.promise;
    });

    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("บันทึกข้อมูลบุคลากรโรงพยาบาลแล้ว");
    expect(container.textContent).toContain("สร้างบุคลากรแล้ว · รอเปิดใช้งาน");
    expect(container.textContent).toContain("mock-one-time-activation-token");
    expect(JSON.stringify(toastCalls())).not.toContain("mock-one-time-activation-token");
    expect(JSON.stringify(toastCalls())).not.toContain("private-user-id");
    expect(JSON.stringify(toastCalls())).not.toContain("private-relationship-id");
    expect(JSON.stringify(toastCalls())).not.toContain("1234567890123");
    expect(JSON.stringify(toastCalls())).not.toContain("ชื่อบุคลากร");
    expect(JSON.stringify(toastCalls())).not.toContain("/activate/workforce");
  });

  it("shows the OSM success Toast and preserves the relationship result without inventing patient assignment", async () => {
    renderWorkspace();
    const form = provisionForm("OSM");
    fillForm(form, "OSM");

    await act(async () => {
      submit(form);
    });

    expect(mocks.osmAction).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("บันทึกข้อมูล อสม. แล้ว");
    expect(container.textContent).toContain("สร้างบุคลากรแล้ว · รอเปิดใช้งาน");
    expect(container.textContent).toContain("ยังไม่มีการกำหนดพื้นที่หรือผู้ป่วย");
    expect(JSON.stringify(toastCalls())).not.toContain("mock-one-time-activation-token");
  });

  it("does not replay a successful Toast after rerender", async () => {
    renderWorkspace();
    const form = provisionForm("HOSPITAL_MEMBER");
    fillForm(form, "HOSPITAL_MEMBER");
    await act(async () => submit(form));
    expect(mocks.success).toHaveBeenCalledOnce();

    renderWorkspace();
    expect(mocks.success).toHaveBeenCalledOnce();
    expect(mocks.staffAction).toHaveBeenCalledOnce();
  });

  it("resets an unchanged form after confirmed success", async () => {
    renderWorkspace();
    const form = provisionForm("HOSPITAL_MEMBER");
    fillForm(form, "HOSPITAL_MEMBER");
    await act(async () => submit(form));

    expect((form.elements.namedItem("givenName") as HTMLInputElement).value).toBe("");
    expect((form.elements.namedItem("nationalId") as HTMLInputElement).value).toBe("");
    expect(container.textContent).toContain("สร้างบุคลากรแล้ว · รอเปิดใช้งาน");
  });

  it("keeps an earlier Staff activation result while a later OSM submission completes", async () => {
    renderWorkspace();
    const staffForm = provisionForm("HOSPITAL_MEMBER");
    fillForm(staffForm, "HOSPITAL_MEMBER");
    await act(async () => submit(staffForm));
    expect(mocks.success).toHaveBeenCalledOnce();

    const osmForm = provisionForm("OSM");
    fillForm(osmForm, "OSM");
    await act(async () => submit(osmForm));

    expect(mocks.success).toHaveBeenCalledTimes(2);
    expect(mocks.success).toHaveBeenNthCalledWith(1, "บันทึกข้อมูลบุคลากรโรงพยาบาลแล้ว");
    expect(mocks.success).toHaveBeenNthCalledWith(2, "บันทึกข้อมูล อสม. แล้ว");
    expect(container.textContent).toContain("mock-one-time-activation-token");
  });

  it("keeps an idempotent result copy from claiming that a new account or relationship was created", async () => {
    const activeResult = resultFor("HOSPITAL_MEMBER");
    if (activeResult.status !== "SUCCESS") throw new Error("Expected a success fixture");
    mocks.staffAction.mockResolvedValueOnce({
      status: "SUCCESS",
      result: {
        ...activeResult.result,
        idempotent: true,
        activationToken: null,
        activationRequired: false,
        accountStatus: "ACTIVE",
      },
    });
    renderWorkspace();
    const form = provisionForm("HOSPITAL_MEMBER");
    fillForm(form, "HOSPITAL_MEMBER");
    await act(async () => submit(form));
    expect(container.textContent).toContain("ข้อมูลบุคลากรพร้อมแล้ว");
    expect(container.textContent).toContain("ผู้ใช้นี้มีบัญชี DEMI ที่เปิดใช้งานอยู่แล้ว");
    expect(container.textContent).not.toContain("เพิ่มสิทธิ์เรียบร้อยแล้ว");
  });

  it.each([
    ["CONFLICT", "warning", "ไม่สามารถเพิ่มบุคลากรได้ กรุณาตรวจสอบรายการล่าสุด"],
    ["FORBIDDEN", "error", "ไม่มีสิทธิ์เพิ่มบุคลากรของโรงพยาบาลนี้"],
    ["INVALID_INPUT", null, null],
  ] as const)("maps staff %s to its inline and Toast behavior", async (code, channel, message) => {
    mocks.staffAction.mockResolvedValueOnce({
      status: "ERROR",
      code,
      message: "ข้อความผิดพลาดที่แสดงในหน้าฟอร์ม",
    });
    renderWorkspace();
    const form = provisionForm("HOSPITAL_MEMBER");
    fillForm(form, "HOSPITAL_MEMBER");
    await act(async () => submit(form));

    expect(container.textContent).toContain("ข้อความผิดพลาดที่แสดงในหน้าฟอร์ม");
    if (channel === "warning") expect(mocks.warning).toHaveBeenCalledExactlyOnceWith(message);
    else if (channel === "error") expect(mocks.error).toHaveBeenCalledExactlyOnceWith(message);
    else expect(toastCalls()).toHaveLength(0);
  });

  it.each([
    ["CONFLICT", "warning", "ไม่สามารถเพิ่ม อสม. ได้ กรุณาตรวจสอบรายการล่าสุด"],
    ["FORBIDDEN", "error", "ไม่มีสิทธิ์เพิ่ม อสม. ของโรงพยาบาลนี้"],
    ["INVALID_INPUT", null, null],
  ] as const)("maps OSM %s to its inline and Toast behavior", async (code, channel, message) => {
    mocks.osmAction.mockResolvedValueOnce({
      status: "ERROR",
      code,
      message: "ข้อความผิดพลาดของ อสม.",
    });
    renderWorkspace();
    const form = provisionForm("OSM");
    fillForm(form, "OSM");
    await act(async () => submit(form));

    expect(container.textContent).toContain("ข้อความผิดพลาดของ อสม.");
    if (channel === "warning") expect(mocks.warning).toHaveBeenCalledExactlyOnceWith(message);
    else if (channel === "error") expect(mocks.error).toHaveBeenCalledExactlyOnceWith(message);
    else expect(toastCalls()).toHaveLength(0);
  });

  it.each(["HOSPITAL_MEMBER", "OSM"] as const)(
    "treats returned UNAVAILABLE for %s as unconfirmed without clearing the draft or retrying",
    async (kind) => {
      const action = kind === "HOSPITAL_MEMBER" ? mocks.staffAction : mocks.osmAction;
      action.mockResolvedValueOnce({
        status: "ERROR",
        code: "UNAVAILABLE",
        message: "ข้อความขัดข้องที่ไม่ควรแสดงเป็นผลล้มเหลวแน่นอน",
      });
      renderWorkspace();
      const form = provisionForm(kind);
      fillForm(form, kind);
      await act(async () => submit(form));

      expect(container.textContent).toContain("บัญชีและความสัมพันธ์อาจถูกสร้างแล้ว");
      expect(container.textContent).toContain("ลิงก์เปิดใช้งานเดิมเรียกคืนไม่ได้");
      expect(container.textContent).not.toContain("ข้อความขัดข้องที่ไม่ควรแสดงเป็นผลล้มเหลวแน่นอน");
      expect(container.querySelector('[role="alert"]')?.textContent).toContain("โหลดรายชื่อล่าสุดก่อน");
      expect(toastCalls()).toHaveLength(0);
      expect(action).toHaveBeenCalledOnce();
      expect((form.elements.namedItem("givenName") as HTMLInputElement).value).not.toBe("");

      await act(async () => submit(form));
      expect(action).toHaveBeenCalledOnce();
    },
  );

  it.each(["HOSPITAL_MEMBER", "OSM"] as const)(
    "retains recovery after a thrown %s request without an automatic retry",
    async (kind) => {
      const action = kind === "HOSPITAL_MEMBER" ? mocks.staffAction : mocks.osmAction;
      action.mockRejectedValueOnce(new Error("private raw infrastructure detail"));
      renderWorkspace();
      const form = provisionForm(kind);
      fillForm(form, kind);
      await act(async () => submit(form));

      expect(container.textContent).toContain("บัญชีและความสัมพันธ์อาจถูกสร้างแล้ว");
      expect(container.textContent).not.toContain("private raw infrastructure detail");
      expect(toastCalls()).toHaveLength(0);
      expect(action).toHaveBeenCalledOnce();
      await act(async () => submit(form));
      expect(action).toHaveBeenCalledOnce();
    },
  );

  it("treats a returned IDLE state as unconfirmed", async () => {
    mocks.staffAction.mockResolvedValueOnce({ status: "IDLE" });
    renderWorkspace();
    const form = provisionForm("HOSPITAL_MEMBER");
    fillForm(form, "HOSPITAL_MEMBER");
    await act(async () => submit(form));

    expect(container.textContent).toContain("บัญชีและความสัมพันธ์อาจถูกสร้างแล้ว");
    expect(toastCalls()).toHaveLength(0);
    expect(mocks.staffAction).toHaveBeenCalledOnce();
  });

  it.each(["HOSPITAL_MEMBER", "OSM"] as const)(
    "blocks rapid duplicate %s submissions synchronously",
    async (kind) => {
      const action = kind === "HOSPITAL_MEMBER" ? mocks.staffAction : mocks.osmAction;
      const pending = deferred<WorkforceProvisionActionState>();
      action.mockReturnValueOnce(pending.promise);
      renderWorkspace();
      const form = provisionForm(kind);
      fillForm(form, kind);

      await act(async () => {
        submit(form);
        submit(form);
        await Promise.resolve();
      });
      expect(action).toHaveBeenCalledOnce();
      expect(container.querySelector<HTMLSelectElement>("#targetHospitalId")?.disabled).toBe(true);
      const hospitalSelector = container.querySelector<HTMLSelectElement>("#targetHospitalId");
      if (!hospitalSelector) throw new Error("Missing Hospital selector");
      hospitalSelector.value = hospitalB.id;
      hospitalSelector.dispatchEvent(new Event("change", { bubbles: true }));
      expect(mocks.routerPush).not.toHaveBeenCalled();

      await act(async () => {
        pending.resolve(resultFor(kind));
        await pending.promise;
      });
      expect(action).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ["HOSPITAL_MEMBER", "OSM"],
    ["OSM", "HOSPITAL_MEMBER"],
  ] as const)("prevents %s and %s provisioning from racing", async (firstKind, secondKind) => {
    const firstAction = firstKind === "HOSPITAL_MEMBER" ? mocks.staffAction : mocks.osmAction;
    const secondAction = secondKind === "HOSPITAL_MEMBER" ? mocks.staffAction : mocks.osmAction;
    const pending = deferred<WorkforceProvisionActionState>();
    firstAction.mockReturnValueOnce(pending.promise);
    renderWorkspace();
    const firstForm = provisionForm(firstKind);
    const secondForm = provisionForm(secondKind);
    fillForm(firstForm, firstKind);
    fillForm(secondForm, secondKind);

    await act(async () => {
      submit(firstForm);
      submit(secondForm);
      await Promise.resolve();
    });
    expect(firstAction).toHaveBeenCalledOnce();
    expect(secondAction).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve(resultFor(firstKind));
      await pending.promise;
    });
  });

  it("hides Hospital A's result under Hospital B while retaining it for Hospital A", async () => {
    const pending = deferred<WorkforceProvisionActionState>();
    mocks.staffAction.mockReturnValueOnce(pending.promise);
    renderWorkspace(hospitalA.id);
    const form = provisionForm("HOSPITAL_MEMBER");
    fillForm(form, "HOSPITAL_MEMBER");
    await act(async () => {
      submit(form);
      await Promise.resolve();
    });

    renderWorkspace(hospitalB.id);
    const newerForm = provisionForm("HOSPITAL_MEMBER");
    setField(newerForm, "givenName", "ร่างใหม่โรงพยาบาล ข");
    await act(async () => {
      pending.resolve(resultFor("HOSPITAL_MEMBER", hospitalA.id));
      await pending.promise;
    });

    expect(mocks.success).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("mock-one-time-activation-token");
    expect((newerForm.elements.namedItem("givenName") as HTMLInputElement).value).toBe("ร่างใหม่โรงพยาบาล ข");

    renderWorkspace(hospitalA.id);
    expect(container.textContent).toContain("mock-one-time-activation-token");
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("keeps a stale unknown-outcome recovery link tied to the submitted Hospital", async () => {
    const pending = deferred<WorkforceProvisionActionState>();
    mocks.osmAction.mockReturnValueOnce(pending.promise);
    renderWorkspace(hospitalA.id);
    const form = provisionForm("OSM");
    fillForm(form, "OSM");
    await act(async () => {
      submit(form);
      await Promise.resolve();
    });
    renderWorkspace(hospitalB.id);
    await act(async () => {
      pending.resolve({ status: "ERROR", code: "UNAVAILABLE", message: "internal" });
      await pending.promise;
    });

    expect(container.textContent).toContain("ผลการเพิ่มข้อมูล อสม.ของโรงพยาบาล กยังยืนยันไม่ได้");
    expect(container.querySelector(`a[href="/app/workforce?hospitalId=${hospitalA.id}"]`)).not.toBeNull();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("does not show Hospital A error feedback after the current context changes to Hospital B", async () => {
    const pending = deferred<WorkforceProvisionActionState>();
    mocks.staffAction.mockReturnValueOnce(pending.promise);
    renderWorkspace(hospitalA.id);
    const form = provisionForm("HOSPITAL_MEMBER");
    fillForm(form, "HOSPITAL_MEMBER");
    await act(async () => {
      submit(form);
      await Promise.resolve();
    });

    renderWorkspace(hospitalB.id);
    await act(async () => {
      pending.resolve({
        status: "ERROR",
        code: "CONFLICT",
        message: "ข้อผิดพลาดของโรงพยาบาล ก",
      });
      await pending.promise;
    });

    expect(container.textContent).not.toContain("ข้อผิดพลาดของโรงพยาบาล ก");
    expect(mocks.warning).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("does not emit a Toast when a success arrives after unmount", async () => {
    const pending = deferred<WorkforceProvisionActionState>();
    mocks.osmAction.mockReturnValueOnce(pending.promise);
    renderWorkspace();
    const form = provisionForm("OSM");
    fillForm(form, "OSM");
    await act(async () => {
      submit(form);
      await Promise.resolve();
    });

    act(() => root.unmount());
    await act(async () => {
      pending.resolve(resultFor("OSM"));
      await pending.promise;
    });
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("does not reset an edited draft when the submitted result returns", async () => {
    const pending = deferred<WorkforceProvisionActionState>();
    mocks.staffAction.mockReturnValueOnce(pending.promise);
    renderWorkspace();
    const form = provisionForm("HOSPITAL_MEMBER");
    fillForm(form, "HOSPITAL_MEMBER");
    await act(async () => {
      submit(form);
      await Promise.resolve();
    });
    setField(form, "givenName", "ร่างที่แก้ไขภายหลัง");

    await act(async () => {
      pending.resolve(resultFor("HOSPITAL_MEMBER"));
      await pending.promise;
    });

    expect((form.elements.namedItem("givenName") as HTMLInputElement).value).toBe("ร่างที่แก้ไขภายหลัง");
    expect(container.textContent).toContain("สร้างบุคลากรแล้ว · รอเปิดใช้งาน");
  });

  it("preserves entered data on a confirmed error", async () => {
    mocks.osmAction.mockResolvedValueOnce({
      status: "ERROR",
      code: "CONFLICT",
      message: "ข้อมูลชนกัน กรุณาตรวจสอบรายการ",
    });
    renderWorkspace();
    const form = provisionForm("OSM");
    fillForm(form, "OSM");
    await act(async () => submit(form));

    expect((form.elements.namedItem("givenName") as HTMLInputElement).value).toBe("ชื่ออสม.");
    expect(container.textContent).toContain("ข้อมูลชนกัน กรุณาตรวจสอบรายการ");
  });
});
