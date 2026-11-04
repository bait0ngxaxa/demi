// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { NetworkReportExportPreview } from "@/modules/reporting/services/hospital-report-query-service";

import { NETWORK_EXPORT_CONFIRMATION, NetworkExportPanel } from "./network-export-panel";

const parentId = "11111111-1111-4111-8111-000000000001";
const childAId = "11111111-1111-4111-8111-000000000002";
const childBId = "11111111-1111-4111-8111-000000000003";

function preview(programs: [number, number, number], cohort: "ACTIVE" | "INCLUDE_ENDED" = "ACTIVE"): NetworkReportExportPreview {
  const hospitals = [
    { id: parentId, hospitalCode: "P-001", name: "โรงพยาบาลแม่ข่าย", kind: "PARENT" as const, relationships: 10, relationshipsWithoutProgram: 1, programs: programs[0] },
    { id: childAId, hospitalCode: "C-002", name: "รพ.สต.บ้านกลาง", kind: "CHILD" as const, relationships: 4, relationshipsWithoutProgram: 0, programs: programs[1] },
    { id: childBId, hospitalCode: "C-003", name: "รพ.สต.หนองน้ำ", kind: "CHILD" as const, relationships: 2, relationshipsWithoutProgram: 2, programs: programs[2] },
  ];
  return {
    parent: { id: parentId, hospitalCode: "P-001", name: "โรงพยาบาลแม่ข่าย" },
    cohort,
    accessBasis: "MEMBER",
    maxPrograms: 5_000,
    hospitals,
    totals: { relationships: 16, relationshipsWithoutProgram: 3, programs: programs[0] + programs[1] + programs[2] },
  };
}

let container: HTMLDivElement;
let root: Root;

function mount(active: NetworkReportExportPreview, includeEnded: NetworkReportExportPreview = active): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<NetworkExportPanel previews={{ ACTIVE: active, INCLUDE_ENDED: includeEnded }} />));
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}

function labelled(text: string): HTMLInputElement {
  const label = Array.from(container.querySelectorAll("label")).find((item) => item.textContent?.includes(text));
  const input = label?.htmlFor ? container.querySelector<HTMLInputElement>(`[id="${label.htmlFor}"]`) : label?.querySelector("input");
  if (!input) throw new Error(`Missing input ${text}`);
  return input;
}

function totals(): string[] {
  return Array.from(container.querySelectorAll("dl dd")).map((item) => item.textContent ?? "");
}

