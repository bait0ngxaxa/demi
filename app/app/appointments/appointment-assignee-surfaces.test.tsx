// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { AppointmentForm, type AppointmentFormProps } from "../patients/[relationshipId]/appointments/new/appointment-form";
import { PatientSelfAppointmentDetailContent, PatientSelfAppointmentRow } from "../personal/patient-self-appointment-content";
import { WorkAppointmentView } from "./work-appointment-view";
import type { WorkAppointmentPage } from "@/modules/appointments/services/work-appointment-query-service";
import { appointerLabel, appointmentAssigneePresentation } from "@/modules/appointments/domain/appointment-people";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/modules/appointments/transport/server-actions", () => ({ createAppointmentAction: vi.fn(), rescheduleAppointmentAction: vi.fn() }));

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const patient = { patientHospitalRelationshipId: "relationship", displayName: "ผู้ป่วย", hospitalNumber: null, hospital: { id: "hospital", name: "โรงพยาบาล" } };
const staff = [
  { userId: "doctor", displayName: "หมอ ก", profession: "DOCTOR" as const },
  { userId: "coordinator", displayName: "ประสาน ข", profession: "COORDINATOR" as const },
  { userId: "no-profession", displayName: "เจ้าหน้าที่ ค", profession: null },
];
const currentOsm = { userId: "current-osm", displayName: "อสม. ผู้ดูแล ง", contactPhone: null };
const candidates = (count: number) => Array.from({ length: count }, (_, index) => ({ userId: `osm-${index}`, displayName: `อสม. คนที่ ${index + 1}` }));

