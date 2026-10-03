import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MealActionState } from "@/modules/meals/transport/action-state";
const harness = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[], actions: [] as ((previous: MealActionState, form: FormData) => Promise<MealActionState>)[], setters: [] as unknown[], buttons: [] as { children?: unknown; onClick?: () => void }[], create: vi.fn(), list: vi.fn() }));
vi.mock("react", async (importOriginal) => {
  const original = await importOriginal<typeof import("react")>();
  return { ...original, useEffect: (effect: () => void | (() => void)) => { harness.effects.push(effect); },
    useState: (initial: unknown) => [initial, (value: unknown) => { harness.setters.push(value); }],
    useTransition: () => [false, (work: () => Promise<void>) => { void work(); }],
    useActionState: (action: (previous: MealActionState, form: FormData) => Promise<MealActionState>) => { harness.actions.push(action); return [{ status: "IDLE" }, () => undefined, false]; } };
});
vi.mock("@/components/ui/button", () => ({ Button: (props: { children?: React.ReactNode; onClick?: () => void }) => { harness.buttons.push(props); return <button>{props.children}</button>; } }));
vi.mock("@/modules/meals/transport/server-actions", () => ({ createPersonalMealAction: harness.create, updatePersonalMealAction: vi.fn(), deletePersonalMealAction: vi.fn(), listPersonalMealsAction: harness.list }));
import { PersonalMealWorkspace } from "./personal-meal-workspace";
const row = { id: "11111111-1111-4111-8111-111111111111", category: "SNACK" as const, occurredOn: "2026-10-03", description: "สังเคราะห์", createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" };
const success: MealActionState = { status: "SUCCESS", result: { outcome: "CREATED", item: row } };
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve };
}
describe("Meal client lifecycle callback evidence (no browser)", () => {
  const events = new Map<string, () => void>();
  beforeEach(() => {
    vi.clearAllMocks(); harness.effects.length = 0; harness.actions.length = 0; harness.setters.length = 0; harness.buttons.length = 0; events.clear();
    vi.stubGlobal("window", { addEventListener: (event: string, handler: () => void) => events.set(event, handler), removeEventListener: (event: string) => events.delete(event), location: { reload: vi.fn() } });
    renderToStaticMarkup(<PersonalMealWorkspace initialPage={{ items: [], nextCursor: null }} today={row.occurredOn} initialNonce={row.id} />);
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
    const response = deferred<MealActionState>(); harness.create.mockReturnValue(response.promise);
    const pending = harness.actions[0]({ status: "IDLE" }, new FormData());
    events.get("pagehide")?.(); response.resolve(success); await pending;
    expect(harness.setters).toContainEqual({ items: [], nextCursor: null }); expect(harness.setters).not.toContainEqual(success);
  });
  it("list denial invalidates pending mutation and clears surviving payload", async () => {
    harness.effects.forEach((effect) => effect());
    const response = deferred<MealActionState>(); harness.create.mockReturnValue(response.promise);
    const pending = harness.actions[0]({ status: "IDLE" }, new FormData());
    harness.list.mockResolvedValue({ status: "DENIED", message: "ปฏิเสธ" });
    harness.buttons.find((button) => button.children === "โหลดรายการล่าสุด")?.onClick?.();
    await vi.waitFor(() => expect(harness.setters).toContainEqual({ status: "DENIED", message: "ปฏิเสธ" }));
    response.resolve(success); await pending;
    expect(harness.setters).not.toContainEqual(success); expect(harness.setters).toContainEqual({ items: [], nextCursor: null });
  });
});
