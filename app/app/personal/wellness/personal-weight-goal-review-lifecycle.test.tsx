import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonalWeightGoalDto } from "@/modules/weight-goals/domain/personal-weight-goal";

const harness = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as { current: unknown }[],
  dependencies: [] as (readonly unknown[] | undefined)[],
  effects: [] as (() => unknown)[],
  transitions: [] as Promise<unknown>[],
  stateCursor: 0,
  refCursor: 0,
  effectCursor: 0,
  focus: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = harness.stateCursor++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (value: unknown) => { harness.states[index] = value; }];
  },
  useRef: (initial: unknown) => {
    const index = harness.refCursor++;
    harness.refs[index] ??= { current: initial };
    return harness.refs[index];
  },
  useEffect: (effect: () => unknown, dependencies?: readonly unknown[]) => {
    const index = harness.effectCursor++;
    const previous = harness.dependencies[index];
    if (!dependencies || !previous || dependencies.some((value, i) => !Object.is(value, previous[i]))) harness.effects.push(effect);
    harness.dependencies[index] = dependencies;
  },
  useTransition: () => [false, (callback: () => Promise<unknown>) => { harness.transitions.push(callback()); }],
}));
vi.mock("@/modules/weight-goals/transport/server-actions", () => ({
  createPersonalWeightGoalAction: vi.fn(), updatePersonalWeightGoalAction: vi.fn(), removePersonalWeightGoalAction: vi.fn(), readPersonalWeightGoalAction: vi.fn(),
}));

import { Button } from "@/components/ui/button";
import { readPersonalWeightGoalAction } from "@/modules/weight-goals/transport/server-actions";
import { PersonalWeightGoalEditor, PersonalWeightGoalRemoveConfirmation, type Coordination } from "./personal-weight-goal-controls";
import { PersonalWeightGoalWorkspace } from "./personal-weight-goal-workspace";
import { createWellnessPrivateAuthority } from "./wellness-private-authority";

type ElementProps = {
  children?: unknown;
  onClick?: () => void;
  onCancel?: () => void;
  coordination?: Coordination;
  nonce?: string;
  ref?: { current: unknown };
};
const initialNonce = "11111111-1111-4111-8111-111111111111";
let authority = createWellnessPrivateAuthority(vi.fn());
const goal: PersonalWeightGoalDto = {
  id: "22222222-2222-4222-8222-222222222222", targetWeightKg: "72.5", targetDate: null,
  createdAt: "2026-10-04T00:00:00.000Z", updatedAt: "2026-10-04T00:00:00.000Z",
};

function elements(node: unknown): ReactElement<ElementProps>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node) || !("type" in node)) return [];
  const element = node as ReactElement<ElementProps>;
  return [element, ...elements(element.props.children)];
}

function textContent(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return textContent((node as ReactElement<ElementProps>).props.children);
}

function button(tree: ReactElement, label: string): ReactElement<ElementProps> | undefined {
  return elements(tree).find((element) => element.type === Button && textContent(element.props.children) === label);
}

function click(tree: ReactElement, label: string): void {
  const onClick = button(tree, label)?.props.onClick;
  if (!onClick) throw new Error(`Expected button: ${label}`);
  onClick();
}

function renderWorkspace(initialGoal: PersonalWeightGoalDto | null = null): ReactElement {
  harness.stateCursor = 0;
  harness.refCursor = 0;
  harness.effectCursor = 0;
  const tree = PersonalWeightGoalWorkspace({ initialGoal, initialNonce, authority });
  // Simulate React's commit ordering: detach old element refs, attach mounted
  // refs, then run effects. In confirmation the remove opener is absent.
  for (const ref of harness.refs) if (ref.current && typeof ref.current === "object" && "focus" in ref.current) ref.current = null;
  for (const element of elements(tree)) if (element.props.ref) element.props.ref.current = { focus: harness.focus };
  for (const effect of harness.effects.splice(0)) effect();
  return tree;
}

beforeEach(() => {
  harness.states = [];
  harness.refs = [];
  harness.dependencies = [];
  harness.effects = [];
  harness.transitions = [];
  harness.focus.mockReset();
  vi.mocked(readPersonalWeightGoalAction).mockReset();
  authority = createWellnessPrivateAuthority(vi.fn());
});

afterEach(() => vi.restoreAllMocks());

