// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bulk: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  search: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  refresh: vi.fn(),
  notifyError: vi.fn<(message: string) => void>(),
  notifySuccess: vi.fn<(message: string) => void>(),
  notifyWarning: vi.fn<(message: string) => void>(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("next/form", () => ({
  // next/form submits as a GET navigation; a plain form is enough here.
  default: (props: Record<string, unknown>) => {
    const { action, ...rest } = props;
    void action;
    return createElement("form", rest);
  },
}));
vi.mock("@/modules/patient-assignment/transport/server-actions", () => ({
  bulkAssignOsmToPatientsAction: mocks.bulk,
  searchPatientOsmBulkCandidatesAction: mocks.search,
}));
vi.mock("@/components/ui/notify", () => ({
  notify: {
    error: mocks.notifyError,
    info: vi.fn(),
    success: mocks.notifySuccess,
    warning: mocks.notifyWarning,
  },
}));

import { PatientOsmBulkAssignmentWorkspace } from "./patient-osm-bulk-assignment-workspace";

const hospitalId = "hospital-1";
const scope = { hospitalId, hospitalName: "โรงพยาบาลทดสอบ" };
const otherScope = { hospitalId: "hospital-2", hospitalName: "โรงพยาบาลอื่น" };
const patients = [1, 2].map((index) => ({
  patientProfileId: `profile-${index}`,
  patientHospitalRelationshipId: `relationship-${index}`,
  displayName: `ผู้ป่วย ${index}`,
  hospital: { id: hospitalId, name: scope.hospitalName },
  hospitalNumber: `HN-${index}`,
  classification: null,
}));
const view = { hospital: scope, patients, totalWithoutOsm: 2 };

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.search.mockResolvedValue({
    status: "OK",
    candidates: [{ userId: "osm-1", displayName: "สมใจ อสม." }],
    hasMore: false,
    nextCursor: null,
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function buttonByText(text: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes(text));
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

async function render(selectedScope = scope): Promise<void> {
  await act(async () => {
    root.render(
      createElement(PatientOsmBulkAssignmentWorkspace, {
        scopes: [scope, otherScope],
        selectedScope,
        view: view as never,
        search: "",
        errorMessage: null,
      }),
    );
  });
}

async function reachConfirmation(): Promise<void> {
  await render();
  await act(async () => {
    for (const checkbox of container.querySelectorAll<HTMLInputElement>('ul[aria-label="ผู้ป่วยที่ยังไม่มี อสม."] input[type=checkbox]')) {
      checkbox.click();
    }
  });
  await act(async () => {
    container.querySelector<HTMLInputElement>('input[name="osm-candidate"]')!.click();
  });
  await act(async () => {
    buttonByText("ตรวจสอบก่อนมอบหมาย").click();
  });
}

function confirmForm(): HTMLFormElement {
  return container.querySelector<HTMLFormElement>('form:has(input[name="submissionNonce"])')!;
}

async function confirmAssignment(): Promise<void> {
  await act(async () => {
    confirmForm().requestSubmit();
  });
}

function bulkResult(operation: string, overrides: Record<string, unknown> = {}) {
  return {
    status: "SUCCESS",
    result: { operation, hospitalId, osmUserId: "osm-1", assignedCount: 2, ...overrides },
  };
}

function allToasts(): string {
  return JSON.stringify([mocks.notifySuccess.mock.calls, mocks.notifyWarning.mock.calls, mocks.notifyError.mock.calls]);
}

describe("bulk OSM assignment feedback", () => {
  it("shows one success Toast for a newly applied batch, refreshes once, and never replays", async () => {
    mocks.bulk.mockResolvedValue(bulkResult("ASSIGNED"));
    await reachConfirmation();

    await confirmAssignment();

    expect(mocks.bulk).toHaveBeenCalledTimes(1);
    expect(mocks.notifySuccess).toHaveBeenCalledTimes(1);
    expect(mocks.notifySuccess).toHaveBeenCalledWith("มอบหมาย อสม. ให้ผู้ป่วยแล้ว");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(allToasts()).not.toContain("สมใจ");
    expect(allToasts()).not.toContain("ผู้ป่วย 1");
    expect(container.textContent).toContain("กำหนด อสม. เรียบร้อยแล้ว");

    await render();
    await render();
    expect(mocks.notifySuccess).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("gives no new success Toast for a confirmed REPLAYED result and explains it inline", async () => {
    mocks.bulk.mockResolvedValue(bulkResult("REPLAYED"));
    await reachConfirmation();

    await confirmAssignment();

    expect(allToasts()).toBe("[[],[],[]]");
    expect(container.textContent).toContain("คำขอนี้ถูกบันทึกไปแล้ว ระบบไม่มอบหมายซ้ำ");
  });

  it("keeps invalid input inline, warns on CONFLICT, errors on FORBIDDEN", async () => {
    mocks.bulk.mockResolvedValue({ status: "ERROR", code: "INVALID_INPUT", message: "เลือกผู้ป่วยไม่ถูกต้อง" });
    await reachConfirmation();
    await confirmAssignment();
    expect(allToasts()).toBe("[[],[],[]]");
    expect(container.textContent).toContain("เลือกผู้ป่วยไม่ถูกต้อง");

    mocks.bulk.mockResolvedValue({ status: "ERROR", code: "CONFLICT", message: "ขัดแย้ง" });
    await confirmAssignment();
    expect(mocks.notifyWarning).toHaveBeenCalledTimes(1);

    mocks.bulk.mockResolvedValue({ status: "ERROR", code: "FORBIDDEN", message: "ไม่มีสิทธิ์" });
    await confirmAssignment();
    expect(mocks.notifyError).toHaveBeenCalledTimes(1);
    expect(mocks.notifySuccess).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it.each([
    ["returned UNAVAILABLE", { status: "ERROR", code: "UNAVAILABLE", message: "ลองใหม่" }],
    ["returned IDLE", { status: "IDLE" }],
    ["a different count than selected", bulkResult("ASSIGNED", { assignedCount: 7 })],
    ["another Hospital", bulkResult("ASSIGNED", { hospitalId: "hospital-9" })],
    ["another OSM", bulkResult("ASSIGNED", { osmUserId: "osm-9" })],
  ])("treats %s as unconfirmed: no Toast, resend offered", async (_label, response) => {
    mocks.bulk.mockResolvedValue(response);
    await reachConfirmation();

    await confirmAssignment();

    expect(allToasts()).toBe("[[],[],[]]");
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(container.textContent).toContain("ตรวจสอบผลด้วยคำขอเดิม");
    expect(container.textContent).not.toContain("กำหนด อสม. เรียบร้อยแล้ว");
    expect(buttonByText("ยืนยันมอบหมาย").disabled).toBe(true);
    expect(mocks.bulk).toHaveBeenCalledTimes(1);
  });

  it("re-sends the identical payload and nonce, never a new batch, and locks the selection meanwhile", async () => {
    mocks.bulk.mockResolvedValueOnce({ status: "ERROR", code: "UNAVAILABLE", message: "ลองใหม่" });
    await reachConfirmation();
    await confirmAssignment();

    expect(buttonByText("กลับไปแก้ไข").disabled).toBe(true);
    expect(container.querySelector<HTMLSelectElement>("select[name=hospitalId]")!.disabled).toBe(true);
    expect(mocks.bulk).toHaveBeenCalledTimes(1);

    mocks.bulk.mockResolvedValueOnce(bulkResult("REPLAYED"));
    await act(async () => {
      buttonByText("ตรวจสอบผลด้วยคำขอเดิม").click();
    });

    expect(mocks.bulk).toHaveBeenCalledTimes(2);
    const first = mocks.bulk.mock.calls[0][1] as FormData;
    const second = mocks.bulk.mock.calls[1][1] as FormData;
    expect(second).toBe(first);
    expect(first.get("submissionNonce")).toBeTruthy();
    expect(first.getAll("patientHospitalRelationshipId")).toEqual(["relationship-1", "relationship-2"]);
    expect(allToasts()).toBe("[[],[],[]]");
    expect(container.textContent).toContain("คำขอนี้ถูกบันทึกไปแล้ว ระบบไม่มอบหมายซ้ำ");
  });

  it("a re-sent request that turns out not to have been applied is announced once", async () => {
    mocks.bulk.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await reachConfirmation();
    await confirmAssignment();
    expect(allToasts()).toBe("[[],[],[]]");

    mocks.bulk.mockResolvedValueOnce(bulkResult("ASSIGNED"));
    await act(async () => {
      buttonByText("ตรวจสอบผลด้วยคำขอเดิม").click();
    });

    expect(mocks.notifySuccess).toHaveBeenCalledTimes(1);
    expect((mocks.bulk.mock.calls[1][1] as FormData).get("submissionNonce")).toBe(
      (mocks.bulk.mock.calls[0][1] as FormData).get("submissionNonce"),
    );
  });

  it("sends one request for two synchronous submits", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mocks.bulk.mockReturnValue(new Promise((done) => { resolve = done; }));
    await reachConfirmation();

    await act(async () => {
      confirmForm().requestSubmit();
      confirmForm().requestSubmit();
    });
    expect(mocks.bulk).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve(bulkResult("ASSIGNED"));
    });
    expect(mocks.notifySuccess).toHaveBeenCalledTimes(1);
  });

  it("gives no Toast when the workspace is unmounted before the response", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mocks.bulk.mockReturnValue(new Promise((done) => { resolve = done; }));
    await reachConfirmation();
    await confirmAssignment();

    act(() => root.unmount());
    root = createRoot(container);
    await act(async () => {
      resolve(bulkResult("ASSIGNED"));
    });

    expect(allToasts()).toBe("[[],[],[]]");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("gives no Toast when the displayed Hospital changed before the response", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    mocks.bulk.mockReturnValue(new Promise((done) => { resolve = done; }));
    await reachConfirmation();
    await confirmAssignment();

    await render(otherScope);
    await act(async () => {
      resolve(bulkResult("ASSIGNED"));
    });

    expect(allToasts()).toBe("[[],[],[]]");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
