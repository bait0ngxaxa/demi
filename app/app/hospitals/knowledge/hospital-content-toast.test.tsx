// @vitest-environment jsdom

import { HospitalContentCategory, HospitalContentStatus } from "@prisma/client";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  archive: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  create: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  edit: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  publish: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  read: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  reconcile: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  withdraw: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  optimize: vi.fn<(file: File) => Promise<File>>(),
  order: [] as string[],
  push: vi.fn<(href: string) => void>(),
  success: vi.fn<(message: string) => void>(),
  warning: vi.fn<(message: string) => void>(),
  error: vi.fn<(message: string) => void>(),
  info: vi.fn<(message: string) => void>(),
}));

vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn(),
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
}));
vi.mock("@/components/ui/notify", () => ({
  notify: {
    success: (message: string) => {
      mocks.order.push("toast");
      mocks.success(message);
    },
    warning: mocks.warning,
    error: mocks.error,
    info: mocks.info,
  },
}));
vi.mock("@/modules/hospital-content/transport/server-actions", () => ({
  archiveHospitalContentAction: mocks.archive,
  createHospitalContentAction: mocks.create,
  editHospitalContentDraftAction: mocks.edit,
  publishHospitalContentAction: mocks.publish,
  readHospitalContentCurrentAction: mocks.read,
  reconcileHospitalContentCreateAction: mocks.reconcile,
  withdrawHospitalContentAction: mocks.withdraw,
}));
vi.mock("@/modules/patient-evidence/client/patient-evidence-image-optimizer", () => ({
  optimizeEvidenceImage: mocks.optimize,
  getEvidenceImageOptimizationErrorMessage: () => "ไม่สามารถเตรียมรูปนี้สำหรับอัปโหลดได้ กรุณาเลือกรูปอื่น",
}));

import type {
  HospitalContentDetailProjection,
  HospitalContentOwnerHospital,
} from "@/modules/hospital-content/types/hospital-content-projections";
import { HospitalContentDetailWorkspace } from "./[contentId]/hospital-content-detail-workspace";
import { HospitalContentImageManager } from "./hospital-content-image-manager";
import { HospitalContentCreateForm } from "./new/hospital-content-create-form";

const hospital: HospitalContentOwnerHospital = {
  id: "11111111-1111-4111-8111-111111111111",
  hospitalCode: "H-001",
  name: "โรงพยาบาลทดสอบ",
};
const otherHospital: HospitalContentOwnerHospital = { ...hospital, id: "44444444-4444-4444-8444-444444444444" };
const CONTENT_ID = "22222222-2222-4222-8222-222222222222";
const NONCE = "33333333-3333-4333-8333-333333333333";
const V1 = "2026-10-05T02:03:04.005Z";
const V2 = "2026-10-06T02:03:04.005Z";
const TITLE = "หัวข้อลับใหม่";
const BODY = "เนื้อหาลับใหม่";

