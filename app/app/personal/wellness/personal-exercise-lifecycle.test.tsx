import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExerciseActionState } from "@/modules/exercises/transport/action-state";
const harness = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[], actions: [] as ((previous: ExerciseActionState, form: FormData) => Promise<ExerciseActionState>)[], setters: [] as unknown[], buttons: [] as { children?: unknown; onClick?: () => void }[], create: vi.fn(), list: vi.fn() }));
vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return { ...original, useEffect: (effect: () => void | (() => void)) => { harness.effects.push(effect); },
    useState: (initial: unknown) => [initial, (value: unknown) => { harness.setters.push(value); }],
    useTransition: () => [false, (work: () => Promise<void>) => { void work(); }],
    useActionState: (action: (previous: ExerciseActionState, form: FormData) => Promise<ExerciseActionState>) => { harness.actions.push(action); return [{ status: "IDLE" }, () => undefined, false]; } };
});
vi.mock("@/components/ui/button", () => ({ Button: (props: { children?: React.ReactNode; onClick?: () => void }) => { harness.buttons.push(props); return <button>{props.children}</button>; } }));
vi.mock("@/modules/exercises/transport/server-actions", () => ({ createPersonalExerciseAction: harness.create, updatePersonalExerciseAction: vi.fn(), deletePersonalExerciseAction: vi.fn(), listPersonalExercisesAction: harness.list }));
import { PersonalExerciseWorkspace } from "./personal-exercise-workspace";
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
    const html = renderToStaticMarkup(<PersonalExerciseWorkspace initialPage={{ items: [], nextCursor: null }} today={row.occurredOn} initialNonce={freshNonce} />);
    expect(html).toContain(`name="submissionNonce" value="${freshNonce}"`);
  });
  const events = new Map<string, () => void>();
  beforeEach(() => {
    vi.clearAllMocks(); harness.effects.length = 0; harness.actions.length = 0; harness.setters.length = 0; harness.buttons.length = 0; events.clear();
    vi.stubGlobal("window", { addEventListener: (event: string, handler: () => void) => events.set(event, handler), removeEventListener: (event: string) => events.delete(event), location: { reload: vi.fn() } });
    renderToStaticMarkup(<PersonalExerciseWorkspace initialPage={{ items: [], nextCursor: null }} today={row.occurredOn} initialNonce={row.id} />);
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
  it("pagehide purges parent and drops delayed mutation payload", async () => {
    harness.effects.forEach((effect) => effect());
    const response = deferred<ExerciseActionState>(); harness.create.mockReturnValue(response.promise);
    const pending = harness.actions[0]({ status: "IDLE" }, new FormData());
    events.get("pagehide")?.(); response.resolve(success); await pending;
    expect(harness.setters).toContainEqual({ items: [], nextCursor: null }); expect(harness.setters).not.toContainEqual(success);
  });
  it("drops delayed list after pagehide and requests fresh BFCache restoration", async () => {
    harness.effects.forEach((effect) => effect());
    const response = deferred<ExerciseActionState>(); harness.list.mockReturnValue(response.promise);
    harness.buttons.find((button) => button.children === "โหลดรายการล่าสุด")?.onClick?.();
    events.get("pagehide")?.(); response.resolve({ status: "SUCCESS", page: { items: [row], nextCursor: null } });
    await vi.waitFor(() => expect(harness.list).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(harness.setters.filter((value) => typeof value === "function")).toEqual([]);
    const restored = events.get("pageshow") as unknown as ((event: { persisted: boolean }) => void) | undefined;
    restored?.({ persisted: true }); expect(window.location.reload).toHaveBeenCalledOnce();
  });
  it("unmount/account replacement invalidates an old delayed mutation callback", async () => {
    const cleanups = harness.effects.map((effect) => effect());
    const response = deferred<ExerciseActionState>(); harness.create.mockReturnValue(response.promise);
    const pending = harness.actions[0]({ status: "IDLE" }, new FormData());
    for (const cleanup of cleanups) if (typeof cleanup === "function") cleanup();
    response.resolve(success); await pending; expect(harness.setters).not.toContainEqual(success);
  });
  it("list denial invalidates pending mutation and clears surviving payload", async () => {
    harness.effects.forEach((effect) => effect());
    const response = deferred<ExerciseActionState>(); harness.create.mockReturnValue(response.promise);
    const pending = harness.actions[0]({ status: "IDLE" }, new FormData());
    harness.list.mockResolvedValue({ status: "DENIED", message: "ปฏิเสธ" });
    harness.buttons.find((button) => button.children === "โหลดรายการล่าสุด")?.onClick?.();
    await vi.waitFor(() => expect(harness.setters).toContainEqual({ status: "DENIED", message: "ปฏิเสธ" }));
    response.resolve(success); await pending;
    expect(harness.setters).not.toContainEqual(success); expect(harness.setters).toContainEqual({ items: [], nextCursor: null });
  });
});
