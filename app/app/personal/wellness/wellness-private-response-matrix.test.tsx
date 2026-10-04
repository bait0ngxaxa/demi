import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonalWeightGoalDto } from "@/modules/weight-goals/domain/personal-weight-goal";
import type { PersonalWeightGoalActionState } from "@/modules/weight-goals/transport/action-state";
import type { MealActionState } from "@/modules/meals/transport/action-state";
import type { ExerciseActionState } from "@/modules/exercises/transport/action-state";
import { PersonalExerciseWorkspace } from "./personal-exercise-workspace";
import { ExerciseEditor } from "./personal-exercise-controls";
import { PersonalMealWorkspace } from "./personal-meal-workspace";
import { MealEditor } from "./personal-meal-controls";
import { PersonalWeightGoalWorkspace } from "./personal-weight-goal-workspace";
import { PersonalWeightGoalEditor } from "./personal-weight-goal-controls";
import { createWellnessPrivateAuthority } from "./wellness-private-authority";

type Domain = "Meal" | "Exercise" | "Weight";
type ResponseKind = "read" | "mutation";
type ActionState = MealActionState | ExerciseActionState | PersonalWeightGoalActionState;
type HookAction = (previous: unknown, formData: FormData) => Promise<unknown>;

const harness = vi.hoisted(() => ({
  component: "",
  hookIndex: 0,
  states: new Map<string, unknown>(),
  refs: new Map<string, { current: unknown }>(),
  writes: [] as { key: string; value: unknown }[],
  transitions: [] as Promise<void>[],
  actions: [] as { component: string; handler: HookAction }[],
}));

