import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/modules/weight-goals/transport/server-actions", () => ({ createPersonalWeightGoalAction: vi.fn(), updatePersonalWeightGoalAction: vi.fn(), removePersonalWeightGoalAction: vi.fn(), readPersonalWeightGoalAction: vi.fn() }));
import { PersonalExerciseWorkspace } from "./personal-exercise-workspace";
import { PersonalMealWorkspace } from "./personal-meal-workspace";
import { PersonalWeightGoalWorkspace } from "./personal-weight-goal-workspace";
import { PersonalWellnessWorkspace } from "./personal-wellness-workspace";
import type { WellnessPrivateAuthority } from "./wellness-private-authority";

type TestElementProps = { children?: unknown; href?: unknown };

const harness = vi.hoisted(() => ({
  session: undefined as unknown,
  authority: undefined as unknown,
  sessionInitialized: false,
  authorityInitialized: false,
  stateCursor: 0,
  effect: undefined as (() => void | (() => void)) | undefined,
  events: new Map<string, EventListenerOrEventListenerObject>(),
  reload: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return {
    ...original,
    useState: (initial: unknown) => {
      const stateIndex = harness.stateCursor++;
      if (stateIndex === 0) {
        if (!harness.sessionInitialized) { harness.session = typeof initial === "function" ? (initial as () => unknown)() : initial; harness.sessionInitialized = true; }
        return [harness.session, (value: unknown) => {
          harness.session = typeof value === "function" ? (value as (current: unknown) => unknown)(harness.session) : value;
        }];
      }
      if (!harness.authorityInitialized) { harness.authority = typeof initial === "function" ? (initial as () => unknown)() : initial; harness.authorityInitialized = true; }
      return [harness.authority, (value: unknown) => { harness.authority = value; }];
    },
    useEffect: (effect: () => void | (() => void)) => { harness.effect ??= effect; },
  };
});

const props = {
  mealPage: { items: [{ id: "meal-id", category: "SNACK" as const, occurredOn: "2026-10-03", description: "private meal marker", createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" }], nextCursor: "meal-cursor" },
  exercisePage: { items: [{ id: "exercise-id", activityName: "private exercise marker", occurredOn: "2026-10-03", durationMinutes: 20, note: "private note", createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" }], nextCursor: "exercise-cursor" },
  weightGoal: { id: "weight-id", targetWeightKg: "72.555", targetDate: "2026-10-01", createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" },
  today: "2026-10-04",
  mealNonce: "11111111-1111-4111-8111-111111111111",
  exerciseNonce: "22222222-2222-4222-8222-222222222222",
  weightGoalNonce: "33333333-3333-4333-8333-333333333333",
};

function elements(node: unknown): ReactElement<TestElementProps>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (node === null || typeof node !== "object" || !("type" in node) || !("props" in node)) return [];
  const element = node as ReactElement<TestElementProps>;
  return [element, ...elements(element.props.children)];
}

function textContent(node: unknown): string {
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (node === null || typeof node !== "object" || !("props" in node)) return "";
  return textContent((node as ReactElement<TestElementProps>).props.children);
}

function childAuthority(tree: ReactElement, child: typeof PersonalMealWorkspace | typeof PersonalExerciseWorkspace | typeof PersonalWeightGoalWorkspace): WellnessPrivateAuthority {
  const element = elements(tree).find((candidate) => candidate.type === child);
  if (!element) throw new Error("Expected Wellness child workspace");
  const childProps = element.props as unknown as { authority: WellnessPrivateAuthority };
  return childProps.authority;
}

function renderParent(): ReactElement {
  harness.stateCursor = 0;
  return PersonalWellnessWorkspace(props);
}

beforeEach(() => {
  harness.session = undefined;
  harness.authority = undefined;
  harness.sessionInitialized = false;
  harness.authorityInitialized = false;
  harness.stateCursor = 0;
  harness.effect = undefined;
  harness.events.clear();
  harness.reload.mockClear();
  vi.stubGlobal("window", {
    addEventListener: (name: string, handler: EventListenerOrEventListenerObject) => harness.events.set(name, handler),
    removeEventListener: (name: string) => { harness.events.delete(name); },
    location: { reload: harness.reload },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("Wellness shared private authority lifetime", () => {
  it("passes one synchronous authority to all three domains and removes every private payload after invalidation", () => {
    const authorizedTree = renderParent();
    const mealAuthority = childAuthority(authorizedTree, PersonalMealWorkspace);
    const exerciseAuthority = childAuthority(authorizedTree, PersonalExerciseWorkspace);
    const weightAuthority = childAuthority(authorizedTree, PersonalWeightGoalWorkspace);
    expect(mealAuthority).toBe(exerciseAuthority);
    expect(weightAuthority).toBe(exerciseAuthority);
    const pendingGeneration = mealAuthority.captureGeneration();

    mealAuthority.invalidate();
    expect(mealAuthority.isCurrent(pendingGeneration)).toBe(false);
    expect(harness.session).toBeNull();

    const deniedTree = renderParent();
    const deniedElements = elements(deniedTree);
    expect(deniedElements.some((element) => element.type === PersonalMealWorkspace || element.type === PersonalExerciseWorkspace || element.type === PersonalWeightGoalWorkspace || element.type === "form")).toBe(false);
    expect(textContent(deniedTree)).toContain("กรุณาเปิดหน้าสุขภาพใหม่เพื่อยืนยันสิทธิ์");
    expect(deniedElements.some((element) => element.type === "a" && element.props.href === "/app/personal/wellness")).toBe(true);
    expect(textContent(deniedTree)).not.toContain("private meal marker");
    expect(textContent(deniedTree)).not.toContain("private exercise marker");
    expect(textContent(deniedTree)).not.toContain("72.555");
    expect(textContent(deniedTree)).not.toContain(props.mealNonce);
    expect(textContent(deniedTree)).not.toContain(props.exerciseNonce);
  });

  it("pagehide invalidates all domains; persisted pageshow requests a fresh reload", () => {
    const tree = renderParent();
    const authority = childAuthority(tree, PersonalWeightGoalWorkspace);
    const generation = authority.captureGeneration();
    const cleanup = harness.effect?.();
    expect(harness.events.has("pagehide")).toBe(true);
    expect(harness.events.has("pageshow")).toBe(true);

    const pagehide = harness.events.get("pagehide");
    if (typeof pagehide === "function") pagehide(new Event("pagehide"));
    expect(authority.isCurrent(generation)).toBe(false);
    expect(harness.session).toBeNull();
    const deniedTree = renderParent();
    expect(elements(deniedTree).some((element) => element.type === PersonalMealWorkspace || element.type === PersonalExerciseWorkspace || element.type === PersonalWeightGoalWorkspace)).toBe(false);

    const pageshow = harness.events.get("pageshow");
    if (typeof pageshow === "function") pageshow({ persisted: true } as unknown as PageTransitionEvent);
    expect(harness.reload).toHaveBeenCalledOnce();
    if (typeof cleanup === "function") cleanup();
  });

  it("Strict Mode setup/cleanup/setup resumes only a fresh shared generation", () => {
    const tree = renderParent();
    const authority = childAuthority(tree, PersonalWeightGoalWorkspace);
    const before = authority.captureGeneration();
    const cleanup = harness.effect?.();
    if (typeof cleanup === "function") cleanup();
    expect(authority.isActive()).toBe(false);
    expect(harness.session).not.toBeNull();

    harness.effect?.();
    expect(authority.isActive()).toBe(true);
    expect(authority.captureGeneration()).not.toBe(before);
    expect(harness.session).not.toBeNull();
  });
});
