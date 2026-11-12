// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AppointmentForm, type AppointmentFormProps } from "../patients/[relationshipId]/appointments/new/appointment-form";
import { PatientSelfAppointmentDetailContent, PatientSelfAppointmentRow } from "../personal/patient-self-appointment-content";
import { WorkAppointmentView } from "./work-appointment-view";
import type { WorkAppointmentPage } from "@/modules/appointments/services/work-appointment-query-service";
import { appointerLabel, appointmentAssigneePresentation } from "@/modules/appointments/domain/appointment-people";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/modules/appointments/transport/server-actions", () => ({ createAppointmentAction: vi.fn(), rescheduleAppointmentAction: vi.fn() }));
const mocks = vi.hoisted(() => ({ searchStaff: vi.fn(), searchOsm: vi.fn(), searchFilter: vi.fn() }));
vi.mock("@/modules/appointments/transport/assignee-search-actions", () => ({
  searchAppointmentResponsibleMembersAction: mocks.searchStaff,
  searchAppointmentOsmCandidatesAction: mocks.searchOsm,
  searchWorkAppointmentResponsibleFilterAction: mocks.searchFilter,
}));

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const patient = { patientHospitalRelationshipId: "relationship", displayName: "ผู้ป่วย", hospitalNumber: null, hospital: { id: "hospital", name: "โรงพยาบาล" } };
const currentOsm = { userId: "current-osm", displayName: "อสม. ผู้ดูแล ง", contactPhone: null };
const page = (items: { id: string; displayName: string; detail?: string }[], position = { page: 1, totalPages: 1 }) => ({
  status: "OK" as const,
  items,
  page: position.page,
  totalPages: position.totalPages,
  hasPreviousPage: position.page > 1,
  hasNextPage: position.page < position.totalPages,
});

