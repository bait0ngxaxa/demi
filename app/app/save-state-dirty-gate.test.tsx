// @vitest-environment jsdom
// SAVE-STATE (2026-11-18): an edit form that stays on the page after saving gates its submit on unsaved
// changes, so "บันทึกแล้ว" never sits next to an enabled submit holding the data just saved.

import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminLegalVersionView } from "@/modules/legal/transport/legal-admin-context";
import type { PatientHospitalProfileDetail } from "@/modules/patient-hospital-profile/services/patient-hospital-profile-service";

const mocks = vi.hoisted(() => ({
  name: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  profile: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  health: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  ownProfile: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  score: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  email: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  draft: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: mocks.refresh }), unstable_rethrow: vi.fn() }));
vi.mock("@/components/ui/notify", () => ({ notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/modules/patient-hospital-profile/transport/hospital-patient-edit-actions", () => ({
  correctPatientNameAction: (_relationshipId: string, ...args: unknown[]) => mocks.name(...args),
  savePatientHealthHistoryAction: (_relationshipId: string, ...args: unknown[]) => mocks.health(...args),
  saveStaffPatientHospitalProfileAction: (_relationshipId: string, ...args: unknown[]) => mocks.profile(...args),
}));
vi.mock("@/modules/user-management/transport/server-actions", () => ({ correctWorkforcePersonNameAction: vi.fn() }));
vi.mock("@/modules/patient-hospital-profile/transport/server-actions", () => ({
  updateOwnPatientHospitalProfileAction: (_relationshipId: string, ...args: unknown[]) => mocks.ownProfile(...args),
}));
vi.mock("@/modules/patient-program-rounds/transport/server-actions", () => ({ recordRoundAchieveScoreAction: mocks.score }));
vi.mock("@/modules/account-settings/transport/server-actions", () => ({
  saveOwnContactEmailAction: mocks.email,
  setMedicationLineRemindersAction: vi.fn(),
}));
vi.mock("@/modules/legal/transport/server-actions", () => ({
  createLegalDraftAction: vi.fn(),
  updateLegalDraftAction: mocks.draft,
  lookupUserLegalHistoryAction: vi.fn(),
  publishLegalVersionAction: vi.fn(),
}));

import { LegalDraftEditor } from "./admin/legal/legal-admin-forms";
import { HospitalPatientEditForm } from "./patients/[relationshipId]/hospital-patient-edit-form";
import { RoundAchieveScoreForm } from "./patients/[relationshipId]/programs/[programId]/rounds/[roundNumber]/round-achieve-score-form";
import { PatientNameCorrectionForm } from "./patients/patient-name-correction-form";
import { PatientHospitalProfileEditor } from "./personal/profile/[relationshipId]/profile-editor";
import { ContactSettingsForm } from "./settings/contact-settings-form";

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(element: ReactElement): void {
  act(() => root.render(element));
}

/** A field by `name`, or by CSS selector when it starts with `#`. */
function field(name: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  const found = container.querySelector<HTMLInputElement>(name.startsWith("#") ? name : `[name="${name}"]`);
  if (!found) throw new Error(`Missing field: ${name}`);
  return found;
}

function type(name: string, value: string): void {
  const element = field(name);
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function submitButton(): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!found) throw new Error("Missing submit button");
  return found;
}

async function submit(): Promise<void> {
  await act(async () => {
    submitButton().click();
  });
}

const relationshipId = "11111111-1111-4111-8111-111111111111";
const ownProfile = {
  relationshipId,
  hospitalName: "โรงพยาบาล ก",
  person: { givenName: "สมชาย", familyName: "ใจดี" },
  profile: {
    gender: null, phoneNumber: "0812345678", addressText: null, emergencyContactName: null,
    emergencyContactPhone: null, occupation: "ค้าขาย", educationLevel: null,
  },
  emergencyContactRelationship: null,
  source: "HOSPITAL_LOCAL",
  version: 5,
} as unknown as PatientHospitalProfileDetail;
const roundTarget = { patientHospitalRelationshipId: relationshipId, patientProgramId: "program-1", roundNumber: 1 };
const roundSuccess = {
  status: "SUCCESS",
  result: { operation: "RECORDED", patientProgramId: "program-1", patientHospitalRelationshipId: relationshipId, roundNumber: 1 },
};

type GatedForm = {
  element: () => ReactElement;
  action: (typeof mocks)["name"];
  edit: [name: string, first: string, second: string];
  success: unknown;
  successText: string;
};