function content(overrides: Partial<HospitalContentDetailProjection> = {}): HospitalContentDetailProjection {
  return {
    id: CONTENT_ID,
    hospital,
    title: "หัวข้อเดิม",
    body: "เนื้อหาเดิม",
    category: HospitalContentCategory.FOOD,
    sourceText: "แหล่งอ้างอิงเดิม",
    status: HospitalContentStatus.DRAFT,
    firstPublishedAt: null,
    latestPublishedAt: null,
    expectedUpdatedAt: V1,
    imageIds: [],
    ...overrides,
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let originalActEnvironment: boolean | undefined;
let originalRandomUUID: PropertyDescriptor | undefined;
const dialogDescriptors: Array<[object, string, PropertyDescriptor | undefined]> = [];

beforeAll(() => {
  const globalWithActFlag = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  originalActEnvironment = globalWithActFlag.IS_REACT_ACT_ENVIRONMENT;
  globalWithActFlag.IS_REACT_ACT_ENVIRONMENT = true;
  originalRandomUUID = Object.getOwnPropertyDescriptor(window.crypto, "randomUUID");
  const define = (target: object, key: string, value: unknown): void => {
    dialogDescriptors.push([target, key, Object.getOwnPropertyDescriptor(target, key)]);
    Object.defineProperty(target, key, { configurable: true, value });
  };
  define(HTMLElement.prototype, "scrollTo", () => undefined);
  define(HTMLDialogElement.prototype, "showModal", function showModal(this: HTMLDialogElement): void {
    this.setAttribute("open", "");
  });
  define(HTMLDialogElement.prototype, "close", function close(this: HTMLDialogElement): void {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  });
});

afterAll(() => {
  const globalWithActFlag = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  if (originalActEnvironment === undefined) Reflect.deleteProperty(globalWithActFlag, "IS_REACT_ACT_ENVIRONMENT");
  else globalWithActFlag.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  for (const [target, key, descriptor] of dialogDescriptors) {
    if (descriptor) Object.defineProperty(target, key, descriptor);
    else Reflect.deleteProperty(target, key);
  }
});

beforeEach(() => {
  for (const mock of Object.values(mocks)) if (typeof mock === "function") mock.mockReset();
  mocks.order.length = 0;
  mocks.push.mockImplementation(() => {
    mocks.order.push("push");
  });
  mocks.optimize.mockImplementation(async (file) => file);
  mocks.reconcile.mockResolvedValue({ status: "SUCCESS", result: { status: "ABSENT" } });
  window.sessionStorage.clear();
  Object.defineProperty(window.crypto, "randomUUID", { configurable: true, value: () => NONCE });
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  container?.remove();
  container = null;
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
  if (originalRandomUUID) Object.defineProperty(window.crypto, "randomUUID", originalRandomUUID);
  else Reflect.deleteProperty(window.crypto, "randomUUID");
});

function toastCalls(): unknown[][] {
  return [...mocks.success.mock.calls, ...mocks.warning.mock.calls, ...mocks.error.mock.calls];
}

async function mount(node: React.ReactNode): Promise<void> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(node);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

function field<T extends HTMLElement>(id: string): T {
  const found = container?.querySelector<T>(`#${id}`);
  if (!found) throw new Error(`Missing field ${id}`);
  return found;
}

function setText(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
  act(() => element.dispatchEvent(new Event("input", { bubbles: true })));
}

function button(label: string, scope: ParentNode = container as HTMLDivElement): HTMLButtonElement {
  const found = Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find((item) =>
    item.textContent?.includes(label),
  );
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}

/** Live regions (status, alert, aria-live) whose text includes `text`; a Toasted success must not be one of them. */
function liveRegionsContaining(root: ParentNode, text: string): Element[] {
  return Array.from(root.querySelectorAll('[role="status"], [role="alert"], [aria-live]:not([aria-live="off"])')).filter(
    (element) => element.textContent?.includes(text),
  );
}

function dispatchSubmit(): void {
  const form = container?.querySelector("form");
  if (!form) throw new Error("Missing form");
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

describe("Hospital Knowledge create Toasts", () => {
  async function mountCreate(): Promise<void> {
    await mount(
      createElement(HospitalContentCreateForm, {
        hospitals: [hospital],
        selectedHospitalId: hospital.id,
        recoveryScope: "toast-regression",
      }),
    );
  }

  async function fillCreate(): Promise<void> {
    setText(field<HTMLInputElement>("hospital-content-title"), TITLE);
    setText(field<HTMLTextAreaElement>("hospital-content-body"), BODY);
    const category = field<HTMLSelectElement>("hospital-content-category");
    category.value = HospitalContentCategory.FOOD;
    act(() => category.dispatchEvent(new Event("change", { bubbles: true })));
  }

  it("announces a confirmed new draft before navigating to its detail page", async () => {
    const pending = deferred<unknown>();
    mocks.create.mockReturnValueOnce(pending.promise);
    await mountCreate();
    await fillCreate();

    await act(async () => {
      dispatchSubmit();
      await Promise.resolve();
    });
    expect(mocks.success).not.toHaveBeenCalled();
    await act(async () => {
      pending.resolve({ status: "SUCCESS", result: { outcome: "CREATED", content: content() } });
      await pending.promise;
    });

    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("สร้างฉบับร่างแล้ว");
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(`/app/hospitals/knowledge/${CONTENT_ID}`);
    expect(mocks.order).toEqual(["toast", "push"]);
    expect(container?.textContent).toContain("สร้างฉบับร่างแล้ว กำลังเปิดรายการปัจจุบัน");
    expect(liveRegionsContaining(container!, "ฉบับร่างแล้ว")).toHaveLength(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(JSON.stringify(toastCalls())).not.toContain(TITLE);
    expect(JSON.stringify(toastCalls())).not.toContain(CONTENT_ID);
  });

  it("does not describe a REPLAY as a new draft and keeps the reconciliation Alert, link and marker", async () => {
    mocks.create.mockResolvedValueOnce({ status: "SUCCESS", result: { outcome: "REPLAY", content: content() } });
    await mountCreate();
    await fillCreate();

    await act(async () => dispatchSubmit());
    await settle();

    expect(toastCalls()).toHaveLength(0);
    expect(container?.textContent).toContain("รายการนี้ถูกสร้างแล้ว ข้อมูลที่ส่งซ้ำไม่ได้ถูกบันทึก");
    expect(button("เปิดรายการที่สร้างไว้")).toBeTruthy();
    expect(container?.textContent).toContain("ตรวจสอบคำขอสร้างฉบับร่าง");
    expect(mocks.push).not.toHaveBeenCalled();
    // The record is confirmed to exist, so the stored recovery marker is released while the in-page attempt stays.
    expect(window.sessionStorage.length).toBe(0);
  });

  it("keeps UNCONFIRMED free of Toasts and preserves the nonce for the user's own re-check", async () => {
    mocks.create.mockResolvedValueOnce({ status: "UNCONFIRMED" });
    await mountCreate();
    await fillCreate();

    await act(async () => dispatchSubmit());
    await settle();

    expect(toastCalls()).toHaveLength(0);
    expect(container?.textContent).toContain("ยังยืนยันผลการบันทึกไม่ได้");
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(JSON.parse(window.sessionStorage.getItem(window.sessionStorage.key(0) ?? "") ?? "{}")).toEqual({
      hospitalId: hospital.id,
      submissionNonce: NONCE,
    });
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("treats a thrown request as unconfirmed with no Toast, the same nonce, and no automatic retry", async () => {
    mocks.create.mockRejectedValueOnce(new TypeError("private server failure"));
    await mountCreate();
    await fillCreate();

    await act(async () => dispatchSubmit());
    await settle();

    expect(toastCalls()).toHaveLength(0);
    expect(container?.textContent).toContain("ยังยืนยันผลการบันทึกไม่ได้");
    expect(container?.textContent).not.toContain("private server failure");
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(window.sessionStorage.length).toBe(1);
  });

  it("keeps validation errors inline with no Toast", async () => {
    mocks.create.mockResolvedValueOnce({
      status: "ERROR",
      code: "VALIDATION",
      message: "กรุณาตรวจสอบข้อมูลที่กรอก",
      fieldErrors: { title: "ตรวจสอบหัวข้อและความยาวอีกครั้ง" },
    });
    await mountCreate();
    await fillCreate();

    await act(async () => dispatchSubmit());
    await settle();

    expect(toastCalls()).toHaveLength(0);
    expect(container?.textContent).toContain("ตรวจสอบหัวข้อและความยาวอีกครั้ง");
  });

  it("drops a rapid duplicate submission so only one draft can be created", async () => {
    const pending = deferred<unknown>();
    mocks.create.mockReturnValueOnce(pending.promise);
    await mountCreate();
    await fillCreate();

    await act(async () => {
      dispatchSubmit();
      dispatchSubmit();
      await Promise.resolve();
    });
    await act(async () => {
      pending.resolve({ status: "SUCCESS", result: { outcome: "CREATED", content: content() } });
      await pending.promise;
    });

    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledOnce();
  });

  it("does not announce a draft created for another Hospital", async () => {
    mocks.create.mockResolvedValueOnce({ status: "SUCCESS", result: { outcome: "CREATED", content: content({ hospital: otherHospital }) } });
    await mountCreate();
    await fillCreate();

    await act(async () => dispatchSubmit());

    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("shows no Toast for a response that arrives after unmount", async () => {
    const pending = deferred<unknown>();
    mocks.create.mockReturnValueOnce(pending.promise);
    await mountCreate();
    await fillCreate();
    await act(async () => {
      dispatchSubmit();
      await Promise.resolve();
    });

    act(() => root?.unmount());
    root = null;
    await act(async () => {
      pending.resolve({ status: "SUCCESS", result: { outcome: "CREATED", content: content() } });
      await pending.promise;
    });

    expect(toastCalls()).toHaveLength(0);
  });
});

describe("Hospital Knowledge detail Toasts", () => {
  async function mountDetail(overrides: Partial<HospitalContentDetailProjection> = {}): Promise<void> {
    await mount(createElement(HospitalContentDetailWorkspace, { content: content(overrides) }));
  }

  async function editTitle(): Promise<void> {
    setText(field<HTMLInputElement>("hospital-content-title"), TITLE);
  }

  async function lifecycle(label: string, confirmLabel = label): Promise<void> {
    act(() => button(label).click());
    const dialog = container?.querySelector("dialog");
    if (!dialog) throw new Error("Missing lifecycle confirmation");
    act(() => button(confirmLabel, dialog).click());
    await settle();
  }

  it("announces a saved draft once, keeps the inline Alert and sends the concurrency version", async () => {
    mocks.edit.mockResolvedValueOnce({ status: "SUCCESS", result: { outcome: "UPDATED", content: content({ title: TITLE, expectedUpdatedAt: V2 }) } });
    await mountDetail();
    await editTitle();

    await act(async () => dispatchSubmit());

    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("บันทึกฉบับร่างแล้ว");
    expect(container?.textContent).toContain("บันทึกฉบับร่างแล้ว");
    expect(liveRegionsContaining(container!, "บันทึกฉบับร่างแล้ว")).toHaveLength(0);
    expect((mocks.edit.mock.calls[0]?.[0] as Record<string, unknown>).expectedUpdatedAt).toBe(V1);
    expect(JSON.stringify(toastCalls())).not.toContain(TITLE);
  });

  it("gives a confirmed no-op no Toast and keeps the explanation inline", async () => {
    mocks.edit.mockResolvedValueOnce({ status: "SUCCESS", result: { outcome: "NOOP", content: content({ title: TITLE }) } });
    await mountDetail();
    await editTitle();

    await act(async () => dispatchSubmit());

    expect(toastCalls()).toHaveLength(0);
    expect(container?.textContent).toContain("ข้อมูลฉบับร่างเป็นปัจจุบันแล้ว ไม่มีการเปลี่ยนแปลง");
    expect(liveRegionsContaining(container!, "ข้อมูลฉบับร่างเป็นปัจจุบันแล้ว")).toHaveLength(1);
  });

  it("warns for a version conflict and requires reconciliation without overwriting the draft", async () => {
    mocks.edit.mockResolvedValueOnce({ status: "ERROR", code: "CONFLICT", message: "ข้อมูลเปลี่ยนแปลงแล้ว" });
    await mountDetail();
    await editTitle();

    await act(async () => dispatchSubmit());

    expect(mocks.warning).toHaveBeenCalledExactlyOnceWith("เนื้อหาเปลี่ยนแปลงแล้ว กรุณาตรวจสอบฉบับล่าสุด");
    expect(container?.textContent).toContain("ตรวจสอบรายการปัจจุบันก่อนดำเนินการต่อ");
    expect(container?.textContent).toContain(TITLE);
    expect(field<HTMLInputElement>("hospital-content-title").value).toBe(TITLE);
  });

  it("reports a confirmed access denial as an error and locks editing", async () => {
    mocks.edit.mockResolvedValueOnce({ status: "ERROR", code: "FORBIDDEN", message: "ไม่มีสิทธิ์" });
    await mountDetail();
    await editTitle();

    await act(async () => dispatchSubmit());

    expect(mocks.error).toHaveBeenCalledExactlyOnceWith("ไม่มีสิทธิ์จัดการเนื้อหาของโรงพยาบาลนี้");
    expect(container?.textContent).toContain("ไม่สามารถแสดงข้อมูลของรายการนี้ได้");
  });

  it("does not claim access was denied for NOT_FOUND", async () => {
    mocks.edit.mockResolvedValueOnce({ status: "ERROR", code: "NOT_FOUND", message: "ไม่พบ" });
    await mountDetail();
    await editTitle();

    await act(async () => dispatchSubmit());

    expect(toastCalls()).toHaveLength(0);
  });

  it("keeps validation inline with no Toast", async () => {
    mocks.edit.mockResolvedValueOnce({ status: "ERROR", code: "VALIDATION", message: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: { title: "ตรวจสอบหัวข้อและความยาวอีกครั้ง" } });
    await mountDetail();
    await editTitle();

    await act(async () => dispatchSubmit());

    expect(toastCalls()).toHaveLength(0);
    expect(container?.textContent).toContain("ตรวจสอบหัวข้อและความยาวอีกครั้ง");
  });

  it.each([
    ["UNCONFIRMED", () => mocks.edit.mockResolvedValueOnce({ status: "UNCONFIRMED" })],
    ["UNAVAILABLE", () => mocks.edit.mockResolvedValueOnce({ status: "ERROR", code: "UNAVAILABLE", message: "ระบบไม่พร้อม" })],
    ["thrown", () => mocks.edit.mockRejectedValueOnce(new TypeError("private server failure"))],
  ] as const)("%s edit gives no Toast, keeps the draft and never retries", async (_name, arrange) => {
    arrange();
    await mountDetail();
    await editTitle();

    await act(async () => dispatchSubmit());
    await settle();

    expect(toastCalls()).toHaveLength(0);
    expect(field<HTMLInputElement>("hospital-content-title").value).toBe(TITLE);
    expect(mocks.edit).toHaveBeenCalledOnce();
    expect(container?.textContent).not.toContain("private server failure");
  });

  it("drops a rapid duplicate save so a stale version is never sent twice", async () => {
    const pending = deferred<unknown>();
    mocks.edit.mockReturnValueOnce(pending.promise);
    await mountDetail();
    await editTitle();

    await act(async () => {
      dispatchSubmit();
      dispatchSubmit();
      await Promise.resolve();
    });
    await act(async () => {
      pending.resolve({ status: "SUCCESS", result: { outcome: "UPDATED", content: content({ title: TITLE, expectedUpdatedAt: V2 }) } });
      await pending.promise;
    });

    expect(mocks.edit).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledOnce();
  });

  it.each([
    ["เผยแพร่", "เผยแพร่", mocks.publish, "PUBLISHED", HospitalContentStatus.DRAFT, "เผยแพร่เนื้อหาแล้ว"],
    ["ถอนการเผยแพร่เพื่อแก้ไข", "ถอนการเผยแพร่", mocks.withdraw, "WITHDRAWN", HospitalContentStatus.PUBLISHED, "ถอนการเผยแพร่เนื้อหาแล้ว"],
    ["เก็บถาวร", "เก็บถาวร", mocks.archive, "ARCHIVED", HospitalContentStatus.DRAFT, "เก็บเนื้อหาเข้าคลังแล้ว"],
  ] as const)("%s runs only after confirmation and announces its confirmed outcome once", async (label, confirmLabel, action, outcome, status, toast) => {
    action.mockResolvedValueOnce({ status: "SUCCESS", result: { outcome, content: content({ status, expectedUpdatedAt: V2 }) } });
    await mountDetail({ status });
    act(() => button(label).click());
    const dialog = container?.querySelector("dialog");
    if (!dialog) throw new Error("Missing lifecycle confirmation");
    act(() => button("ยกเลิก", dialog).click());
    await settle();
    expect(action).not.toHaveBeenCalled();
    expect(toastCalls()).toHaveLength(0);

    await lifecycle(label, confirmLabel);

    expect(action).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith(toast);
    expect(action.mock.calls[0]?.[0]).toEqual({ contentId: CONTENT_ID, expectedUpdatedAt: V1 });
  });

  it("does not announce a lifecycle success whose outcome is not the requested one", async () => {
    mocks.archive.mockResolvedValueOnce({ status: "SUCCESS", result: { outcome: "PUBLISHED", content: content() } });
    await mountDetail();

    await lifecycle("เก็บถาวร");

    expect(toastCalls()).toHaveLength(0);
  });

  it.each([
    ["CONFLICT", "warning", "เนื้อหาเปลี่ยนแปลงแล้ว กรุณาตรวจสอบฉบับล่าสุด"],
    ["FORBIDDEN", "error", "ไม่มีสิทธิ์จัดการเนื้อหาของโรงพยาบาลนี้"],
  ] as const)("maps a confirmed lifecycle %s to a %s Toast", async (code, level, message) => {
    mocks.archive.mockResolvedValueOnce({ status: "ERROR", code, message: "ผลลัพธ์จากระบบ" });
    await mountDetail();

    await lifecycle("เก็บถาวร");

    expect(mocks[level]).toHaveBeenCalledExactlyOnceWith(message);
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it.each([
    ["UNCONFIRMED", () => mocks.publish.mockResolvedValueOnce({ status: "UNCONFIRMED" })],
    ["thrown", () => mocks.publish.mockRejectedValueOnce(new TypeError("private server failure"))],
  ] as const)("%s publish gives no Toast, keeps the dialog open and never retries", async (_name, arrange) => {
    arrange();
    await mountDetail();

    await lifecycle("เผยแพร่");

    expect(toastCalls()).toHaveLength(0);
    expect(container?.querySelector("dialog")).not.toBeNull();
    expect(mocks.publish).toHaveBeenCalledOnce();
    expect(button("เผยแพร่", container?.querySelector("dialog") as HTMLDialogElement).disabled).toBe(true);
  });

  it("does not replay a Toast after a rerender or navigation prompt", async () => {
    mocks.edit.mockResolvedValueOnce({ status: "SUCCESS", result: { outcome: "UPDATED", content: content({ title: TITLE, expectedUpdatedAt: V2 }) } });
    await mountDetail();
    await editTitle();
    await act(async () => dispatchSubmit());

    await act(async () => root?.render(createElement(HospitalContentDetailWorkspace, { content: content({ title: TITLE, expectedUpdatedAt: V2 }) })));

    expect(mocks.success).toHaveBeenCalledOnce();
    expect(mocks.edit).toHaveBeenCalledOnce();
  });

  it("shows no Toast for a response that arrives after unmount", async () => {
    const pending = deferred<unknown>();
    mocks.edit.mockReturnValueOnce(pending.promise);
    await mountDetail();
    await editTitle();
    await act(async () => {
      dispatchSubmit();
      await Promise.resolve();
    });

    act(() => root?.unmount());
    root = null;
    await act(async () => {
      pending.resolve({ status: "SUCCESS", result: { outcome: "UPDATED", content: content({ title: TITLE, expectedUpdatedAt: V2 }) } });
      await pending.promise;
    });

    expect(toastCalls()).toHaveLength(0);
  });

  it("gives the read-only reconciliation lookup no Toast", async () => {
    mocks.edit.mockResolvedValueOnce({ status: "UNCONFIRMED" });
    mocks.read.mockResolvedValueOnce({ status: "SUCCESS", content: content({ title: "ฉบับล่าสุด", expectedUpdatedAt: V2 }) });
    await mountDetail();
    await editTitle();
    await act(async () => dispatchSubmit());
    await settle();

    await act(async () => button("โหลดข้อมูลปัจจุบัน").click());
    await settle();

    expect(mocks.read).toHaveBeenCalledOnce();
    expect(toastCalls()).toHaveLength(0);
    expect(container?.textContent).toContain("ฉบับล่าสุด");
  });
});

describe("Hospital Knowledge image upload Toasts", () => {
  const imageIdOne = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
  const imageIdTwo = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";

  function pick(count: number): void {
    const input = field<HTMLInputElement>("hospital-content-image-files");
    const files = Array.from({ length: count }, (_, index) => new File([`image-${index}`], `private-name-${index}.png`, { type: "image/png" }));
    Object.defineProperty(input, "files", { configurable: true, value: files });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function ok(imageId: string): Response {
    return new Response(JSON.stringify({ imageId }), { status: 201, headers: { "content-type": "application/json" } });
  }

  function status(code: number): Response {
    return new Response(JSON.stringify({ error: "x" }), { status: code, headers: { "content-type": "application/json" } });
  }

  async function mountImages(initial: readonly string[] = []): Promise<void> {
    await mount(createElement(HospitalContentImageManager, { contentId: CONTENT_ID, imageIds: initial }));
  }

  function imageCount(): number {
    return container?.querySelectorAll("img").length ?? 0;
  }

  it("announces a full upload once and lists every confirmed image", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(imageIdOne)).mockResolvedValueOnce(ok(imageIdTwo));
    vi.stubGlobal("fetch", fetchMock);
    await mountImages();

    await act(async () => pick(2));
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("เพิ่มภาพประกอบแล้ว");
    expect(mocks.warning).not.toHaveBeenCalled();
    expect(imageCount()).toBe(2);
    expect(container?.textContent).toContain("เพิ่มรูปแล้ว 2 รูป");
    const serialized = JSON.stringify(toastCalls());
    expect(serialized).not.toContain(imageIdOne);
    expect(serialized).not.toContain("private-name");
    expect(serialized).not.toContain("/api/hospital-content");
  });

  it("warns about a partial upload, keeps the confirmed image, and does not retry the failed one", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(imageIdOne)).mockResolvedValueOnce(status(403));
    vi.stubGlobal("fetch", fetchMock);
    await mountImages();

    await act(async () => pick(2));
    await settle();

    expect(mocks.warning).toHaveBeenCalledExactlyOnceWith("อัปโหลดได้บางรูป กรุณาตรวจสอบรายการภาพ");
    expect(mocks.success).not.toHaveBeenCalled();
    expect(imageCount()).toBe(1);
    expect(container?.textContent).toContain("อัปโหลดไม่สำเร็จ");
    expect(container?.textContent).toContain("เพิ่มรูปแล้ว 1 รูป");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not call a lost response a definite failure and keeps earlier confirmed images", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(imageIdOne)).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    await mountImages();

    await act(async () => pick(2));
    await settle();

    expect(mocks.warning).toHaveBeenCalledExactlyOnceWith("อัปโหลดได้บางรูป กรุณาตรวจสอบรายการภาพ");
    expect(imageCount()).toBe(1);
    expect(container?.textContent).toContain("ระบบยังยืนยันผลการอัปโหลดรูปไม่ได้");
    expect(container?.textContent).not.toContain("อัปโหลดไม่สำเร็จ");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats a server error as unconfirmed rather than failed", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(status(503));
    vi.stubGlobal("fetch", fetchMock);
    await mountImages();

    await act(async () => pick(1));
    await settle();

    expect(toastCalls()).toHaveLength(0);
    expect(container?.textContent).toContain("ระบบยังยืนยันผลการอัปโหลดรูปไม่ได้");
    expect(imageCount()).toBe(0);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("gives a first-file refusal no Toast and keeps the message inline", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(status(403));
    vi.stubGlobal("fetch", fetchMock);
    await mountImages();

    await act(async () => pick(1));
    await settle();

    expect(toastCalls()).toHaveLength(0);
    expect(container?.textContent).toContain("อัปโหลดไม่สำเร็จ กรุณาตรวจสอบสิทธิ์หรือโหลดหน้าใหม่");
  });

  it("keeps client-side validation inline without uploading or notifying", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await mountImages([imageIdOne, imageIdTwo, "i3", "i4"]);

    await act(async () => pick(2));
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(toastCalls()).toHaveLength(0);
    expect(container?.textContent).toContain("เพิ่มได้อีกไม่เกิน 1 รูป");
  });

  it("keeps an optimization failure inline without uploading or notifying", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.optimize.mockRejectedValueOnce(new Error("bad image"));
    await mountImages();

    await act(async () => pick(1));
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(toastCalls()).toHaveLength(0);
    expect(container?.textContent).toContain("ไม่สามารถเตรียมรูปนี้สำหรับอัปโหลดได้");
  });

  it("drops a rapid duplicate selection while an upload is running", async () => {
    const pending = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    await mountImages();

    await act(async () => {
      pick(1);
      pick(1);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      pending.resolve(ok(imageIdOne));
      await pending.promise;
    });
    await settle();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(mocks.success).toHaveBeenCalledOnce();
  });

  it("shows no Toast when the manager unmounts before the upload finishes", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(pending.promise));
    await mountImages();
    await act(async () => {
      pick(1);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    act(() => root?.unmount());
    root = null;
    await act(async () => {
      pending.resolve(ok(imageIdOne));
      await pending.promise;
    });
    await settle();

    expect(toastCalls()).toHaveLength(0);
  });
});
