// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bulkAction: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/ui/notify", () => ({
  notify: { success: mocks.success, warning: mocks.warning, error: mocks.error, info: mocks.info },
}));
vi.mock("@/modules/workforce/transport/server-actions", () => ({
  provisionHospitalMemberAction: vi.fn(),
  provisionOsmAction: vi.fn(),
  provisionWorkforceBulkAction: mocks.bulkAction,
  regenerateWorkforceActivationAction: vi.fn(),
  startAssistedWorkforceActivationAction: vi.fn(),
}));

import type {
  WorkforceBulkActionState,
  WorkforceBulkRowResultState,
} from "@/modules/workforce/transport/action-state";
import { WorkforceImportWorkspace } from "./workforce-import-workspace";

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

const NATIONAL_ID = "1234567890123";
const GIVEN_NAME = "ชื่อลับทดสอบ";

function bulkResult(
  rows: WorkforceBulkRowResultState[],
  kind: "HOSPITAL_MEMBER" | "OSM" = "HOSPITAL_MEMBER",
  hospitalId = hospitalA.id,
): WorkforceBulkActionState {
  return { status: "SUCCESS", result: { kind, hospitalId, rows } };
}

const created = (rowNumber: number): WorkforceBulkRowResultState => ({
  rowNumber,
  status: "created",
  activationRequired: true,
});
const existing = (rowNumber: number): WorkforceBulkRowResultState => ({
  rowNumber,
  status: "existing",
  activationRequired: false,
});
const invalid = (rowNumber: number): WorkforceBulkRowResultState => ({
  rowNumber,
  status: "invalid",
  reason: "INVALID_ROW",
});

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
  mocks.bulkAction.mockReset().mockResolvedValue(bulkResult([created(1)]));
  mocks.success.mockReset();
  mocks.warning.mockReset();
  mocks.error.mockReset();
  mocks.info.mockReset();
  window.sessionStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderWorkspace(selectedHospitalId = hospitalA.id): Promise<void> {
  const hospital = [hospitalA, hospitalB].find((item) => item.id === selectedHospitalId);
  if (!hospital) throw new Error("Test Hospital is missing");
  await act(async () => {
    root.render(
      createElement(WorkforceImportWorkspace, {
        hospitals: [hospitalA, hospitalB],
        selectedHospitalId,
        hospitalName: hospital.name,
        rows: [],
        serverTime: 1791849600000,
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
      }),
    );
    await Promise.resolve();
  });
}

function bulkForm(): HTMLFormElement {
  const form = container.querySelector<HTMLFormElement>('form:has([name="submissionId"])');
  if (!form) throw new Error("Missing bulk form");
  return form;
}

function setControlled(element: HTMLInputElement | HTMLSelectElement, value: string): void {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw new Error("Missing value setter");
  setter.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

async function fillRow(index: number, nationalId = NATIONAL_ID): Promise<void> {
  const form = bulkForm();
  const nationalIds = form.querySelectorAll<HTMLInputElement>('input[name="nationalId"]');
  const givenNames = form.querySelectorAll<HTMLInputElement>('input[name="givenName"]');
  const familyNames = form.querySelectorAll<HTMLInputElement>('input[name="familyName"]');
  await act(async () => {
    setControlled(nationalIds[index]!, nationalId);
    setControlled(givenNames[index]!, GIVEN_NAME);
    setControlled(familyNames[index]!, "นามสกุลลับ");
  });
}

function submitBulk(): void {
  const form = bulkForm();
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!button) throw new Error("Missing bulk submit button");
  form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: button }));
}

function submittedKey(callIndex: number): string {
  const formData = mocks.bulkAction.mock.calls[callIndex]?.[1];
  if (!(formData instanceof FormData)) throw new Error("Missing submitted form data");
  return String(formData.get("submissionId"));
}

function toastCalls(): unknown[][] {
  return [...mocks.success.mock.calls, ...mocks.warning.mock.calls, ...mocks.error.mock.calls];
}

