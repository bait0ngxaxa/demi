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

async function mountCreateForm(): Promise<void> {
  window.sessionStorage.clear();
  await mount(createElement(HospitalContentCreateForm, {
    hospitals: [hospital],
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

beforeAll(() => {
  const globalWithActFlag = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  originalActEnvironment = globalWithActFlag.IS_REACT_ACT_ENVIRONMENT;
  globalWithActFlag.IS_REACT_ACT_ENVIRONMENT = true;
  originalRandomUUID = Object.getOwnPropertyDescriptor(window.crypto, "randomUUID");
});

afterAll(() => {
  const globalWithActFlag = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  if (originalActEnvironment === undefined) {
    Reflect.deleteProperty(globalWithActFlag, "IS_REACT_ACT_ENVIRONMENT");
  } else {
    globalWithActFlag.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  }
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
});
