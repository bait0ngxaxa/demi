// @vitest-environment jsdom
/**
 * UX-D3 cross-feature regression: every migrated clinical/patient dialog is a single native modal
 * with an accessible name, no nested dialog, no nested form, initial focus inside the dialog, and
 * focus back outside it after an idle close. Opening a dialog never dispatches a mutation.
 */
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  baseline: vi.fn(), bulk: vi.fn(), search: vi.fn(),
  medicationCreate: vi.fn(), medicationUpdate: vi.fn(), medicationStop: vi.fn(), medicationSchedules: vi.fn(),
  mealCreate: vi.fn(), mealUpdate: vi.fn(), mealDelete: vi.fn(), mealList: vi.fn(),
  exerciseCreate: vi.fn(), exerciseUpdate: vi.fn(), exerciseDelete: vi.fn(), exerciseList: vi.fn(),
  goalCreate: vi.fn(), goalUpdate: vi.fn(), goalRemove: vi.fn(), goalRead: vi.fn(),
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/form", () => ({
  default: (props: Record<string, unknown>) => {
    const { action, ...rest } = props;
    void action;
    return createElement("form", rest);
  },
}));
vi.mock("@/components/ui/notify", () => ({ notify: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/modules/patient-baseline/transport/server-actions", () => ({ createPatientBaselineAction: actions.baseline }));
vi.mock("@/modules/patient-assignment/transport/server-actions", () => ({ bulkAssignOsmToPatientsAction: actions.bulk, searchPatientOsmBulkCandidatesAction: actions.search }));
vi.mock("@/modules/medications/transport/server-actions", () => ({
  createPersonalMedicationAction: actions.medicationCreate, updatePersonalMedicationAction: actions.medicationUpdate,
  stopPersonalMedicationAction: actions.medicationStop, replacePersonalMedicationSchedulesAction: actions.medicationSchedules,
}));
vi.mock("@/modules/meals/transport/server-actions", () => ({ createPersonalMealAction: actions.mealCreate, updatePersonalMealAction: actions.mealUpdate, deletePersonalMealAction: actions.mealDelete, listPersonalMealsAction: actions.mealList }));
vi.mock("@/modules/exercises/transport/server-actions", () => ({ createPersonalExerciseAction: actions.exerciseCreate, updatePersonalExerciseAction: actions.exerciseUpdate, deletePersonalExerciseAction: actions.exerciseDelete, listPersonalExercisesAction: actions.exerciseList }));
vi.mock("@/modules/weight-goals/transport/server-actions", () => ({ createPersonalWeightGoalAction: actions.goalCreate, updatePersonalWeightGoalAction: actions.goalUpdate, removePersonalWeightGoalAction: actions.goalRemove, readPersonalWeightGoalAction: actions.goalRead }));
vi.mock("./personal/wellness/daily-wellness-action", () => ({ readDailyWellnessAction: vi.fn() }));

import { PatientBaselineForm } from "./patients/[relationshipId]/baseline/baseline-form";
import { PatientOsmBulkAssignmentWorkspace } from "./patients/assign-osm/patient-osm-bulk-assignment-workspace";
import { PersonalMedicationWorkspace } from "./personal/medications/personal-medication-workspace";
import { PersonalWellnessWorkspace } from "./personal/wellness/personal-wellness-workspace";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const date = "2026-10-29";
const hospital = { hospitalId: "hospital-1", hospitalName: "โรงพยาบาลทดสอบ" };
const relationshipId = "11111111-1111-4111-8111-111111111111";
const medication = { id: "22222222-2222-4222-8222-222222222222", medicationName: "ยาทดสอบ", instructionText: null, status: "ACTIVE" as const, stoppedAt: null, createdAt: `${date}T00:00:00.000Z`, updatedAt: `${date}T00:00:00.000Z`, schedules: [{ localTime: "08:00" }] };
const meal = { id: "33333333-3333-4333-8333-333333333333", category: "BREAKFAST" as const, occurredOn: date, description: null, createdAt: `${date}T00:00:00.000Z`, updatedAt: `${date}T00:00:00.000Z` };
const exercise = { id: "44444444-4444-4444-8444-444444444444", activityName: "เดิน", occurredOn: date, durationMinutes: null, note: null, createdAt: `${date}T00:00:00.000Z`, updatedAt: `${date}T00:00:00.000Z` };
const goal = { id: "55555555-5555-4555-8555-555555555555", targetWeightKg: "70", targetDate: null, createdAt: `${date}T00:00:00.000Z`, updatedAt: `${date}T00:00:00.000Z` };
const wellness = (
  <PersonalWellnessWorkspace
    exerciseNonce="66666666-6666-4666-8666-666666666666"
    exercisePage={{ items: [exercise], nextCursor: null, dailySummary: { occurredOn: date, count: 1, recordedDurationCount: 0, durationMinutes: null } }}
    mealNonce="77777777-7777-4777-8777-777777777777"
    mealPage={{ items: [meal], nextCursor: null, dailySummary: { occurredOn: date, count: 1 } }}
    today={date}
    weightGoal={goal}
    weightGoalNonce="88888888-8888-4888-8888-888888888888"
  />
);

let host: HTMLDivElement;
let root: Root;
let originalShowModal: PropertyDescriptor | undefined;
let originalClose: PropertyDescriptor | undefined;
beforeAll(() => {
  originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement): void { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement): void { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); } });
});
afterAll(() => {
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal); else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose); else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});
beforeEach(() => {
  Object.values(actions).forEach((action) => action.mockReset());
  actions.search.mockResolvedValue({ status: "OK", candidates: [{ userId: "osm-1", displayName: "สมใจ อสม." }], page: 1, totalPages: 1, hasPreviousPage: false, hasNextPage: false });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); });

