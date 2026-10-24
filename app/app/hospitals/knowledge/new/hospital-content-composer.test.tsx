// @vitest-environment jsdom

import { HospitalContentCategory, HospitalContentStatus } from "@prisma/client";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  publish: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  read: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  reconcile: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  optimize: vi.fn<(file: File) => Promise<File>>(),
  push: vi.fn<(href: string) => void>(),
  success: vi.fn<(message: string) => void>(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: vi.fn() }) }));
vi.mock("@/components/ui/notify", () => ({ notify: { success: mocks.success, warning: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/modules/hospital-content/transport/server-actions", () => ({
  createHospitalContentAction: mocks.create,
  publishHospitalContentAction: mocks.publish,
  readHospitalContentCurrentAction: mocks.read,
  reconcileHospitalContentCreateAction: mocks.reconcile,
}));
vi.mock("@/modules/patient-evidence/client/patient-evidence-image-optimizer", () => ({
  optimizeEvidenceImage: mocks.optimize,
  getEvidenceImageOptimizationErrorMessage: () => "ไม่สามารถเตรียมรูปนี้สำหรับอัปโหลดได้",
}));

import type { HospitalContentDetailProjection, HospitalContentOwnerHospital } from "@/modules/hospital-content/types/hospital-content-projections";
import { HospitalContentCreateForm } from "./hospital-content-create-form";

const hospital: HospitalContentOwnerHospital = { id: "11111111-1111-4111-8111-111111111111", hospitalCode: "H-001", name: "โรงพยาบาลทดสอบ" };
const CONTENT_ID = "22222222-2222-4222-8222-222222222222";
const V1 = "2026-10-05T02:03:04.005Z";
const TITLE = "หัวข้อเผยแพร่";
const BODY = "เนื้อหาเผยแพร่";

function draftContent(overrides: Partial<HospitalContentDetailProjection> = {}): HospitalContentDetailProjection {
  return {
    id: CONTENT_ID, hospital, title: TITLE, body: BODY, category: HospitalContentCategory.FOOD, sourceText: null,
    status: HospitalContentStatus.DRAFT, firstPublishedAt: null, latestPublishedAt: null, expectedUpdatedAt: V1, imageIds: [], ...overrides,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let originalActEnvironment: boolean | undefined;
let uuidCounter = 0;
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
  define(URL, "createObjectURL", () => "blob:preview");
  define(URL, "revokeObjectURL", () => undefined);
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
  mocks.optimize.mockImplementation(async (file) => file);
  mocks.reconcile.mockResolvedValue({ status: "SUCCESS", result: { status: "ABSENT" } });
  mocks.create.mockResolvedValue({ status: "SUCCESS", result: { outcome: "CREATED", content: draftContent() } });
  mocks.publish.mockResolvedValue({ status: "SUCCESS", result: { outcome: "PUBLISHED", content: draftContent({ status: HospitalContentStatus.PUBLISHED }) } });
  window.sessionStorage.clear();
  uuidCounter = 0;
  Object.defineProperty(window.crypto, "randomUUID", {
    configurable: true,
    value: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}`,
  });
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
});

async function settle(): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); });
}

async function mountComposer(): Promise<void> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(createElement(HospitalContentCreateForm, { hospitals: [hospital], selectedHospitalId: hospital.id, recoveryScope: "composer" }));
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
  const found = Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find((item) => item.textContent?.trim() === label || item.getAttribute("aria-label") === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}

function fillRequired(): void {
  setText(field<HTMLInputElement>("hospital-content-title"), TITLE);
  setText(field<HTMLTextAreaElement>("hospital-content-body"), BODY);
  const category = field<HTMLSelectElement>("hospital-content-category");
  category.value = HospitalContentCategory.FOOD;
  act(() => category.dispatchEvent(new Event("change", { bubbles: true })));
}

async function pickImages(names: readonly string[]): Promise<void> {
  const input = field<HTMLInputElement>("hospital-content-composer-image-files");
  const files = names.map((name) => new File([name], name, { type: "image/png" }));
  Object.defineProperty(input, "files", { configurable: true, value: files });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
  await settle();
}

function imageRows(): HTMLLIElement[] {
  return Array.from(container?.querySelectorAll<HTMLLIElement>("section[aria-labelledby='hospital-content-composer-images-heading'] li") ?? []);
}

function dialogOf(): HTMLDialogElement {
  const dialog = Array.from(container?.querySelectorAll("dialog") ?? []).find((item) => item.hasAttribute("open"));
  if (!dialog) throw new Error("Missing open dialog");
  return dialog;
}

function uploadCaptions(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map(([, init]) => ((init as RequestInit).body as FormData).get("caption") as string);
}

function uploadedNames(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map(([, init]) => (((init as RequestInit).body as FormData).get("file") as File).name);
}

function imageOk(imageId: string): Response {
  return new Response(JSON.stringify({ imageId }), { status: 201, headers: { "content-type": "application/json" } });
}

describe("Hospital content composer", () => {
  it("offers one primary 'เผยแพร่' with a secondary draft button and asks for required fields first", async () => {
    await mountComposer();

    expect(button("เผยแพร่").className).toContain("bg-action-primary");
    expect(button("บันทึกฉบับร่าง").className).not.toContain("bg-action-primary");
    await act(async () => button("เผยแพร่").click());

    expect(mocks.create).not.toHaveBeenCalled();
    expect(container?.querySelector("dialog[open]")).toBeNull();
    expect(container?.textContent).toContain("เลือกหมวดหมู่ที่ต้องการ");
  });

  it("publishes after confirmation with the version returned by create, then opens the published item with a Toast", async () => {
    await mountComposer();
    fillRequired();

    await act(async () => button("เผยแพร่").click());
    expect(mocks.create).not.toHaveBeenCalled();
    expect(dialogOf().textContent).toContain(TITLE);

    await act(async () => button("เผยแพร่", dialogOf()).click());
    await settle();

    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.publish).toHaveBeenCalledExactlyOnceWith({ contentId: CONTENT_ID, expectedUpdatedAt: V1 });
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("เผยแพร่เนื้อหาแล้ว");
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(`/app/hospitals/knowledge/${CONTENT_ID}`);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("limits the picker to three images, previews them in order and lets the owner reorder and remove before submit", async () => {
    await mountComposer();
    await pickImages(["a.png", "b.png"]);
    await pickImages(["c.png", "d.png"]);

    expect(container?.textContent).toContain("เพิ่มได้อีกไม่เกิน 1 รูป");
    await pickImages(["c.png"]);
    expect(imageRows()).toHaveLength(3);
    expect(container?.querySelector("#hospital-content-composer-image-files")).toBeNull();
    expect(container?.textContent).toContain("เพิ่มรูปครบ 3 รูปแล้ว");

    await act(async () => button("เลื่อนภาพที่ 3 ขึ้น").click());
    await act(async () => button("ลบภาพที่ 1").click());
    expect(imageRows()).toHaveLength(2);
    expect(container?.querySelector("#hospital-content-composer-image-files")).not.toBeNull();
  });

  it("uploads images in the chosen order with stable nonces and publishes only after every image is stored", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(imageOk("img-1"))
      .mockResolvedValueOnce(imageOk("img-2"))
      .mockResolvedValueOnce(imageOk("img-3"));
    vi.stubGlobal("fetch", fetchMock);
    mocks.publish.mockImplementation(async () => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
      return { status: "SUCCESS", result: { outcome: "PUBLISHED", content: draftContent({ status: HospitalContentStatus.PUBLISHED }) } };
    });
    await mountComposer();
    fillRequired();
    await pickImages(["a.png", "b.png", "c.png"]);
    await act(async () => button("เลื่อนภาพที่ 3 ขึ้น").click());
    await act(async () => button("ลบภาพที่ 1").click());
    await pickImages(["d.png"]);

    await act(async () => button("เผยแพร่").click());
    await act(async () => button("เผยแพร่", dialogOf()).click());
    await settle();

    expect(uploadedNames(fetchMock)).toEqual(["c.png", "b.png", "d.png"]);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(Array(3).fill(`/api/hospital-content/${CONTENT_ID}/images`));
    expect(new Set(uploadCaptions(fetchMock)).size).toBe(3);
    expect(mocks.publish).toHaveBeenCalledOnce();
    expect(mocks.push).toHaveBeenCalledOnce();
  });

  it("stops without publishing when image 2 fails, keeps the saved draft, and resumes with only the remaining upload", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(imageOk("img-1"))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(imageOk("img-2"));
    vi.stubGlobal("fetch", fetchMock);
    await mountComposer();
    fillRequired();
    await pickImages(["a.png", "b.png"]);

    await act(async () => button("เผยแพร่").click());
    await act(async () => button("เผยแพร่", dialogOf()).click());
    await settle();

    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(container?.textContent).toContain("อัปโหลดรูปที่ 2 ไม่สำเร็จ");
    expect(container?.textContent).toContain("บันทึกฉบับร่างไว้แล้ว เนื้อหายังไม่ถูกเผยแพร่");
    expect(field<HTMLInputElement>("hospital-content-title").disabled).toBe(true);
    expect(button("เปิดฉบับร่าง")).toBeTruthy();
    const failedCaption = uploadCaptions(fetchMock)[1];

    await act(async () => button("ลองต่อ").click());
    await settle();

    expect(mocks.create).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(uploadCaptions(fetchMock)[2]).toBe(failedCaption);
    expect(uploadedNames(fetchMock)).toEqual(["a.png", "b.png", "b.png"]);
    expect(mocks.publish).toHaveBeenCalledExactlyOnceWith({ contentId: CONTENT_ID, expectedUpdatedAt: V1 });
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(`/app/hospitals/knowledge/${CONTENT_ID}`);
  });

  it("does not offer a resume for a rejected image and opens the saved draft instead", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: "รูปหรือข้อมูลอัปโหลดไม่ผ่านการตรวจสอบ" }), { status: 400 })));
    await mountComposer();
    fillRequired();
    await pickImages(["a.png"]);

    await act(async () => button("เผยแพร่").click());
    await act(async () => button("เผยแพร่", dialogOf()).click());
    await settle();

    expect(container?.textContent).toContain("รูปหรือข้อมูลอัปโหลดไม่ผ่านการตรวจสอบ");
    expect(Array.from(container?.querySelectorAll("button") ?? []).some((item) => item.textContent === "ลองต่อ")).toBe(false);
    await act(async () => button("เปิดฉบับร่าง").click());
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(`/app/hospitals/knowledge/${CONTENT_ID}`);
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("reports a publish conflict, offers the draft only, and never publishes twice", async () => {
    mocks.publish.mockResolvedValueOnce({ status: "ERROR", code: "CONFLICT", message: "x" });
    await mountComposer();
    fillRequired();

    await act(async () => button("เผยแพร่").click());
    await act(async () => button("เผยแพร่", dialogOf()).click());
    await settle();

    expect(container?.textContent).toContain("ฉบับร่างถูกเปลี่ยนแปลงแล้ว");
    expect(Array.from(container?.querySelectorAll("button") ?? []).some((item) => item.textContent === "ลองต่อ")).toBe(false);
    expect(mocks.publish).toHaveBeenCalledOnce();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("recovers an unconfirmed publish by reading the content and finishes without a second publish", async () => {
    mocks.publish.mockResolvedValueOnce({ status: "UNCONFIRMED" });
    mocks.read.mockResolvedValueOnce({ status: "SUCCESS", content: draftContent({ status: HospitalContentStatus.PUBLISHED, expectedUpdatedAt: "2026-10-05T02:04:04.005Z" }) });
    await mountComposer();
    fillRequired();

    await act(async () => button("เผยแพร่").click());
    await act(async () => button("เผยแพร่", dialogOf()).click());
    await settle();
    expect(container?.textContent).toContain("ยังยืนยันผลไม่ได้");

    await act(async () => button("ลองต่อ").click());
    await settle();

    expect(mocks.publish).toHaveBeenCalledOnce();
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith(CONTENT_ID);
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("เผยแพร่เนื้อหาแล้ว");
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(`/app/hospitals/knowledge/${CONTENT_ID}`);
  });

  it("saves a draft together with its images and never publishes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(imageOk("img-1")));
    await mountComposer();
    fillRequired();
    await pickImages(["a.png"]);

    await act(async () => button("บันทึกฉบับร่าง").click());
    await settle();

    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.success).toHaveBeenCalledExactlyOnceWith("สร้างฉบับร่างแล้ว");
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(`/app/hospitals/knowledge/${CONTENT_ID}`);
  });
});
