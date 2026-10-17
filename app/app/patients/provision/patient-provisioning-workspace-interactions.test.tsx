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

function renderWorkspace(selectedHospitalId: string): void {
  act(() => {
    root?.render(
      createElement(PatientProvisioningWorkspace, {
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

  it("discards a stale success after the Hospital context changes", async () => {
    renderWorkspace(hospitalId);
    const mounted = container!;
    const pending = deferred<PatientProvisionActionState>();
    mocks.provision.mockReturnValue(pending.promise);
    fillPatient(mounted);

    act(() => {
      button(mounted, "เพิ่มผู้ป่วย").click();
    });
    renderWorkspace(otherHospitalId);
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
  });

  it("keeps a stale unconfirmed outcome bound to its own Hospital", async () => {
    renderWorkspace(hospitalId);
    const mounted = container!;
    const pending = deferred<PatientProvisionActionState>();
    mocks.provision.mockReturnValue(pending.promise);
    fillPatient(mounted);

    act(() => {
      button(mounted, "เพิ่มผู้ป่วย").click();
    });
    renderWorkspace(otherHospitalId);
    await act(async () => {
      pending.resolve({ status: "ERROR", code: "UNAVAILABLE", message: "ระบบไม่พร้อมดำเนินการในขณะนี้" });
      await pending.promise;
    });

    expect(allNotifications()).toBe(0);
    expect(mounted.textContent).not.toContain(unconfirmedText);
    expect(button(mounted, "เพิ่มผู้ป่วย").disabled).toBe(false);

    renderWorkspace(hospitalId);
    expect(mounted.querySelector('[role="alert"]')?.textContent).toContain(unconfirmedText);
    expect(button(mounted, "เพิ่มผู้ป่วย").disabled).toBe(true);
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
