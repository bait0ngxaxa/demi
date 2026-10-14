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
  push: vi.fn<(href: string) => void>(),
  read: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  reconcile: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  withdraw: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/modules/hospital-content/transport/server-actions", () => ({
  archiveHospitalContentAction: mocks.archive,
  createHospitalContentAction: mocks.create,
  editHospitalContentDraftAction: mocks.edit,
  publishHospitalContentAction: mocks.publish,
  readHospitalContentCurrentAction: mocks.read,
  reconcileHospitalContentCreateAction: mocks.reconcile,
  withdrawHospitalContentAction: mocks.withdraw,
}));
vi.mock("./hospital-content-image-manager", () => ({ HospitalContentImageManager: () => null }));

import type { HospitalContentDetailProjection, HospitalContentOwnerHospital } from "@/modules/hospital-content/types/hospital-content-projections";
import { HospitalContentCreateForm } from "./new/hospital-content-create-form";
import { HospitalContentDetailWorkspace } from "./[contentId]/hospital-content-detail-workspace";

const hospital: HospitalContentOwnerHospital = {
  id: "11111111-1111-4111-8111-111111111111",
  hospitalCode: "H-001",
  name: "โรงพยาบาลทดสอบ",
};
const secondHospital: HospitalContentOwnerHospital = {
  id: "44444444-4444-4444-8444-444444444444",
  hospitalCode: "H-002",
  name: "โรงพยาบาลตัวอย่าง",
};
const contentId = "22222222-2222-4222-8222-222222222222";
const expectedUpdatedAt = "2026-10-05T02:03:04.005Z";
const submissionNonce = "33333333-3333-4333-8333-333333333333";
const createFieldIds = {
  title: "hospital-content-title",
  body: "hospital-content-body",
  category: "hospital-content-category",
  sourceText: "hospital-content-source",
} as const;
const createTextFields = [
  { name: "title", value: "หัวข้อใหม่" },
  { name: "body", value: "เนื้อหาใหม่" },
  { name: "sourceText", value: "แหล่งอ้างอิงใหม่" },
] as const;

function content(overrides: Partial<HospitalContentDetailProjection> = {}): HospitalContentDetailProjection {
  return {
    id: contentId,
    hospital,
    title: "หัวข้อเดิม",
    body: "เนื้อหาเดิม",
    category: HospitalContentCategory.FOOD,
    sourceText: "แหล่งอ้างอิงเดิม",
    status: HospitalContentStatus.DRAFT,
    firstPublishedAt: null,
    latestPublishedAt: null,
    expectedUpdatedAt,
    imageIds: [],
    ...overrides,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let originalActEnvironment: boolean | undefined;
let originalRandomUUID: PropertyDescriptor | undefined;
let originalShowModal: PropertyDescriptor | undefined;
let originalClose: PropertyDescriptor | undefined;
let originalScrollTo: PropertyDescriptor | undefined;

function field<T extends HTMLElement>(id: string): T {
  const found = container?.querySelector<T>(`#${id}`);
  if (!found) throw new Error(`Missing field ${id}`);
  return found;
}

function setTextValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw new Error("Missing native value setter");
  setter.call(element, value);
  act(() => element.dispatchEvent(new Event("input", { bubbles: true })));
}

function setCategoryValue(value: HospitalContentCategory): void {
  const select = field<HTMLSelectElement>(createFieldIds.category);
  select.value = value;
  act(() => select.dispatchEvent(new Event("change", { bubbles: true })));
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

async function mountCreateForm(hospitals: readonly HospitalContentOwnerHospital[] = [hospital]): Promise<void> {
  window.sessionStorage.clear();
  await mount(createElement(HospitalContentCreateForm, {
    hospitals,
    selectedHospitalId: hospital.id,
    recoveryScope: "event-lifecycle-regression",
  }));
  field(createFieldIds.title);
}

function dispatchSubmit(): void {
  const form = container?.querySelector("form");
  if (!form) throw new Error("Missing knowledge form");
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

function button(label: string, scope: ParentNode = container as HTMLDivElement): HTMLButtonElement {
  const found = Array.from(scope.querySelectorAll<HTMLButtonElement>("button"))
    .find((item) => item.textContent?.includes(label));
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}

function link(label: string): HTMLAnchorElement {
  const found = Array.from(container?.querySelectorAll<HTMLAnchorElement>("a") ?? [])
    .find((item) => item.textContent?.includes(label));
  if (!found) throw new Error(`Missing link ${label}`);
  return found;
}

function clickLink(anchor: HTMLAnchorElement): MouseEvent {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
  act(() => anchor.dispatchEvent(event));
  return event;
}

beforeAll(() => {
  const globalWithActFlag = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  originalActEnvironment = globalWithActFlag.IS_REACT_ACT_ENVIRONMENT;
  globalWithActFlag.IS_REACT_ACT_ENVIRONMENT = true;
  originalRandomUUID = Object.getOwnPropertyDescriptor(window.crypto, "randomUUID");
  originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement): void { this.setAttribute("open", ""); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement): void {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value(): void {} });
});

afterAll(() => {
  const globalWithActFlag = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  if (originalActEnvironment === undefined) {
    Reflect.deleteProperty(globalWithActFlag, "IS_REACT_ACT_ENVIRONMENT");
  } else {
    globalWithActFlag.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  }
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  if (originalScrollTo) Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScrollTo);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
});

