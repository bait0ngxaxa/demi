// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  mealCreate: vi.fn(), mealUpdate: vi.fn(), mealDelete: vi.fn(), mealList: vi.fn(),
  exerciseCreate: vi.fn(), exerciseUpdate: vi.fn(), exerciseDelete: vi.fn(), exerciseList: vi.fn(),
}));
vi.mock("./daily-wellness-action", () => ({ readDailyWellnessAction: vi.fn() }));
vi.mock("@/modules/meals/transport/server-actions", () => ({ createPersonalMealAction: mock.mealCreate, updatePersonalMealAction: mock.mealUpdate, deletePersonalMealAction: mock.mealDelete, listPersonalMealsAction: mock.mealList }));
vi.mock("@/modules/exercises/transport/server-actions", () => ({ createPersonalExerciseAction: mock.exerciseCreate, updatePersonalExerciseAction: mock.exerciseUpdate, deletePersonalExerciseAction: mock.exerciseDelete, listPersonalExercisesAction: mock.exerciseList }));
vi.mock("@/modules/weight-goals/transport/server-actions", () => ({ createPersonalWeightGoalAction: vi.fn(), updatePersonalWeightGoalAction: vi.fn(), removePersonalWeightGoalAction: vi.fn(), readPersonalWeightGoalAction: vi.fn() }));
import { PersonalMealWorkspace } from "./personal-meal-workspace";
import { PersonalExerciseWorkspace } from "./personal-exercise-workspace";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { PersonalWellnessWorkspace } from "./personal-wellness-workspace";
import { createWellnessPrivateAuthority, type WellnessPrivateAuthority } from "./wellness-private-authority";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const date = "2026-10-29";
const nonce = "11111111-1111-4111-8111-111111111111";
const meal = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", category: "LUNCH" as const, occurredOn: date, description: "ข้าวกล้อง", createdAt: `${date}T05:00:00.000Z`, updatedAt: `${date}T05:00:00.000Z` };
const otherMeal = { ...meal, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", category: "DINNER" as const, description: "ต้มจืด" };
const exercise = { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", activityName: "เดินเร็ว", occurredOn: date, durationMinutes: 30, note: "สวนสาธารณะ", createdAt: `${date}T05:00:00.000Z`, updatedAt: `${date}T05:00:00.000Z` };
const otherExercise = { ...exercise, id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", activityName: "โยคะ", note: null };

let host: HTMLDivElement;
let root: Root;
let originalShowModal: PropertyDescriptor | undefined;
let originalClose: PropertyDescriptor | undefined;
beforeAll(() => {
  originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement): void { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement): void { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); } });
});
afterAll(() => {
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal); else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose); else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});
beforeEach(() => { vi.resetAllMocks(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(() => root.unmount()); host.remove(); });

function dialog(): HTMLDialogElement | null {
  return host.querySelector("dialog");
}
function button(label: string, scope: ParentNode = host): HTMLButtonElement {
  const found = [...scope.querySelectorAll("button")].find((element) => element.textContent === label);
  if (!found) throw new Error(`Missing ${label}`);
  return found;
}
function rowButton(label: "แก้ไข" | "ลบ", index = 0): HTMLButtonElement {
  const found = [...host.querySelectorAll<HTMLButtonElement>("li button")].filter((element) => element.textContent === label)[index];
  if (!found) throw new Error(`Missing row ${label}`);
  return found;
}
async function type(element: HTMLInputElement | HTMLTextAreaElement | null, value: string): Promise<void> {
  if (!element) throw new Error("Missing field");
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(() => {
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function escape(): Promise<void> {
  await act(() => { dialog()?.dispatchEvent(new Event("cancel", { cancelable: true })); });
}
function deferred(): { promise: Promise<unknown>; resolve: (value: unknown) => void } {
  let resolve: (value: unknown) => void = () => undefined;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

const kinds = {
  meal: {
    first: meal, second: otherMeal, editField: 'textarea[name="description"]', editTitle: "แก้ไขบันทึกมื้ออาหาร", deleteTitle: "ลบบันทึกมื้ออาหาร",
    context: "มื้อกลางวัน", create: mock.mealCreate, update: mock.mealUpdate, remove: mock.mealDelete, list: mock.mealList,
    startCreate: async () => { await act(() => host.querySelector<HTMLInputElement>('[name="category"][value="SNACK"]')?.click()); },
    createDraftField: 'textarea[name="description"]',
  },
  exercise: {
    first: exercise, second: otherExercise, editField: 'textarea[name="note"]', editTitle: "แก้ไขบันทึกการออกกำลังกาย", deleteTitle: "ลบบันทึกการออกกำลังกาย",
    context: "เดินเร็ว", create: mock.exerciseCreate, update: mock.exerciseUpdate, remove: mock.exerciseDelete, list: mock.exerciseList,
    startCreate: async () => { await act(() => button("เดิน").click()); },
    createDraftField: 'textarea[name="note"]',
  },
} as const;

describe.each(["meal", "exercise"] as const)("%s journal dialogs", (kind) => {
  const k = kinds[kind];
  async function mount(authority: WellnessPrivateAuthority = createWellnessPrivateAuthority(vi.fn()), onSummary = vi.fn()): Promise<{ authority: WellnessPrivateAuthority; onSummary: ReturnType<typeof vi.fn> }> {
    const props = { today: date, initialNonce: nonce, authority, date, onSummary };
    await act(() => root.render(kind === "meal"
      ? <PersonalMealWorkspace {...props} initialPage={{ items: [meal, otherMeal], nextCursor: null }} />
      : <PersonalExerciseWorkspace {...props} initialPage={{ items: [exercise, otherExercise], nextCursor: null }} />));
    return { authority, onSummary };
  }
  function summary(count: number): Record<string, unknown> {
    return kind === "meal" ? { occurredOn: date, count } : { occurredOn: date, count, recordedDurationCount: count, durationMinutes: 30 * count };
  }
  function createForm(): HTMLFormElement | null {
    return host.querySelector<HTMLInputElement>('input[name="submissionNonce"]')?.form ?? null;
  }

  it("keeps quick entry on the page and opens a focused edit dialog for the selected entry", async () => {
    await mount();
    expect(createForm()?.closest("dialog")).toBeNull();
    await act(() => rowButton("แก้ไข").click());

    expect(dialog()?.hasAttribute("open")).toBe(true);
    expect(dialog()?.querySelector("h2")?.textContent).toBe(k.editTitle);
    expect(dialog()?.textContent).toContain(k.context);
    expect(dialog()?.querySelector("time")?.getAttribute("dateTime")).toBe(date);
    expect(dialog()?.querySelector<HTMLInputElement>('input[name="entryId"]')?.value).toBe(k.first.id);
    expect(dialog()?.querySelector<HTMLInputElement>('input[name="expectedUpdatedAt"]')?.value).toBe(k.first.updatedAt);
    expect(dialog()?.querySelector('input[name="submissionNonce"]')).toBeNull();
    expect(createForm()?.closest("dialog")).toBeNull();
    expect(createForm()?.querySelector<HTMLInputElement>('input[name="submissionNonce"]')?.value).toBe(nonce);
    expect(rowButton("แก้ไข").getAttribute("aria-label")).toContain(date);

    await act(() => button("ยกเลิก", dialog() ?? host).click());
    expect(dialog()).toBeNull();
    expect(k.update).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(rowButton("แก้ไข"));
  });

  it("retains the edit draft for the same entry version only", async () => {
    await mount();
    await act(() => rowButton("แก้ไข").click());
    await type(dialog()?.querySelector<HTMLTextAreaElement>(k.editField) ?? null, "ร่างที่ยังไม่บันทึก");
    await escape();
    await act(() => rowButton("แก้ไข").click());
    expect(dialog()?.querySelector<HTMLTextAreaElement>(k.editField)?.value).toBe("ร่างที่ยังไม่บันทึก");
    await escape();

    await act(() => rowButton("แก้ไข", 1).click());
    expect(dialog()?.querySelector<HTMLInputElement>('input[name="entryId"]')?.value).toBe(k.second.id);
    expect(dialog()?.querySelector<HTMLTextAreaElement>(k.editField)?.value).toBe(kind === "meal" ? otherMeal.description : "");
    await escape();
    await act(() => rowButton("แก้ไข").click());
    expect(dialog()?.querySelector<HTMLTextAreaElement>(k.editField)?.value).not.toBe("ร่างที่ยังไม่บันทึก");
  });

  it("keeps the create draft and its nonce through an entry edit, and refreshes the day after a confirmed save", async () => {
    const { onSummary } = await mount();
    await k.startCreate();
    await type(host.querySelector<HTMLTextAreaElement>(k.createDraftField), "ร่างบันทึกใหม่");
    const updated = { ...k.first, updatedAt: `${date}T06:00:00.000Z` };
    k.update.mockResolvedValue({ status: "SUCCESS", message: "บันทึกการแก้ไขแล้ว", result: { outcome: "UPDATED", item: updated } });
    const read = deferred();
    k.list.mockReturnValue(read.promise);
    await act(() => rowButton("แก้ไข").click());
    await act(() => button("บันทึกการแก้ไข", dialog() ?? host).click());

    expect(k.update).toHaveBeenCalledTimes(1);
    expect(k.update.mock.calls[0][1].get("expectedUpdatedAt")).toBe(k.first.updatedAt);
    expect(k.list.mock.calls[0][0].get("occurredOn")).toBe(date);
    // The read that proves the new aggregate is still running: the dialog cannot be dismissed into new intent.
    await escape();
    expect(dialog()?.hasAttribute("open")).toBe(true);

    await act(async () => read.resolve({ status: "SUCCESS", page: { items: [updated, k.second], nextCursor: null, dailySummary: summary(2) } }));
    expect(dialog()).toBeNull();
    expect(onSummary).toHaveBeenLastCalledWith(summary(2));
    expect(host.querySelector<HTMLTextAreaElement>(k.createDraftField)?.value).toBe("ร่างบันทึกใหม่");
    expect(createForm()?.querySelector<HTMLInputElement>('input[name="submissionNonce"]')?.value).toBe(nonce);
    expect(host.textContent).toContain("บันทึกการแก้ไขแล้ว");
  });

  it("confirms deletion in a destructive dialog that identifies the entry; cancel sends nothing", async () => {
    await mount();
    await act(() => rowButton("ลบ").click());

    expect(dialog()?.querySelector("h2")?.textContent).toBe(k.deleteTitle);
    expect(dialog()?.textContent).toContain(k.context);
    expect(dialog()?.querySelector("form textarea")).toBeNull();
    expect(document.activeElement).toBe(button("ยกเลิก", dialog() ?? host));
    await act(() => button("ยกเลิก", dialog() ?? host).click());
    expect(dialog()).toBeNull();
    expect(k.remove).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(rowButton("ลบ"));
  });

  it("removes the entry only after the server confirms, then refreshes and returns focus to the history", async () => {
    await mount();
    const request = deferred();
    k.remove.mockReturnValue(request.promise);
    k.list.mockResolvedValue({ status: "SUCCESS", page: { items: [k.second], nextCursor: null, dailySummary: summary(1) } });
    await act(() => rowButton("ลบ").click());
    await act(() => {
      const confirm = button("ยืนยันลบ", dialog() ?? host);
      confirm.click();
      confirm.click();
    });

    expect(host.querySelectorAll("li")).toHaveLength(2);
    expect(rowButton("แก้ไข").disabled).toBe(true);
    await escape();
    expect(dialog()?.hasAttribute("open")).toBe(true);

    await act(async () => request.resolve({ status: "SUCCESS", message: "ลบบันทึกแล้ว", result: { outcome: "DELETED", entryId: k.first.id } }));
    expect(k.remove).toHaveBeenCalledTimes(1);
    const payload = k.remove.mock.calls[0][1] as FormData;
    expect(payload.get("entryId")).toBe(k.first.id);
    expect(payload.get("expectedUpdatedAt")).toBe(k.first.updatedAt);
    expect(dialog()).toBeNull();
    expect(host.querySelectorAll("li")).toHaveLength(1);
    expect(k.list).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.tagName).toBe("H3");
  });

  it("closes the dialog and clears private state when the server denies access", async () => {
    const authority = createWellnessPrivateAuthority(vi.fn());
    await mount(authority);
    await act(() => rowButton("แก้ไข").click());
    await type(dialog()?.querySelector<HTMLTextAreaElement>(k.editField) ?? null, "ข้อมูลส่วนตัว");
    k.update.mockResolvedValue({ status: "DENIED", message: "ยืนยันสิทธิ์" });
    await act(() => button("บันทึกการแก้ไข", dialog() ?? host).click());

    expect(dialog()).toBeNull();
    expect(authority.isActive()).toBe(false);
    expect(host.querySelectorAll("li")).toHaveLength(0);
    expect(host.textContent).not.toContain("ข้อมูลส่วนตัว");
  });

  it("ignores a late edit response after authority invalidation", async () => {
    const authority = createWellnessPrivateAuthority(vi.fn());
    await mount(authority);
    const request = deferred();
    k.update.mockReturnValue(request.promise);
    await act(() => rowButton("แก้ไข").click());
    await act(() => button("บันทึกการแก้ไข", dialog() ?? host).click());
    authority.invalidate();
    await act(async () => request.resolve({ status: "SUCCESS", message: "late private result", result: { outcome: "UPDATED", item: k.first } }));

    expect(host.textContent).not.toContain("late private result");
    expect(k.list).not.toHaveBeenCalled();
  });

  it("keeps entry dialogs unavailable while a create outcome is unresolved", async () => {
    await mount();
    await k.startCreate();
    k.create.mockResolvedValue({ status: "UNCONFIRMED", message: "ผลยังไม่แน่นอน" });
    await act(() => button(kind === "meal" ? "บันทึกมื้ออาหาร" : "บันทึกการออกกำลังกาย").click());

    expect(rowButton("แก้ไข").disabled).toBe(true);
    expect(rowButton("ลบ").disabled).toBe(true);
    await act(() => rowButton("ลบ").click());
    expect(dialog()).toBeNull();
    expect(createForm()?.querySelector<HTMLInputElement>('input[name="submissionNonce"]')?.value).toBe(nonce);
  });
});

describe("journal dialogs inside the daily wellness page", () => {
  it("removes an open private dialog on pagehide", async () => {
    const props = { today: date, mealNonce: nonce, exerciseNonce: "22222222-2222-4222-8222-222222222222", weightGoalNonce: "33333333-3333-4333-8333-333333333333", weightGoal: null,
      mealPage: { items: [meal], nextCursor: null, dailySummary: { occurredOn: date, count: 1 } },
      exercisePage: { items: [], nextCursor: null, dailySummary: { occurredOn: date, count: 0, recordedDurationCount: 0, durationMinutes: null } } };
    await act(() => root.render(<PersonalWellnessWorkspace {...props} />));
    await act(() => rowButton("แก้ไข").click());
    expect(dialog()?.textContent).toContain("ข้าวกล้อง");

    await act(() => window.dispatchEvent(new Event("pagehide")));
    expect(dialog()).toBeNull();
    expect(host.textContent).not.toContain("ข้าวกล้อง");
    expect(host.textContent).toContain("ยืนยันสิทธิ์");
  });
});
