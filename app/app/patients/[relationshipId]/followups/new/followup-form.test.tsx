// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { FollowupForm } from "./followup-form";

const actions = vi.hoisted(() => ({
  createFollowupAction: vi.fn(),
  createFollowupForProgramAction: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn() },
}));

vi.mock("@/modules/followups/transport/server-actions", () => ({
  createFollowupAction: actions.createFollowupAction,
  createFollowupForProgramAction: actions.createFollowupForProgramAction,
}));
vi.mock("next/navigation", () => ({ useRouter: () => actions.router, unstable_rethrow: vi.fn() }));

const patient = {
  patientHospitalRelationshipId: "relationship",
  displayName: "คุณสมใจ ทดสอบ",
  hospitalNumber: "HN-0081",
  hospital: { id: "hospital", name: "โรงพยาบาลตัวอย่าง" },
};
const appointments = [{ appointmentId: "appointment", type: "FOLLOW_UP" as const, scheduledAt: "2026-10-30T02:00:00.000Z" }];
const goalPlans = [{
  goalPlanId: "goal-plan",
  roundNumber: 2,
  createdAt: "2026-10-01T03:00:00.000Z",
  primaryGoalLabel: "เดินได้สม่ำเสมอ",
  items: [{ goalPlanItemId: "goal-item", activityCode: "exercise_walk", activityLabel: "เดินออกกำลังกาย", targetDays: 5, targetValue: 30, targetUnit: "นาที", sortOrder: 1 }],
}];
const success = { status: "SUCCESS", result: { followupId: "followup", patientHospitalRelationshipId: "relationship", roundNumber: 3 } } as const;
const returnTo = "/app/patients/11111111-1111-4111-8111-111111111111/programs/22222222-2222-4222-8222-222222222222/rounds/3?after=VITALS";

let root: Root | undefined;
let container: HTMLDivElement;

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  HTMLDialogElement.prototype.close = function() { this.open = false; };
  HTMLFormElement.prototype.requestSubmit = function(submitter?: HTMLButtonElement) {
    if (!this.reportValidity()) return;
    this.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: submitter ?? null }));
  };
  HTMLElement.prototype.scrollTo = vi.fn();
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.clearAllMocks();
});

const twoActivityPlan = {
  ...goalPlans[0],
  goalPlanId: "goal-plan-2",
  roundNumber: 3,
  items: [
    { goalPlanItemId: "item-walk", activityCode: "exercise_walk", activityLabel: "เดินออกกำลังกาย", targetDays: 4, targetValue: 30, targetUnit: "นาที", sortOrder: 1 },
    { goalPlanItemId: "item-sweet", activityCode: "stop_sweet", activityLabel: "งดน้ำหวาน", targetDays: 3, targetValue: null, targetUnit: null, sortOrder: 2 },
  ],
};

function mountProgram(overrides: { selectedAppointmentId?: string | null; selectedGoalPlanId?: string | null; latestHeightCm?: number | null; planReturnTo?: string | null; goalPlans?: ComponentProps<typeof FollowupForm>["goalPlans"] } = {}): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(
    <FollowupForm
      programRoundNumber={3}
      appointments={appointments}
      goalPlans={overrides.goalPlans ?? goalPlans}
      patient={patient}
      scope={{ kind: "program", patientProgramId: "program", relationshipId: "relationship", returnTo: overrides.planReturnTo ?? null, latestHeightCm: overrides.latestHeightCm === undefined ? 165 : overrides.latestHeightCm }}
      selectedAppointmentId={overrides.selectedAppointmentId === undefined ? "appointment" : overrides.selectedAppointmentId}
      selectedGoalPlanId={overrides.selectedGoalPlanId === undefined ? "goal-plan" : overrides.selectedGoalPlanId}
      submissionNonce="followup-nonce"
      todayServiceDate="2026-11-02"
    />,
  ));
}

function mountRelationship(): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(
    <FollowupForm
      appointments={appointments}
      goalPlans={goalPlans}
      patient={patient}
      scope={{ kind: "relationship", relationshipId: "relationship" }}
      selectedAppointmentId={null}
      selectedGoalPlanId={null}
      submissionNonce="direct-followup-nonce"
      todayServiceDate="2026-11-02"
    />,
  ));
}

