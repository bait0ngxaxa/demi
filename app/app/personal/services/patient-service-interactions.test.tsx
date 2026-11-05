// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { PatientServiceRequestStatusView } from "@/modules/patient-service-requests/services/patient-service-request-service";
import type { PatientServiceMutationActionState } from "@/modules/patient-service-requests/transport/action-state";

type MutationAction = (
  previous: PatientServiceMutationActionState,
  formData: FormData,
) => Promise<PatientServiceMutationActionState>;

const serverActions = vi.hoisted(() => ({
  create: vi.fn<MutationAction>(),
  withdraw: vi.fn<MutationAction>(),
}));

vi.mock("@/modules/patient-service-requests/transport/server-actions", () => ({
  createPatientServiceRequestAction: serverActions.create,
  withdrawOwnPatientServiceRequestAction: serverActions.withdraw,
  searchOwnServiceRequestOsmChoicesAction: vi.fn(),
}));

import { PatientServiceRequestForm, PatientServiceRequestHistoryItem } from "./patient-service-request-controls";

const pendingRequest: PatientServiceRequestStatusView = {
  requestId: "11111111-1111-4111-8111-111111111111",
  relationshipId: "22222222-2222-4222-8222-222222222222",
  appointmentId: null,
  serviceCode: "SCREENING",
  status: "PENDING",
  preferredOsmName: "สมชาย อสม.",
  preferredDate: "2026-11-03",
  preferredSlot: "MORNING",
  note: "โทรก่อนถึง",
  rejectionReason: null,
  createdAt: new Date("2026-10-30T00:00:00.000Z"),
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let originalActEnvironment: boolean | undefined;
let originalShowModal: PropertyDescriptor | undefined;
let originalClose: PropertyDescriptor | undefined;
let originalRequestSubmit: PropertyDescriptor | undefined;

function mount(node: ReactNode): void {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(node));
}