describe("Weight Goal review and focus lifecycle", () => {
  it.each(["UNCONFIRMED", "ERROR", "throw", "missing-currentGoal"] as const)("keeps a consumed intent blocked after refresh %s until an authoritative empty read", async (failure) => {
    const randomUUID = vi.spyOn(crypto, "randomUUID");
    let tree = renderWorkspace();
    click(tree, "ตั้งเป้าหมายน้ำหนัก");
    tree = renderWorkspace();
    const editor = elements(tree).find((element) => element.type === PersonalWeightGoalEditor);
    expect(editor?.props.nonce).toBe(initialNonce);
    editor?.props.coordination?.onResult({ status: "CREATE_CONSUMED" });
    tree = renderWorkspace();
    expect(button(tree, "ตั้งเป้าหมายน้ำหนัก")).toBeUndefined();

    if (failure === "throw") vi.mocked(readPersonalWeightGoalAction).mockRejectedValueOnce(new Error("offline"));
    else if (failure === "missing-currentGoal") vi.mocked(readPersonalWeightGoalAction).mockResolvedValueOnce({ status: "SUCCESS" });
    else vi.mocked(readPersonalWeightGoalAction).mockResolvedValueOnce({ status: failure });
    click(tree, "โหลดข้อมูลล่าสุด");
    await Promise.all(harness.transitions.splice(0));
    tree = renderWorkspace();
    expect(button(tree, "ตั้งเป้าหมายน้ำหนัก")).toBeUndefined();
    expect(textContent(tree)).not.toContain("ยังไม่ได้ตั้งเป้าหมายน้ำหนักส่วนตัว");
    expect(elements(tree).some((element) => element.type === PersonalWeightGoalEditor)).toBe(false);
    expect(button(tree, "โหลดข้อมูลล่าสุด")).toBeDefined();

    vi.mocked(readPersonalWeightGoalAction).mockResolvedValueOnce({ status: "SUCCESS", currentGoal: null });
    click(tree, "โหลดข้อมูลล่าสุด");
    await Promise.all(harness.transitions.splice(0));
    tree = renderWorkspace();
    expect(button(tree, "ตั้งเป้าหมายน้ำหนัก")).toBeDefined();
    expect(elements(tree).some((element) => element.type === PersonalWeightGoalEditor)).toBe(false);
    expect(randomUUID).not.toHaveBeenCalled();
    click(tree, "ตั้งเป้าหมายน้ำหนัก");
    tree = renderWorkspace();
    const freshEditor = elements(tree).find((element) => element.type === PersonalWeightGoalEditor);
    expect(freshEditor?.props.nonce).not.toBe(initialNonce);
    expect(freshEditor?.props.nonce).toMatch(/^[0-9a-f-]{36}$/u);
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("shows the authoritative current goal after a consumed intent instead of starting a fresh intent", async () => {
    let tree = renderWorkspace();
    click(tree, "ตั้งเป้าหมายน้ำหนัก");
    tree = renderWorkspace();
    elements(tree).find((element) => element.type === PersonalWeightGoalEditor)?.props.coordination?.onResult({ status: "CREATE_CONSUMED" });
    tree = renderWorkspace();
    vi.mocked(readPersonalWeightGoalAction).mockResolvedValueOnce({ status: "SUCCESS", currentGoal: goal });
    click(tree, "โหลดข้อมูลล่าสุด");
    await Promise.all(harness.transitions.splice(0));
    tree = renderWorkspace();
    expect(button(tree, "แก้ไข")).toBeDefined();
    expect(button(tree, "ตั้งเป้าหมายน้ำหนัก")).toBeUndefined();
  });

  it("restores focus on cancel only after the remove opener mounts again", () => {
    let tree = renderWorkspace(goal);
    click(tree, "ลบเป้าหมาย");
    tree = renderWorkspace(goal);
    expect(button(tree, "ลบเป้าหมาย")).toBeUndefined();
    harness.focus.mockClear();
    const onCancel = elements(tree).find((element) => element.type === PersonalWeightGoalRemoveConfirmation)?.props.onCancel;
    if (!onCancel) throw new Error("Expected remove confirmation");
    onCancel();
    expect(harness.focus).not.toHaveBeenCalled();
    tree = renderWorkspace(goal);
    expect(button(tree, "ลบเป้าหมาย")).toBeDefined();
    expect(harness.focus).toHaveBeenCalledOnce();
    renderWorkspace(goal);
    expect(harness.focus).toHaveBeenCalledOnce();
  });
});
