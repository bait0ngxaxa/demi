import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { AppointmentCancellationRequestStatus, AppointmentInteractionSource, HospitalStatus } from "@prisma/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LineWorkflowScopedFailureState } from "@/modules/line/transport/workflow-scoped-appointments";
import type { PatientSelfAppointmentDetail, PatientSelfAppointmentHistory } from "@/modules/patient-self/services/patient-self-care-query-service";

const mocks = vi.hoisted(() => ({ relationships: vi.fn(), history: vi.fn(), detail: vi.fn() }));

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/modules/line/transport/workflow-scoped-appointments", () => ({
  loadLineWorkflowAppointmentRelationships: mocks.relationships,
  loadLineWorkflowAppointmentHistory: mocks.history,
  loadLineWorkflowAppointmentDetail: mocks.detail,
}));

import LineWorkflowAppointmentDetailPage from "./[relationshipId]/[appointmentId]/page";
import LineWorkflowAppointmentHistoryPage from "./[relationshipId]/page";
import LineWorkflowAppointmentsLayout from "./layout";
import LineWorkflowAppointmentRelationshipsPage from "./page";

const REL = "11111111-1111-4111-8111-111111111111";
const APPT = "22222222-2222-4222-8222-222222222222";
const relationship = {
  relationshipId: REL, hospitalCode: "H-SYN", hospitalName: "โรงพยาบาลสังเคราะห์", hospitalNumber: "HN-SYN-1",
  hospitalStatus: HospitalStatus.SUSPENDED, careEndedAt: null,
};
const appointment: PatientSelfAppointmentHistory["appointments"][number] = {
  appointmentId: APPT, type: "FOLLOW_UP" as never, scheduledAt: new Date("2026-11-01T03:00:00Z"), durationMinutes: 30,
  locationType: "HOSPITAL" as never, locationDetail: "อาคารสังเคราะห์", status: "SCHEDULED" as never, updatedAt: new Date("2026-10-01T00:00:00Z"),
  responsibleDisplayName: "ผู้ดูแลสังเคราะห์", responsibleProfession: null, osmAtCreationDisplayName: null,
  acknowledgement: null,
  cancellationRequests: [{ source: AppointmentInteractionSource.PATIENT_SELF, status: AppointmentCancellationRequestStatus.PENDING, submittedAt: new Date("2026-10-02T00:00:00Z") }],
};
const history: PatientSelfAppointmentHistory = { relationship, appointments: [appointment], historyPage: { page: 1, hasMore: true } };
const detail: PatientSelfAppointmentDetail = { ...appointment, relationship, parentHospitalName: null, contactPhones: { hospitalPhone: null, patientPhone: null } };
const rescheduleRequest = {
  id: "33333333-3333-4333-8333-333333333333", appointmentId: APPT, source: "PATIENT_SELF", status: "REJECTED",
  reason: "ติดธุระสังเคราะห์", preferredDatetimes: [new Date("2026-11-05T03:00:00Z")], submittedAt: new Date("2026-10-03T00:00:00Z"),
  resolvedAt: new Date("2026-10-04T00:00:00Z"), rejectionReason: "เต็มสังเคราะห์",
} as never;
const scopedDetail = (overrides: Partial<PatientSelfAppointmentDetail> = {}, rescheduleRequests: unknown[] = [rescheduleRequest]) => ({
  status: "AUTHORIZED", data: { detail: { ...detail, ...overrides }, rescheduleRequests },
});
const PATIENT_DATA = /โรงพยาบาลสังเคราะห์|HN-SYN-1|อาคารสังเคราะห์|ผู้ดูแลสังเคราะห์|11111111-1111|22222222-2222/u;

const renderRoot = async (): Promise<string> => renderToStaticMarkup(await LineWorkflowAppointmentRelationshipsPage());
const renderHistory = async (page?: string): Promise<string> => renderToStaticMarkup(await LineWorkflowAppointmentHistoryPage({
  params: Promise.resolve({ relationshipId: REL }), searchParams: Promise.resolve(page ? { page } : {}),
}));
const renderDetail = async (): Promise<string> => renderToStaticMarkup(await LineWorkflowAppointmentDetailPage({
  params: Promise.resolve({ relationshipId: REL, appointmentId: APPT }),
}));

function hrefs(markup: string): string[] {
  return [...markup.matchAll(/href="([^"]*)"/gu)].map((match) => match[1].replaceAll("&amp;", "&"));
}