function click(label: string, scope: ParentNode = container): void {
  const button = [...scope.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent === label);
  expect(button).toBeDefined();
  act(() => button?.click());
}

function setValue(selector: string, value: string): void {
  const element = container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector);
  expect(element).toBeDefined();
  if (!element) return;
  const prototype = element instanceof HTMLInputElement
    ? HTMLInputElement.prototype
    : element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLSelectElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  act(() => {
    setter?.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

function chooseRadio(name: string, value: string): void {
  const radio = container.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`);
  expect(radio).toBeDefined();
  act(() => radio?.click());
}

function openReview(): void {
  const form = container.querySelector<HTMLFormElement>("form");
  if (!form) throw new Error("Follow-up form not found");
  const submitter = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  act(() => form.requestSubmit(submitter ?? undefined));
}

async function settle(): Promise<void> {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

function fillProgramRequiredFields(): void {
  // D1: every activity of the plan is recorded.
  setValue("#progress-status-exercise_walk", "DONE");
  setValue("#progress-achieved-days-exercise_walk", "4");
  chooseRadio("followedPlanChoice", "true");
  setValue("#followup-reflection", "เดินได้ต่อเนื่อง");
  chooseRadio("planAdjustedChoice", "false");
  chooseRadio("hasObstacleChoice", "false");
}

function fillRelationshipRequiredFields(): void {
  chooseRadio("planAdjustedChoice", "false");
  chooseRadio("hasObstacleChoice", "false");
}

function formDataFor(action: { mock: { calls: unknown[][] } }, callIndex = 0): FormData {
  const call = action.mock.calls[callIndex];
  const payload = call?.[1];
  expect(payload).toBeInstanceOf(FormData);
  if (!(payload instanceof FormData)) throw new Error("Follow-up payload was not FormData");
  return payload;
}

function summaryText(): string {
  return container.querySelector("#followup-achievement-summary")?.textContent ?? "";
}

describe("Program follow-up progress and success rate (D1/D2)", () => {
  it("requires every plan activity, shows the live BR-04 rate and blocks review while incomplete", () => {
    mountProgram({ goalPlans: [twoActivityPlan], selectedGoalPlanId: null });
    // The Program's latest plan is preselected and cannot be unlinked.
    const planSelect = container.querySelector<HTMLSelectElement>("#followup-goal-plan");
    expect(planSelect?.value).toBe("goal-plan-2");
    expect(planSelect?.required).toBe(true);
    expect([...(planSelect?.options ?? [])].map((option) => option.value)).toEqual(["goal-plan-2"]);
    expect(container.textContent).toContain("ต้องบันทึกให้ครบทุกกิจกรรมในแผน");
    expect(container.textContent).not.toContain("เลือกบันทึกเฉพาะกิจกรรม");
    expect(summaryText()).toBe("กรอกให้ครบทุกกิจกรรมเพื่อคำนวณอัตราความสำเร็จ");

    chooseRadio("followedPlanChoice", "true");
    setValue("#followup-reflection", "เดินได้ต่อเนื่อง");
    chooseRadio("planAdjustedChoice", "false");
    chooseRadio("hasObstacleChoice", "false");
    setValue("#progress-status-exercise_walk", "DONE");
    setValue("#progress-achieved-days-exercise_walk", "3");
    openReview();

    expect(container.querySelector("dialog")).toBeNull();
    const sweetStatus = container.querySelector<HTMLSelectElement>("#progress-status-stop_sweet");
    expect(sweetStatus?.getAttribute("aria-invalid")).toBe("true");
    expect(container.textContent).toContain("กรุณาเลือกสถานะของกิจกรรมนี้");
    expect(document.activeElement).toBe(sweetStatus);
    expect(container.querySelector("#progress-status-exercise_walk")?.getAttribute("aria-invalid")).toBeNull();
    expect(actions.createFollowupForProgramAction).not.toHaveBeenCalled();

    // An applicable activity without achieved days stays incomplete.
    setValue("#progress-status-stop_sweet", "PARTIAL");
    expect(summaryText()).toBe("กรอกให้ครบทุกกิจกรรมเพื่อคำนวณอัตราความสำเร็จ");
    setValue("#progress-achieved-days-stop_sweet", "2");
    // (3 + 2) / (4 + 3) = 71%, strictly above 70%.
    expect(summaryText()).toBe("ทำได้ 5 จาก 7 วัน · อัตราความสำเร็จ 71%เกิน 70%");
    setValue("#progress-achieved-days-stop_sweet", "1");
    expect(summaryText()).toBe("ทำได้ 4 จาก 7 วัน · อัตราความสำเร็จ 57%ไม่เกิน 70%");
    // NOT_APPLICABLE leaves both sums and needs no days.
    setValue("#progress-status-stop_sweet", "NOT_APPLICABLE");
    expect(summaryText()).toBe("ทำได้ 3 จาก 4 วัน · อัตราความสำเร็จ 75%เกิน 70%");

    setValue("#followup-weight", "70");
    setValue("#followup-waist", "80");
    setValue("#followup-systolic", "120");
    setValue("#followup-diastolic", "80");
    setValue("#followup-blood-sugar", "90");
    openReview();
    const dialog = container.querySelector("dialog");
    expect(dialog?.textContent).toContain("วันที่ติดตาม");
    expect(dialog?.textContent).toContain("อัตราความสำเร็จตามเป้าทำได้ 3 จาก 4 วัน · อัตราความสำเร็จ 75%เกิน 70%");
  });

  it("labels the date วันที่ติดตาม for Program Follow-ups only", () => {
    mountProgram();
    expect(container.querySelector('label[for="followup-service-date"]')?.textContent).toBe("วันที่ติดตาม");
    act(() => root?.unmount());
    container.remove();
    mountRelationship();
    expect(container.querySelector('label[for="followup-service-date"]')?.textContent).toBe("วันที่ให้บริการ");
    expect(container.querySelector("#followup-achievement-summary")).toBeNull();
  });

  it("explains instead of offering a save when the Program has no Goal Plan", () => {
    mountProgram({ goalPlans: [], selectedGoalPlanId: null, planReturnTo: returnTo });
    expect(container.querySelector("form")).toBeNull();
    expect(container.textContent).toContain("ต้องมีแผนสุขภาพก่อนบันทึกการติดตามผล");
    expect(container.textContent).toContain("โปรแกรมนี้ยังไม่มีแผนสุขภาพ");
    const back = [...container.querySelectorAll("a")].find((link) => link.textContent === "กลับไปหน้าครั้งบริการ");
    expect(back?.getAttribute("href")).toBe(returnTo);
    expect([...container.querySelectorAll("button")].some((button) => button.textContent === "บันทึกการติดตามผล")).toBe(false);
  });
});

describe("follow-up recording review", () => {
  it("runs native required-field validation before opening review", () => {
    mountProgram();
    expect(container.querySelector("form")?.getAttribute("action")).toBeNull();
    openReview();
    expect(container.querySelector("dialog")).toBeNull();
    expect(actions.createFollowupForProgramAction).not.toHaveBeenCalled();
  });

  it("reviews patient, Program/Round, appointment, goal plan, recorded zero and missing values without mutation", () => {
    mountProgram();
    fillProgramRequiredFields();
    setValue("#followup-weight", "0");
    setValue("#followup-blood-sugar", "88.5");
    setValue("#followup-expert-advice", "เพิ่มเวลาตามความพร้อม");
    setValue("#followup-general-note", "ติดตามอีกหนึ่งสัปดาห์");
    chooseRadio("hasObstacleChoice", "true");
    setValue("#followup-obstacle-note", "เวลาน้อยในช่วงเช้า");
    chooseRadio("planAdjustedChoice", "true");
    setValue("#progress-status-exercise_walk", "DONE");
    setValue("#progress-achieved-days-exercise_walk", "0");
    setValue("#progress-note-exercise_walk", "ยังไม่ได้ออกกำลังกายในช่วงนี้");
    openReview();

    const dialog = container.querySelector<HTMLDialogElement>("dialog");
    expect(dialog).toBeDefined();
    expect(container.querySelectorAll("dialog")).toHaveLength(1);
    expect(dialog?.textContent).toContain("คุณสมใจ ทดสอบ");
    expect(dialog?.textContent).toContain("โรงพยาบาลตัวอย่าง");
    expect(dialog?.textContent).toContain("โปรแกรมสุขภาพ · ครั้งบริการที่ 3");
    expect(dialog?.querySelector("form")).toBeNull();
    expect(dialog?.textContent).toContain("ติดตาม ·");
    expect(dialog?.textContent).toContain("เดินได้สม่ำเสมอ");
    expect(dialog?.textContent).toContain("น้ำหนัก (kg)0");
    expect(dialog?.textContent).toContain("รอบเอว (cm)ไม่ได้กรอก");
    expect(dialog?.textContent).toContain("ค่าสุขภาพของรอบนี้ยังขาด");
    expect(dialog?.textContent).toContain("รอบเอว · ความดันตัวบน · ความดันตัวล่าง");
    expect(dialog?.textContent).toContain("ทำได้ตามแผน");
    expect(dialog?.textContent).toContain("0 วัน");
    expect(dialog?.textContent).toContain("ยังไม่ได้ออกกำลังกายในช่วงนี้");
    expect(dialog?.textContent).toContain("เพิ่มเวลาตามความพร้อม");
    expect(dialog?.textContent).toContain("ปรับแผน");
    expect(dialog?.textContent).toContain("เวลาน้อยในช่วงเช้า");
    expect(dialog?.textContent).toContain("ติดตามอีกหนึ่งสัปดาห์");
    expect(dialog?.textContent).toContain("ระบบจะไม่ข้ามขั้นตอนหรือเลือกเหตุผลให้อัตโนมัติ");
    expect(dialog?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false);
    expect(dialog?.querySelector<HTMLButtonElement>("footer button:last-child")?.disabled).toBe(true);
    expect(actions.createFollowupForProgramAction).not.toHaveBeenCalled();
  });

  it("cancels review without mutation and preserves the clinical draft", () => {
    mountProgram();
    fillProgramRequiredFields();
    setValue("#followup-weight", "72.4");
    openReview();
    click("ยกเลิก", container.querySelector("dialog") ?? container);
    expect(container.querySelector("dialog")).toBeNull();
    expect(container.querySelector<HTMLInputElement>("#followup-weight")?.value).toBe("72.4");
    expect(container.querySelector<HTMLTextAreaElement>("#followup-reflection")?.value).toBe("เดินได้ต่อเนื่อง");
    expect(actions.createFollowupForProgramAction).not.toHaveBeenCalled();
    openReview();
    expect(container.querySelector("dialog")?.textContent).toContain("น้ำหนัก (kg)72.4");
  });

  it("closes review and restores native validation when a field becomes invalid before confirmation", async () => {
    mountProgram();
    fillProgramRequiredFields();
    setValue("#followup-weight", "72.4");
    setValue("#followup-waist", "80");
    setValue("#followup-systolic", "120");
    setValue("#followup-diastolic", "80");
    setValue("#followup-blood-sugar", "90");
    openReview();

    const form = container.querySelector<HTMLFormElement>("form");
    if (!form) throw new Error("Follow-up form not found");
    const requestSubmit = vi.spyOn(form, "requestSubmit");
    const weight = container.querySelector<HTMLInputElement>("#followup-weight");
    if (!weight) throw new Error("Follow-up weight field not found");
    expect(weight.validity.valid).toBe(true);

    weight.setCustomValidity("กรุณาตรวจสอบค่าน้ำหนัก");
    expect(weight.validity.valid).toBe(false);
    click("บันทึกต่อ", container.querySelector("dialog") ?? container);

    expect(container.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(weight);
    expect(weight.validationMessage).toBe("กรุณาตรวจสอบค่าน้ำหนัก");
    expect(requestSubmit).not.toHaveBeenCalled();
    expect(actions.createFollowupForProgramAction).not.toHaveBeenCalled();

    weight.setCustomValidity("");
    actions.createFollowupForProgramAction.mockResolvedValueOnce(success);
    openReview();
    click("บันทึกต่อ", container.querySelector("dialog") ?? container);
    await settle();

    expect(actions.createFollowupForProgramAction).toHaveBeenCalledOnce();
    expect(formDataFor(actions.createFollowupForProgramAction).get("submissionNonce")).toBe("followup-nonce");
  });

  it("requires explicit missing-vitals acknowledgment and submits the original FormData once", async () => {
    let resolveAction: ((state: typeof success) => void) | undefined;
    actions.createFollowupForProgramAction.mockReturnValueOnce(new Promise((resolve) => { resolveAction = resolve; }));
    mountProgram({ planReturnTo: returnTo });
    fillProgramRequiredFields();
    chooseRadio("hasObstacleChoice", "true");
    setValue("#followup-obstacle-note", "เวลาน้อยในช่วงเช้า");
    chooseRadio("planAdjustedChoice", "true");
    setValue("#followup-weight", "0");
    setValue("#followup-blood-sugar", "88.5");
    setValue("#followup-expert-advice", "เพิ่มเวลาตามความพร้อม");
    setValue("#followup-general-note", "ติดตามอีกหนึ่งสัปดาห์");
    setValue("#progress-status-exercise_walk", "DONE");
    setValue("#progress-achieved-days-exercise_walk", "0");
    setValue("#progress-note-exercise_walk", "เดินตามเส้นทาง");
    openReview();
    const dialog = container.querySelector<HTMLDialogElement>("dialog");
    const confirm = dialog?.querySelector<HTMLButtonElement>("footer button:last-child");
    expect(confirm?.disabled).toBe(true);
    expect(actions.createFollowupForProgramAction).not.toHaveBeenCalled();
    const acknowledgment = dialog?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    act(() => acknowledgment?.click());
    expect(confirm?.disabled).toBe(false);

    await act(async () => { confirm?.click(); confirm?.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(actions.createFollowupForProgramAction).toHaveBeenCalledTimes(1);
    const payload = formDataFor(actions.createFollowupForProgramAction);
    expect(Object.fromEntries(payload.entries())).toEqual({
      patientProgramId: "program",
      submissionNonce: "followup-nonce",
      appointmentId: "appointment",
      sourceGoalPlanId: "goal-plan",
      serviceDate: "2026-11-02",
      planAdjusted: "true",
      hasObstacle: "true",
      obstacleNote: "เวลาน้อยในช่วงเช้า",
      weight: "0",
      waistCircumference: "",
      systolicBloodPressure: "",
      diastolicBloodPressure: "",
      bloodSugar: "88.5",
      heightCm: "165",
      followedPlan: "true",
      expertAdvice: "เพิ่มเวลาตามความพร้อม",
      reflectionNote: "เดินได้ต่อเนื่อง",
      generalNote: "ติดตามอีกหนึ่งสัปดาห์",
      activityProgress: JSON.stringify([{ goalActivityCode: "exercise_walk", status: "DONE", achievedDays: 0, note: "เดินตามเส้นทาง" }]),
      followedPlanChoice: "true",
      planAdjustedChoice: "true",
      hasObstacleChoice: "true",
    });
    expect(actions.router.push).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLButtonElement>('dialog button[aria-label="ปิดหน้าต่าง"]')?.disabled).toBe(true);
    await act(async () => { resolveAction?.(success); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(actions.router.push).toHaveBeenCalledWith(`/app/patients/relationship/programs/program/goals/new?sourceFollowupId=followup&returnTo=${encodeURIComponent(returnTo)}`);
  });

  it("recovers an unknown Program recording with the same original payload and nonce", async () => {
    actions.createFollowupForProgramAction.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(success);
    mountProgram({ latestHeightCm: null });
    fillProgramRequiredFields();
    setValue("#followup-weight", "0");
    setValue("#followup-waist", "80");
    setValue("#followup-systolic", "120");
    setValue("#followup-diastolic", "80");
    setValue("#followup-blood-sugar", "90");
    openReview();
    const dialog = container.querySelector<HTMLDialogElement>("dialog");
    const confirm = dialog?.querySelector<HTMLButtonElement>("footer button:last-child");
    expect(confirm?.disabled).toBe(false);
    await act(async () => { confirm?.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(actions.createFollowupForProgramAction).toHaveBeenCalledTimes(1);
    expect(container.querySelector("dialog")?.textContent).toContain("ตรวจสอบผลของรายการ");
    expect(container.querySelector("dialog")?.textContent).toContain("ส่วนสูง (cm)ไม่ได้กรอก");
    const firstPayload = formDataFor(actions.createFollowupForProgramAction);
    const recovery = [...(container.querySelector("dialog")?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find((button) => button.textContent === "ตรวจสอบผลของรายการ");
    expect(recovery).toBeDefined();
    await act(async () => { recovery?.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(actions.createFollowupForProgramAction).toHaveBeenCalledTimes(2);
    const secondPayload = formDataFor(actions.createFollowupForProgramAction, 1);
    expect(Object.fromEntries(secondPayload.entries())).toEqual(Object.fromEntries(firstPayload.entries()));
    expect(actions.router.push).toHaveBeenCalledWith(`/app/patients/relationship/programs/program/followups/followup`);
  });

  it("keeps relationship follow-up on its existing route and does not require Program vitals acknowledgment", async () => {
    actions.createFollowupAction.mockResolvedValueOnce(success);
    mountRelationship();
    fillRelationshipRequiredFields();
    openReview();
    const dialog = container.querySelector<HTMLDialogElement>("dialog");
    expect(dialog?.textContent).toContain("การติดตามผลนอกโปรแกรม");
    expect(dialog?.querySelector<HTMLInputElement>('input[type="checkbox"]')).toBeNull();
    expect(dialog?.textContent).toContain("ความมั่นใจและสิ่งที่ต้องการสะท้อน");
    click("บันทึกต่อ", dialog ?? container);
    await settle();
    expect(actions.createFollowupAction).toHaveBeenCalledTimes(1);
    const payload = formDataFor(actions.createFollowupAction);
    expect(payload.get("patientHospitalRelationshipId")).toBe("relationship");
    expect(payload.get("submissionNonce")).toBe("direct-followup-nonce");
    expect(payload.get("patientProgramId")).toBeNull();
    expect(actions.router.push).toHaveBeenCalledWith("/app/patients/relationship/followups/followup");
  });

  it.each(["CONFLICT", "FORBIDDEN"] as const)("closes review and refreshes after a confirmed %s result", async (code) => {
    actions.createFollowupForProgramAction.mockResolvedValueOnce({ status: "ERROR", code, message: "ข้อมูลหรือสิทธิ์เปลี่ยนแปลงแล้ว" });
    mountProgram();
    fillProgramRequiredFields();
    setValue("#followup-weight", "61.5");
    openReview();
    act(() => container.querySelector<HTMLInputElement>('dialog input[type="checkbox"]')?.click());
    click("บันทึกต่อ", container.querySelector("dialog") ?? container);
    await settle();
    expect(container.querySelector("dialog")).toBeNull();
    expect(container.querySelector<HTMLInputElement>("#followup-weight")?.value).toBe("61.5");
    expect(actions.router.refresh).toHaveBeenCalledTimes(1);
    expect(actions.router.push).not.toHaveBeenCalled();
  });

  it("returns validation errors to the draft and restores focus without clearing entered values", async () => {
    actions.createFollowupForProgramAction.mockResolvedValueOnce({ status: "ERROR", code: "INVALID_INPUT", message: "ตรวจสอบข้อมูลที่กรอก" });
    mountProgram();
    fillProgramRequiredFields();
    setValue("#followup-weight", "64.2");
    openReview();
    act(() => container.querySelector<HTMLInputElement>('dialog input[type="checkbox"]')?.click());
    click("บันทึกต่อ", container.querySelector("dialog") ?? container);
    await settle();
    expect(container.querySelector("dialog")).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("ตรวจสอบข้อมูลที่กรอก");
    expect(container.querySelector<HTMLInputElement>("#followup-weight")?.value).toBe("64.2");
    expect(container.querySelector<HTMLTextAreaElement>("#followup-reflection")?.value).toBe("เดินได้ต่อเนื่อง");
    expect(document.activeElement).toBe(container.querySelector("#followup-action-feedback"));
    expect(actions.router.push).not.toHaveBeenCalled();
  });
});
