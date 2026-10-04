import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExerciseActionState } from "@/modules/exercises/transport/action-state";
import type { WellnessPrivateAuthority } from "./wellness-private-authority";
import { createWellnessPrivateAuthority } from "./wellness-private-authority";
const harness = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[], actions: [] as ((previous: ExerciseActionState, form: FormData) => Promise<ExerciseActionState>)[], setters: [] as unknown[], buttons: [] as { children?: unknown; onClick?: () => void }[], transitions: [] as Promise<void>[], create: vi.fn(), list: vi.fn() }));
vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return { ...original, useEffect: (effect: () => void | (() => void)) => { harness.effects.push(effect); },
    useState: (initial: unknown) => [initial, (value: unknown) => { harness.setters.push(value); }],
    useTransition: () => [false, (work: () => Promise<void>) => { harness.transitions.push(work()); }],
    useActionState: (action: (previous: ExerciseActionState, form: FormData) => Promise<ExerciseActionState>) => { harness.actions.push(action); return [{ status: "IDLE" }, () => undefined, false]; } };
});
vi.mock("@/components/ui/button", () => ({ Button: (props: { children?: React.ReactNode; onClick?: () => void }) => { harness.buttons.push(props); return <button>{props.children}</button>; } }));
vi.mock("@/modules/exercises/transport/server-actions", () => ({ createPersonalExerciseAction: harness.create, updatePersonalExerciseAction: vi.fn(), deletePersonalExerciseAction: vi.fn(), listPersonalExercisesAction: harness.list }));
import { PersonalExerciseWorkspace } from "./personal-exercise-workspace";
let authority: WellnessPrivateAuthority;
let invalidated: boolean;
const row = { id: "11111111-1111-4111-8111-111111111111", activityName: "เดิน", durationMinutes: null, occurredOn: "2026-10-03", note: "สังเคราะห์", createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" };
const success: ExerciseActionState = { status: "SUCCESS", result: { outcome: "CREATED", item: row } };
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve };
}
describe("Exercise client lifecycle callback evidence (no browser)", () => {
  it("consumed result never rotates/resubmits automatically; explicit new intent uses fresh UUID", async () => {
    harness.effects.forEach((effect) => effect());
    const freshNonce = "22222222-2222-4222-8222-222222222222";
    const uuid = vi.fn(() => freshNonce); vi.stubGlobal("crypto", { randomUUID: uuid });
    harness.create.mockResolvedValue({ status: "CREATE_CONSUMED" });
    await harness.actions[0]({ status: "IDLE" }, new FormData());
    expect(uuid).not.toHaveBeenCalled(); expect(harness.create).toHaveBeenCalledTimes(1);
    harness.buttons.find((button) => button.children === "เริ่มบันทึกใหม่")?.onClick?.();
    expect(uuid).toHaveBeenCalledTimes(1); expect(harness.setters).toContain(freshNonce);
    expect(harness.create).toHaveBeenCalledTimes(1);
    const html = renderToStaticMarkup(<PersonalExerciseWorkspace initialPage={{ items: [], nextCursor: null }} today={row.occurredOn} initialNonce={freshNonce} authority={authority} />);
    expect(html).toContain(`name="submissionNonce" value="${freshNonce}"`);
  });
  beforeEach(() => {
    vi.clearAllMocks(); harness.effects.length = 0; harness.actions.length = 0; harness.setters.length = 0; harness.buttons.length = 0; harness.transitions.length = 0;
    invalidated = false; authority = createWellnessPrivateAuthority(() => { invalidated = true; });
    renderToStaticMarkup(<PersonalExerciseWorkspace initialPage={{ items: [], nextCursor: null }} today={row.occurredOn} initialNonce={row.id} authority={authority} />);
  });
  afterEach(() => vi.unstubAllGlobals());
  it("Strict Mode setup/cleanup/setup still processes authoritative mutation result", async () => {
    const cleanups = harness.effects.map((effect) => effect());
    for (const cleanup of cleanups) if (typeof cleanup === "function") cleanup();
    harness.effects.forEach((effect) => effect());
    harness.create.mockResolvedValue(success);
    await harness.actions[0]({ status: "IDLE" }, new FormData());
    expect(harness.setters).toContainEqual(success); expect(harness.setters.some((value) => typeof value === "function")).toBe(true);
  });
  it("shared authority invalidation drops a delayed Exercise mutation result synchronously", async () => {
    harness.effects.forEach((effect) => effect());
    const response = deferred<ExerciseActionState>(); harness.create.mockReturnValue(response.promise);
    const pending = harness.actions[0]({ status: "IDLE" }, new FormData());
    const generation = authority.captureGeneration(); authority.invalidate();
    expect(authority.isCurrent(generation)).toBe(false); response.resolve(success);
    await expect(pending).resolves.toEqual({ status: "IDLE" });
    expect(harness.setters).not.toContainEqual(success); expect(invalidated).toBe(true);
  });
  it("a delayed Exercise list response is ignored after sibling invalidation", async () => {
    harness.effects.forEach((effect) => effect());
    const response = deferred<ExerciseActionState>(); harness.list.mockReturnValue(response.promise);
    harness.buttons.find((button) => button.children === "โหลดรายการล่าสุด")?.onClick?.();
    const generation = authority.captureGeneration(); authority.invalidate();
    response.resolve({ status: "SUCCESS", page: { items: [row], nextCursor: null } }); await harness.transitions[0];
    expect(authority.isCurrent(generation)).toBe(false);
    expect(harness.setters).not.toContainEqual(expect.any(Function));
  });
  it("unmount/account replacement invalidates an old delayed mutation callback", async () => {
    const cleanups = harness.effects.map((effect) => effect());
    const response = deferred<ExerciseActionState>(); harness.create.mockReturnValue(response.promise);
    const pending = harness.actions[0]({ status: "IDLE" }, new FormData());
    for (const cleanup of cleanups) if (typeof cleanup === "function") cleanup();
    response.resolve(success); await pending; expect(harness.setters).not.toContainEqual(success);
  });
  it("Exercise DENIED invalidates the shared authority and clears Exercise payload", async () => {
    harness.effects.forEach((effect) => effect());
    harness.list.mockResolvedValue({ status: "DENIED", message: "ปฏิเสธ" });
    harness.buttons.find((button) => button.children === "โหลดรายการล่าสุด")?.onClick?.();
    await harness.transitions[0];
    expect(authority.isActive()).toBe(false); expect(invalidated).toBe(true);
    expect(harness.setters).toContainEqual({ items: [], nextCursor: null });
    expect(harness.setters.some((value) => typeof value === "object" && value !== null && "status" in value && value.status === "DENIED")).toBe(false);
  });
});