describe("scoped Appointment pages — authorized", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.relationships.mockResolvedValue({ status: "AUTHORIZED", data: [relationship] });
    mocks.history.mockResolvedValue({ status: "AUTHORIZED", data: history });
    mocks.detail.mockResolvedValue(scopedDetail());
  });

  it("lists own Hospital relationships with status context and scoped history links only", async () => {
    const markup = await renderRoot();
    expect(markup).toContain("โรงพยาบาลสังเคราะห์");
    expect(markup).toContain("ถูกระงับการใช้งาน");
    expect(hrefs(markup)).toEqual([`/line/workflow/appointments/${REL}`]);
  });

  it("shows history with scoped detail and pagination links, and forwards the requested page", async () => {
    const markup = await renderHistory("1");
    expect(mocks.history).toHaveBeenCalledWith(REL, "1");
    expect(markup).toContain("อาคารสังเคราะห์");
    expect(markup).toContain("คำขอยกเลิกล่าสุด");
    expect(hrefs(markup)).toEqual([
      `/line/workflow/appointments/${REL}/${APPT}`,
      `/line/workflow/appointments/${REL}?page=2`,
      "/line/workflow/appointments",
    ]);
  });

  it("renders the legitimate empty state only after a successful authorized query", async () => {
    mocks.history.mockResolvedValue({ status: "AUTHORIZED", data: { ...history, appointments: [], historyPage: { page: 1, hasMore: false } } });
    expect(await renderHistory()).toContain("ยังไม่มีรายการนัดหมาย");
  });

  it("offers both scoped interactions for a SCHEDULED appointment of an ACTIVE Hospital, without forms or Server Actions", async () => {
    mocks.detail.mockResolvedValue(scopedDetail({
      relationship: { ...relationship, hospitalStatus: HospitalStatus.ACTIVE }, cancellationRequests: [],
    }));
    const markup = await renderDetail();
    expect(markup).toContain("รับทราบนัดหมาย</button>");
    expect(markup).toContain("ส่งคำขอยกเลิกนัดหมาย</button>");
    expect(markup).toContain("การส่งคำขอไม่ได้ยกเลิกนัดทันที");
    expect(markup).not.toMatch(/<form|<input|\$ACTION|formaction/u);
    expect(hrefs(markup)).toEqual([`/line/workflow/appointments/${REL}`, "/line/workflow/appointments"]);
  });

  it("shows read-only detail, read-only reschedule history and existing pending request without controls", async () => {
    const markup = await renderDetail();
    for (const content of ["รายละเอียดนัดหมาย", "อาคารสังเคราะห์", "การรับทราบนัดหมาย", "คำขอยกเลิกนัด", "รอโรงพยาบาลพิจารณา",
      "ไม่อยู่ในสถานะเปิดใช้งาน", "คำขอเลื่อนนัด", "ปฏิเสธ", "เหตุผล: ติดธุระสังเคราะห์", "เหตุผลที่ปฏิเสธ: เต็มสังเคราะห์"]) {
      expect(markup).toContain(content);
    }
    // Suspended Hospital and existing pending request: no interaction control; no reschedule request/review control ever.
    expect(markup).not.toMatch(/<form|<button|<input|<details|\$ACTION/u);
    expect(markup).not.toContain("ขอเลื่อนนัด</summary>");
  });

  it("keeps the cancellation request available for an already acknowledged version, like the ordinary page", async () => {
    mocks.detail.mockResolvedValue(scopedDetail({
      relationship: { ...relationship, hospitalStatus: HospitalStatus.ACTIVE }, cancellationRequests: [],
      acknowledgement: { source: AppointmentInteractionSource.PATIENT_SELF, acknowledgedAt: new Date("2026-10-02T00:00:00Z") },
    }, []));
    const markup = await renderDetail();
    expect(markup).toContain("รับทราบนัดหมายแล้ว");
    expect(markup).not.toContain("รับทราบนัดหมาย</button>");
    expect(markup).toContain("ส่งคำขอยกเลิกนัดหมาย</button>");
  });

  it.each([
    ["cancelled", { status: "CANCELLED" as never, cancellationRequests: [] }, "ยังไม่สามารถบันทึกการรับทราบสำหรับนัดหมายนี้ได้"],
    ["completed", { status: "COMPLETED" as never, cancellationRequests: [] }, "ยังไม่สามารถส่งคำขอยกเลิกสำหรับนัดหมายนี้ได้"],
    ["ended care", { relationship: { ...relationship, hospitalStatus: HospitalStatus.ACTIVE, careEndedAt: new Date("2026-10-01T00:00:00Z") }, cancellationRequests: [] }, "โรงพยาบาลนี้สิ้นสุดการดูแลแล้ว"],
  ] as Array<[string, Partial<PatientSelfAppointmentDetail>, string]>)("shows the %s appointment without an acknowledgement or cancellation control", async (_label, overrides, text) => {
    mocks.detail.mockResolvedValue(scopedDetail({ relationship: { ...relationship, hospitalStatus: HospitalStatus.ACTIVE }, ...overrides }, []));
    const markup = await renderDetail();
    expect(markup).toContain(text);
    expect(markup).toContain("ยังไม่มีคำขอเลื่อนนัด");
    expect(markup).not.toMatch(/<button/u);
  });

  it("offers an explicit, labelled exit to ordinary DEMI web", () => {
    const markup = renderToStaticMarkup(<LineWorkflowAppointmentsLayout><p>content</p></LineWorkflowAppointmentsLayout>);
    expect(markup).toContain("ออกจากหน้านัดหมายใน LINE ไปยัง DEMI");
    expect(markup).toContain("เป็นการใช้งานบนเว็บตามปกติ");
    expect(hrefs(markup)).toEqual(["/app/personal"]);
  });
});

