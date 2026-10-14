// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  confirmImport: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  downloadFailedRows: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  previewImport: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  provision: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  push: vi.fn<(href: string) => void>(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/modules/patient-provisioning/transport/server-actions", () => ({
  confirmPatientImportAction: mocks.confirmImport,
  previewPatientImportAction: mocks.previewImport,
  provisionPatientAction: mocks.provision,
}));
vi.mock("@/modules/patient-provisioning/transport/patient-import-failed-rows-client", () => ({
  downloadPatientImportFailedRows: mocks.downloadFailedRows,
}));

import { PATIENT_IMPORT_CONTRACT_VERSION } from "@/modules/patient-provisioning/import/patient-import-contract";
import type {
  PatientImportActionState,
  PatientImportPreviewBinding,
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

    const downloadButton = button(mounted, "ดาวน์โหลดแถวที่ไม่ผ่าน");
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
    expect(resultDialog.textContent).toContain("นำเข้าผู้ป่วยใหม่เรียบร้อยแล้ว");
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
    expect(reopenedDialog.textContent).toContain("นำเข้าผู้ป่วยใหม่เรียบร้อยแล้ว");
    expect(reopenedDialog.textContent).toContain("สมหญิง");
    expect(document.activeElement).toBe(reopenedDialog.querySelector("h2"));
  });
});
