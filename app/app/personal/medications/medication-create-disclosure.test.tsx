// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonalMedicationActionState } from "@/modules/medications/transport/action-state";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/modules/medications/transport/server-actions", () => ({
  createPersonalMedicationAction: mocks.create, updatePersonalMedicationAction: vi.fn(),
  stopPersonalMedicationAction: vi.fn(), replacePersonalMedicationSchedulesAction: vi.fn(),
}));
import { PersonalMedicationWorkspace } from "./personal-medication-workspace";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const empty = { items: [], nextCursor: null };
let host: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  mocks.create.mockReset();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(() => root.render(<PersonalMedicationWorkspace active={empty} stopped={empty} selected={null} />));
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
function disclosure(): HTMLDetailsElement {
  const element = host.querySelector("details");
  if (!element) throw new Error("Missing create disclosure");
  return element;
}
async function toggle(): Promise<void> {
  await act(() => disclosure().querySelector("summary")?.click());
}
function name(): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>('[name="medicationName"]');
  if (!input) throw new Error("Missing name");
  return input;
}
async function typeName(): Promise<void> {
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(name(), "ยาที่จดไว้");
    name().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit(): Promise<void> {
  await act(async () => { host.querySelector("form")?.requestSubmit(); });
}
describe("medication creation disclosure interactions", () => {
  it("collapses empty and dirty forms without replacing the editor or draft", async () => {
    const input = name();
    await toggle(); expect(disclosure().open).toBe(false);
    await toggle(); await typeName(); await toggle(); await toggle();
    expect(name()).toBe(input); expect(name().value).toBe("ยาที่จดไว้");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each([
    { status: "CONFLICT", message: "รายการเปลี่ยนแล้ว" },
    { status: "ERROR", refreshRequired: true, message: "ยังยืนยันไม่ได้" },
    { status: "ERROR", loginHref: "/login", message: "หมดเวลาเข้าสู่ระบบ" },
    { status: "ERROR", message: "บัญชีนี้ไม่สามารถเข้าถึงรายการได้" },
  ] satisfies PersonalMedicationActionState[])("keeps pending and review-required $message visible without retry", async (result) => {
    let resolve: (value: PersonalMedicationActionState) => void = () => undefined;
    mocks.create.mockReturnValue(new Promise((done) => { resolve = done; }));
    await typeName(); await submit();
    await toggle(); expect(disclosure().open).toBe(true);
    expect(host.querySelector('[aria-busy="true"]')).not.toBeNull();
    await act(() => resolve(result));
    await toggle(); expect(disclosure().open).toBe(true);
    expect(disclosure().textContent).toContain(result.message);
    expect(host.querySelector('[data-navigation-guard="unknown-outcome"]') !== null).toBe(Boolean("refreshRequired" in result && result.refreshRequired));
    // Also recover a native toggle that did not originate from a summary click.
    await act(() => { disclosure().open = false; disclosure().dispatchEvent(new Event("toggle")); });
    expect(disclosure().open).toBe(true);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(name().value).toBe("ยาที่จดไว้");
    expect(document.activeElement?.closest("details")).toBe(disclosure());
  });
  it("permits collapse after validation and authoritative success without auto-closing", async () => {
    mocks.create.mockResolvedValueOnce({ status: "ERROR", message: "ตรวจสอบชื่อ", fieldErrors: { medicationName: "ตรวจสอบชื่อ" } });
    await typeName(); await submit();
    expect(disclosure().open).toBe(true);
    await toggle(); expect(disclosure().open).toBe(false); await toggle();
    mocks.create.mockResolvedValueOnce({ status: "SUCCESS", message: "บันทึกรายการแล้ว" });
    await submit(); expect(disclosure().open).toBe(true);
    expect(host.textContent).toContain("บันทึกรายการแล้ว");
    await toggle(); expect(disclosure().open).toBe(false);
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });
  it("uses a native summary with a visible focus style and accessible name", () => {
    const summary = disclosure().querySelector("summary");
    expect(summary?.textContent).toContain("เพิ่มรายการยา");
    expect(summary?.className).toContain("focus-visible:ring-4");
    summary?.focus(); expect(document.activeElement).toBe(summary);
    expect(summary?.getAttribute("role")).toBeNull();
  });
  it.each([1, 5, 24, 60])("keeps a %i-time schedule keyboard focusable with native list semantics", async (count) => {
    const schedules = Array.from({ length: count }, (_, index) => ({ localTime: `08:${String(index).padStart(2, "0")}` }));
    const item = { id: "11111111-1111-4111-8111-111111111111", medicationName: "ยาที่จดไว้", instructionText: null, status: "STOPPED" as const, stoppedAt: "2026-10-03T00:00:00Z", createdAt: "2026-10-03T00:00:00Z", updatedAt: "2026-10-03T00:00:00Z", schedules };
    await act(() => root.render(<PersonalMedicationWorkspace active={empty} stopped={{ items: [item], nextCursor: null }} selected={item} />));
    const list = host.querySelector<HTMLUListElement>('ul[aria-label="เวลาที่บันทึกไว้ก่อนหยุดติดตาม"]');
    expect(list?.tabIndex).toBe(0);
    expect(list?.getAttribute("role")).toBeNull();
    expect(list?.querySelectorAll(":scope > li")).toHaveLength(count);
    expect([...list?.querySelectorAll("time") ?? []].map((time) => time.dateTime)).toEqual(schedules.map((time) => time.localTime));
    list?.focus(); expect(document.activeElement).toBe(list);
    expect(list?.className).toContain("focus-visible:ring-4");
    expect(list?.className).toContain("overflow-x-hidden");
  });
});
