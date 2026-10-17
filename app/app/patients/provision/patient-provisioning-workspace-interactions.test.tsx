// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  confirmImport: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  downloadFailedRows: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  notifyError: vi.fn<(message: string) => void>(),
  notifyInfo: vi.fn<(message: string) => void>(),
  notifySuccess: vi.fn<(message: string) => void>(),
  notifyWarning: vi.fn<(message: string) => void>(),
  previewImport: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  provision: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  push: vi.fn<(href: string) => void>(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
}));
vi.mock("@/modules/patient-provisioning/transport/server-actions", () => ({
  confirmPatientImportAction: mocks.confirmImport,
  previewPatientImportAction: mocks.previewImport,
  provisionPatientAction: mocks.provision,
}));
vi.mock("@/modules/patient-provisioning/transport/patient-import-failed-rows-client", () => ({
  downloadPatientImportFailedRows: mocks.downloadFailedRows,
}));
vi.mock("@/components/ui/notify", () => ({
  notify: {
    error: mocks.notifyError,
    info: mocks.notifyInfo,
    success: mocks.notifySuccess,
    warning: mocks.notifyWarning,
  },
}));

import { PATIENT_IMPORT_CONTRACT_VERSION } from "@/modules/patient-provisioning/import/patient-import-contract";
import type {
  PatientImportActionState,
  PatientImportPreviewBinding,
  PatientProvisionActionState,
} from "@/modules/patient-provisioning/transport/action-state";
import type {
  PatientImportPreviewRow,
  PatientImportResultSummary,
} from "@/modules/patient-provisioning/services/patient-roster-import-types";
import { PatientProvisioningWorkspace } from "./patient-provisioning-workspace";

const hospitalId = "33333333-3333-4333-8333-333333333333";
const scope = {
  hospitalId,
  hospitalCode: "TEST-HOSPITAL",
  hospitalName: "โรงพยาบาลทดสอบ",
  canBulkImport: true,
};

function previewRow(
  rowNumber: number,
  classification: PatientImportPreviewRow["classification"],
): PatientImportPreviewRow {
  return {
    rowNumber,
    sourceSequenceNumber: String(rowNumber - 1),
    identityDisplay: `000000000000${rowNumber}`,
    givenName: rowNumber === 2 ? "สมชาย" : "สมหญิง",
    familyName: "ผู้ป่วยทดสอบ",
    hospitalNumber: null,
    classification,
    reason: classification === "READY" ? null : "เลขบัตรประชาชนไม่ถูกต้อง",
    baselineStatus: "NOT_APPLICABLE",
    requirementGatedFields: [],
    diagnosticCodes: [],
    patientClassification: { status: "NOT_APPLICABLE", sourceClassification: null },
  };
}

const readyRow = previewRow(2, "READY");
const invalidRow = previewRow(3, "INVALID");
const preview: PatientImportPreviewBinding = {
  targetHospitalId: hospitalId,
  effectiveDate: null,
  importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
  baselineDateRequired: false,
  rows: [readyRow, invalidRow],
  file: null,
  fileFingerprint: "a".repeat(64),
  previewBinding: "preview-binding",
};