describe.each<[string, GatedForm]>([
  ["S1 name correction", {
    element: () => createElement(PatientNameCorrectionForm, { relationshipId, version: 2, givenName: "สมชาย", familyName: "ใจดี" }),
    action: mocks.name,
    edit: ["givenName", "สมหญิง", "สมศรี"],
    success: { status: "SUCCESS", message: "บันทึกชื่อ-สกุลแล้ว" },
    successText: "บันทึกชื่อ-สกุลแล้ว",
  }],
  ["S2 staff profile", {
    element: () => createElement(HospitalPatientEditForm, { health: false, relationshipId, values: { phoneNumber: "0800000000" }, version: 3 }),
    action: mocks.profile,
    edit: ["phoneNumber", "0811111111", "0822222222"],
    success: { status: "SUCCESS", message: "บันทึกข้อมูลผู้ป่วยแล้ว" },
    successText: "บันทึกข้อมูลผู้ป่วยแล้ว",
  }],
  ["S2 health history", {
    element: () => createElement(HospitalPatientEditForm, { health: true, relationshipId, values: {}, version: 1 }),
    action: mocks.health,
    edit: ["otherConditions", "ไขมันในเลือดสูง", "หอบหืด"],
    success: { status: "SUCCESS", message: "บันทึกประวัติสุขภาพแล้ว" },
    successText: "บันทึกประวัติสุขภาพแล้ว",
  }],
  ["S3 own hospital profile", {
    element: () => createElement(PatientHospitalProfileEditor, { profile: ownProfile }),
    action: mocks.ownProfile,
    edit: ["occupation", "รับจ้าง", "เกษตรกร"],
    success: { status: "SUCCESS", message: "บันทึกข้อมูลสำหรับโรงพยาบาลนี้แล้ว" },
    successText: "บันทึกข้อมูลสำหรับโรงพยาบาลนี้แล้ว",
  }],
  ["S4 Achieve score", {
    element: () => createElement(RoundAchieveScoreForm, {
      achieveScore: { editable: true, score: 60, computedRatePercent: null },
      submissionNonce: "nonce-1",
      target: roundTarget,
    }),
    action: mocks.score,
    // A blank score clears the saved one, so it is a change.
    edit: ["score", "", "75"],
    success: roundSuccess,
    successText: "บันทึก Achieve score แล้ว",
  }],
])("%s", (_label, form) => {
  it("submits only unsaved changes and hides the success once the user edits again", async () => {
    render(form.element());
    const [name, first, second] = form.edit;
    expect(submitButton().disabled).toBe(true);

    type(name, first);
    expect(submitButton().disabled).toBe(false);

    form.action.mockResolvedValueOnce(form.success);
    await submit();
    expect(form.action).toHaveBeenCalledTimes(1);
    expect(submitButton().disabled).toBe(true);
    expect(container.textContent).toContain(form.successText);

    type(name, second);
    expect(submitButton().disabled).toBe(false);
    expect(container.textContent).not.toContain(form.successText);

    form.action.mockResolvedValueOnce({ status: "ERROR", code: "INVALID_INPUT", message: "ข้อมูลไม่ถูกต้อง" });
    await submit();
    expect(container.textContent).toContain("ข้อมูลไม่ถูกต้อง");
    expect(submitButton().disabled).toBe(false);
  });
});

describe("S3 own hospital profile from the legacy profile", () => {
  it("can save the shown values unchanged, because they are not saved for this hospital yet", () => {
    render(createElement(PatientHospitalProfileEditor, { profile: { ...ownProfile, source: "LEGACY_FALLBACK" } }));
    expect(submitButton().disabled).toBe(false);
  });
});

describe("S5 contact email", () => {
  it("submits only a changed email and hides the success once the user edits again", async () => {
    render(createElement(ContactSettingsForm, { initial: { email: "old@example.test", version: 3 }, patient: null }));
    expect(submitButton().disabled).toBe(true);

    type("#contact-email", "new@example.test");
    expect(submitButton().disabled).toBe(false);

    mocks.email.mockResolvedValueOnce({ status: "SUCCESS", email: "new@example.test", version: 4 });
    await submit();
    expect(mocks.email).toHaveBeenCalledWith({ email: "new@example.test", expectedVersion: 3 });
    expect(submitButton().disabled).toBe(true);
    expect(container.textContent).toContain("บันทึกอีเมลติดต่อแล้ว");

    type("#contact-email", "other@example.test");
    expect(submitButton().disabled).toBe(false);
    expect(container.textContent).not.toContain("บันทึกอีเมลติดต่อแล้ว");

    mocks.email.mockResolvedValueOnce({ status: "ERROR", code: "VALIDATION", message: "อีเมลไม่ถูกต้อง" });
    await submit();
    expect(mocks.email).toHaveBeenLastCalledWith({ email: "other@example.test", expectedVersion: 4 });
    expect(container.textContent).toContain("อีเมลไม่ถูกต้อง");
    expect(submitButton().disabled).toBe(false);
  });
});

describe("S6 legal draft", () => {
  it("saves only an edited draft", () => {
    const draft: AdminLegalVersionView = {
      id: "b0000000-0000-4000-8000-000000000001",
      kind: "TERMS",
      versionLabel: "2026-11",
      title: "ข้อกำหนดและเงื่อนไขการใช้บริการ",
      body: "# ข้อ 1",
      isPlaceholder: false,
      status: "DRAFT",
      publishedAt: null,
      updatedAt: "2026-11-03T05:00:00.000Z",
      isCurrent: false,
    };
    render(createElement(LegalDraftEditor, { version: draft }));
    expect(submitButton().disabled).toBe(true);

    type("title", "ข้อกำหนดฉบับแก้ไข");
    expect(submitButton().disabled).toBe(false);

    // A saved draft comes back as a new revision, which clears the unsaved edit.
    render(createElement(LegalDraftEditor, { version: { ...draft, updatedAt: "2026-11-18T05:00:00.000Z" } }));
    expect(submitButton().disabled).toBe(true);
  });
});