beforeEach(() => {
  mocks.archive.mockReset().mockResolvedValue({ status: "SUCCESS", result: { outcome: "ARCHIVED", content: content() } });
  mocks.create.mockReset().mockResolvedValue({ status: "ERROR", code: "UNAVAILABLE", message: "test" });
  mocks.edit.mockReset().mockResolvedValue({ status: "ERROR", code: "UNAVAILABLE", message: "test" });
  mocks.publish.mockReset().mockResolvedValue({ status: "SUCCESS", result: { outcome: "PUBLISHED", content: content() } });
  mocks.push.mockReset();
  mocks.read.mockReset().mockResolvedValue({ status: "SUCCESS", content: content() });
  mocks.reconcile.mockReset().mockResolvedValue({ status: "SUCCESS", result: { status: "ABSENT" } });
  mocks.withdraw.mockReset().mockResolvedValue({ status: "SUCCESS", result: { outcome: "WITHDRAWN", content: content() } });
  Object.defineProperty(window.crypto, "randomUUID", {
    configurable: true,
    value: () => submissionNonce,
  });
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  container?.remove();
  container = null;
  window.sessionStorage.clear();
  if (originalRandomUUID) {
    Object.defineProperty(window.crypto, "randomUUID", originalRandomUUID);
  } else {
    Reflect.deleteProperty(window.crypto, "randomUUID");
  }
});

describe("Hospital Knowledge create form event lifecycle regression", () => {
  it.each(createTextFields)("updates $name without losing the other draft fields or throwing", async ({ name, value }) => {
    await mountCreateForm();

    expect(() => setTextValue(field<HTMLInputElement | HTMLTextAreaElement>(createFieldIds[name]), value)).not.toThrow();
    expect(field<HTMLInputElement>(createFieldIds.title).value).toBe(name === "title" ? value : "");
    expect(field<HTMLTextAreaElement>(createFieldIds.body).value).toBe(name === "body" ? value : "");
    expect(field<HTMLSelectElement>(createFieldIds.category).value).toBe("");
    expect(field<HTMLInputElement>(createFieldIds.sourceText).value).toBe(name === "sourceText" ? value : "");
  });

  it("keeps the selected category typed and preserves the other create draft fields", async () => {
    await mountCreateForm();
    const category: HospitalContentCategory = HospitalContentCategory.NCD;

    expect(() => setCategoryValue(category)).not.toThrow();
    expect(field<HTMLSelectElement>(createFieldIds.category).value).toBe(category);
    expect(field<HTMLInputElement>(createFieldIds.title).value).toBe("");
    expect(field<HTMLTextAreaElement>(createFieldIds.body).value).toBe("");
    expect(field<HTMLInputElement>(createFieldIds.sourceText).value).toBe("");
  });

  it("submits the controlled create draft values and enum category", async () => {
    await mountCreateForm();
    const category: HospitalContentCategory = HospitalContentCategory.NCD;
    setTextValue(field<HTMLInputElement>(createFieldIds.title), "หัวข้อสำหรับสร้าง");
    setTextValue(field<HTMLTextAreaElement>(createFieldIds.body), "เนื้อหาสำหรับสร้าง");
    setCategoryValue(category);
    setTextValue(field<HTMLInputElement>(createFieldIds.sourceText), "อ้างอิงสำหรับสร้าง");

    mocks.create.mockResolvedValue({
      status: "SUCCESS",
      result: { outcome: "CREATED", content: content({ title: "หัวข้อสำหรับสร้าง", body: "เนื้อหาสำหรับสร้าง", category, sourceText: "อ้างอิงสำหรับสร้าง" }) },
    });
    await act(async () => {
      dispatchSubmit();
    });

    expect(mocks.create).toHaveBeenCalledWith({
      hospitalId: hospital.id,
      submissionNonce,
      title: "หัวข้อสำหรับสร้าง",
      body: "เนื้อหาสำหรับสร้าง",
      category,
      sourceText: "อ้างอิงสำหรับสร้าง",
    });
  });

  it("keeps the create draft when hospital switching is cancelled and follows the selected hospital after approval", async () => {
    await mountCreateForm([hospital, secondHospital]);
    setTextValue(field<HTMLInputElement>(createFieldIds.title), "หัวข้อฉบับร่าง");

    const selector = field<HTMLSelectElement>("hospital-content-create-hospital");
    selector.value = secondHospital.id;
    act(() => selector.dispatchEvent(new Event("change", { bubbles: true })));
    expect(mocks.push).not.toHaveBeenCalled();
    expect(container?.querySelector("dialog")?.textContent).toContain(secondHospital.name);

    button("ยกเลิก", container?.querySelector("dialog") as HTMLDialogElement).click();
    expect(field<HTMLInputElement>(createFieldIds.title).value).toBe("หัวข้อฉบับร่าง");
    expect(field<HTMLSelectElement>("hospital-content-create-hospital").value).toBe(hospital.id);
    expect(mocks.push).not.toHaveBeenCalled();

    const retrySelector = field<HTMLSelectElement>("hospital-content-create-hospital");
    retrySelector.value = secondHospital.id;
    act(() => retrySelector.dispatchEvent(new Event("change", { bubbles: true })));
    const dialog = container?.querySelector("dialog");
    if (!dialog) throw new Error("Missing hospital switch confirmation");
    await act(async () => {
      button("เปลี่ยนโรงพยาบาล", dialog).click();
    });
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(
      `/app/hospitals/knowledge/new?hospitalId=${secondHospital.id}`,
    );
  });

  it("preserves the intended create-page destination until explicit approval", async () => {
    await mountCreateForm();
    setTextValue(field<HTMLInputElement>(createFieldIds.title), "หัวข้อฉบับร่าง");

    const event = clickLink(link("กลับไปรายการ"));
    expect(event.defaultPrevented).toBe(true);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(field<HTMLInputElement>(createFieldIds.title).value).toBe("หัวข้อฉบับร่าง");

    const dialog = container?.querySelector("dialog");
    if (!dialog) throw new Error("Missing unsaved draft confirmation");
    await act(async () => {
      button("ออกจากหน้านี้", dialog).click();
    });
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(
      `/app/hospitals/knowledge?hospitalId=${hospital.id}`,
    );
  });
});