function button(label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find((element) => element.textContent?.trim() === label);
  if (!found) throw new Error(`Missing ${label}`);
  return found;
}

async function prepareBulkSelection(): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); });
  await act(() => host.querySelector<HTMLInputElement>('ul[aria-label="ผู้ป่วยที่ยังไม่มี อสม."] input[type=checkbox]')?.click());
  await act(() => host.querySelector<HTMLInputElement>('input[name="osm-candidate"]')?.click());
}

type Surface = { name: string; element: ReactElement; prepare?: () => Promise<void>; trigger: string; title: string };
const surfaces: Surface[] = [
  {
    name: "Patient Baseline review",
    element: <PatientBaselineForm patient={{ patientHospitalRelationshipId: relationshipId, displayName: "ผู้ป่วยทดสอบ", hospitalNumber: null, hospital: { id: hospital.hospitalId, name: hospital.hospitalName } }} relationshipId={relationshipId} />,
    trigger: "ตรวจสอบข้อมูลก่อนบันทึก",
    title: "ตรวจสอบข้อมูลตั้งต้นก่อนบันทึก",
  },
  {
    name: "Bulk OSM assignment review",
    element: <PatientOsmBulkAssignmentWorkspace errorMessage={null} scopes={[hospital]} search="" selectedScope={hospital} view={{ hospital, totalWithoutOsm: 1, page: 1, pageSize: 25, totalPages: 1, hasPreviousPage: false, hasNextPage: false, patients: [{ patientProfileId: "profile-1", patientHospitalRelationshipId: relationshipId, displayName: "ผู้ป่วยทดสอบ", hospital: { id: hospital.hospitalId, name: hospital.hospitalName }, hospitalNumber: null, classification: null }] } as never} />,
    prepare: prepareBulkSelection,
    trigger: "ตรวจสอบก่อนมอบหมาย (1 คน)",
    title: "ยืนยันการมอบหมาย อสม.",
  },
  ...[
    ["Medication text edit", "แก้ไขชื่อยาและข้อความประกอบ", "แก้ไขชื่อยาและข้อความประกอบ"],
    ["Medication schedule edit", "แก้ไขเวลา", "แก้ไขเวลาที่ต้องการติดตามใน DEMI"],
    ["Medication stop tracking", "หยุดติดตามรายการนี้ใน DEMI", "หยุดติดตามรายการนี้ใน DEMI"],
  ].map(([name, trigger, title]) => ({
    name,
    element: <PersonalMedicationWorkspace active={{ items: [], nextCursor: null }} selected={medication} stopped={{ items: [], nextCursor: null }} />,
    trigger,
    title,
  })),
  ...[
    ["Meal entry edit", "แก้ไข", "แก้ไขบันทึกมื้ออาหาร", 0],
    ["Meal entry delete", "ลบ", "ลบบันทึกมื้ออาหาร", 0],
    ["Exercise entry edit", "แก้ไข", "แก้ไขบันทึกการออกกำลังกาย", 1],
    ["Exercise entry delete", "ลบ", "ลบบันทึกการออกกำลังกาย", 1],
  ].map(([name, label, title, row]) => ({
    name: name as string,
    element: wellness,
    trigger: `${label as string}#row${row as number}`,
    title: title as string,
  })),
  { name: "Weight goal edit", element: wellness, trigger: "แก้ไข#goal", title: "แก้ไขเป้าหมายน้ำหนัก" },
  { name: "Weight goal removal", element: wellness, trigger: "ลบเป้าหมาย", title: "ยืนยันการลบเป้าหมาย" },
];

function resolveTrigger(trigger: string): HTMLButtonElement {
  const [label, scope] = trigger.split("#");
  if (scope?.startsWith("row")) {
    const rows = [...host.querySelectorAll("li")].filter((item) => [...item.querySelectorAll("button")].some((element) => element.textContent === label));
    const found = [...(rows[Number(scope.slice(3))]?.querySelectorAll("button") ?? [])].find((element) => element.textContent === label);
    if (!found) throw new Error(`Missing row trigger ${trigger}`);
    return found;
  }
  if (scope === "goal") {
    const found = host.querySelector("#weight-goal")?.querySelectorAll("button");
    const match = [...(found ?? [])].find((element) => element.textContent === label);
    if (!match) throw new Error(`Missing goal trigger ${trigger}`);
    return match;
  }
  return button(label);
}

describe.each(surfaces)("$name", ({ element, prepare, trigger, title }) => {
  it("opens one named native modal without nesting or dispatching, and returns focus outside after an idle close", async () => {
    await act(() => root.render(element));
    await prepare?.();
    const opener = resolveTrigger(trigger);
    await act(() => opener.click());

    const dialogs = host.querySelectorAll("dialog");
    expect(dialogs).toHaveLength(1);
    const dialog = dialogs[0];
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.querySelector("dialog")).toBeNull();
    expect(host.querySelector("form form")).toBeNull();
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy ? document.getElementById(labelledBy)?.textContent : null).toBe(title);
    expect(dialog.contains(document.activeElement)).toBe(true);
    for (const action of Object.values(actions)) {
      if (action !== actions.search) expect(action).not.toHaveBeenCalled();
    }

    await act(() => { dialog.dispatchEvent(new Event("cancel", { cancelable: true })); });
    expect(host.querySelector("dialog")).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
    expect(host.contains(document.activeElement)).toBe(true);
  });
});
