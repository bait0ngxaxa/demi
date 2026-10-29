// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RoundPlanEditor, PlanItemControl } from "./round-plan-editor";
import { CompleteRoundControl } from "./round-step-controls";
import { ROUND_ITEM_CATALOG, type RoundStepState } from "@/modules/patient-program-rounds/domain/round-steps";

const actions = vi.hoisted(() => ({ addRoundPlanItemAction: vi.fn(), removeRoundPlanItemAction: vi.fn(), markCustomItemDoneAction: vi.fn(), unmarkCustomItemDoneAction: vi.fn(), addProgramRoundAction: vi.fn(), completePatientProgramRoundAction: vi.fn(), recordPatientProgramRoundProfileAction: vi.fn(), skipPatientProgramRoundStepAction: vi.fn(), unskipPatientProgramRoundStepAction: vi.fn() }));
vi.mock("@/modules/patient-program-rounds/transport/server-actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), unstable_rethrow: vi.fn() }));
const target = { patientHospitalRelationshipId: "relationship", patientProgramId: "program", roundNumber: 7 };
let root: Root | undefined;
let container: HTMLDivElement;
beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  HTMLDialogElement.prototype.close = function() { this.open = false; };
  HTMLElement.prototype.scrollTo = vi.fn();
});
afterEach(() => { act(() => root?.unmount()); container?.remove(); vi.clearAllMocks(); });
function mount(element: React.ReactNode): void { container = document.createElement("div"); document.body.append(container); root = createRoot(container); act(() => root?.render(element)); }
function click(label: string): void { const button = [...container.querySelectorAll("button")].find((node) => node.textContent === label); expect(button).toBeDefined(); act(() => button?.click()); }
function item(id: string, status: RoundStepState["status"] = "TODO"): RoundStepState { return { ...ROUND_ITEM_CATALOG.CUSTOM, label: id, planItemId: id, evidence: null, skip: null, missingMeasurements: [], status }; }

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
  it("confirms removal before sending an untouched item and preserves its identity", () => {
    mount(<PlanItemControl step={item("custom-1")} target={target} submissionNonce="nonce" />);
    click("ตัดออก");
    expect(container.querySelector("dialog")?.textContent).toContain("ตัด “custom-1” ออกจากแผนหรือไม่");
    expect(actions.removeRoundPlanItemAction).not.toHaveBeenCalled();
    expect(container.querySelector('input[name="planItemId"]')?.getAttribute("value")).toBe("custom-1");
    expect(container.querySelector('textarea[name="note"]')?.getAttribute("maxlength")).toBe("500");
  });
  it("offers undo for a done CUSTOM and no removal", () => {
    mount(<PlanItemControl step={item("custom-2", "DONE")} target={target} submissionNonce="nonce" />);
    expect(container.textContent).toContain("ยกเลิกทำแล้ว");
    expect(container.textContent).not.toContain("ตัดออก");
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
    expect(actions.completePatientProgramRoundAction).not.toHaveBeenCalled();
  });
});