describe("Hospital Knowledge edit form event lifecycle regression", () => {
  it.each([
    { name: "title", value: "หัวข้อที่แก้" },
    { name: "body", value: "เนื้อหาที่แก้" },
    { name: "sourceText", value: "อ้างอิงที่แก้" },
  ] as const)("updates $name without losing the other draft fields or throwing", async ({ name, value }) => {
    await mount(createElement(HospitalContentDetailWorkspace, { content: content() }));

    expect(() => setTextValue(field<HTMLInputElement | HTMLTextAreaElement>(createFieldIds[name]), value)).not.toThrow();
    expect(field<HTMLInputElement>(createFieldIds.title).value).toBe(name === "title" ? value : "หัวข้อเดิม");
    expect(field<HTMLTextAreaElement>(createFieldIds.body).value).toBe(name === "body" ? value : "เนื้อหาเดิม");
    expect(field<HTMLSelectElement>(createFieldIds.category).value).toBe(HospitalContentCategory.FOOD);
    expect(field<HTMLInputElement>(createFieldIds.sourceText).value).toBe(name === "sourceText" ? value : "แหล่งอ้างอิงเดิม");
  });

  it("keeps the selected category typed and preserves the other edit draft fields", async () => {
    await mount(createElement(HospitalContentDetailWorkspace, { content: content() }));
    const category: HospitalContentCategory = HospitalContentCategory.EXERCISE;

    expect(() => setCategoryValue(category)).not.toThrow();
    expect(field<HTMLSelectElement>(createFieldIds.category).value).toBe(category);
    expect(field<HTMLInputElement>(createFieldIds.title).value).toBe("หัวข้อเดิม");
    expect(field<HTMLTextAreaElement>(createFieldIds.body).value).toBe("เนื้อหาเดิม");
    expect(field<HTMLInputElement>(createFieldIds.sourceText).value).toBe("แหล่งอ้างอิงเดิม");
  });

  it("submits the controlled edit draft values with the existing concurrency version", async () => {
    const category: HospitalContentCategory = HospitalContentCategory.EXERCISE;
    const updated = content({
      title: "หัวข้อที่แก้สำหรับบันทึก",
      body: "เนื้อหาที่แก้สำหรับบันทึก",
      category,
      sourceText: "อ้างอิงที่แก้สำหรับบันทึก",
    });
    await mount(createElement(HospitalContentDetailWorkspace, { content: content() }));
    setTextValue(field<HTMLInputElement>(createFieldIds.title), updated.title);
    setTextValue(field<HTMLTextAreaElement>(createFieldIds.body), updated.body);
    setCategoryValue(category);
    setTextValue(field<HTMLInputElement>(createFieldIds.sourceText), updated.sourceText ?? "");
    mocks.edit.mockResolvedValue({ status: "SUCCESS", result: { outcome: "UPDATED", content: updated } });

    await act(async () => {
      dispatchSubmit();
    });

    expect(mocks.edit).toHaveBeenCalledWith({
      contentId,
      expectedUpdatedAt,
      title: updated.title,
      body: updated.body,
      category,
      sourceText: updated.sourceText,
    });
  });

  it("keeps the edit draft when leaving is cancelled and follows the original destination after approval", async () => {
    await mount(createElement(HospitalContentDetailWorkspace, { content: content() }));
    setTextValue(field<HTMLInputElement>(createFieldIds.title), "หัวข้อแก้ไขที่ยังไม่บันทึก");

    const event = clickLink(link("กลับไปรายการ"));
    expect(event.defaultPrevented).toBe(true);
    expect(mocks.push).not.toHaveBeenCalled();
    const dialog = container?.querySelector("dialog");
    if (!dialog) throw new Error("Missing edit draft confirmation");

    button("ยกเลิก", dialog).click();
    expect(field<HTMLInputElement>(createFieldIds.title).value).toBe("หัวข้อแก้ไขที่ยังไม่บันทึก");
    expect(mocks.push).not.toHaveBeenCalled();

    clickLink(link("กลับไปรายการ"));
    const confirmDialog = container?.querySelector("dialog");
    if (!confirmDialog) throw new Error("Missing edit draft confirmation");
    await act(async () => {
      button("ออกจากหน้านี้", confirmDialog).click();
    });
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(`/app/hospitals/knowledge?hospitalId=${hospital.id}`);
  });

  it("does not run a lifecycle mutation until confirmed and keeps an uncertain result open without retry", async () => {
    await mount(createElement(HospitalContentDetailWorkspace, { content: content() }));
    act(() => button("เก็บถาวร").click());
    expect(mocks.archive).not.toHaveBeenCalled();
    let dialog = container?.querySelector("dialog");
    if (!dialog) throw new Error("Missing archive confirmation");
    button("ยกเลิก", dialog).click();
    expect(mocks.archive).not.toHaveBeenCalled();

    mocks.archive.mockResolvedValue({ status: "UNCONFIRMED" });
    act(() => button("เก็บถาวร").click());
    dialog = container?.querySelector("dialog");
    if (!dialog) throw new Error("Missing archive confirmation");
    await act(async () => {
      button("เก็บถาวร", dialog).click();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.archive).toHaveBeenCalledOnce();
    expect(container?.querySelector("dialog")).not.toBeNull();
    expect(container?.textContent).toContain("ยังยืนยันผลไม่ได้");
    const confirmButton = button("เก็บถาวร", container?.querySelector("dialog") as HTMLDialogElement);
    expect(confirmButton.disabled).toBe(true);
  });

  it("blocks navigation while a confirmed lifecycle mutation is pending", async () => {
    let resolveArchive: ((result: unknown) => void) | null = null;
    mocks.archive.mockReturnValue(new Promise((resolve) => { resolveArchive = resolve; }));
    await mount(createElement(HospitalContentDetailWorkspace, {
      content: content({ status: HospitalContentStatus.PUBLISHED }),
    }));

    act(() => button("เก็บถาวร").click());
    const dialog = container?.querySelector("dialog");
    if (!dialog) throw new Error("Missing archive confirmation");
    act(() => button("เก็บถาวร", dialog).click());
    expect(mocks.archive).toHaveBeenCalledOnce();

    const event = clickLink(link("กลับไปรายการ"));
    expect(event.defaultPrevented).toBe(true);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(container?.textContent).toContain("กรุณารอให้ระบบบันทึกหรือตรวจสอบข้อมูลเสร็จก่อนออกจากหน้านี้");

    await act(async () => {
      resolveArchive?.({
        status: "SUCCESS",
        result: { outcome: "ARCHIVED", content: content({ status: HospitalContentStatus.ARCHIVED }) },
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    expect(mocks.push).not.toHaveBeenCalled();
    expect(container?.querySelector("dialog")).toBeNull();
  });
});