function type(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeAll(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value(): void {} });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement): void { this.setAttribute("open", ""); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement): void { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); },
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("ADR-0025 network export selection", () => {
  it("defaults to the whole network with its totals", () => {
    mount(preview([30, 8, 0]));

    expect(labelled("ทั้งเครือข่าย").checked).toBe(true);
    expect(container.textContent).toContain("ทั้งเครือข่าย (แม่ข่าย + ลูกข่าย 2 แห่ง)");
    expect(container.querySelector("ul[aria-label='หน่วยบริการที่เลือกได้']")).toBeNull();
    expect(totals()).toEqual(["3 แห่ง", "16", "38"]);
  });

  it("lists Hospitals with their counts, searches, and selects all or none of the visible ones", () => {
    mount(preview([30, 8, 0]));
    act(() => labelled("เลือกหน่วยบริการ").click());

    expect(container.textContent).toContain("รหัส C-002 · 4 เคส · 8 โปรแกรม");
    expect(totals()).toEqual(["3 แห่ง", "16", "38"]);

    act(() => button("ไม่เลือกเลย").click());
    expect(totals()).toEqual(["0 แห่ง", "0", "0"]);
    expect(button("ส่งออก Excel เครือข่าย").disabled).toBe(true);
    expect(container.textContent).toContain("เลือกอย่างน้อยหนึ่งหน่วยบริการเพื่อส่งออก");

    type(labelled("ค้นหาหน่วยบริการ"), "หนอง");
    expect(Array.from(container.querySelectorAll("ul[aria-label='หน่วยบริการที่เลือกได้'] li")).map((item) => item.textContent)).toEqual([
      expect.stringContaining("รพ.สต.หนองน้ำ"),
    ]);
    act(() => button("เลือกทั้งหมดที่แสดง").click());
    expect(totals()).toEqual(["1 แห่ง", "2", "0"]);

    type(labelled("ค้นหาหน่วยบริการ"), "C-002");
    act(() => labelled("รพ.สต.บ้านกลาง").click());
    expect(totals()).toEqual(["2 แห่ง", "6", "8"]);

    type(labelled("ค้นหาหน่วยบริการ"), "ไม่มีชื่อนี้");
    expect(container.textContent).toContain("ไม่พบหน่วยบริการที่ตรงกับคำค้น");
  });

  it("blocks a selection above 5,000 Programs until fewer Hospitals are chosen", () => {
    mount(preview([4_500, 600, 10]));

    expect(container.textContent).toContain("ไฟล์เดียวส่งออกได้ไม่เกิน 5,000 โปรแกรม แต่ที่เลือกไว้มี 5,110 โปรแกรม");
    expect(button("ส่งออก Excel เครือข่าย").disabled).toBe(true);

    act(() => labelled("เลือกหน่วยบริการ").click());
    act(() => labelled("รพ.สต.บ้านกลาง").click());
    expect(container.textContent).not.toContain("ไฟล์เดียวส่งออกได้ไม่เกิน");
    expect(button("ส่งออก Excel เครือข่าย").disabled).toBe(false);
  });

  it("uses the cohort's own counts and asks for confirmation before the download request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "หน่วยบริการต่อไปนี้ไม่อยู่ในเครือข่ายที่ส่งออกได้แล้ว: รพ.สต.หนองน้ำ" }), { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    mount(preview([30, 8, 0]), preview([31, 9, 1], "INCLUDE_ENDED"));

    act(() => labelled("รวมผู้ที่สิ้นสุดการดูแล").click());
    expect(totals()).toEqual(["3 แห่ง", "16", "41"]);
    act(() => labelled("เลือกหน่วยบริการ").click());
    act(() => labelled("โรงพยาบาลแม่ข่าย").click());

    act(() => button("ส่งออก Excel เครือข่าย").click());
    const dialog = container.querySelector("dialog");
    expect(dialog?.textContent).toContain(NETWORK_EXPORT_CONFIRMATION);
    expect(dialog?.textContent).toContain("2 หน่วยบริการ · 10 โปรแกรม · รวมผู้ที่สิ้นสุดการดูแล");
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => button("ยืนยันและดาวน์โหลด").click());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://demi.test");
    expect(url.pathname).toBe("/api/v1/hospital/reporting/network/export");
    expect(url.searchParams.get("parentHospitalId")).toBe(parentId);
    expect(url.searchParams.getAll("hospitalId")).toEqual([childAId, childBId]);
    expect(url.searchParams.get("scope")).toBeNull();
    expect(url.searchParams.get("cohort")).toBe("INCLUDE_ENDED");
    expect(container.querySelector("[role=alert]")?.textContent).toContain("รพ.สต.หนองน้ำ");
  });

  it("requests scope=ALL for the whole network and cancels without a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mount(preview([30, 8, 0]));

    act(() => button("ส่งออก Excel เครือข่าย").click());
    act(() => button("ยกเลิก").click());
    expect(container.querySelector("dialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(new Response("{}", { status: 503 }));
    act(() => button("ส่งออก Excel เครือข่าย").click());
    await act(async () => button("ยืนยันและดาวน์โหลด").click());
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "https://demi.test");
    expect(url.searchParams.get("scope")).toBe("ALL");
    expect(url.searchParams.getAll("hospitalId")).toEqual([]);
  });
});
