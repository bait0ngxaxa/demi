// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppointmentCancellationRequestStatus, AppointmentInteractionSource, HospitalStatus } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { PatientSelfAppointmentDetail } from "@/modules/patient-self/services/patient-self-care-query-service";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => router,
}));

import { LineWorkflowAppointmentInteractions } from "./line-workflow-appointment-interactions";

const REL = "11111111-1111-4111-8111-111111111111";
const APPT = "22222222-2222-4222-8222-222222222222";
const NONCE = "33333333-3333-4333-8333-333333333333";
const VERSION = "2026-10-01T00:00:00.000Z";
const appointment = {
  appointmentId: APPT, type: "FOLLOW_UP", scheduledAt: new Date("2026-11-01T03:00:00Z"), durationMinutes: 30,
  locationType: "HOSPITAL", locationDetail: null, status: "SCHEDULED", updatedAt: new Date(VERSION),
  responsibleDisplayName: null, responsibleProfession: null, osmAtCreationDisplayName: null, acknowledgement: null, cancellationRequests: [],
  relationship: { relationshipId: REL, hospitalCode: "H", hospitalName: "โรงพยาบาล", hospitalNumber: null, hospitalStatus: HospitalStatus.ACTIVE, careEndedAt: null },
  contactPhones: { hospitalPhone: null, patientPhone: null },
} as unknown as PatientSelfAppointmentDetail;

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find((item) => item.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}

const text = (): string => document.body.textContent ?? "";

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function mount(detail: PatientSelfAppointmentDetail = appointment): void {
  act(() => root.render(<LineWorkflowAppointmentInteractions appointment={detail} cancellationRequestNonce={NONCE} />));
}

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement): void { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement): void { this.removeAttribute("open"); } });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value(): void {} });
});

afterAll(() => {
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
});

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("scoped Appointment interaction controls", () => {
  it("acknowledges through the fixed handler only, with the current version, then refreshes the scoped read", async () => {
    fetchMock.mockResolvedValue(reply({ status: "SUCCESS", operation: "ACKNOWLEDGED" }));
    mount();
    act(() => button("รับทราบนัดหมาย").click());
    await flush();
    expect(fetchMock).toHaveBeenCalledOnce();
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/line/workflow/appointments/acknowledge");
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin", redirect: "error", referrerPolicy: "no-referrer", cache: "no-store" });
    expect(JSON.parse(init.body as string)).toEqual({ patientHospitalRelationshipId: REL, appointmentId: APPT, expectedUpdatedAt: VERSION });
    expect(text()).toContain("บันทึกการรับทราบนัดหมายแล้ว");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("prevents a second concurrent submission while one is pending", async () => {
    let resolve: (value: Response) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise<Response>((done) => {
      resolve = done;
    }));
    mount();
    act(() => button("รับทราบนัดหมาย").click());
    await flush();
    expect(button("กำลังบันทึก...").disabled).toBe(true);
    expect(button("ส่งคำขอยกเลิกนัดหมาย").disabled).toBe(true);
    act(() => button("กำลังบันทึก...").click());
    await act(async () => resolve(reply({ status: "SUCCESS", operation: "ACKNOWLEDGED" })));
    await flush();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("asks for explicit confirmation that a cancellation request is not a cancellation, then sends the server nonce", async () => {
    fetchMock.mockResolvedValue(reply({ status: "SUCCESS", operation: "CANCELLATION_REQUESTED" }));
    mount();
    act(() => button("ส่งคำขอยกเลิกนัดหมาย").click());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(text()).toContain("นัดหมายยังไม่ถูกยกเลิกทันที");
    act(() => button("กลับ").click());
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => button("ส่งคำขอยกเลิกนัดหมาย").click());
    act(() => button("ส่งคำขอยกเลิก").click());
    await flush();
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/line/workflow/appointments/cancellation-request");
    expect(JSON.parse(init.body as string)).toEqual({ patientHospitalRelationshipId: REL, appointmentId: APPT, expectedUpdatedAt: VERSION, submissionNonce: NONCE });
    expect(text()).toContain("นัดหมายยังไม่ถูกยกเลิกจนกว่าโรงพยาบาลจะพิจารณา");
  });

  it.each([
    ["a network failure", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["an unrecognized reply", () => Promise.resolve(new Response("<html>gateway</html>", { status: 502 }))],
  ])("treats %s as an unknown outcome and resends only the identical payload (same nonce)", async (_label, failure) => {
    fetchMock.mockImplementationOnce(failure).mockResolvedValueOnce(reply({ status: "SUCCESS", operation: "CANCELLATION_REQUESTED" }));
    mount();
    act(() => button("ส่งคำขอยกเลิกนัดหมาย").click());
    act(() => button("ส่งคำขอยกเลิก").click());
    await flush();
    expect(text()).toContain("ระบบยังยืนยันผลการดำเนินการไม่ได้");
    expect(text()).not.toContain("ส่งคำขอไปยังโรงพยาบาลแล้ว");
    expect(button("ส่งคำขอยกเลิกนัดหมาย").disabled).toBe(true);
    expect(router.refresh).not.toHaveBeenCalled();
    act(() => button("ตรวจสอบผลด้วยคำขอเดิม").click());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).submissionNonce).toBe(NONCE);
    expect(text()).toContain("ส่งคำขอไปยังโรงพยาบาลแล้ว");
  });

  it("shows the domain conflict with an explicit reload and never resubmits", async () => {
    fetchMock.mockResolvedValue(reply({ status: "ERROR", code: "CONFLICT" }, 409));
    mount();
    act(() => button("รับทราบนัดหมาย").click());
    await flush();
    expect(text()).toContain("นัดหมายถูกบันทึกหรือเปลี่ยนแปลงแล้ว");
    expect(router.refresh).not.toHaveBeenCalled();
    act(() => button("โหลดข้อมูลล่าสุด").click());
    expect(router.refresh).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each(["SCOPE_EXPIRED", "SCOPE_REVOKED", "SESSION_MISMATCH", "LOGIN_REQUIRED", "SCOPE_MISSING", "INELIGIBLE", "NOT_ACTIVATED"])(
    "reports %s as not saved and re-renders from a fresh scoped read for recovery",
    async (code) => {
      fetchMock.mockResolvedValue(reply({ status: "ERROR", code }, 403));
      mount();
      act(() => button("รับทราบนัดหมาย").click());
      await flush();
      expect(text()).toContain("ยังไม่ได้บันทึกรายการนี้");
      expect(router.refresh).toHaveBeenCalled();
    },
  );

  it("reports backend unavailability without claiming success", async () => {
    fetchMock.mockResolvedValue(reply({ status: "ERROR", code: "TEMPORARILY_UNAVAILABLE" }, 503));
    mount();
    act(() => button("รับทราบนัดหมาย").click());
    await flush();
    expect(text()).toContain("ระบบไม่พร้อมบันทึกในขณะนี้");
    expect(text()).not.toContain("บันทึกการรับทราบนัดหมายแล้ว");
  });

  it("renders no controls for an existing pending request, and shows its status", () => {
    mount({ ...appointment, cancellationRequests: [{
      source: AppointmentInteractionSource.PATIENT_SELF, status: AppointmentCancellationRequestStatus.PENDING, submittedAt: new Date(VERSION),
    }] } as PatientSelfAppointmentDetail);
    expect(text()).toContain("รอโรงพยาบาลพิจารณา");
    expect([...document.querySelectorAll("button")].map((item) => item.textContent)).toEqual(["รับทราบนัดหมาย"]);
    expect(document.querySelector("form")).toBeNull();
  });
});
