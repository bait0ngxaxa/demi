import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { PersonalMedicationDetailDto } from "@/modules/medications/domain/personal-medication-definitions";
import type { PersonalMedicationActionState } from "@/modules/medications/transport/action-state";
import { MedicationScheduleEditor, MedicationEditor, MedicationStopForm } from "./personal-medication-controls";
import { PersonalMedicationWorkspace } from "./personal-medication-workspace";
import { replacePersonalMedicationSchedulesAction } from "@/modules/medications/transport/server-actions";

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, state: { status: "IDLE" } as PersonalMedicationActionState, pending: false, action: undefined as ((previous: PersonalMedicationActionState, formData: FormData) => Promise<PersonalMedicationActionState>) | undefined }));
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return { ...react, useActionState: (action: typeof hooks.action) => { hooks.action = action; return [hooks.state, () => undefined, hooks.pending]; },
    useState: (initial: unknown) => {
      const index = hooks.cursor++; if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === "function" ? initial() : initial;
      return [hooks.slots[index], (next: unknown) => { hooks.slots[index] = typeof next === "function" ? next(hooks.slots[index]) : next; }];
    }, useRef: () => ({ current: null }), useEffect: () => undefined, useId: () => "time-editor", useCallback: (callback: unknown) => callback };
});
vi.mock("@/modules/medications/transport/server-actions", () => ({ createPersonalMedicationAction: vi.fn(), updatePersonalMedicationAction: vi.fn(), stopPersonalMedicationAction: vi.fn(), replacePersonalMedicationSchedulesAction: vi.fn() }));
const item: PersonalMedicationDetailDto = { id: "11111111-1111-4111-8111-111111111111", medicationName: "ยาไทย", instructionText: null, status: "ACTIVE", stoppedAt: null, createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z", schedules: [{ localTime: "08:00" }, { localTime: "20:00" }] };
type Props = { children?: ReactNode; name?: string; value?: string; type?: string; step?: number; disabled?: boolean; onClick?: () => void; onChange?: (event: { target: { value: string } }) => void; onSubmit?: (event: { preventDefault: () => void }) => void };
function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function editor(coordination?: Parameters<typeof MedicationScheduleEditor>[0]["coordination"]): React.JSX.Element {
  hooks.cursor = 0; return MedicationScheduleEditor({ item, coordination });
}
function control(tree: ReactNode, label: string): ReactElement<Props> {
  const button = elements(tree).find((element) => element.type === Button && element.props.children === label);
  if (!button) throw new Error("Missing control"); return button;
}
function draft(tree: ReactNode): string[] {
  const field = elements(tree).find((element) => element.props.name === "times");
  if (!field?.props.value) throw new Error("Missing collection"); return JSON.parse(field.props.value) as string[];
}
describe("daily schedule editor interactions", () => {
  beforeEach(() => { hooks.slots = []; hooks.cursor = 0; hooks.state = { status: "IDLE" }; hooks.pending = false; hooks.action = undefined; vi.resetAllMocks(); vi.stubGlobal("requestAnimationFrame", (callback: () => void) => { callback(); return 1; }); });
  afterEach(() => vi.unstubAllGlobals());
  it("native minute controls carry plain HH:mm and complete JSON desired set", () => {
    const tree = editor(); const inputs = elements(tree).filter((element) => element.type === Input);
    expect(inputs.map((element) => [element.props.type, element.props.step, element.props.value])).toEqual([["time", 60, "08:00"], ["time", 60, "20:00"]]);
    expect(draft(tree)).toEqual(["08:00", "20:00"]);
  });
  it("add/edit/remove are local draft changes and cancel restores loaded values", () => {
    const onSubmit = vi.fn(); const coordination = { blocked: false, onSubmit, onResult: vi.fn() };
    control(editor(coordination), "เพิ่มเวลา").props.onClick?.();
    expect(draft(editor(coordination))).toEqual(["08:00", "20:00", ""]);
    const inputs = elements(editor(coordination)).filter((element) => element.type === Input);
    inputs[2].props.onChange?.({ target: { value: "13:30" } });
    expect(draft(editor(coordination))).toEqual(["08:00", "20:00", "13:30"]);
    control(editor(coordination), "ลบเวลา").props.onClick?.();
    expect(draft(editor(coordination))).toEqual(["20:00", "13:30"]);
    expect(onSubmit).not.toHaveBeenCalled();
    control(editor(coordination), "ยกเลิก").props.onClick?.();
    expect(draft(editor(coordination))).toEqual(["08:00", "20:00"]);
  });
  it("removing every row submits explicit [] in one complete save", () => {
    const onSubmit = vi.fn(); const coordination = { blocked: false, onSubmit, onResult: vi.fn() };
    control(editor(coordination), "ลบเวลา").props.onClick?.(); control(editor(coordination), "ลบเวลา").props.onClick?.();
    const tree = editor(coordination); const preventDefault = vi.fn();
    expect(draft(tree)).toEqual([]);
    elements(tree).find((element) => element.type === "form")?.props.onSubmit?.({ preventDefault });
    expect(preventDefault).not.toHaveBeenCalled(); expect(onSubmit).toHaveBeenCalledOnce();
  });
  it.each(["", "08:00"])("blocks invalid empty/duplicate draft %s without losing it", (value) => {
    control(editor(), "เพิ่มเวลา").props.onClick?.();
    elements(editor()).filter((element) => element.type === Input)[2].props.onChange?.({ target: { value } });
    const preventDefault = vi.fn(); elements(editor()).find((element) => element.type === "form")?.props.onSubmit?.({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce(); expect(draft(editor())).toEqual(["08:00", "20:00", value]);
    const html = renderToStaticMarkup(editor());
    expect(html).toContain(value ? "เวลาซ้ำกัน" : "กรุณาระบุเวลา HH:mm");
  });
  it.each(["SUCCESS", "CONFLICT", "ERROR"] as const)("shows %s and blocks replay until reload for uncertain/conflict outcome", (status) => {
    hooks.state = { status, message: status === "SUCCESS" ? "บันทึกเวลาแล้ว" : "โหลดข้อมูลล่าสุด", refreshRequired: status === "ERROR" };
    const html = renderToStaticMarkup(editor()); expect(html).toContain(hooks.state.message); expect(html).toContain("disabled");
    if (status !== "SUCCESS") expect(html).toContain("โหลดรายการล่าสุด");
  });
  it("pending locks selected schedule/text/stop controls locally", () => {
    hooks.pending = true;
    expect(renderToStaticMarkup(editor())).toContain("กำลังบันทึกเวลา");
    const coordination = { blocked: true, onSubmit: vi.fn(), onResult: vi.fn() };
    hooks.cursor = 0; expect(renderToStaticMarkup(MedicationEditor({ item, coordination }))).toContain("disabled");
    hooks.slots = []; hooks.cursor = 0; expect(renderToStaticMarkup(MedicationStopForm({ item, coordination }))).toContain("disabled");
  });
  it("STOPPED shows only retained ascending clock content and Thai history wording", () => {
    hooks.cursor = 0;
    const html = renderToStaticMarkup(<PersonalMedicationWorkspace active={{ items: [], nextCursor: null }} stopped={{ items: [], nextCursor: null }} selected={{ ...item, status: "STOPPED", stoppedAt: item.updatedAt }} />);
    for (const text of ["เวลาที่บันทึกไว้ก่อนหยุดติดตามรายการนี้", "08:00", "20:00", "Asia/Bangkok"]) expect(html).toContain(text);
    for (const absent of ["<form", "เพิ่มเวลา", "ลบเวลา", "บันทึกเวลา</button", "taken", "missed", "dose", "notification"]) expect(html).not.toContain(absent);
    expect(html.indexOf("08:00")).toBeLessThan(html.indexOf("20:00"));
  });
  it("all selected forms share a remount key that changes with aggregate version", () => {
    const empty = { items: [], nextCursor: null };
    hooks.cursor = 0; const before = PersonalMedicationWorkspace({ active: empty, stopped: empty, selected: item });
    hooks.cursor = 0; const after = PersonalMedicationWorkspace({ active: empty, stopped: empty, selected: { ...item, updatedAt: "2026-10-03T00:00:00.001Z" } });
    expect(elements(before).some((element) => element.key === `${item.id}:${item.updatedAt}`)).toBe(true);
    expect(elements(after).some((element) => element.key === `${item.id}:2026-10-03T00:00:00.001Z`)).toBe(true);
  });
  it("one local coordinator locks every sibling and requires reload after conflict/unknown outcome", () => {
    const empty = { items: [], nextCursor: null };
    const workspace = PersonalMedicationWorkspace({ active: empty, stopped: empty, selected: item });
    const selectedForms = elements(workspace).find((element) => element.key === `${item.id}:${item.updatedAt}`);
    if (!selectedForms || typeof selectedForms.type !== "function") throw new Error("Missing selected forms");
    type SelectedProps = { item: PersonalMedicationDetailDto; onFeedback: (state: PersonalMedicationActionState) => void };
    const component = selectedForms.type as (props: SelectedProps) => React.JSX.Element;
    const props = selectedForms.props as unknown as SelectedProps;
    type Coordination = NonNullable<Parameters<typeof MedicationScheduleEditor>[0]["coordination"]>;
    function coordination(): Coordination {
      hooks.cursor = 1; // The outer workspace owns the first local state.
      const forms = elements(component(props));
      const editor = forms.find((element) => element.type === MedicationScheduleEditor);
      if (!editor || !isValidElement<{ coordination: Coordination }>(editor)) throw new Error("Missing coordinator");
      const result = editor.props.coordination;
      for (const sibling of forms.filter((element) => element.type === MedicationEditor || element.type === MedicationStopForm)) {
        expect((sibling.props as unknown as { coordination: Coordination }).coordination).toBe(result);
      }
      return result;
    }
    expect(coordination().blocked).toBe(false);
    coordination().onSubmit(); expect(coordination().blocked).toBe(true);
    coordination().onResult({ status: "ERROR", message: "ตรวจสอบเวลา" }); expect(coordination().blocked).toBe(false);
    for (const state of [{ status: "CONFLICT" as const }, { status: "ERROR" as const, refreshRequired: true }, { status: "SUCCESS" as const, item, message: "บันทึกเวลาแล้ว" }]) {
      coordination().onResult(state); expect(coordination().blocked).toBe(true);
    }
    expect(hooks.slots[0]).toMatchObject({ status: "SUCCESS", message: "บันทึกเวลาแล้ว" });
  });
  it("reports committed success before returning the action result, independent of form remount", async () => {
    const onResult = vi.fn(); editor({ blocked: false, onSubmit: vi.fn(), onResult });
    const success = { status: "SUCCESS" as const, message: "บันทึกเวลาแล้ว", item };
    vi.mocked(replacePersonalMedicationSchedulesAction).mockResolvedValue(success);
    expect(await hooks.action?.({ status: "IDLE" }, new FormData())).toEqual(success);
    expect(onResult).toHaveBeenCalledExactlyOnceWith(success);
  });
  it("a rejected browser action becomes an ambiguous outcome requiring refresh without replay", async () => {
    const onResult = vi.fn(); editor({ blocked: false, onSubmit: vi.fn(), onResult });
    vi.mocked(replacePersonalMedicationSchedulesAction).mockRejectedValue(new Error("private network detail"));
    const result = await hooks.action?.({ status: "IDLE" }, new FormData());
    expect(result).toMatchObject({ status: "ERROR", refreshRequired: true });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(replacePersonalMedicationSchedulesAction).toHaveBeenCalledOnce(); expect(onResult).toHaveBeenCalledWith(result);
  });
});