const serverActions = vi.hoisted(() => ({
  createMeal: vi.fn(),
  updateMeal: vi.fn(),
  deleteMeal: vi.fn(),
  listMeals: vi.fn(),
  createExercise: vi.fn(),
  updateExercise: vi.fn(),
  deleteExercise: vi.fn(),
  listExercises: vi.fn(),
  createWeightGoal: vi.fn(),
  updateWeightGoal: vi.fn(),
  removeWeightGoal: vi.fn(),
  readWeightGoal: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  const nextKey = (): string => `${harness.component}:${harness.hookIndex++}`;
  return {
    ...original,
    useState: (initial: unknown) => {
      const key = nextKey();
      if (!harness.states.has(key)) {
        harness.states.set(key, typeof initial === "function" ? (initial as () => unknown)() : initial);
      }
      const setState = (value: unknown): void => {
        const next = typeof value === "function"
          ? (value as (previous: unknown) => unknown)(harness.states.get(key))
          : value;
        harness.states.set(key, next);
        harness.writes.push({ key, value: next });
      };
      return [harness.states.get(key), setState];
    },
    useRef: (initial: unknown) => {
      const key = nextKey();
      if (!harness.refs.has(key)) harness.refs.set(key, { current: initial });
      return harness.refs.get(key);
    },
    useEffect: () => { nextKey(); },
    useId: () => nextKey(),
    useTransition: () => [false, (work: () => Promise<void>) => { harness.transitions.push(work()); }],
    useActionState: (handler: HookAction, initial: unknown) => {
      nextKey();
      harness.actions.push({ component: harness.component, handler });
      return [initial, (formData: FormData) => handler(initial, formData), false];
    },
  };
});

vi.mock("@/modules/meals/transport/server-actions", () => ({
  createPersonalMealAction: serverActions.createMeal,
  updatePersonalMealAction: serverActions.updateMeal,
  deletePersonalMealAction: serverActions.deleteMeal,
  listPersonalMealsAction: serverActions.listMeals,
}));
vi.mock("@/modules/exercises/transport/server-actions", () => ({
  createPersonalExerciseAction: serverActions.createExercise,
  updatePersonalExerciseAction: serverActions.updateExercise,
  deletePersonalExerciseAction: serverActions.deleteExercise,
  listPersonalExercisesAction: serverActions.listExercises,
}));
vi.mock("@/modules/weight-goals/transport/server-actions", () => ({
  createPersonalWeightGoalAction: serverActions.createWeightGoal,
  updatePersonalWeightGoalAction: serverActions.updateWeightGoal,
  removePersonalWeightGoalAction: serverActions.removeWeightGoal,
  readPersonalWeightGoalAction: serverActions.readWeightGoal,
}));

type Element = ReactElement<Record<string, unknown>>;

function elements(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (node === null || typeof node !== "object" || !("type" in node) || !("props" in node)) return [];
  const element = node as Element;
  return [element, ...elements(element.props.children)];
}

function textContent(node: unknown): string {
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (node === null || typeof node !== "object" || !("props" in node)) return "";
  return textContent((node as Element).props.children);
}

function renderWithHooks<T>(component: string, render: () => T): T {
  harness.component = component;
  harness.hookIndex = 0;
  return render();
}

function clickButton(tree: unknown, label: string): void {
  const button = elements(tree).find((element) =>
    typeof element.props.onClick === "function" && textContent(element.props.children) === label);
  if (!button || typeof button.props.onClick !== "function") throw new Error(`Expected button: ${label}`);
  (button.props.onClick as () => void)();
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const meal = {
  id: "11111111-1111-4111-8111-111111111111",
  category: "SNACK" as const,
  occurredOn: "2026-10-04",
  description: "สังเคราะห์",
  createdAt: "2026-10-04T00:00:00.000Z",
  updatedAt: "2026-10-04T00:00:00.000Z",
};
const exercise = {
  id: "22222222-2222-4222-8222-222222222222",
  activityName: "เดิน",
  occurredOn: "2026-10-04",
  durationMinutes: null,
  note: "สังเคราะห์",
  createdAt: "2026-10-04T00:00:00.000Z",
  updatedAt: "2026-10-04T00:00:00.000Z",
};
const weightGoal: PersonalWeightGoalDto = {
  id: "33333333-3333-4333-8333-333333333333",
  targetWeightKg: "72.555",
  targetDate: null,
  createdAt: "2026-10-04T00:00:00.000Z",
  updatedAt: "2026-10-04T00:00:00.000Z",
};

function workspace(domain: Domain, authority: ReturnType<typeof createWellnessPrivateAuthority>): unknown {
  if (domain === "Meal") {
    return renderWithHooks("Meal", () => PersonalMealWorkspace({
      initialPage: { items: [], nextCursor: null },
      today: "2026-10-04",
      initialNonce: "11111111-1111-4111-8111-111111111111",
      authority,
    }));
  }
  if (domain === "Exercise") {
    return renderWithHooks("Exercise", () => PersonalExerciseWorkspace({
      initialPage: { items: [], nextCursor: null },
      today: "2026-10-04",
      initialNonce: "22222222-2222-4222-8222-222222222222",
      authority,
    }));
  }
  return renderWithHooks("Weight", () => PersonalWeightGoalWorkspace({
    initialGoal: null,
    initialNonce: "33333333-3333-4333-8333-333333333333",
    authority,
  }));
}

function editorType(domain: Domain): unknown {
  if (domain === "Meal") return MealEditor;
  if (domain === "Exercise") return ExerciseEditor;
  return PersonalWeightGoalEditor;
}

function editorElement(tree: unknown, domain: Domain): Element {
  const editor = elements(tree).find((element) => element.type === editorType(domain));
  if (!editor) throw new Error(`Expected ${domain} editor`);
  return editor;
}

function openEditor(tree: unknown, domain: Domain, authority: ReturnType<typeof createWellnessPrivateAuthority>): unknown {
  if (domain === "Weight") {
    clickButton(tree, "ตั้งเป้าหมายน้ำหนัก");
    return workspace(domain, authority);
  }
  return tree;
}

function denySource(domain: Domain, authority: ReturnType<typeof createWellnessPrivateAuthority>): void {
  const tree = openEditor(workspace(domain, authority), domain, authority);
  const coordination = editorElement(tree, domain).props.coordination as unknown as {
    onResult: (state: { status: "DENIED"; message: string }) => void;
  };
  coordination.onResult({ status: "DENIED", message: "ปฏิเสธ" });
}

function mutationState(domain: Domain): ActionState {
  if (domain === "Meal") return { status: "SUCCESS", result: { outcome: "CREATED", item: meal } };
  if (domain === "Exercise") return { status: "SUCCESS", result: { outcome: "CREATED", item: exercise } };
  return { status: "SUCCESS", result: { outcome: "CREATED", goal: weightGoal } };
}

function readState(domain: Domain): ActionState {
  if (domain === "Meal") return { status: "SUCCESS", page: { items: [meal], nextCursor: null } };
  if (domain === "Exercise") return { status: "SUCCESS", page: { items: [exercise], nextCursor: null } };
  return { status: "SUCCESS", currentGoal: weightGoal };
}

function preparePendingRead(domain: Domain, authority: ReturnType<typeof createWellnessPrivateAuthority>) {
  const response = deferred<ActionState>();
  if (domain === "Meal") serverActions.listMeals.mockReturnValueOnce(response.promise);
  if (domain === "Exercise") serverActions.listExercises.mockReturnValueOnce(response.promise);
  if (domain === "Weight") serverActions.readWeightGoal.mockReturnValueOnce(response.promise);
  let tree = workspace(domain, authority);
  if (domain === "Weight") {
    tree = openEditor(tree, domain, authority);
    const coordination = editorElement(tree, domain).props.coordination as unknown as {
      onResult: (state: PersonalWeightGoalActionState) => void;
    };
    coordination.onResult({ status: "CREATE_CONSUMED", message: "คำขอถูกใช้แล้ว" });
    tree = workspace(domain, authority);
    clickButton(tree, "โหลดข้อมูลล่าสุด");
  } else {
    clickButton(tree, "โหลดรายการล่าสุด");
  }
  const pending = harness.transitions.at(-1);
  if (!pending) throw new Error(`Expected pending ${domain} read`);
  return { response, pending };
}

function preparePendingMutation(domain: Domain, authority: ReturnType<typeof createWellnessPrivateAuthority>) {
  const response = deferred<ActionState>();
  if (domain === "Meal") serverActions.createMeal.mockReturnValueOnce(response.promise);
  if (domain === "Exercise") serverActions.createExercise.mockReturnValueOnce(response.promise);
  if (domain === "Weight") {
    serverActions.createWeightGoal.mockReturnValueOnce(response.promise);
  }

  let tree = workspace(domain, authority);
  tree = openEditor(tree, domain, authority);
  const props = editorElement(tree, domain).props;
  const form = renderWithHooks(`${domain}:editor`, () => {
    if (domain === "Meal") return MealEditor(props as unknown as Parameters<typeof MealEditor>[0]);
    if (domain === "Exercise") return ExerciseEditor(props as unknown as Parameters<typeof ExerciseEditor>[0]);
    return PersonalWeightGoalEditor(props as unknown as Parameters<typeof PersonalWeightGoalEditor>[0]);
  });
  const formElement = elements(form).find((element) => element.type === "form");
  if (!formElement || typeof formElement.props.action !== "function") throw new Error(`Expected ${domain} mutation form`);
  const action = formElement.props.action as (formData: FormData) => Promise<unknown>;
  const pending = action(new FormData());
  return { response, pending };
}

function expectServerRequestStarted(domain: Domain, kind: ResponseKind): void {
  if (kind === "read") {
    if (domain === "Meal") expect(serverActions.listMeals).toHaveBeenCalledOnce();
    if (domain === "Exercise") expect(serverActions.listExercises).toHaveBeenCalledOnce();
    if (domain === "Weight") expect(serverActions.readWeightGoal).toHaveBeenCalledOnce();
    return;
  }
  if (domain === "Meal") expect(serverActions.createMeal).toHaveBeenCalledOnce();
  if (domain === "Exercise") expect(serverActions.createExercise).toHaveBeenCalledOnce();
  if (domain === "Weight") expect(serverActions.createWeightGoal).toHaveBeenCalledOnce();
}

const denialSources: readonly Domain[] = ["Meal", "Exercise", "Weight"];
const pendingTargets: readonly Domain[] = ["Meal", "Exercise", "Weight"];
const responseKinds: readonly ResponseKind[] = ["read", "mutation"];
const responseMatrix = denialSources.flatMap((source) => pendingTargets
  .filter((target) => target !== source)
  .flatMap((target) => responseKinds.map((kind) => ({ source, target, kind }))));

describe("shared Wellness privacy response matrix", () => {
  beforeEach(() => {
    harness.component = "";
    harness.hookIndex = 0;
    harness.states.clear();
    harness.refs.clear();
    harness.writes.length = 0;
    harness.transitions.length = 0;
    harness.actions.length = 0;
    for (const action of Object.values(serverActions)) action.mockReset();
  });

  it.each(responseMatrix)("$source DENIED prevents a pending $target $kind response from restoring private state", async ({ source, target, kind }) => {
    const onInvalidate = vi.fn();
    const authority = createWellnessPrivateAuthority(onInvalidate);
    const started = kind === "read"
      ? preparePendingRead(target, authority)
      : preparePendingMutation(target, authority);
    expectServerRequestStarted(target, kind);

    denySource(source, authority);
    expect(authority.isActive()).toBe(false);
    expect(onInvalidate).toHaveBeenCalledOnce();
    const writesAtDenial = harness.writes.length;

    started.response.resolve(kind === "read" ? readState(target) : mutationState(target));
    await started.pending;

    expect(harness.writes).toHaveLength(writesAtDenial);
    expect(authority.isActive()).toBe(false);
    if (target === "Weight") expect(harness.states.get("Weight:0")).toBeNull();
    if (target === "Meal" || target === "Exercise") {
      expect(harness.states.get(`${target}:0`)).toEqual({ items: [], nextCursor: null });
    }
  });
});