describe("scoped Appointment pages — denied", () => {
  const states: LineWorkflowScopedFailureState[] = [
    "NOT_ACTIVATED", "SCOPE_MISSING", "SCOPE_EXPIRED", "SCOPE_REVOKED", "SESSION_MISMATCH", "LOGIN_REQUIRED",
    "AUTH_UNAVAILABLE", "RATE_LIMITED", "INELIGIBLE", "RESOURCE_INVALID", "TEMPORARILY_UNAVAILABLE",
  ];

  it.each(states)("renders %s as Thai status with no Patient data, no empty state and no ordinary substitute", async (state) => {
    for (const loader of [mocks.relationships, mocks.history, mocks.detail]) loader.mockResolvedValue({ status: "DENIED", state });
    for (const markup of [await renderRoot(), await renderHistory(), await renderDetail()]) {
      expect(markup).toMatch(/[฀-๿]/u);
      expect(markup).toContain('role="status"');
      // The retry link may echo the requested scoped URL; nothing else may carry identifiers.
      expect(markup.replace(/href="[^"]*"/gu, "")).not.toMatch(PATIENT_DATA);
      expect(markup).not.toContain("ยังไม่มีรายการนัดหมาย");
      expect(markup).not.toMatch(/<form|<button/u);
      for (const href of hrefs(markup)) {
        expect(["/line/workflow?intent=OPEN_PATIENT_APPOINTMENTS", "/login?returnTo=%2Fline%2Fworkflow%3Fintent%3DOPEN_PATIENT_APPOINTMENTS",
          "/line/account", "/line/workflow/appointments", `/line/workflow/appointments/${REL}`, `/line/workflow/appointments/${REL}/${APPT}`]).toContain(href);
      }
    }
  });

  it("retries a temporary failure on the same fixed scoped page", async () => {
    mocks.history.mockResolvedValue({ status: "DENIED", state: "TEMPORARILY_UNAVAILABLE" });
    expect(hrefs(await renderHistory())).toEqual([`/line/workflow/appointments/${REL}`]);
  });

  it("sends expired or missing scope back through the gateway, never to /app", async () => {
    mocks.relationships.mockResolvedValue({ status: "DENIED", state: "SCOPE_EXPIRED" });
    expect(hrefs(await renderRoot())).toEqual(["/line/workflow?intent=OPEN_PATIENT_APPOINTMENTS"]);
  });
});

describe("scoped module graph", () => {
  const root = resolve(__dirname, "../../../..");

  function resolveImport(from: string, specifier: string): string | null {
    const base = specifier.startsWith("@/") ? resolve(root, "src", specifier.slice(2)) : specifier.startsWith(".") ? resolve(dirname(from), specifier) : null;
    if (!base) return null;
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")]) {
      if (/\.tsx?$/u.test(candidate) && existsSync(candidate)) return candidate;
    }
    return null;
  }

  it("contains no Server Action module and no ordinary interaction or reschedule control", () => {
    const entries = ["page.tsx", "layout.tsx", "[relationshipId]/page.tsx", "[relationshipId]/[appointmentId]/page.tsx",
      "acknowledge/route.ts", "cancellation-request/route.ts"].map((file) => resolve(__dirname, file));
    const seen = new Set<string>();
    const queue = [...entries];
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/^\s*["']use server["']/mu);
      for (const match of source.matchAll(/(?:from|import)\s+["']([^"']+)["']/gu)) {
        const next = resolveImport(file, match[1]);
        if (next) queue.push(next);
      }
    }
    const graph = [...seen].map((file) => file.replaceAll("\\", "/"));
    for (const required of ["app/app/personal/patient-self-appointment-content.tsx", "app/line/workflow/appointments/line-workflow-appointment-interactions.tsx",
      "app/app/patients/[relationshipId]/appointments/reschedule-request-history.tsx", "src/modules/appointments/services/appointment-service.ts"]) {
      expect(graph.some((file) => file.endsWith(required)), required).toBe(true);
    }
    expect(graph.filter((file) => /server-actions|interaction-controls|reschedule-request-(?:section|form)/u.test(file))).toEqual([]);
  });
});