function button(label: string, parent: ParentNode = container ?? document): HTMLButtonElement {
  const found = Array.from(parent.querySelectorAll<HTMLButtonElement>("button"))
    .find((candidate) => candidate.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

async function settle(): Promise<void> {
  await act(async () => new Promise<void>((resolve) => setTimeout(resolve, 0)));
}

beforeAll(() => {
  const globalWithActFlag = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  originalActEnvironment = globalWithActFlag.IS_REACT_ACT_ENVIRONMENT;
  globalWithActFlag.IS_REACT_ACT_ENVIRONMENT = true;
  originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
  originalRequestSubmit = Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, "requestSubmit");
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
  Object.defineProperty(HTMLFormElement.prototype, "requestSubmit", {
    configurable: true,
    value(this: HTMLFormElement, submitter?: HTMLButtonElement | HTMLInputElement): void {
      this.dispatchEvent(new SubmitEvent("submit", {
        bubbles: true,
        cancelable: true,
        submitter: submitter ?? null,
      }));
    },
  });
});

afterAll(() => {
  const globalWithActFlag = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  if (originalActEnvironment === undefined) Reflect.deleteProperty(globalWithActFlag, "IS_REACT_ACT_ENVIRONMENT");
  else globalWithActFlag.IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  for (const [prototype, key, descriptor] of [
    [HTMLDialogElement.prototype, "showModal", originalShowModal],
    [HTMLDialogElement.prototype, "close", originalClose],
    [HTMLFormElement.prototype, "requestSubmit", originalRequestSubmit],
  ] as const) {
    if (descriptor) Object.defineProperty(prototype, key, descriptor);
    else Reflect.deleteProperty(prototype, key);
  }
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  container?.remove();
  container = null;
  serverActions.create.mockReset();
  serverActions.withdraw.mockReset();
});

describe("Patient service request interactions", () => {
  it("keeps request creation on the page with the existing Bangkok date bounds and optional preferences", () => {
    const markup = renderToStaticMarkup(createElement(PatientServiceRequestForm, {
      relationshipId: pendingRequest.relationshipId,
      services: ["SCREENING", "FOLLOW_UP", "EMPOWERMENT"],
      assignedOsm: { relationshipId: "osm-1", displayName: "สมชาย อสม." },
      preferredDateBounds: { min: "2026-11-03", max: "2027-01-02" },
    }));

    expect(markup).toContain('name="preferredDate"');
    expect(markup).toContain('min="2026-11-03"');
    expect(markup).toContain('max="2027-01-02"');
    expect(markup).toContain('name="preferredSlot"');
    expect(markup).toContain('name="preferredOsmRelationshipId"');
    expect(markup).toContain('name="note"');
    expect(markup).toContain("เลือกได้ตั้งแต่พรุ่งนี้ถึง 60 วันข้างหน้า");
    expect(markup).toContain("การเลือก อสม. ท่านอื่นเป็นการเยี่ยมครั้งนี้เท่านั้น");
    expect(markup).not.toContain("<dialog");
  });

  it("offers the three native services by code and marks one that already has an open request (ADR-0029)", () => {
    const markup = renderToStaticMarkup(createElement(PatientServiceRequestForm, {
      relationshipId: pendingRequest.relationshipId,
      services: ["SCREENING", "FOLLOW_UP", "EMPOWERMENT"],
      openServiceCodes: ["FOLLOW_UP"],
      assignedOsm: null,
      preferredDateBounds: { min: "2026-11-03", max: "2027-01-02" },
    }));

    expect(markup).toContain('name="serviceCode"');
    expect(markup).not.toContain("offeringId");
    expect(markup).toContain('<option value="SCREENING">คัดกรอง</option>');
    expect(markup).toContain('<option disabled="" value="FOLLOW_UP">ติดตาม (มีคำขอที่รอดำเนินการอยู่แล้ว)</option>');
    expect(markup).toContain('<option value="EMPOWERMENT">เสริมพลังใจ</option>');
    expect(markup.indexOf("คัดกรอง")).toBeLessThan(markup.indexOf("ติดตาม"));
    expect(markup.indexOf("ติดตาม")).toBeLessThan(markup.indexOf("เสริมพลังใจ"));
  });

  it.each(["PENDING", "APPROVED"] as const)("requires explicit confirmation before withdrawing a %s request", async (status) => {
    serverActions.withdraw.mockResolvedValue({ status: "SUCCESS", message: "ถอนคำขอแล้ว" });
    const request = { ...pendingRequest, status };
    mount(createElement(PatientServiceRequestHistoryItem, { hospitalName: "โรงพยาบาล ก", request }));
    const trigger = button("ถอนคำขอ");
    trigger.focus();
    act(() => trigger.click());

    const dialog = container?.querySelector<HTMLDialogElement>("dialog");
    expect(dialog?.open).toBe(true);
    expect(dialog?.textContent).toContain("โรงพยาบาล ก");
    expect(dialog?.textContent).toContain("คัดกรอง");
    expect(dialog?.textContent).toContain("การถอนคำขอไม่ใช่การยกเลิกนัดหมายที่สร้างแล้ว");
    expect(dialog?.querySelectorAll("form")).toHaveLength(0);
    expect(serverActions.withdraw).not.toHaveBeenCalled();

    act(() => button("ยกเลิก", dialog ?? document).click());
    expect(container?.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(serverActions.withdraw).not.toHaveBeenCalled();
  });

  it("withdraws only after the final confirmation, sends the selected request id, and restores focus to feedback", async () => {
    serverActions.withdraw.mockResolvedValue({ status: "SUCCESS", message: "ถอนคำขอแล้ว" });
    mount(createElement(PatientServiceRequestHistoryItem, { hospitalName: "โรงพยาบาล ก", request: pendingRequest }));
    act(() => button("ถอนคำขอ").click());
    expect(serverActions.withdraw).not.toHaveBeenCalled();
    act(() => button("ยืนยันถอนคำขอ", container?.querySelector("dialog") ?? document).click());
    await settle();

    expect(serverActions.withdraw).toHaveBeenCalledOnce();
    const formData = serverActions.withdraw.mock.calls[0]?.[1];
    expect(formData?.get("requestId")).toBe(pendingRequest.requestId);
    expect(container?.querySelector("dialog")).toBeNull();
    expect(container?.querySelector('[role="status"]')?.textContent).toContain("ถอนคำขอแล้ว");
    expect(document.activeElement).toBe(container?.querySelector('[role="status"]'));
  });

  it.each(["STARTED", "REJECTED", "WITHDRAWN"] as const)("does not expose withdrawal for %s requests", (status) => {
    mount(createElement(PatientServiceRequestHistoryItem, {
      hospitalName: "โรงพยาบาล ก",
      request: { ...pendingRequest, status, appointmentId: status === "STARTED" ? "appointment-1" : null },
    }));
    expect(Array.from(container?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .some((candidate) => candidate.textContent?.includes("ถอนคำขอ"))).toBe(false);
  });

  it("keeps unknown withdrawal outcomes locked and offers reload reconciliation", async () => {
    serverActions.withdraw.mockRejectedValue(new TypeError("Failed to fetch"));
    mount(createElement(PatientServiceRequestHistoryItem, { hospitalName: "โรงพยาบาล ก", request: pendingRequest }));
    act(() => button("ถอนคำขอ").click());
    act(() => button("ยืนยันถอนคำขอ", container?.querySelector("dialog") ?? document).click());
    await settle();

    const dialog = container?.querySelector<HTMLDialogElement>("dialog");
    expect(dialog?.open).toBe(true);
    expect(dialog?.textContent).toContain("ยังยืนยันผลการดำเนินการไม่ได้");
    expect(button("ยืนยันถอนคำขอ", dialog ?? document).disabled).toBe(true);
    expect(button("ถอนคำขอ").disabled).toBe(true);
    expect(serverActions.withdraw).toHaveBeenCalledOnce();

    act(() => button("ปิดหน้าต่าง", dialog ?? document).click());
    expect(container?.querySelector("dialog")).toBeNull();
    expect(container?.textContent).toContain("โหลดข้อมูลล่าสุด");
    expect(button("ถอนคำขอ").disabled).toBe(true);
  });
});
