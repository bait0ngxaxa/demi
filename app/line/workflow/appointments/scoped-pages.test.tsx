import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { AppointmentCancellationRequestStatus, AppointmentInteractionSource, HospitalStatus } from "@prisma/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LineWorkflowScopedFailureState } from "@/modules/line/transport/workflow-scoped-appointments";
import type { PatientSelfAppointmentDetail, PatientSelfAppointmentHistory } from "@/modules/patient-self/services/patient-self-care-query-service";

const mocks = vi.hoisted(() => ({ relationships: vi.fn(), history: vi.fn(), detail: vi.fn() }));

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
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
const detail: PatientSelfAppointmentDetail = { ...appointment, relationship, contactPhones: { hospitalPhone: null, patientPhone: null } };
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
    mocks.detail.mockResolvedValue({ status: "AUTHORIZED", data: detail });
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

  it("shows detail with read-only interaction state and no mutation control", async () => {
    const markup = await renderDetail();
    for (const content of ["รายละเอียดนัดหมาย", "อาคารสังเคราะห์", "การรับทราบนัดหมาย", "คำขอยกเลิกนัด", "รอโรงพยาบาลพิจารณา", "การรับทราบนัดหมายและคำขอยกเลิกผ่าน LINE ยังไม่เปิดใช้งาน"]) {
      expect(markup).toContain(content);
    }
    expect(markup).not.toMatch(/<form|<button|<input|\$ACTION/u);
    expect(markup).not.toContain("คำขอเลื่อนนัด");
    expect(hrefs(markup)).toEqual([`/line/workflow/appointments/${REL}`, "/line/workflow/appointments"]);
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
    "AUTH_UNAVAILABLE", "INELIGIBLE", "RESOURCE_INVALID", "TEMPORARILY_UNAVAILABLE",
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

  it("contains no Server Action module and no ordinary interaction control", () => {
    const entries = ["page.tsx", "layout.tsx", "[relationshipId]/page.tsx", "[relationshipId]/[appointmentId]/page.tsx"].map((file) => resolve(__dirname, file));
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
    expect(graph.some((file) => file.endsWith("app/app/personal/patient-self-appointment-content.tsx"))).toBe(true);
    expect(graph.filter((file) => /server-actions|interaction-controls|reschedule-request/u.test(file))).toEqual([]);
  });
});