async function renderForm(props: Partial<AppointmentFormProps> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(
    <AppointmentForm
      currentOsmAssignee={currentOsm}
      mode="create"
      osmCandidates={candidates(3)}
      patient={patient}
      relationshipId="relationship"
      responsibleMembers={staff}
      submissionNonce="nonce"
      {...(props as object)}
    />,
  ));
  const select = (id: string) => {
    const element = container.querySelector<HTMLSelectElement>(`#${id}`);
    if (!element) throw new Error(`Missing #${id}`);
    return element;
  };
  const hidden = (name: string) => container.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value;
  const change = async (element: HTMLSelectElement | HTMLInputElement, value: string) => {
    await act(async () => {
      if (element instanceof HTMLInputElement) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        element.value = value;
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  };
  const cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return { container, select, hidden, change, cleanup };
}

describe("Appointment assignee picker (ADR-0027, AP-2)", () => {
  it("groups every staff member by profession label and every อสม., current one first", async () => {
    const form = await renderForm();
    try {
      const groups = [...form.select("appointment-responsible-user").querySelectorAll("optgroup")];
      expect(groups.map((group) => group.label)).toEqual(["เจ้าหน้าที่", "อสม."]);
      expect([...(groups[0]?.querySelectorAll("option") ?? [])].map((option) => option.textContent)).toEqual([
        "หมอ ก · แพทย์", "ประสาน ข · ผู้ประสานงาน", "เจ้าหน้าที่ ค · เจ้าหน้าที่",
      ]);
      expect([...(groups[1]?.querySelectorAll("option") ?? [])].map((option) => option.textContent)).toEqual([
        "อสม. ผู้ดูแล · อสม. ผู้ดูแล ง", "อสม. คนที่ 1", "อสม. คนที่ 2", "อสม. คนที่ 3",
      ]);
      expect(form.container.querySelector("#appointment-osm-search")).toBeNull();
    } finally {
      await form.cleanup();
    }
  });

  it("keeps the chosen location for an อสม., explains a one-off visit and sends one assignee", async () => {
    const form = await renderForm();
    try {
      const picker = form.select("appointment-responsible-user");
      const location = form.select("appointment-location-type");
      await form.change(location, "CLINIC");
      await form.change(picker, "osm:osm-1");
      expect(location.value).toBe("CLINIC");
      expect(form.hidden("locationType")).toBe("CLINIC");
      expect(form.hidden("assignedOsmUserId")).toBe("osm-1");
      expect(form.hidden("responsibleUserId")).toBe("");
      expect(form.container.textContent).toContain("จะเห็นเฉพาะนัดนี้");
      expect(form.container.textContent).toContain("เยี่ยมครั้งนี้เท่านั้น");

      // Changing the location never clears the อสม.
      await form.change(location, "ONLINE");
      expect(form.hidden("assignedOsmUserId")).toBe("osm-1");

      await form.change(picker, "osm:current-osm");
      expect(form.container.textContent).not.toContain("เยี่ยมครั้งนี้เท่านั้น");

      await form.change(picker, "staff:coordinator");
      expect(form.hidden("responsibleUserId")).toBe("coordinator");
      expect(form.hidden("assignedOsmUserId")).toBe("");
    } finally {
      await form.cleanup();
    }
  });

  it("offers a name search for a long อสม. list and keeps the chosen อสม. listed", async () => {
    const form = await renderForm({ osmCandidates: candidates(12) });
    try {
      const search = form.container.querySelector<HTMLInputElement>("#appointment-osm-search");
      if (!search) throw new Error("Missing search");
      const picker = form.select("appointment-responsible-user");
      await form.change(picker, "osm:osm-0");
      await form.change(search, "คนที่ 12");
      const osmOptions = () => [...(picker.querySelectorAll("optgroup")[1]?.querySelectorAll("option") ?? [])].map((option) => option.textContent);
      expect(osmOptions()).toEqual(["อสม. ผู้ดูแล · อสม. ผู้ดูแล ง", "อสม. คนที่ 1", "อสม. คนที่ 12"]);
      expect(picker.value).toBe("osm:osm-0");
      await form.change(search, "ไม่มีชื่อนี้");
      expect(osmOptions()).toContain("ไม่พบ อสม. ที่ตรงกับคำค้น");
    } finally {
      await form.cleanup();
    }
  });

  it("keeps an อสม.'s own form to their home visit", async () => {
    const form = await renderForm({ homeVisitOnly: true, responsibleMembers: [], osmCandidates: [] });
    try {
      expect(form.select("appointment-responsible-user").disabled).toBe(true);
      expect(form.hidden("assignedOsmUserId")).toBe("current-osm");
      expect(form.hidden("locationType")).toBe("HOME_VISIT");
      expect(form.container.querySelector("#appointment-osm-search")).toBeNull();
    } finally {
      await form.cleanup();
    }
  });

  it("stacks the picker in one column at 380 px", async () => {
    const form = await renderForm({ osmCandidates: candidates(12) });
    try {
      const field = form.select("appointment-responsible-user").closest("div.space-y-2");
      expect(field?.className).toContain("sm:col-span-2");
      expect(form.container.querySelector("fieldset")?.className).toContain("grid gap-5 sm:grid-cols-2");
      expect(form.container.innerHTML).not.toMatch(/\bw-\[(?:[4-9]\d\d|\d{4,})px\]/u);
    } finally {
      await form.cleanup();
    }
  });
});

describe("ผู้นัดหมาย and the assignee (ADR-0027, AP-5)", () => {
  it("names the appointer's role and the one assignee", () => {
    expect(appointerLabel({ displayName: "สมศรี", role: "NURSE" })).toBe("สมศรี · พยาบาล");
    expect(appointerLabel({ displayName: "สมชาย", role: "OSM" })).toBe("สมชาย · อสม.");
    expect(appointerLabel({ displayName: "สมหมาย", role: "STAFF" })).toBe("สมหมาย · เจ้าหน้าที่");
    expect(appointerLabel({ displayName: "ผู้เคยทำงาน", role: null })).toBe("ผู้เคยทำงาน");
    expect(appointmentAssigneePresentation({ responsibleDisplayName: null, responsibleProfession: null, assignedOsmDisplayName: "อสม. จ" }))
      .toEqual({ heading: "อสม. ผู้รับผิดชอบนัด", displayName: "อสม. จ" });
    expect(appointmentAssigneePresentation({ responsibleDisplayName: "ประสาน ข", responsibleProfession: "COORDINATOR", assignedOsmDisplayName: null }))
      .toEqual({ heading: "เจ้าหน้าที่ผู้ดูแล", displayName: "ประสาน ข" });
  });

  const at = new Date("2026-11-03T03:00:00Z");
  const item: WorkAppointmentPage["items"][number] = {
    appointmentId: "appointment", relationshipId: "relationship", scheduledAt: at, durationMinutes: 30, type: "FOLLOW_UP",
    locationType: "CLINIC", status: "SCHEDULED", patientDisplayName: "ผู้ป่วย", hospitalName: "โรงพยาบาล",
    responsibleDisplayName: null, responsibleProfession: null, osmAtCreationDisplayName: "อสม. ผู้ดูแล ง",
    assignedOsmDisplayName: "อสม. คนที่ 2", appointer: { displayName: "หมอ ก", role: "DOCTOR" },
    pendingRequestBadges: { reschedule: false, staleReschedule: false, cancellation: false }, hasUnassignedOsm: false,
    osmAcceptanceStatus: "WAITING", serviceCode: null, source: "HOSPITAL", isOneOffVisit: true,
  };

  it.each(["DIRECT", "OSM"] as const)("shows the appointer and the อสม. assignee in the %s work list row", (access) => {
    const page = {
      hospital: { hospitalId: "hospital", hospitalName: "โรงพยาบาล", access, canCreate: false, canResolveRequests: false, canAcceptAssignments: access === "OSM" },
      tab: "UPCOMING", filters: {}, items: [item], nextCursor: null, responsibleOptions: [], hospitals: [],
      canCreate: false, canResolveRequests: false, canAcceptAssignments: access === "OSM",
    } as unknown as WorkAppointmentPage;
    const markup = renderToStaticMarkup(<WorkAppointmentView page={page} queryError={null} />);
    expect(markup).toContain("ผู้นัดหมาย: หมอ ก · แพทย์");
    expect(markup).toContain("อสม. ผู้รับผิดชอบนัด: อสม. คนที่ 2");
    expect(markup).toContain("break-words");
  });

  it("shows the patient the appointer by name and role, as their projection already names staff", () => {
    const appointment = {
      appointmentId: "appointment", serviceCode: null, source: "HOSPITAL" as const, type: "FOLLOW_UP" as const, scheduledAt: at,
      durationMinutes: 30, locationType: "CLINIC" as const, locationDetail: null, status: "SCHEDULED" as const, updatedAt: at,
      responsibleDisplayName: "ประสาน ข", responsibleProfession: "COORDINATOR" as const, osmAtCreationDisplayName: null,
      assignedOsmDisplayName: null, appointer: { displayName: "อสม. จ", role: "OSM" as const }, acknowledgement: null, cancellationRequests: [],
    };
    const row = renderToStaticMarkup(<PatientSelfAppointmentRow appointment={appointment} href="/app/personal/appointments/x" />);
    expect(row).toContain("ผู้นัดหมาย: อสม. จ · อสม.");
    expect(row).toContain("เจ้าหน้าที่ผู้ดูแล: ประสาน ข");
    const detail = renderToStaticMarkup(<PatientSelfAppointmentDetailContent detail={{
      ...appointment,
      relationship: { relationshipId: "relationship", hospitalName: "โรงพยาบาล", hospitalCode: "H", hospitalNumber: null, hospitalStatus: "ACTIVE", careEndedAt: null },
      parentHospitalName: null,
      contactPhones: { assignedOsmPhone: null, hospitalPhone: null, patientPhone: null },
    }} interactions={null} />);
    expect(detail).toContain("ผู้นัดหมาย");
    expect(detail).toContain("อสม. จ · อสม.");
  });
});