describe("Workforce bulk provisioning Toasts", () => {
  it("announces full success only when every processed row is created", async () => {
    mocks.bulkAction.mockResolvedValueOnce(bulkResult([created(1), created(2)]));
    await renderWorkspace();
    await fillRow(0);

    await act(async () => submitBulk());

    expect(mocks.bulkAction).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("บันทึกรายการบุคลากรแล้ว");
    expect(mocks.warning).not.toHaveBeenCalled();
    expect(container.textContent).toContain("สร้างใหม่ 2 · มีอยู่แล้ว 0 · ไม่สำเร็จ 0");
  });

  it("uses the same neutral wording when every row already existed", async () => {
    mocks.bulkAction.mockResolvedValueOnce(bulkResult([existing(1), existing(2)]));
    await renderWorkspace();
    await fillRow(0);

    await act(async () => submitBulk());

    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("บันทึกรายการบุคลากรแล้ว");
    expect(JSON.stringify(toastCalls())).not.toMatch(/สร้าง/);
    expect(container.textContent).toContain("สร้างใหม่ 0 · มีอยู่แล้ว 2 · ไม่สำเร็จ 0");
  });

  it("announces success for a mix of created and existing rows", async () => {
    mocks.bulkAction.mockResolvedValueOnce(bulkResult([created(1), existing(2)]));
    await renderWorkspace();
    await fillRow(0);

    await act(async () => submitBulk());

    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("บันทึกรายการบุคลากรแล้ว");
    expect(container.textContent).toContain("สร้างใหม่ 1 · มีอยู่แล้ว 1 · ไม่สำเร็จ 0");
  });

  it("warns about partial success and keeps every row result visible", async () => {
    mocks.bulkAction.mockResolvedValueOnce(bulkResult([created(1), invalid(2), existing(3)]));
    await renderWorkspace();
    await fillRow(0);

    await act(async () => submitBulk());

    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.warning).toHaveBeenCalledExactlyOnceWith("บันทึกได้บางรายการ กรุณาตรวจสอบผลรายแถว");
    expect(container.textContent).toContain("สร้างใหม่ 1 · มีอยู่แล้ว 1 · ไม่สำเร็จ 1");
    expect(container.textContent).toContain("แถว 1: สร้างแล้ว");
    expect(container.textContent).toContain("แถว 2: ไม่สำเร็จ · ข้อมูลในแถวไม่ถูกต้อง");
    expect(container.textContent).toContain("แถว 3: มีอยู่ในโรงพยาบาลนี้แล้ว");
  });

  it("warns that nothing was saved when every row is invalid", async () => {
    mocks.bulkAction.mockResolvedValueOnce(bulkResult([invalid(1), invalid(2)]));
    await renderWorkspace();
    await fillRow(0);

    await act(async () => submitBulk());

    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.warning).toHaveBeenCalledExactlyOnceWith("ไม่มีรายการที่บันทึกสำเร็จ กรุณาตรวจสอบข้อมูลรายแถว");
    expect(container.textContent).toContain("สร้างใหม่ 0 · มีอยู่แล้ว 0 · ไม่สำเร็จ 2");
  });

  it("uses OSM wording for an OSM batch", async () => {
    mocks.bulkAction.mockResolvedValueOnce(bulkResult([created(1)], "OSM"));
    await renderWorkspace();
    const select = bulkForm().querySelector<HTMLSelectElement>('select[name="kind"]');
    if (!select) throw new Error("Missing kind select");
    await act(async () => setControlled(select, "OSM"));
    await act(async () => Promise.resolve());
    await fillRow(0);

    await act(async () => submitBulk());

    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("บันทึกรายการ อสม. แล้ว");
  });

  it("keeps duplicate-row validation inline with no Toast", async () => {
    mocks.bulkAction.mockResolvedValueOnce({
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "พบเลขบัตรประชาชนซ้ำในรายการที่ส่ง ไม่มีการบันทึกข้อมูล",
      duplicateRowNumbers: [1, 2],
    });
    await renderWorkspace();
    await fillRow(0);

    await act(async () => submitBulk());

    expect(toastCalls()).toHaveLength(0);
    expect(container.textContent).toContain("พบเลขบัตรประชาชนซ้ำในรายการที่ส่ง");
  });

  it("warns for a confirmed conflict and shows the existing inline message", async () => {
    mocks.bulkAction.mockResolvedValueOnce({
      status: "ERROR",
      code: "CONFLICT",
      message: "ไม่สามารถดำเนินการกับบุคลากรรายนี้ได้ กรุณาตรวจสอบสถานะแล้วลองใหม่",
    });
    await renderWorkspace();
    await fillRow(0);

    await act(async () => submitBulk());

    expect(mocks.warning).toHaveBeenCalledExactlyOnceWith("ไม่สามารถบันทึกรายการได้ กรุณาตรวจสอบรายการล่าสุด");
    expect(mocks.success).not.toHaveBeenCalled();
    expect(container.textContent).toContain("ไม่สามารถดำเนินการกับบุคลากรรายนี้ได้");
  });

  it("reports a confirmed forbidden response as an error", async () => {
    mocks.bulkAction.mockResolvedValueOnce({
      status: "ERROR",
      code: "FORBIDDEN",
      message: "บัญชีนี้ไม่มีสิทธิ์จัดการบุคลากรของโรงพยาบาลนี้",
    });
    await renderWorkspace();
    await fillRow(0);

    await act(async () => submitBulk());

    expect(mocks.error).toHaveBeenCalledExactlyOnceWith("ไม่มีสิทธิ์เพิ่มบุคลากรของโรงพยาบาลนี้");
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("treats a returned UNAVAILABLE as unconfirmed, keeps the recovery text, and never resends by itself", async () => {
    mocks.bulkAction.mockResolvedValueOnce({
      status: "ERROR",
      code: "UNAVAILABLE",
      message: "ข้อความโครงสร้างพื้นฐาน",
    });
    await renderWorkspace();
    await fillRow(0);

    await act(async () => submitBulk());

    expect(toastCalls()).toHaveLength(0);
    expect(container.textContent).toContain("ระบบยังยืนยันผลการบันทึกไม่ได้");
    expect(container.textContent).not.toContain("ข้อความโครงสร้างพื้นฐาน");
    expect(mocks.bulkAction).toHaveBeenCalledOnce();
    const submit = bulkForm().querySelector<HTMLButtonElement>('button[type="submit"]');
    expect(submit?.disabled).toBe(false);
  });

  it("treats a thrown request as unconfirmed and keeps the same submission identity for the user's replay", async () => {
    mocks.bulkAction.mockRejectedValueOnce(new Error("network lost"));
    await renderWorkspace();
    await fillRow(0);

    await act(async () => submitBulk());

    expect(toastCalls()).toHaveLength(0);
    expect(container.textContent).toContain("ระบบยังยืนยันผลการบันทึกไม่ได้");
    expect(mocks.bulkAction).toHaveBeenCalledOnce();

    mocks.bulkAction.mockResolvedValueOnce(bulkResult([created(1)]));
    await act(async () => submitBulk());

    expect(mocks.bulkAction).toHaveBeenCalledTimes(2);
    expect(submittedKey(1)).toBe(submittedKey(0));
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("บันทึกรายการบุคลากรแล้ว");
    expect(container.textContent).not.toContain("ระบบยังยืนยันผลการบันทึกไม่ได้");
  });

  it("replays the same submissionId after a confirmed result and issues a new one on explicit request", async () => {
    await renderWorkspace();
    await fillRow(0);
    await act(async () => submitBulk());
    await act(async () => submitBulk());
    expect(submittedKey(1)).toBe(submittedKey(0));

    const newSubmission = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("เริ่มรายการใหม่หลังแก้ข้อมูล"),
    );
    if (!newSubmission) throw new Error("Missing new submission button");
    await act(async () => newSubmission.click());
    await act(async () => submitBulk());

    expect(mocks.bulkAction).toHaveBeenCalledTimes(3);
    expect(submittedKey(2)).not.toBe(submittedKey(0));
  });

  it("does not generate a new identity when the request times out", async () => {
    mocks.bulkAction.mockRejectedValueOnce(new Error("timeout"));
    await renderWorkspace();
    await fillRow(0);
    const before = bulkForm().querySelector<HTMLInputElement>('input[name="submissionId"]')?.value;

    await act(async () => submitBulk());

    expect(bulkForm().querySelector<HTMLInputElement>('input[name="submissionId"]')?.value).toBe(before);
    expect(submittedKey(0)).toBe(before);
  });

  it("drops a rapid duplicate submission before it reaches the Server Action", async () => {
    const action = deferred<WorkforceBulkActionState>();
    mocks.bulkAction.mockReturnValueOnce(action.promise);
    await renderWorkspace();
    await fillRow(0);

    await act(async () => {
      submitBulk();
      submitBulk();
      await Promise.resolve();
    });
    await act(async () => {
      action.resolve(bulkResult([created(1)]));
      await action.promise;
    });

    expect(mocks.bulkAction).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledOnce();
  });

  it("emits no Toast and shows no result when the Hospital changed before the response", async () => {
    const action = deferred<WorkforceBulkActionState>();
    mocks.bulkAction.mockReturnValueOnce(action.promise);
    await renderWorkspace(hospitalA.id);
    await fillRow(0);
    await act(async () => {
      submitBulk();
      await Promise.resolve();
    });

    await renderWorkspace(hospitalB.id);
    await act(async () => {
      action.resolve(bulkResult([created(1)], "HOSPITAL_MEMBER", hospitalA.id));
      await action.promise;
    });

    expect(toastCalls()).toHaveLength(0);
    expect(container.textContent).not.toContain("สร้างใหม่ 1");
    expect(container.textContent).not.toContain("แถว 1: สร้างแล้ว");
  });

  it("does not treat a success result for another Hospital as confirmation", async () => {
    mocks.bulkAction.mockResolvedValueOnce(bulkResult([created(1)], "HOSPITAL_MEMBER", hospitalB.id));
    await renderWorkspace(hospitalA.id);
    await fillRow(0);

    await act(async () => submitBulk());

    expect(toastCalls()).toHaveLength(0);
    expect(container.textContent).not.toContain("สร้างใหม่ 1");
    expect(container.textContent).toContain("ระบบยังยืนยันผลการบันทึกไม่ได้");
  });

  it("never places row data or identifiers in a Toast", async () => {
    mocks.bulkAction.mockResolvedValueOnce(bulkResult([created(1), invalid(2)]));
    await renderWorkspace();
    await fillRow(0);

    await act(async () => submitBulk());

    const serialized = JSON.stringify(toastCalls());
    expect(serialized).not.toContain(NATIONAL_ID);
    expect(serialized).not.toContain(GIVEN_NAME);
    expect(serialized).not.toContain("นามสกุลลับ");
    expect(serialized).not.toContain(hospitalA.id);
  });

  it("does not replay a Toast after a rerender", async () => {
    mocks.bulkAction.mockResolvedValueOnce(bulkResult([created(1), invalid(2)]));
    await renderWorkspace();
    await fillRow(0);
    await act(async () => submitBulk());
    expect(mocks.warning).toHaveBeenCalledOnce();

    await renderWorkspace();

    expect(mocks.warning).toHaveBeenCalledOnce();
    expect(mocks.bulkAction).toHaveBeenCalledOnce();
  });

  it("shows no Toast for a response that arrives after unmount", async () => {
    const action = deferred<WorkforceBulkActionState>();
    mocks.bulkAction.mockReturnValueOnce(action.promise);
    await renderWorkspace();
    await fillRow(0);
    await act(async () => {
      submitBulk();
      await Promise.resolve();
    });

    act(() => root.unmount());
    await act(async () => {
      action.resolve(bulkResult([created(1)]));
      await action.promise;
    });

    expect(toastCalls()).toHaveLength(0);
    root = createRoot(container);
  });
});