async function renderForm(props: Partial<AppointmentFormProps> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(
    <AppointmentForm
      currentOsmAssignee={currentOsm}
      mode="create"
      patient={patient}
      relationshipId="relationship"
      selectedOsm={null}
      selectedResponsible={null}
      submissionNonce="nonce"
      {...(props as object)}
    />,
  ));
  const select = (id: string) => {
    const element = container.querySelector<HTMLSelectElement>(`#${id}`);
    if (!element) throw new Error(`Missing #${id}`);
    return element;
  };
  const hidden = (name: string) => container.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`)?.value;
  const kind = (label: string) => {
    const input = [...container.querySelectorAll<HTMLInputElement>('input[name="appointment-assignee-kind"]')]
      .find((candidate) => candidate.closest("label")?.textContent?.startsWith(label));
    if (!input) throw new Error(`Missing kind ${label}`);
    return input;
  };
  const click = async (element: HTMLElement) => {
    await act(async () => element.click());
  };
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
  return { container, select, hidden, kind, click, change, cleanup };
}

describe("Appointment assignee picker (ADR-0027, AP-1, AP-2)", () => {
  beforeEach(() => {
    mocks.searchStaff.mockReset().mockResolvedValue(page([
      { id: "doctor", displayName: "หมอ ก", detail: "แพทย์" },
      { id: "coordinator", displayName: "ประสาน ข", detail: "ผู้ประสานงาน" },
    ]));
    mocks.searchOsm.mockReset().mockResolvedValue(page([
      { id: "osm-0", displayName: "อสม. คนที่ 1" },
      { id: "osm-1", displayName: "อสม. คนที่ 2" },
    ], { page: 1, totalPages: 2 }));
  });

  it("ships no roster: staff and other อสม. are searched on the server for this relationship only", async () => {
    const form = await renderForm();
    try {
      expect(mocks.searchStaff).not.toHaveBeenCalled();
      expect(mocks.searchOsm).not.toHaveBeenCalled();
      expect(form.container.textContent).toContain("อสม. ผู้ดูแล · อสม. ผู้ดูแล ง");

      await form.click(form.kind("เจ้าหน้าที่"));
      expect(mocks.searchStaff).toHaveBeenCalledWith("relationship", "", 1);
      expect(form.container.textContent).toContain("หมอ ก · แพทย์");

      await form.click(form.kind("อสม. คนอื่น"));
      expect(mocks.searchOsm).toHaveBeenCalledWith("relationship", "", 1);
      expect(form.container.textContent).toContain("อสม. คนที่ 2");
    } finally {
      await form.cleanup();
    }
  });

  it("keeps the chosen location for an อสม., explains a one-off visit and sends one assignee", async () => {
    const form = await renderForm();
    try {
      const location = form.select("appointment-location-type");
      await form.change(location, "CLINIC");
      await form.click(form.kind("อสม. คนอื่น"));
      await form.click(form.container.querySelector<HTMLInputElement>('input[name="osm-candidate"][value="osm-1"]')!);
      expect(location.value).toBe("CLINIC");
      expect(form.hidden("locationType")).toBe("CLINIC");
      expect(form.hidden("assignedOsmUserId")).toBe("osm-1");
      expect(form.hidden("responsibleUserId")).toBe("");
      expect(form.container.textContent).toContain("จะเห็นเฉพาะนัดนี้");
      expect(form.container.textContent).toContain("เยี่ยมครั้งนี้เท่านั้น");

      // Changing the location never clears the อสม.
      await form.change(location, "ONLINE");
      expect(form.hidden("assignedOsmUserId")).toBe("osm-1");

      await form.click(form.kind("อสม. ผู้ดูแล"));
      expect(form.hidden("assignedOsmUserId")).toBe("current-osm");
      expect(form.container.textContent).not.toContain("เยี่ยมครั้งนี้เท่านั้น");

      await form.click(form.kind("เจ้าหน้าที่"));
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
      await form.click(form.container.querySelector<HTMLInputElement>('input[name="staff-candidate"][value="coordinator"]')!);
      expect(form.hidden("responsibleUserId")).toBe("coordinator");
      expect(form.hidden("assignedOsmUserId")).toBe("");

      await form.click(form.kind("ยังไม่ระบุ"));
      expect(form.hidden("responsibleUserId")).toBe("");
      expect(form.hidden("assignedOsmUserId")).toBe("");
    } finally {
      await form.cleanup();
    }
  });

  it("never submits the picker's own controls as form fields", async () => {
    const form = await renderForm();
    try {
      await form.click(form.kind("อสม. คนอื่น"));
      await form.click(form.container.querySelector<HTMLInputElement>('input[name="osm-candidate"][value="osm-0"]')!);
      const fields = [...new FormData(form.container.querySelector("form")!).keys()];
      expect(fields).not.toContain("osm-candidate");
      expect(fields).not.toContain("appointment-assignee-kind");
      expect(fields.filter((name) => name === "assignedOsmUserId")).toHaveLength(1);
    } finally {
      await form.cleanup();
    }
  });

  it("keeps a one-off อสม. already on the Appointment chosen when it is not on the page shown", async () => {
    const form = await renderForm({
      mode: "reschedule",
      submissionNonce: undefined,
      appointment: {
        appointmentId: "appointment", type: "HOME_VISIT", scheduledAt: "2026-12-01T03:00:00.000Z", durationMinutes: 30,
        locationType: "HOME_VISIT", locationDetail: null, note: null, responsibleUserId: null,
        assignedOsmUserId: "osm-far", serviceCode: null, updatedAt: "2026-11-01T00:00:00.000Z",
      },
      selectedOsm: { userId: "osm-far", displayName: "อสม. หน้าอื่น" },
    } as unknown as Partial<AppointmentFormProps>);
    try {
      expect(form.kind("อสม. คนอื่น").checked).toBe(true);
      expect(form.hidden("assignedOsmUserId")).toBe("osm-far");
      expect(form.container.textContent).toContain("อสม. ที่เลือก: อสม. หน้าอื่น");
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
      await form.click([...form.container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "ถัดไป")!);
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
      expect(mocks.searchOsm).toHaveBeenLastCalledWith("relationship", "", 2);
      expect(form.hidden("assignedOsmUserId")).toBe("osm-far");
    } finally {
      await form.cleanup();
    }
  });

  it("keeps an อสม.'s own form to their home visit", async () => {
    const form = await renderForm({ homeVisitOnly: true });
    try {
      expect(form.container.querySelector('input[name="appointment-assignee-kind"]')).toBeNull();
      expect(form.hidden("assignedOsmUserId")).toBe("current-osm");
      expect(form.hidden("locationType")).toBe("HOME_VISIT");
      expect(mocks.searchOsm).not.toHaveBeenCalled();
      expect(mocks.searchStaff).not.toHaveBeenCalled();
    } finally {
      await form.cleanup();
    }
  });

  it("stacks the assignee choice in one column at 380 px", async () => {
    const form = await renderForm();
    try {
      const field = form.kind("เจ้าหน้าที่").closest("fieldset");
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
      tab: "UPCOMING", filters: {}, items: [item], nextCursor: null, responsibleFilter: { mode: "VISIBLE", options: [] }, hospitals: [],
      canCreate: false, canResolveRequests: false, canAcceptAssignments: access === "OSM",
    } as unknown as WorkAppointmentPage;
    const markup = renderToStaticMarkup(<WorkAppointmentView page={page} queryError={null} />);
    expect(markup).toContain("ผู้นัดหมาย: หมอ ก · แพทย์");
    expect(markup).toContain("อสม. ผู้รับผิดชอบนัด: อสม. คนที่ 2");
    expect(markup).toContain("break-words");
  });

  it("searches the work Hospital's operators for the responsible filter and names the chosen one from the URL", async () => {
    mocks.searchFilter.mockResolvedValue(page([{ id: "nurse", displayName: "พยาบาล ข", detail: "พยาบาล" }]));
    const workPage = {
      hospital: { hospitalId: "hospital-a", hospitalName: "โรงพยาบาล", access: "DIRECT", canCreate: true, canResolveRequests: true, canAcceptAssignments: false },
      tab: "UPCOMING", filters: { responsibleUserId: "doctor" }, items: [], nextCursor: null, hasNextPage: false, hospitals: [],
      canCreate: true, canResolveRequests: true, canAcceptAssignments: false,
      responsibleFilter: { mode: "SEARCH", selected: { userId: "doctor", displayName: "หมอ ก", profession: "DOCTOR" } },
    } as unknown as WorkAppointmentPage;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<WorkAppointmentView page={workPage} queryError={null} />));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    const form = container.querySelector<HTMLFormElement>('form[action="/app/appointments"]')!;
    // The chosen person is named even though no search result shows them, and travels as the list form's filter.
    expect(container.textContent).toContain("เจ้าหน้าที่ที่เลือก: หมอ ก · แพทย์");
    expect(new FormData(form).get("responsibleUserId")).toBe("doctor");
    expect(container.querySelector('select[name="responsibleUserId"]')).toBeNull();
    expect(mocks.searchFilter).toHaveBeenCalledWith("hospital-a", "", 1);
    // The picker's own radios and search box are not fields of the list form.
    expect([...new FormData(form).keys()].sort()).toEqual(["responsibleUserId", "tab", "dateFrom", "dateTo", "status", "type", "locationType", "awaitingOsmAcceptance", "unassignedOsm", "unassigned"].sort());

    const radio = (label: string) => [...container.querySelectorAll<HTMLInputElement>('input[name="responsible-filter"]')]
      .find((input) => input.closest("label")?.textContent?.startsWith(label))!;
    await act(async () => radio("พยาบาล ข").click());
    expect(new FormData(form).get("responsibleUserId")).toBe("nurse");
    // "ทุกคน" sends no filter.
    await act(async () => radio("ทุกคน").click());
    expect(new FormData(form).has("responsibleUserId")).toBe(false);
    await act(async () => root.unmount());
    container.remove();
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