const importSummary: PatientImportResultSummary = {
  targetHospitalId: hospitalId,
  imported: 1,
  alreadyExists: 0,
  duplicateInFile: 0,
  invalid: 0,
  conflict: 0,
  failed: 1,
  baselineCreated: 0,
  classificationCreated: 0,
  rows: [
    { ...readyRow, result: "IMPORTED" },
    { ...invalidRow, result: "FAILED" },
  ],
  file: null,
};

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(value) {
      if (!resolvePromise) {
        throw new Error("Deferred promise has not initialized");
      }
      resolvePromise(value);
    },
  };
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.replace(/\s+/gu, " ").trim() === label,
  );
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${label}`);
  }
  return found;
}

function currentDialog(container: HTMLElement): HTMLDialogElement {
  const found = container.querySelector("dialog");
  if (!(found instanceof HTMLDialogElement) || !found.open) {
    throw new Error("Expected the import dialog to be open");
  }
  return found;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let originalShowModal: PropertyDescriptor | undefined;
let originalClose: PropertyDescriptor | undefined;
let originalScrollTo: PropertyDescriptor | undefined;
let previousActEnvironment: boolean | undefined;

beforeAll(() => {
  const globalWithActFlag = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  previousActEnvironment = globalWithActFlag.IS_REACT_ACT_ENVIRONMENT;
  globalWithActFlag.IS_REACT_ACT_ENVIRONMENT = true;

  originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");

  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
});

afterAll(() => {
  const globalWithActFlag = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  if (previousActEnvironment === undefined) {
    Reflect.deleteProperty(globalWithActFlag, "IS_REACT_ACT_ENVIRONMENT");
  } else {
    globalWithActFlag.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  }

  for (const [prototype, key, descriptor] of [
    [HTMLDialogElement.prototype, "showModal", originalShowModal],
    [HTMLDialogElement.prototype, "close", originalClose],
    [HTMLElement.prototype, "scrollTo", originalScrollTo],
  ] as const) {
    if (descriptor) {
      Object.defineProperty(prototype, key, descriptor);
    } else {
      Reflect.deleteProperty(prototype, key);
    }
  }
});

beforeEach(() => {
  mocks.confirmImport.mockReset();
  mocks.downloadFailedRows.mockReset().mockResolvedValue({ status: "SUCCESS" });
  mocks.previewImport.mockReset().mockResolvedValue({ status: "SUCCESS", preview });
  mocks.provision.mockReset();
  mocks.notifyError.mockReset();
  mocks.notifyInfo.mockReset();
  mocks.notifySuccess.mockReset();
  mocks.notifyWarning.mockReset();
  mocks.push.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(PatientProvisioningWorkspace, {
        key: hospitalId,
        scopes: [scope],
        selectedHospitalId: hospitalId,
        selectedScope: scope,
      }),
    );
  });
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

async function openReviewDialog(): Promise<HTMLDivElement> {
  const mounted = container;
  if (!mounted) {
    throw new Error("Workspace is not mounted");
  }

  await act(async () => {
    button(mounted, "นำเข้าจาก Excel").click();
  });

  const fileInput = mounted.querySelector<HTMLInputElement>("#patient-import-file");
  if (!fileInput) {
    throw new Error("Missing patient import file input");
  }
  const file = new File(["patient import"], "patients.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const files = {
    0: file,
    length: 1,
    item: (index: number) => (index === 0 ? file : null),
  } as unknown as FileList;
  Object.defineProperty(fileInput, "files", { configurable: true, value: files });
  await act(async () => {
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => {
    const form = mounted.querySelector<HTMLFormElement>('form[enctype="multipart/form-data"]');
    if (!form) {
      throw new Error("Missing patient import preview form");
    }
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  return mounted;
}

describe("Patient import review dialog interactions", () => {
  it("blocks failed-row download and Escape while importing, then preserves the result and focus on reopen", async () => {
    const mounted = await openReviewDialog();
    const returnFocusButton = button(mounted, "ตรวจสอบและแสดงตัวอย่าง");
    const initialDialog = currentDialog(mounted);

    expect(initialDialog.querySelector("h2")?.textContent).toBe("ตรวจสอบก่อนนำเข้า");
    expect(document.activeElement).toBe(initialDialog.querySelector("h2"));

    const pendingImport = deferred<PatientImportActionState>();
    mocks.confirmImport.mockReturnValue(pendingImport.promise);
    act(() => {
      button(mounted, "ยืนยันนำเข้า 1 รายการ").click();
    });

    const downloadButton = button(mounted, "ดาวน์โหลดแถวที่ต้องแก้ไข");
    expect(downloadButton.disabled).toBe(true);
    await act(async () => {
      downloadButton.click();
    });
    expect(mocks.downloadFailedRows).not.toHaveBeenCalled();

    const cancelEvent = new Event("cancel", { cancelable: true });
    await act(async () => {
      currentDialog(mounted).dispatchEvent(cancelEvent);
    });
    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(currentDialog(mounted)).toBe(initialDialog);
    expect(button(mounted, "ยกเลิก").disabled).toBe(true);

    await act(async () => {
      pendingImport.resolve({ status: "SUCCESS", summary: importSummary });
      await pendingImport.promise;
    });

    const resultDialog = currentDialog(mounted);
    expect(resultDialog.querySelector("h2")?.textContent).toBe("ผลการนำเข้าผู้ป่วย");
    expect(resultDialog.textContent).toContain("นำเข้าผู้ป่วยใหม่แล้ว");
    expect(resultDialog.textContent).toContain("สมหญิง");
    expect(document.activeElement).toBe(resultDialog.querySelector("h2"));

    await act(async () => {
      button(mounted, "ปิด").click();
    });
    expect(mounted.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(returnFocusButton);

    await act(async () => {
      button(mounted, "ดูผลการนำเข้า").click();
    });
    const reopenedDialog = currentDialog(mounted);
    expect(reopenedDialog.querySelector("h2")?.textContent).toBe("ผลการนำเข้าผู้ป่วย");
    expect(reopenedDialog.textContent).toContain("นำเข้าผู้ป่วยใหม่แล้ว");
    expect(reopenedDialog.textContent).toContain("สมหญิง");
    expect(document.activeElement).toBe(reopenedDialog.querySelector("h2"));
  });

  it("keeps an import with a lost response unconfirmed and blocks a second confirmation", async () => {
    const mounted = await openReviewDialog();
    mocks.confirmImport.mockRejectedValue(new TypeError("Failed to fetch"));

    await act(async () => {
      button(mounted, "ยืนยันนำเข้า 1 รายการ").click();
    });

    const dialog = currentDialog(mounted);
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(dialog.textContent).not.toContain("นำเข้าผู้ป่วยใหม่แล้ว");
    const confirmButton = button(mounted, "ยืนยันนำเข้า 1 รายการ");
    expect(confirmButton.disabled).toBe(true);
    await act(async () => {
      confirmButton.click();
    });
    expect(mocks.confirmImport).toHaveBeenCalledTimes(1);
  });

  it("shows a retryable preview failure when the preview request cannot reach the server", async () => {
    mocks.previewImport.mockReset().mockRejectedValue(new TypeError("Failed to fetch"));
    const mounted = await openReviewDialog();

    expect(mounted.querySelector("dialog")).toBeNull();
    expect(mounted.textContent).toContain("เชื่อมต่อระบบไม่สำเร็จ");
    expect(button(mounted, "ตรวจสอบและแสดงตัวอย่าง").disabled).toBe(false);
  });

  it("keeps typed patient details after a rejected single provisioning", async () => {
    const mounted = container!;
    mocks.provision.mockResolvedValue({ status: "ERROR", code: "INVALID_INPUT", message: "เลขบัตรประชาชนไม่ถูกต้อง" });
    const givenName = mounted.querySelector<HTMLInputElement>('input[name="givenName"]')!;
    const familyName = mounted.querySelector<HTMLInputElement>('input[name="familyName"]')!;
    const nationalId = mounted.querySelector<HTMLInputElement>('input[name="nationalId"]')!;
    givenName.value = "สมชาย";
    familyName.value = "ใจดี";
    nationalId.value = "1234567890123";

    await act(async () => {
      button(mounted, "เพิ่มผู้ป่วย").click();
    });

    expect(mocks.provision).toHaveBeenCalledTimes(1);
    expect(mounted.textContent).toContain("เลขบัตรประชาชนไม่ถูกต้อง");
    expect(givenName.value).toBe("สมชาย");
    expect(nationalId.value).toBe("1234567890123");
  });
});

const otherHospitalId = "55555555-5555-4555-8555-555555555555";
const otherScope = { ...scope, hospitalId: otherHospitalId, hospitalName: "โรงพยาบาลอื่น" };
const relationshipId = "44444444-4444-4444-8444-444444444444";

function provisionSuccess(
  outcome: "CREATED" | "ALREADY_PROVISIONED",
  resultHospitalId = hospitalId,
): PatientProvisionActionState {
  return {
    status: "SUCCESS",
    result: {
      outcome,
      relationshipId,
      hospitalId: resultHospitalId,
      accountStatus: "PROVISIONED",
      reusedExistingUser: false,
      canOpenPatientDetail: true,
      canManagePatientActivation: true,
    },
  };
}

/** Keyed by Hospital like `page.tsx`, so a Hospital change remounts the Workspace. */
function renderWorkspace(selectedHospitalId: string): void {
  act(() => {
    root?.render(
      createElement(PatientProvisioningWorkspace, {
        key: selectedHospitalId,
        scopes: [scope, otherScope],
        selectedHospitalId,
        selectedScope: selectedHospitalId === hospitalId ? scope : otherScope,
      }),
    );
  });
}

function patientInput(mounted: HTMLElement, name: string): HTMLInputElement {
  const found = mounted.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!found) {
    throw new Error(`Missing input: ${name}`);
  }
  return found;
}

function fillPatient(mounted: HTMLElement, nationalId = "1234567890123"): void {
  patientInput(mounted, "givenName").value = "สมชาย";
  patientInput(mounted, "familyName").value = "ใจดี";
  patientInput(mounted, "nationalId").value = nationalId;
}

function provisionCall(index: number): FormData {
  const formData = mocks.provision.mock.calls[index]?.[1];
  if (!(formData instanceof FormData)) {
    throw new Error(`Missing provisioning call ${index}`);
  }
  return formData;
}

function allNotifications(): number {
  return (
    mocks.notifySuccess.mock.calls.length +
    mocks.notifyWarning.mock.calls.length +
    mocks.notifyError.mock.calls.length +
    mocks.notifyInfo.mock.calls.length
  );
}

const unconfirmedText = "ระบบยังยืนยันผลการดำเนินการไม่ได้";

describe("Single Patient provisioning Toast feedback", () => {
  it("emits one success Toast for a created Patient, resets the form and keeps continuation links", async () => {
    const mounted = container!;
    mocks.provision.mockResolvedValue(provisionSuccess("CREATED"));
    fillPatient(mounted);

    await act(async () => {
      button(mounted, "เพิ่มผู้ป่วย").click();
    });

    expect(mocks.notifySuccess).toHaveBeenCalledTimes(1);
    expect(mocks.notifySuccess).toHaveBeenCalledWith("เพิ่มข้อมูลผู้ป่วยแล้ว");
    expect(allNotifications()).toBe(1);
    expect(patientInput(mounted, "nationalId").value).toBe("");
    expect(mounted.querySelector(`a[href="/app/patients/${relationshipId}"]`)?.textContent).toBe("เปิดข้อมูลผู้ป่วย");
    expect(mounted.querySelector(`a[href="/app/patients/activation?hospitalId=${hospitalId}"]`)).not.toBeNull();

    renderWorkspace(hospitalId);
    await act(async () => {
      button(mounted, "นำเข้าจาก Excel").click();
    });
    await act(async () => {
      button(mounted, "เพิ่มรายบุคคล").click();
    });

    expect(mounted.textContent).toContain("เพิ่มข้อมูลผู้ป่วยแล้ว");
    expect(mocks.notifySuccess).toHaveBeenCalledTimes(1);
  });

  it("does not claim a new Patient for an already provisioned result", async () => {
    const mounted = container!;
    mocks.provision.mockResolvedValue(provisionSuccess("ALREADY_PROVISIONED"));
    fillPatient(mounted);

    await act(async () => {
      button(mounted, "เพิ่มผู้ป่วย").click();
    });

    expect(allNotifications()).toBe(0);
    expect(mounted.textContent).toContain("ผู้ป่วยรายนี้มีข้อมูลในโรงพยาบาลแล้ว");
    expect(mounted.textContent).not.toContain("เพิ่มข้อมูลผู้ป่วยแล้ว");
    expect(mounted.querySelector(`a[href="/app/patients/${relationshipId}"]`)).not.toBeNull();
  });

  it("keeps validation inline without a Toast", async () => {
    const mounted = container!;
    mocks.provision.mockResolvedValue({
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาตรวจสอบข้อมูลผู้ป่วยให้ถูกต้อง",
      fieldErrors: { nationalId: "เลขบัตรประชาชนต้องมี 13 หลัก" },
    });
    fillPatient(mounted);

    await act(async () => {
      button(mounted, "เพิ่มผู้ป่วย").click();
    });

    expect(allNotifications()).toBe(0);
    expect(mounted.textContent).toContain("เลขบัตรประชาชนต้องมี 13 หลัก");
    expect(patientInput(mounted, "nationalId").getAttribute("aria-invalid")).toBe("true");
    expect(patientInput(mounted, "nationalId").value).toBe("1234567890123");
  });

  it.each([
    ["CONFLICT", "warning", "ข้อมูลผู้ป่วยขัดแย้งกับข้อมูลเดิม กรุณาตรวจสอบ"],
    ["FORBIDDEN", "error", "ไม่มีสิทธิ์เพิ่มผู้ป่วยในโรงพยาบาลนี้"],
  ] as const)("maps a confirmed %s refusal to its static %s Toast and keeps the inline message", async (code, level, toast) => {
    const mounted = container!;
    const channel = level === "warning" ? mocks.notifyWarning : mocks.notifyError;
    const inlineMessage = "ข้อความจากเซิร์ฟเวอร์ที่แสดงในหน้า";
    mocks.provision.mockResolvedValue({ status: "ERROR", code, message: inlineMessage });
    fillPatient(mounted);

    await act(async () => {
      button(mounted, "เพิ่มผู้ป่วย").click();
    });

    expect(channel).toHaveBeenCalledTimes(1);
    expect(channel).toHaveBeenCalledWith(toast);
    expect(allNotifications()).toBe(1);
    expect(mounted.textContent).toContain(inlineMessage);
    expect(patientInput(mounted, "nationalId").value).toBe("1234567890123");
    expect(button(mounted, "เพิ่มผู้ป่วย").disabled).toBe(false);
  });

  it("treats a returned UNAVAILABLE as unconfirmed without a Toast or a failure claim", async () => {
    const mounted = container!;
    mocks.provision.mockResolvedValue({
      status: "ERROR",
      code: "UNAVAILABLE",
      message: "ระบบไม่พร้อมดำเนินการในขณะนี้ กรุณาลองใหม่อีกครั้ง",
    });
    fillPatient(mounted);

    await act(async () => {
      button(mounted, "เพิ่มผู้ป่วย").click();
    });

    expect(allNotifications()).toBe(0);
    expect(mounted.textContent).not.toContain("ระบบไม่พร้อมดำเนินการในขณะนี้");
    expect(mounted.querySelector('[role="alert"]')?.textContent).toContain(unconfirmedText);
    expect(patientInput(mounted, "nationalId").value).toBe("1234567890123");
    expect(button(mounted, "เพิ่มผู้ป่วย").disabled).toBe(true);
  });

  it("recovers a thrown request only by re-sending the exact original payload", async () => {
    const mounted = container!;
    mocks.provision.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    fillPatient(mounted);
    patientInput(mounted, "hospitalNumber").value = "HN-001";

    await act(async () => {
      button(mounted, "เพิ่มผู้ป่วย").click();
    });

    expect(allNotifications()).toBe(0);
    expect(mounted.querySelector('[role="alert"]')?.textContent).toContain(unconfirmedText);
    expect(patientInput(mounted, "nationalId").value).toBe("1234567890123");
    expect(button(mounted, "เพิ่มผู้ป่วย").disabled).toBe(true);
    await act(async () => {
      mounted.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(mocks.provision).toHaveBeenCalledTimes(1);

    patientInput(mounted, "nationalId").value = "9999999999999";
    mocks.provision.mockResolvedValueOnce(provisionSuccess("ALREADY_PROVISIONED"));
    await act(async () => {
      button(mounted, "ตรวจสอบผลด้วยคำขอเดิม").click();
    });

    expect(mocks.provision).toHaveBeenCalledTimes(2);
    expect(provisionCall(1)).toBe(provisionCall(0));
    expect(provisionCall(1).get("nationalId")).toBe("1234567890123");
    expect(provisionCall(1).get("hospitalNumber")).toBe("HN-001");
    expect(allNotifications()).toBe(0);
    expect(mounted.textContent).not.toContain(unconfirmedText);
    expect(mounted.textContent).toContain("ผู้ป่วยรายนี้มีข้อมูลในโรงพยาบาลแล้ว");
    expect(patientInput(mounted, "nationalId").value).toBe("9999999999999");
  });

  it("dispatches one Server Action for a rapid double submit", async () => {
    const mounted = container!;
    const pending = deferred<PatientProvisionActionState>();
    mocks.provision.mockReturnValue(pending.promise);
    fillPatient(mounted);

    act(() => {
      const form = mounted.querySelector("form")!;
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(mocks.provision).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(provisionSuccess("CREATED"));
      await pending.promise;
    });
    expect(mocks.provision).toHaveBeenCalledTimes(1);
    expect(mocks.notifySuccess).toHaveBeenCalledTimes(1);
  });

  it("blocks the Hospital selector while a request is in flight", async () => {
    renderWorkspace(hospitalId);
    const mounted = container!;
    const pending = deferred<PatientProvisionActionState>();
    mocks.provision.mockReturnValue(pending.promise);
    fillPatient(mounted);

    act(() => {
      button(mounted, "เพิ่มผู้ป่วย").click();
    });
    const selector = mounted.querySelector<HTMLSelectElement>("#targetHospitalId")!;
    expect(selector.disabled).toBe(true);

    await act(async () => {
      pending.resolve(provisionSuccess("CREATED"));
      await pending.promise;
    });
    expect(selector.disabled).toBe(false);
  });

  it("discards a response that settles after the Hospital key remounts the Workspace", async () => {
    renderWorkspace(hospitalId);
    const mounted = container!;
    const pending = deferred<PatientProvisionActionState>();
    mocks.provision.mockReturnValue(pending.promise);
    fillPatient(mounted);

    act(() => {
      button(mounted, "เพิ่มผู้ป่วย").click();
    });
    const formBeforeSwitch = mounted.querySelector("form");
    renderWorkspace(otherHospitalId);
    expect(mounted.querySelector("form")).not.toBe(formBeforeSwitch);
    expect(patientInput(mounted, "nationalId").value).toBe("");
    fillPatient(mounted, "1111111111111");

    await act(async () => {
      pending.resolve(provisionSuccess("CREATED"));
      await pending.promise;
    });

    expect(allNotifications()).toBe(0);
    expect(patientInput(mounted, "nationalId").value).toBe("1111111111111");
    expect(mounted.textContent).not.toContain("เพิ่มข้อมูลผู้ป่วยแล้ว");
    expect(mounted.querySelector('a[href^="/app/patients/activation"]')).toBeNull();
    expect(mounted.querySelector(`a[href="/app/patients/${relationshipId}"]`)).toBeNull();

    renderWorkspace(hospitalId);
    expect(mounted.textContent).not.toContain("เพิ่มข้อมูลผู้ป่วยแล้ว");
    expect(allNotifications()).toBe(0);
  });

  it("locks Hospital and mode switches until an unconfirmed outcome is resolved", async () => {
    renderWorkspace(hospitalId);
    const mounted = container!;
    mocks.provision.mockResolvedValueOnce({ status: "ERROR", code: "UNAVAILABLE", message: "ระบบไม่พร้อมดำเนินการในขณะนี้" });
    fillPatient(mounted);

    await act(async () => {
      button(mounted, "เพิ่มผู้ป่วย").click();
    });

    const selector = mounted.querySelector<HTMLSelectElement>("#targetHospitalId")!;
    expect(selector.disabled).toBe(true);
    await act(async () => {
      selector.value = otherHospitalId;
      selector.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(mocks.push).not.toHaveBeenCalled();

    const excelMode = button(mounted, "นำเข้าจาก Excel");
    expect(excelMode.disabled).toBe(true);
    await act(async () => {
      excelMode.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mounted.querySelector('[role="alert"]')?.textContent).toContain(unconfirmedText);
    expect(button(mounted, "ตรวจสอบผลด้วยคำขอเดิม").disabled).toBe(false);

    mocks.provision.mockResolvedValueOnce(provisionSuccess("ALREADY_PROVISIONED"));
    await act(async () => {
      button(mounted, "ตรวจสอบผลด้วยคำขอเดิม").click();
    });

    expect(provisionCall(1)).toBe(provisionCall(0));
    expect(mounted.textContent).not.toContain(unconfirmedText);
    expect(selector.disabled).toBe(false);
    expect(button(mounted, "นำเข้าจาก Excel").disabled).toBe(false);
  });

  it("locks the mode switch while a request is in flight so its recovery alert cannot be hidden", async () => {
    const mounted = container!;
    const pending = deferred<PatientProvisionActionState>();
    mocks.provision.mockReturnValue(pending.promise);
    fillPatient(mounted);

    act(() => {
      button(mounted, "เพิ่มผู้ป่วย").click();
    });
    await act(async () => {
      button(mounted, "นำเข้าจาก Excel").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(button(mounted, "นำเข้าจาก Excel").disabled).toBe(true);
    expect(mounted.querySelector('input[name="nationalId"]')).not.toBeNull();

    await act(async () => {
      pending.resolve({ status: "ERROR", code: "UNAVAILABLE", message: "ระบบไม่พร้อมดำเนินการในขณะนี้" });
      await pending.promise;
    });
    expect(mounted.querySelector('[role="alert"]')?.textContent).toContain(unconfirmedText);
  });

  it("treats a returned IDLE as unconfirmed without a Toast", async () => {
    const mounted = container!;
    mocks.provision.mockResolvedValue({ status: "IDLE" });
    fillPatient(mounted);

    await act(async () => {
      button(mounted, "เพิ่มผู้ป่วย").click();
    });

    expect(allNotifications()).toBe(0);
    expect(mounted.querySelector('[role="alert"]')?.textContent).toContain(unconfirmedText);
    expect(patientInput(mounted, "nationalId").value).toBe("1234567890123");
    expect(button(mounted, "เพิ่มผู้ป่วย").disabled).toBe(true);
  });

  it("keeps a draft edited while the request was pending", async () => {
    const mounted = container!;
    const pending = deferred<PatientProvisionActionState>();
    mocks.provision.mockReturnValue(pending.promise);
    fillPatient(mounted);

    act(() => {
      button(mounted, "เพิ่มผู้ป่วย").click();
    });
    patientInput(mounted, "nationalId").value = "2222222222222";

    await act(async () => {
      pending.resolve(provisionSuccess("CREATED"));
      await pending.promise;
    });

    expect(mocks.notifySuccess).toHaveBeenCalledTimes(1);
    expect(mounted.textContent).toContain("เพิ่มข้อมูลผู้ป่วยแล้ว");
    expect(patientInput(mounted, "nationalId").value).toBe("2222222222222");
    expect(patientInput(mounted, "givenName").value).toBe("สมชาย");
  });

  it("treats a success for a different Hospital as unconfirmed", async () => {
    const mounted = container!;
    mocks.provision.mockResolvedValue(provisionSuccess("CREATED", otherHospitalId));
    fillPatient(mounted);

    await act(async () => {
      button(mounted, "เพิ่มผู้ป่วย").click();
    });

    expect(allNotifications()).toBe(0);
    expect(mounted.textContent).not.toContain("เพิ่มข้อมูลผู้ป่วยแล้ว");
    expect(mounted.querySelector('[role="alert"]')?.textContent).toContain(unconfirmedText);
    expect(patientInput(mounted, "nationalId").value).toBe("1234567890123");
  });

  it("suppresses feedback for a response that arrives after unmount", async () => {
    const mounted = container!;
    const pending = deferred<PatientProvisionActionState>();
    mocks.provision.mockReturnValue(pending.promise);
    fillPatient(mounted);

    act(() => {
      button(mounted, "เพิ่มผู้ป่วย").click();
    });
    act(() => root?.unmount());
    root = null;

    await act(async () => {
      pending.resolve(provisionSuccess("CREATED"));
      await pending.promise;
    });
    expect(allNotifications()).toBe(0);
  });
});

type ImportRowResult = PatientImportResultSummary["rows"][number]["result"];

function importPreview(
  classifications: readonly PatientImportPreviewRow["classification"][],
  binding = "preview-binding",
): PatientImportPreviewBinding {
  return {
    ...preview,
    rows: classifications.map((classification, index) => previewRow(index + 2, classification)),
    previewBinding: binding,
  };
}

/** A summary whose counts are derived from its rows, as the import service builds it. */
function importResult(
  results: readonly ImportRowResult[],
  overrides: Partial<PatientImportResultSummary> = {},
): PatientImportActionState {
  const rows = results.map((result, index) => ({
    ...previewRow(index + 2, result === "IMPORTED" || result === "FAILED" ? "READY" : result),
    result,
  }));
  const count = (result: ImportRowResult) => rows.filter((row) => row.result === result).length;

  return {
    status: "SUCCESS",
    summary: {
      targetHospitalId: hospitalId,
      imported: count("IMPORTED"),
      alreadyExists: count("ALREADY_EXISTS"),
      duplicateInFile: count("DUPLICATE_IN_FILE"),
      invalid: count("INVALID"),
      conflict: count("CONFLICT"),
      failed: count("FAILED"),
      baselineCreated: 0,
      classificationCreated: 0,
      rows,
      file: null,
      ...overrides,
    },
  };
}

function confirmButton(mounted: HTMLElement): HTMLButtonElement {
  const found = Array.from(currentDialog(mounted).querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.startsWith("ยืนยันนำเข้า"),
  );
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error("Missing import confirmation button");
  }
  return found;
}

async function confirmImport(mounted: HTMLElement): Promise<void> {
  await act(async () => {
    confirmButton(mounted).click();
  });
}

/** The value shown under a summary label such as "นำเข้าผู้ป่วยใหม่". */
function summaryCount(mounted: HTMLElement, label: string): string | null {
  const term = Array.from(currentDialog(mounted).querySelectorAll("dt")).find(
    (candidate) => candidate.textContent === label,
  );
  return term?.nextElementSibling?.textContent ?? null;
}

function effectiveDateInput(mounted: HTMLElement): HTMLInputElement {
  const found = mounted.querySelector<HTMLInputElement>("#patient-import-effective-date");
  if (!found) {
    throw new Error("Missing effective date input");
  }
  return found;
}

function setInputValue(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function submitPreview(mounted: HTMLElement): Promise<void> {
  await act(async () => {
    const form = mounted.querySelector<HTMLFormElement>('form[enctype="multipart/form-data"]');
    if (!form) {
      throw new Error("Missing patient import preview form");
    }
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

function confirmCall(index: number): FormData {
  const formData = mocks.confirmImport.mock.calls[index]?.[0];
  if (!(formData instanceof FormData)) {
    throw new Error(`Missing import confirmation call ${index}`);
  }
  return formData;
}

const importFailureHeading = "นำเข้าไม่สำเร็จ";
const importForbiddenToast = "ไม่มีสิทธิ์นำเข้าผู้ป่วยของโรงพยาบาลนี้";

describe("Excel Patient import preview feedback", () => {
  it("opens the review dialog for a preview without a Toast", async () => {
    const mounted = await openReviewDialog();

    expect(currentDialog(mounted).querySelector("h2")?.textContent).toBe("ตรวจสอบก่อนนำเข้า");
    expect(allNotifications()).toBe(0);
    expect(mocks.confirmImport).not.toHaveBeenCalled();
  });

  it("keeps preview validation inline without a Toast", async () => {
    mocks.previewImport.mockReset().mockResolvedValue({
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "ไฟล์ไม่ตรงกับไฟล์ตัวอย่างของโรงพยาบาลนี้",
    });
    const mounted = await openReviewDialog();

    expect(mounted.querySelector("dialog")).toBeNull();
    expect(mounted.textContent).toContain("ไฟล์ไม่ตรงกับไฟล์ตัวอย่างของโรงพยาบาลนี้");
    expect(mounted.textContent).toContain("patients.xlsx");
    expect(allNotifications()).toBe(0);
  });

  it("maps a confirmed preview FORBIDDEN to its static error Toast and keeps the inline message", async () => {
    mocks.previewImport.mockReset().mockResolvedValue({
      status: "ERROR",
      code: "FORBIDDEN",
      message: "บัญชีนี้ไม่มีสิทธิ์เพิ่มผู้ป่วยในโรงพยาบาลนี้",
    });
    const mounted = await openReviewDialog();

    expect(mocks.notifyError).toHaveBeenCalledTimes(1);
    expect(mocks.notifyError).toHaveBeenCalledWith("ไม่มีสิทธิ์ตรวจสอบไฟล์ผู้ป่วยของโรงพยาบาลนี้");
    expect(allNotifications()).toBe(1);
    expect(mounted.textContent).toContain("บัญชีนี้ไม่มีสิทธิ์เพิ่มผู้ป่วยในโรงพยาบาลนี้");
    expect(mounted.querySelector("dialog")).toBeNull();
  });

  it.each([
    ["returned UNAVAILABLE", () => mocks.previewImport.mockResolvedValue({ status: "ERROR", code: "UNAVAILABLE", message: "ระบบไม่พร้อมดำเนินการในขณะนี้ กรุณาลองใหม่อีกครั้ง" })],
    ["thrown request", () => mocks.previewImport.mockRejectedValue(new TypeError("Failed to fetch"))],
  ] as const)("keeps a %s preview retryable without a Toast", async (_label, arrange) => {
    mocks.previewImport.mockReset();
    arrange();
    const mounted = await openReviewDialog();

    expect(allNotifications()).toBe(0);
    expect(mounted.querySelector("dialog")).toBeNull();
    expect(mounted.textContent).toContain("patients.xlsx");
    expect(button(mounted, "ตรวจสอบและแสดงตัวอย่าง").disabled).toBe(false);
  });

  it("invalidates a checked preview when the effective date changes, without a Toast", async () => {
    const mounted = await openReviewDialog();
    await act(async () => {
      button(mounted, "ยกเลิก").click();
    });
    expect(button(mounted, "เปิดหน้าตรวจสอบ")).toBeDefined();

    act(() => setInputValue(effectiveDateInput(mounted), "2026-01-15"));

    expect(effectiveDateInput(mounted).value).toBe("2026-01-15");
    expect(mounted.textContent).not.toContain("เปิดหน้าตรวจสอบ");
    expect(mounted.querySelector("dialog")).toBeNull();
    expect(mounted.textContent).toContain("patients.xlsx");
    expect(allNotifications()).toBe(0);
  });

  it("discards a preview that settles after the Hospital key remounts the Workspace", async () => {
    renderWorkspace(hospitalId);
    const pending = deferred<unknown>();
    mocks.previewImport.mockReset().mockReturnValue(pending.promise);
    const mounted = await openReviewDialog();

    renderWorkspace(otherHospitalId);
    await act(async () => {
      pending.resolve({ status: "ERROR", code: "FORBIDDEN", message: "บัญชีนี้ไม่มีสิทธิ์" });
      await pending.promise;
    });

    expect(allNotifications()).toBe(0);
    expect(mounted.querySelector("dialog")).toBeNull();
    expect(mounted.textContent).not.toContain("บัญชีนี้ไม่มีสิทธิ์");
  });
});

describe("Excel Patient import confirmation Toast feedback", () => {
  it.each([
    {
      name: "all new rows imported",
      preview: ["READY", "READY"],
      results: ["IMPORTED", "IMPORTED"],
      level: "success",
      toast: "นำเข้าข้อมูลผู้ป่วยแล้ว",
      heading: "นำเข้าผู้ป่วยใหม่แล้ว",
      imported: "2",
    },
    {
      name: "new rows imported with attention rows",
      preview: ["READY", "INVALID"],
      results: ["IMPORTED", "INVALID"],
      level: "warning",
      toast: "นำเข้าได้บางรายการ กรุณาตรวจสอบผลรายแถว",
      heading: "นำเข้าผู้ป่วยใหม่แล้ว และยังมีบางรายการที่ต้องแก้ไข",
      imported: "1",
    },
    {
      name: "only existing Patients",
      preview: ["READY", "ALREADY_EXISTS"],
      results: ["ALREADY_EXISTS", "ALREADY_EXISTS"],
      level: null,
      toast: null,
      heading: "ไม่มีผู้ป่วยใหม่ในไฟล์นี้",
      imported: "0",
    },
    {
      name: "no new rows with attention rows",
      preview: ["READY", "INVALID"],
      results: ["FAILED", "INVALID"],
      level: "warning",
      toast: "ยังไม่มีผู้ป่วยใหม่ที่นำเข้าได้ กรุณาตรวจสอบผลรายแถว",
      heading: "ยังไม่มีรายการที่บันทึกได้",
      imported: "0",
    },
    {
      name: "existing Patients mixed with attention rows",
      preview: ["READY", "READY"],
      results: ["ALREADY_EXISTS", "FAILED"],
      level: "warning",
      toast: "ยังไม่มีผู้ป่วยใหม่ที่นำเข้าได้ กรุณาตรวจสอบผลรายแถว",
      heading: "ยังไม่มีรายการที่บันทึกได้",
      imported: "0",
    },
  ] as const)("classifies $name from the final rows", async (scenario) => {
    mocks.previewImport.mockReset().mockResolvedValue({ status: "SUCCESS", preview: importPreview(scenario.preview) });
    mocks.confirmImport.mockResolvedValue(importResult(scenario.results));
    const mounted = await openReviewDialog();

    await confirmImport(mounted);

    const dialog = currentDialog(mounted);
    expect(dialog.querySelector("h2")?.textContent).toBe("ผลการนำเข้าผู้ป่วย");
    expect(dialog.textContent).toContain(scenario.heading);
    expect(summaryCount(mounted, "นำเข้าผู้ป่วยใหม่")).toBe(scenario.imported);
    if (scenario.imported === "0") {
      expect(dialog.textContent).not.toContain("นำเข้าผู้ป่วยใหม่แล้ว");
    }
    if (scenario.level === null) {
      expect(allNotifications()).toBe(0);
    } else {
      const channel = scenario.level === "success" ? mocks.notifySuccess : mocks.notifyWarning;
      expect(channel).toHaveBeenCalledTimes(1);
      expect(channel).toHaveBeenCalledWith(scenario.toast);
      expect(allNotifications()).toBe(1);
    }
  });

  it("counts neither FAILED rows nor baseline and classification records as imported Patients", async () => {
    mocks.previewImport.mockReset().mockResolvedValue({ status: "SUCCESS", preview: importPreview(["READY", "READY"]) });
    mocks.confirmImport.mockResolvedValue(
      importResult(["IMPORTED", "FAILED"], { baselineCreated: 1, classificationCreated: 1 }),
    );
    const mounted = await openReviewDialog();

    await confirmImport(mounted);

    expect(summaryCount(mounted, "นำเข้าผู้ป่วยใหม่")).toBe("1");
    expect(summaryCount(mounted, "บันทึกไม่สำเร็จ")).toBe("1");
    expect(mocks.notifyWarning).toHaveBeenCalledWith("นำเข้าได้บางรายการ กรุณาตรวจสอบผลรายแถว");
    expect(mocks.notifySuccess).not.toHaveBeenCalled();
    expect(currentDialog(mounted).textContent).toContain("สมหญิง");

    await act(async () => {
      button(mounted, "ดาวน์โหลดแถวที่ต้องแก้ไข").click();
    });
    expect(mocks.downloadFailedRows).toHaveBeenCalledWith(expect.objectContaining({ failedRowNumbers: [3] }));
    expect(currentDialog(mounted).querySelector('a[href^="/app/patients?hospitalId="]')).not.toBeNull();
  });

  it("maps a confirmed import FORBIDDEN to its error Toast without claiming nothing was saved", async () => {
    mocks.confirmImport.mockResolvedValue({
      status: "ERROR",
      code: "FORBIDDEN",
      message: "บัญชีนี้ไม่มีสิทธิ์เพิ่มผู้ป่วยในโรงพยาบาลนี้",
    });
    const mounted = await openReviewDialog();

    await confirmImport(mounted);

    expect(mocks.notifyError).toHaveBeenCalledTimes(1);
    expect(mocks.notifyError).toHaveBeenCalledWith(importForbiddenToast);
    expect(allNotifications()).toBe(1);
    const dialog = currentDialog(mounted);
    expect(dialog.textContent).toContain(importForbiddenToast);
    expect(dialog.textContent).toContain("บางรายการอาจถูกบันทึกไปแล้ว");
    expect(dialog.textContent).not.toContain(importFailureHeading);
    expect(confirmButton(mounted).disabled).toBe(true);
    await act(async () => {
      confirmButton(mounted).click();
    });
    expect(mocks.confirmImport).toHaveBeenCalledTimes(1);
  });

  it("keeps a confirmation INVALID_INPUT inline with the file and preview retained", async () => {
    mocks.confirmImport.mockResolvedValue({
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "ไฟล์ โรงพยาบาล วันที่ข้อมูลตั้งต้น หรือรูปแบบนำเข้าเปลี่ยนแปลงแล้ว กรุณาตรวจสอบใหม่ก่อนยืนยันนำเข้า",
    });
    const mounted = await openReviewDialog();

    await confirmImport(mounted);

    expect(allNotifications()).toBe(0);
    const dialog = currentDialog(mounted);
    expect(dialog.textContent).toContain(importFailureHeading);
    expect(dialog.textContent).toContain("กรุณาตรวจสอบใหม่ก่อนยืนยันนำเข้า");
    expect(dialog.textContent).toContain("patients.xlsx");
    expect(dialog.querySelector("table")).not.toBeNull();
    expect(dialog.textContent).not.toContain(unconfirmedText);
    expect(confirmButton(mounted).disabled).toBe(true);
    await act(async () => {
      confirmButton(mounted).click();
    });
    expect(mocks.confirmImport).toHaveBeenCalledTimes(1);
    expect(button(mounted, "เพิ่มรายบุคคล").disabled).toBe(false);

    await act(async () => {
      button(mounted, "ยกเลิก").click();
    });
    mocks.previewImport.mockResolvedValueOnce({ status: "SUCCESS", preview: importPreview(["READY", "INVALID"], "fresh-binding") });
    mocks.confirmImport.mockResolvedValue(importResult(["IMPORTED", "INVALID"]));
    await submitPreview(mounted);
    expect(confirmButton(mounted).disabled).toBe(false);
    await confirmImport(mounted);

    expect(confirmCall(1).get("previewBinding")).toBe("fresh-binding");
    expect(mocks.notifyWarning).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["counts that disagree with the rows", importResult(["IMPORTED", "INVALID"], { imported: 2 })],
    ["a summary for another Hospital", importResult(["IMPORTED", "INVALID"], { targetHospitalId: otherHospitalId })],
    ["rows that do not match the preview", importResult(["IMPORTED"])],
    ["baseline records beyond the imported Patients", importResult(["IMPORTED", "INVALID"], { baselineCreated: 2 })],
    ["a null summary", { status: "SUCCESS", summary: null }],
    ["a null row", (() => {
      const response = importResult(["IMPORTED", "INVALID"]);
      return response.status === "SUCCESS"
        ? { ...response, summary: { ...response.summary, rows: [response.summary.rows[0], null] } }
        : response;
    })()],
    ["a row without a result", (() => {
      const response = importResult(["IMPORTED", "INVALID"]);
      return response.status === "SUCCESS"
        ? { ...response, summary: { ...response.summary, rows: [response.summary.rows[0], {}] } }
        : response;
    })()],
    ["a non-numeric count", importResult(["IMPORTED", "INVALID"], { failed: Number.NaN })],
  ] as const)("treats a success with %s as unconfirmed without a Toast", async (_label, response) => {
    mocks.confirmImport.mockResolvedValue(response);
    const mounted = await openReviewDialog();

    await confirmImport(mounted);

    expect(allNotifications()).toBe(0);
    const dialog = currentDialog(mounted);
    expect(dialog.querySelector("h2")?.textContent).toBe("ตรวจสอบก่อนนำเข้า");
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain(unconfirmedText);
    expect(confirmButton(mounted).disabled).toBe(true);
  });
});

describe("Excel Patient import unconfirmed outcome", () => {
  it.each([
    ["returned UNAVAILABLE", () => mocks.confirmImport.mockResolvedValue({ status: "ERROR", code: "UNAVAILABLE", message: "ระบบไม่พร้อมดำเนินการในขณะนี้ กรุณาลองใหม่อีกครั้ง" })],
    ["thrown request", () => mocks.confirmImport.mockRejectedValue(new TypeError("Failed to fetch"))],
    ["returned IDLE", () => mocks.confirmImport.mockResolvedValue({ status: "IDLE" })],
  ] as const)("keeps a %s unconfirmed without a Toast or a failure claim", async (_label, arrange) => {
    arrange();
    const mounted = await openReviewDialog();

    await confirmImport(mounted);

    expect(allNotifications()).toBe(0);
    const dialog = currentDialog(mounted);
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain(unconfirmedText);
    expect(dialog.textContent).toContain("บางรายการอาจถูกบันทึกไปแล้ว");
    expect(dialog.textContent).not.toContain(importFailureHeading);
    expect(dialog.textContent).not.toContain("ระบบไม่พร้อมดำเนินการในขณะนี้");
    expect(dialog.textContent).toContain("patients.xlsx");
    expect(confirmButton(mounted).disabled).toBe(true);
    await act(async () => {
      confirmButton(mounted).click();
    });
    expect(mocks.confirmImport).toHaveBeenCalledTimes(1);
  });

  it("locks file, date, mode and Hospital until a fresh preview of the same file, then allows a new confirmation", async () => {
    renderWorkspace(hospitalId);
    mocks.confirmImport.mockResolvedValueOnce({ status: "ERROR", code: "UNAVAILABLE", message: "ระบบไม่พร้อมดำเนินการในขณะนี้" });
    const mounted = await openReviewDialog();

    await confirmImport(mounted);
    await act(async () => {
      button(mounted, "ยกเลิก").click();
    });

    expect(mounted.querySelector("dialog")).toBeNull();
    expect(mounted.textContent).toContain(unconfirmedText);
    expect(mounted.textContent).toContain("บางรายการอาจถูกบันทึกไปแล้ว");
    expect(mounted.textContent).not.toContain("ปิดหน้าต่างนี้");
    expect(mounted.textContent).not.toContain("ยังไม่ได้นำเข้า");
    expect(mounted.querySelector<HTMLInputElement>("#patient-import-file")?.disabled).toBe(true);
    expect(effectiveDateInput(mounted).disabled).toBe(true);
    expect(button(mounted, "ล้างไฟล์").disabled).toBe(true);
    expect(button(mounted, "เพิ่มรายบุคคล").disabled).toBe(true);
    const selector = mounted.querySelector<HTMLSelectElement>("#targetHospitalId")!;
    expect(selector.disabled).toBe(true);
    await act(async () => {
      selector.value = otherHospitalId;
      selector.dispatchEvent(new Event("change", { bubbles: true }));
      button(mounted, "เพิ่มรายบุคคล").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mounted.textContent).toContain("patients.xlsx");

    mocks.previewImport.mockResolvedValueOnce({ status: "ERROR", code: "UNAVAILABLE", message: "ระบบไม่พร้อมดำเนินการในขณะนี้" });
    await submitPreview(mounted);
    expect(mounted.textContent).toContain(unconfirmedText);
    expect(effectiveDateInput(mounted).disabled).toBe(true);

    mocks.previewImport.mockResolvedValueOnce({
      status: "SUCCESS",
      preview: importPreview(["ALREADY_EXISTS", "READY"], "fresh-binding"),
    });
    await submitPreview(mounted);

    const recheckDialog = currentDialog(mounted);
    expect(recheckDialog.textContent).toContain("ไฟล์นี้อาจถูกนำเข้าไปแล้วบางส่วนจากคำขอก่อนหน้า");
    expect(recheckDialog.textContent).not.toContain(unconfirmedText);
    expect(mocks.confirmImport).toHaveBeenCalledTimes(1);
    const recheckRequest = mocks.previewImport.mock.calls.at(-1)?.[0];
    expect(recheckRequest).toBeInstanceOf(FormData);
    for (const field of ["targetHospitalId", "effectiveDate"]) {
      expect((recheckRequest as FormData).get(field)).toBe(confirmCall(0).get(field));
    }
    expect(((recheckRequest as FormData).get("file") as File).name).toBe((confirmCall(0).get("file") as File).name);
    // The fresh preview resolved the unconfirmed state, so the switches are released.
    expect(selector.disabled).toBe(false);

    mocks.confirmImport.mockResolvedValueOnce(importResult(["ALREADY_EXISTS", "IMPORTED"]));
    await confirmImport(mounted);

    expect(confirmCall(1).get("previewBinding")).toBe("fresh-binding");
    expect(mocks.notifySuccess).toHaveBeenCalledTimes(1);
    expect(mocks.notifySuccess).toHaveBeenCalledWith("นำเข้าข้อมูลผู้ป่วยแล้ว");
    expect(button(mounted, "เพิ่มรายบุคคล").disabled).toBe(false);
    expect(selector.disabled).toBe(false);
  });
});

describe("Excel Patient import concurrency and context", () => {
  it("sends one confirmation for a rapid double click", async () => {
    const pending = deferred<PatientImportActionState>();
    mocks.confirmImport.mockReturnValue(pending.promise);
    const mounted = await openReviewDialog();
    const confirm = confirmButton(mounted);

    act(() => {
      confirm.click();
      confirm.click();
    });
    expect(mocks.confirmImport).toHaveBeenCalledTimes(1);
    expect(button(mounted, "เพิ่มรายบุคคล").disabled).toBe(true);

    await act(async () => {
      pending.resolve(importResult(["IMPORTED", "INVALID"]));
      await pending.promise;
    });
    expect(mocks.confirmImport).toHaveBeenCalledTimes(1);
    expect(mocks.notifyWarning).toHaveBeenCalledTimes(1);
  });

  it("discards a confirmation that settles after the Hospital key remounts the Workspace", async () => {
    renderWorkspace(hospitalId);
    const pending = deferred<PatientImportActionState>();
    mocks.confirmImport.mockReturnValue(pending.promise);
    const mounted = await openReviewDialog();

    act(() => {
      confirmButton(mounted).click();
    });
    renderWorkspace(otherHospitalId);
    await act(async () => {
      pending.resolve(importResult(["IMPORTED", "INVALID"]));
      await pending.promise;
    });

    expect(allNotifications()).toBe(0);
    expect(mounted.querySelector("dialog")).toBeNull();
    renderWorkspace(hospitalId);
    expect(mounted.querySelector("dialog")).toBeNull();
    expect(mounted.textContent).not.toContain("นำเข้าผู้ป่วยใหม่แล้ว");
    expect(allNotifications()).toBe(0);
  });

  it("suppresses feedback for a confirmation that settles after unmount", async () => {
    const pending = deferred<PatientImportActionState>();
    mocks.confirmImport.mockReturnValue(pending.promise);
    const mounted = await openReviewDialog();

    act(() => {
      confirmButton(mounted).click();
    });
    act(() => root?.unmount());
    root = null;

    await act(async () => {
      pending.resolve(importResult(["IMPORTED", "INVALID"]));
      await pending.promise;
    });
    expect(allNotifications()).toBe(0);
  });

  it("does not replay a Toast on rerender or result reopen, and gives a new explicit import its own Toast", async () => {
    mocks.confirmImport.mockResolvedValue(importResult(["IMPORTED", "INVALID"]));
    const mounted = await openReviewDialog();

    await confirmImport(mounted);
    expect(mocks.notifyWarning).toHaveBeenCalledTimes(1);

    act(() => {
      root?.render(
        createElement(PatientProvisioningWorkspace, {
          key: hospitalId,
          scopes: [scope],
          selectedHospitalId: hospitalId,
          selectedScope: scope,
        }),
      );
    });
    await act(async () => {
      button(mounted, "ปิด").click();
    });
    await act(async () => {
      button(mounted, "ดูผลการนำเข้า").click();
    });
    expect(currentDialog(mounted).querySelector("h2")?.textContent).toBe("ผลการนำเข้าผู้ป่วย");
    expect(allNotifications()).toBe(1);

    await act(async () => {
      button(mounted, "นำเข้าไฟล์ใหม่").click();
    });
    expect(mounted.querySelector("dialog")).toBeNull();
    expect(mounted.textContent).not.toContain("patients.xlsx");

    mocks.confirmImport.mockResolvedValue(importResult(["IMPORTED", "INVALID"]));
    await openReviewDialog();
    await confirmImport(mounted);

    expect(mocks.confirmImport).toHaveBeenCalledTimes(2);
    expect(mocks.notifyWarning).toHaveBeenCalledTimes(2);
  });
});
