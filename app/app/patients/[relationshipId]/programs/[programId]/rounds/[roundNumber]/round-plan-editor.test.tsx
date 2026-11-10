// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RoundPlanEditor, PlanItemControl } from "./round-plan-editor";
import { CompleteRoundControl, SkipStepControl, UnskipStepControl } from "./round-step-controls";
import { ROUND_ITEM_CATALOG, type RoundStepState } from "@/modules/patient-program-rounds/domain/round-steps";

const actions = vi.hoisted(() => ({ addRoundPlanItemAction: vi.fn(), removeRoundPlanItemAction: vi.fn(), markCustomItemDoneAction: vi.fn(), unmarkCustomItemDoneAction: vi.fn(), addProgramRoundAction: vi.fn(), completePatientProgramRoundAction: vi.fn(), recordPatientProgramRoundProfileAction: vi.fn(), skipPatientProgramRoundStepAction: vi.fn(), unskipPatientProgramRoundStepAction: vi.fn(), router: { refresh: vi.fn(), push: vi.fn() } }));
vi.mock("@/modules/patient-program-rounds/transport/server-actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => actions.router, unstable_rethrow: vi.fn() }));
const target = { patientHospitalRelationshipId: "relationship", patientProgramId: "program", roundNumber: 7 };
let root: Root | undefined;
let container: HTMLDivElement;
beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  HTMLDialogElement.prototype.close = function() { this.open = false; };
  HTMLFormElement.prototype.requestSubmit = function(submitter?: HTMLElement) {
    this.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: submitter instanceof HTMLButtonElement ? submitter : null }));
  };
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterEach(() => { act(() => root?.unmount()); container?.remove(); vi.clearAllMocks(); });
function mount(element: React.ReactNode): void { container = document.createElement("div"); document.body.append(container); root = createRoot(container); act(() => root?.render(element)); }
function click(label: string): void { const button = [...container.querySelectorAll("button")].find((node) => node.textContent === label); expect(button).toBeDefined(); act(() => button?.click()); }
function clickIn(selector: string, label: string): void { const button = [...container.querySelectorAll<HTMLButtonElement>(`${selector} button`)].find((node) => node.textContent === label); expect(button).toBeDefined(); act(() => button?.click()); }
async function submit(form: HTMLFormElement): Promise<void> { const submitter = form.querySelector<HTMLButtonElement>('button[type="submit"]'); await act(async () => { form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter })); await new Promise((resolve) => setTimeout(resolve, 0)); }); }
function setInputValue(input: HTMLInputElement, value: string): void { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set; act(() => { setter?.call(input, value); input.dispatchEvent(new InputEvent("input", { bubbles: true })); }); }
function item(id: string, status: RoundStepState["status"] = "TODO"): RoundStepState { return { ...ROUND_ITEM_CATALOG.CUSTOM, label: id, planItemId: id, evidence: null, skip: null, missingMeasurements: [], status }; }
const success = { status: "SUCCESS", result: { operation: "RECORDED", patientProgramId: "program", patientHospitalRelationshipId: "relationship", roundNumber: 7 } } as const;

