// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  remove: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  reorder: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  read: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock("@/components/ui/notify", () => ({ notify: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/modules/hospital-content/transport/server-actions", () => ({
  removeHospitalContentImageAction: mocks.remove,
  reorderHospitalContentImagesAction: mocks.reorder,
  readHospitalContentCurrentAction: mocks.read,
}));
vi.mock("@/modules/patient-evidence/client/patient-evidence-image-optimizer", () => ({
  optimizeEvidenceImage: async (file: File) => file,
  getEvidenceImageOptimizationErrorMessage: () => "รูปไม่ผ่าน",
}));

import { HospitalContentImageManager } from "./hospital-content-image-manager";

const CONTENT_ID = "22222222-2222-4222-8222-222222222222";
const [one, two, three] = ["img-1", "img-2", "img-3"] as const;

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let originalActEnvironment: boolean | undefined;
const patched: Array<[object, string, PropertyDescriptor | undefined]> = [];

beforeAll(() => {
  const flagged = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  originalActEnvironment = flagged.IS_REACT_ACT_ENVIRONMENT;
  flagged.IS_REACT_ACT_ENVIRONMENT = true;
  const define = (target: object, key: string, value: unknown): void => {
    patched.push([target, key, Object.getOwnPropertyDescriptor(target, key)]);
    Object.defineProperty(target, key, { configurable: true, value });
  };
  define(HTMLElement.prototype, "scrollTo", () => undefined);
  define(HTMLDialogElement.prototype, "showModal", function showModal(this: HTMLDialogElement): void { this.setAttribute("open", ""); });
  define(HTMLDialogElement.prototype, "close", function close(this: HTMLDialogElement): void { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); });
});

afterAll(() => {
  const flagged = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  if (originalActEnvironment === undefined) Reflect.deleteProperty(flagged, "IS_REACT_ACT_ENVIRONMENT");
  else flagged.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  for (const [target, key, descriptor] of patched) {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else Reflect.deleteProperty(target, key);
  }
});

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

async function mountManager(imageIds: readonly string[]): Promise<void> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(HospitalContentImageManager, { contentId: CONTENT_ID, imageIds }));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

function button(label: string, scope: ParentNode = container as HTMLDivElement): HTMLButtonElement {
  const found = Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find((item) => item.textContent?.trim() === label || item.getAttribute("aria-label") === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}

function shownOrder(): string[] {
  return Array.from(container?.querySelectorAll("ol img") ?? []).map((image) => (image.getAttribute("src") ?? "").split("/").pop() ?? "");
}

describe("Hospital content draft image manager", () => {
  it("states the three image limit and hides the picker once it is reached", async () => {
    await mountManager([one, two, three]);
    expect(container?.textContent).toContain("ได้ไม่เกิน 3 รูป");
    expect(container?.textContent).toContain("เพิ่มรูปครบ 3 รูปแล้ว");
    expect(container?.querySelector("#hospital-content-image-files")).toBeNull();
  });

  it("reorders through the server and shows the order the server returns", async () => {
    mocks.reorder.mockResolvedValueOnce({ status: "SUCCESS", imageIds: [two, one, three] });
    await mountManager([one, two, three]);
    expect(button("เลื่อนภาพที่ 1 ขึ้น").disabled).toBe(true);
    expect(button("เลื่อนภาพที่ 3 ลง").disabled).toBe(true);

    await act(async () => button("เลื่อนภาพที่ 1 ลง").click());

    expect(mocks.reorder).toHaveBeenCalledExactlyOnceWith({ contentId: CONTENT_ID, imageIds: [two, one, three] });
    expect(shownOrder()).toEqual([two, one, three]);
  });

  it("asks before removing, then removes through the server", async () => {
    mocks.remove.mockResolvedValueOnce({ status: "SUCCESS", imageIds: [one, three] });
    await mountManager([one, two, three]);

    await act(async () => button("ลบภาพที่ 2").click());
    expect(mocks.remove).not.toHaveBeenCalled();
    const dialog = container?.querySelector("dialog[open]") as HTMLDialogElement;
    expect(dialog.textContent).toContain("ลบภาพที่ 2 หรือไม่");

    await act(async () => button("ลบรูป", dialog).click());

    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith({ contentId: CONTENT_ID, imageId: two });
    expect(shownOrder()).toEqual([one, three]);
    expect(container?.querySelector("#hospital-content-image-files")).not.toBeNull();
  });

  it("reloads the stored list when the outcome of a change is unknown", async () => {
    mocks.reorder.mockResolvedValueOnce({ status: "ERROR", code: "UNAVAILABLE", message: "x" });
    mocks.read.mockResolvedValueOnce({ status: "SUCCESS", content: { imageIds: [two, one] } });
    await mountManager([one, two]);

    await act(async () => button("เลื่อนภาพที่ 1 ลง").click());

    expect(mocks.read).toHaveBeenCalledExactlyOnceWith(CONTENT_ID);
    expect(shownOrder()).toEqual([two, one]);
    expect(container?.textContent).toContain("ระบบยังยืนยันผลการเปลี่ยนรูปไม่ได้");
  });

  it("lets a legacy draft above the limit remove images but not reorder them", async () => {
    mocks.remove.mockResolvedValueOnce({ status: "SUCCESS", imageIds: [two, three, "img-4"] });
    await mountManager([one, two, three, "img-4"]);
    expect(container?.textContent).toContain("เกินกำหนด 3 รูป");

    await act(async () => button("เลื่อนภาพที่ 1 ลง").click());
    expect(mocks.reorder).not.toHaveBeenCalled();

    await act(async () => button("ลบภาพที่ 1").click());
    await act(async () => button("ลบรูป", container?.querySelector("dialog[open]") as HTMLDialogElement).click());
    expect(mocks.remove).toHaveBeenCalledOnce();
  });
});