describe("staff round plan controls", () => {
  it("offers re-add and explains unavailable catalog choices with a bounded custom title", () => {
    mount(<RoundPlanEditor target={target} submissionNonce="nonce" choices={[{ code: "PAM", label: "PAM", unavailableReason: "ทำแล้วในโปรแกรมนี้", recommended: true }, { code: "CUSTOM", label: "อื่น ๆ (กำหนดเอง)", unavailableReason: null, recommended: false }]} />);
    click("เพิ่มกลับ");
    const option = container.querySelector('option[value="PAM"]');
    expect(option?.hasAttribute("disabled")).toBe(true);
    expect(option?.textContent).toContain("ทำแล้วในโปรแกรมนี้");
    const select = container.querySelector("select");
    act(() => { if(select) { select.value = "CUSTOM"; select.dispatchEvent(new Event("change", { bubbles: true })); } });
    expect(container.querySelector('input[name="customTitle"]')?.getAttribute("maxlength")).toBe("120");
  });
  it("keeps the custom item draft when the add dialog is canceled and reopened", () => {
    mount(<RoundPlanEditor target={target} submissionNonce="nonce" choices={[{ code: "CUSTOM", label: "อื่น ๆ (กำหนดเอง)", unavailableReason: null, recommended: false }]} />);
    click("เพิ่มรายการ");
    const select = container.querySelector("select");
    act(() => { if(select) { select.value = "CUSTOM"; select.dispatchEvent(new Event("change", { bubbles: true })); } });
    const title = container.querySelector<HTMLInputElement>('input[name="customTitle"]');
    expect(title).toBeDefined();
    if (title) setInputValue(title, "ติดตามการเดิน");
    click("ยกเลิก");
    click("เพิ่มรายการ");
    expect(container.querySelector("select")?.value).toBe("CUSTOM");
    expect(container.querySelector<HTMLInputElement>('input[name="customTitle"]')?.value).toBe("ติดตามการเดิน");
    expect(actions.addRoundPlanItemAction).not.toHaveBeenCalled();
  });
  it("submits a custom plan item with the original round and nonce once", async () => {
    let resolveAction: ((state: typeof success) => void) | undefined;
    actions.addRoundPlanItemAction.mockReturnValueOnce(new Promise((resolve) => { resolveAction = resolve; }));
    mount(<RoundPlanEditor target={target} submissionNonce="add-nonce" choices={[{ code: "CUSTOM", label: "อื่น ๆ (กำหนดเอง)", unavailableReason: null, recommended: false }]} />);
    click("เพิ่มรายการ");
    const select = container.querySelector("select");
    act(() => { if(select) { select.value = "CUSTOM"; select.dispatchEvent(new Event("change", { bubbles: true })); } });
    const title = container.querySelector<HTMLInputElement>('input[name="customTitle"]');
    if (title) setInputValue(title, "ติดตามการเดิน");
    const form = container.querySelector<HTMLFormElement>("dialog form");
    if (!form) throw new Error("Plan item form not found");
    const event = () => form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: form.querySelector<HTMLButtonElement>("button[type='submit']") }));
    act(() => { event(); event(); });
    expect(actions.addRoundPlanItemAction).toHaveBeenCalledTimes(1);
    const payload = actions.addRoundPlanItemAction.mock.calls[0]?.[1];
    expect(payload).toBeInstanceOf(FormData);
    if (!(payload instanceof FormData)) throw new Error("Plan item payload was not FormData");
    expect(Object.fromEntries(payload.entries())).toEqual({ patientProgramId: "program", roundNumber: "7", submissionNonce: "add-nonce", stepCode: "CUSTOM", customTitle: "ติดตามการเดิน" });
    expect(container.querySelector<HTMLButtonElement>('dialog button[aria-label="ปิดหน้าต่าง"]')?.disabled).toBe(true);
    await act(async () => { resolveAction?.(success); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(container.querySelector('button:not([aria-label])'));
  });
  it("blocks a selected plan choice that becomes unavailable while the dialog is open", () => {
    const available: Parameters<typeof RoundPlanEditor>[0]["choices"] = [{ code: "PAM", label: "PAM", unavailableReason: null, recommended: false }];
    mount(<RoundPlanEditor target={target} submissionNonce="nonce" choices={available} />);
    click("เพิ่มรายการ");
    const select = container.querySelector("select");
    act(() => { if(select) { select.value = "PAM"; select.dispatchEvent(new Event("change", { bubbles: true })); } });
    act(() => root?.render(<RoundPlanEditor target={target} submissionNonce="nonce" choices={[{ ...available[0], unavailableReason: "ทำแล้วในโปรแกรมนี้" }]} />));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("ไม่พร้อมเพิ่มแล้ว");
    expect(container.querySelector<HTMLButtonElement>('form button[type="submit"]')?.disabled).toBe(true);
    expect(actions.addRoundPlanItemAction).not.toHaveBeenCalled();
  });
  it("confirms removal before sending an untouched item and preserves its identity", () => {
    mount(<PlanItemControl step={item("custom-1")} target={target} submissionNonce="nonce" />);
    click("ตัดออก");
    expect(container.querySelector("dialog")?.textContent).toContain("ตัด “custom-1” ออกจากแผนหรือไม่");
    expect(actions.removeRoundPlanItemAction).not.toHaveBeenCalled();
    expect(container.querySelector('input[name="planItemId"]')?.getAttribute("value")).toBe("custom-1");
    expect(container.querySelector('textarea[name="note"]')?.getAttribute("maxlength")).toBe("500");
  });
  it("returns focus to the current step heading after a TODO item is removed", async () => {
    actions.removeRoundPlanItemAction.mockResolvedValueOnce(success);
    mount(<><h2 id="program-round-current-step-heading" tabIndex={-1}>Current step</h2><PlanItemControl step={item("custom-remove")} target={target} submissionNonce="remove-nonce" /></>);
    click("ตัดออก");
    const confirmButton = [...(container.querySelector<HTMLDialogElement>("dialog")?.querySelectorAll("button") ?? [])].find((button) => button.textContent === "ตัดออก");
    await act(async () => { confirmButton?.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(actions.removeRoundPlanItemAction).toHaveBeenCalledTimes(1);
    const payload = actions.removeRoundPlanItemAction.mock.calls[0]?.[1];
    expect(payload).toBeInstanceOf(FormData);
    if (!(payload instanceof FormData)) throw new Error("Plan removal payload was not FormData");
    expect(Object.fromEntries(payload.entries())).toEqual({ patientProgramId: "program", roundNumber: "7", submissionNonce: "remove-nonce", planItemId: "custom-remove" });
    expect(document.activeElement).toBe(container.querySelector("#program-round-current-step-heading"));
  });
  it("offers undo for a done CUSTOM and no removal", () => {
    mount(<PlanItemControl step={item("custom-2", "DONE")} target={target} submissionNonce="nonce" />);
    expect(container.textContent).toContain("ยกเลิกทำแล้ว");
    expect(container.textContent).not.toContain("ตัดออก");
  });
  it("keeps custom-item unmarking as a direct reversible action with the same target and nonce", async () => {
    actions.unmarkCustomItemDoneAction.mockResolvedValueOnce(success);
    mount(<PlanItemControl step={item("custom-undo", "DONE")} target={target} submissionNonce="undo-nonce" />);
    expect(container.querySelector("dialog")).toBeNull();
    const form = container.querySelector<HTMLFormElement>("form");
    if (!form) throw new Error("Custom item unmark form not found");
    await submit(form);
    expect(actions.unmarkCustomItemDoneAction).toHaveBeenCalledTimes(1);
    const payload = actions.unmarkCustomItemDoneAction.mock.calls[0]?.[1];
    expect(payload).toBeInstanceOf(FormData);
    if (!(payload instanceof FormData)) throw new Error("Custom item payload was not FormData");
    expect(Object.fromEntries(payload.entries())).toEqual({ patientProgramId: "program", roundNumber: "7", submissionNonce: "undo-nonce", planItemId: "custom-undo" });
  });
  it("reviews done, skipped and both unfinished CUSTOM items before ending", () => {
    mount(<CompleteRoundControl target={target} roundsHref="/rounds" submissionNonce="nonce" steps={[item("done", "DONE"), item("skipped", "SKIPPED"), item("custom-a"), item("custom-b")]} />);
    click("จบบริการครั้งที่ 7");
    const dialog = container.querySelector("dialog");
    expect(dialog?.textContent).toContain("ทำแล้ว (1)");
    expect(dialog?.textContent).toContain("ข้ามแล้ว (1)");
    expect(dialog?.textContent).toContain("ยังไม่ได้ทำเมื่อจบบริการ (2)");
    expect(dialog?.textContent).toContain("custom-a");
    expect(dialog?.textContent).toContain("custom-b");
    expect(dialog?.textContent).toContain("ต้องมีอย่างน้อยหนึ่งรายการที่ทำแล้ว");
    expect(dialog?.textContent).toContain("ไม่จำเป็นต้องจัดการทุกรายการก่อนจบ");
    expect(actions.completePatientProgramRoundAction).not.toHaveBeenCalled();
  });
  it("allows canceling round completion, then submits the exact round and nonce once after review", async () => {
    let resolveAction: ((state: typeof success) => void) | undefined;
    actions.completePatientProgramRoundAction.mockReturnValueOnce(new Promise((resolve) => { resolveAction = resolve; }));
    mount(<CompleteRoundControl target={target} roundsHref="/rounds" submissionNonce="completion-nonce" steps={[item("done", "DONE"), item("todo")] } />);
    click("จบบริการครั้งที่ 7");
    clickIn("dialog", "ยกเลิก");
    expect(actions.completePatientProgramRoundAction).not.toHaveBeenCalled();
    click("จบบริการครั้งที่ 7");
    const confirmButton = [...(container.querySelector<HTMLDialogElement>("dialog")?.querySelectorAll("button") ?? [])].find((button) => button.textContent === "จบบริการครั้งที่ 7");
    await act(async () => { confirmButton?.click(); confirmButton?.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(actions.completePatientProgramRoundAction).toHaveBeenCalledTimes(1);
    const payload = actions.completePatientProgramRoundAction.mock.calls[0]?.[1];
    expect(payload).toBeInstanceOf(FormData);
    if (!(payload instanceof FormData)) throw new Error("Round completion payload was not FormData");
    expect(Object.fromEntries(payload.entries())).toEqual({ patientHospitalRelationshipId: "relationship", patientProgramId: "program", roundNumber: "7", submissionNonce: "completion-nonce" });
    await act(async () => { resolveAction?.(success); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(actions.router.push).toHaveBeenCalledWith("/rounds");
  });
  it("recovers an unknown completion with the original nonce and FormData", async () => {
    actions.completePatientProgramRoundAction.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(success);
    mount(<CompleteRoundControl target={target} roundsHref="/rounds" submissionNonce="completion-nonce" steps={[item("done", "DONE")]} />);
    click("จบบริการครั้งที่ 7");
    clickIn("dialog", "จบบริการครั้งที่ 7");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(container.querySelector("dialog")?.textContent).toContain("ยังยืนยันผลรายการนี้ไม่ได้");
    clickIn("dialog", "ปิดหน้าต่าง");
    const recovery = [...container.querySelectorAll("button")].find((button) => button.textContent === "ตรวจสอบผลของรายการ");
    expect(recovery).toBeDefined();
    const firstPayload = actions.completePatientProgramRoundAction.mock.calls[0]?.[1];
    expect(firstPayload).toBeInstanceOf(FormData);
    if (!(firstPayload instanceof FormData)) throw new Error("Unconfirmed round completion payload was not FormData");
    await act(async () => { recovery?.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(actions.completePatientProgramRoundAction).toHaveBeenCalledTimes(2);
    const secondPayload = actions.completePatientProgramRoundAction.mock.calls[1]?.[1];
    expect(secondPayload).toBeInstanceOf(FormData);
    if (!(secondPayload instanceof FormData)) throw new Error("Resent round completion payload was not FormData");
    expect(Object.fromEntries(secondPayload.entries())).toEqual(Object.fromEntries(firstPayload.entries()));
    expect(actions.router.push).toHaveBeenCalledWith("/rounds");
  });
  it("requires an OTHER skip note and keeps the dialog and original payload available after an unknown outcome", async () => {
    actions.skipPatientProgramRoundStepAction.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(success);
    mount(<><h2 id="program-round-current-step-heading" tabIndex={-1}>Current step</h2><SkipStepControl nextHref="/rounds/next" planItemId="plan-item" stepLabel="วัดรอบเอว" target={target} /></>);
    click("ข้ามรายการนี้");
    const other = container.querySelector<HTMLInputElement>('input[value="OTHER"]');
    expect(other).toBeDefined();
    act(() => other?.click());
    const note = container.querySelector<HTMLTextAreaElement>('textarea[name="note"]');
    expect(note?.required).toBe(true);
    expect(note?.maxLength).toBe(500);
    act(() => { if(note) { note.value = "ผู้ป่วยขอเลื่อน"; } });
    const form = container.querySelector<HTMLFormElement>("dialog form");
    if (!form) throw new Error("Skip dialog form not found");
    await submit(form);
    expect(container.querySelector("dialog")?.textContent).toContain("ตรวจสอบผลของรายการ");
    expect(container.querySelector<HTMLDialogElement>("dialog")?.open).toBe(true);
    expect(container.querySelector<HTMLButtonElement>('dialog button[aria-label="ปิดหน้าต่าง"]')?.disabled).toBe(true);
    const cancelButton = [...(container.querySelector<HTMLDialogElement>("dialog")?.querySelectorAll("button") ?? [])].find((button) => button.textContent === "ยกเลิก");
    expect(cancelButton?.disabled).toBe(true);
    const firstPayload = actions.skipPatientProgramRoundStepAction.mock.calls[0]?.[1];
    expect(firstPayload).toBeInstanceOf(FormData);
    if (!(firstPayload instanceof FormData)) throw new Error("Skip payload was not FormData");
    expect(Object.fromEntries(firstPayload.entries())).toEqual({ patientHospitalRelationshipId: "relationship", patientProgramId: "program", roundNumber: "7", planItemId: "plan-item", reasonCode: "OTHER", note: "ผู้ป่วยขอเลื่อน" });
    const recovery = [...container.querySelectorAll("button")].find((button) => button.textContent === "ตรวจสอบผลของรายการ");
    expect(recovery).toBeDefined();
    await act(async () => { recovery?.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(actions.skipPatientProgramRoundStepAction).toHaveBeenCalledTimes(2);
    const secondPayload = actions.skipPatientProgramRoundStepAction.mock.calls[1]?.[1];
    expect(secondPayload).toBeInstanceOf(FormData);
    if (!(secondPayload instanceof FormData)) throw new Error("Resent skip payload was not FormData");
    expect(Object.fromEntries(secondPayload.entries())).toEqual(Object.fromEntries(firstPayload.entries()));
    expect(actions.router.push).toHaveBeenCalledWith("/rounds/next");
  });
  it("cancels skip without mutation and restores focus to the round heading", () => {
    mount(<><h2 id="program-round-current-step-heading" tabIndex={-1}>Current step</h2><SkipStepControl nextHref="/rounds/next" planItemId="plan-item" stepLabel="วัดรอบเอว" target={target} /></>);
    click("ข้ามรายการนี้");
    click("ยกเลิก");
    expect(actions.skipPatientProgramRoundStepAction).not.toHaveBeenCalled();
    expect(container.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(container.querySelector("#program-round-current-step-heading"));
  });
  it("prevents duplicate unskip submissions and preserves the plan item target", async () => {
    let resolveAction: ((state: typeof success) => void) | undefined;
    actions.unskipPatientProgramRoundStepAction.mockReturnValueOnce(new Promise((resolve) => { resolveAction = resolve; }));
    mount(<UnskipStepControl planItemId="plan-item" target={target} />);
    const form = container.querySelector<HTMLFormElement>("form");
    if (!form) throw new Error("Unskip form not found");
    const event = () => form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: form.querySelector<HTMLButtonElement>("button[type='submit']") }));
    act(() => { event(); event(); });
    expect(actions.unskipPatientProgramRoundStepAction).toHaveBeenCalledTimes(1);
    const payload = actions.unskipPatientProgramRoundStepAction.mock.calls[0]?.[1];
    expect(payload).toBeInstanceOf(FormData);
    if (!(payload instanceof FormData)) throw new Error("Unskip payload was not FormData");
    expect(Object.fromEntries(payload.entries())).toEqual({ patientHospitalRelationshipId: "relationship", patientProgramId: "program", roundNumber: "7", planItemId: "plan-item" });
    await act(async () => { resolveAction?.(success); await new Promise((resolve) => setTimeout(resolve, 0)); });
  });
});
