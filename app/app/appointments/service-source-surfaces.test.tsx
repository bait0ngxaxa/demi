// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PatientSelfAppointmentDetailContent, PatientSelfAppointmentRow } from "../personal/patient-self-appointment-content";
import { AppointmentFields } from "../family/grants/[grantId]/appointments/appointment-fields";
import { WorkAppointmentView } from "./work-appointment-view";
import { AppointmentForm } from "../patients/[relationshipId]/appointments/new/appointment-form";
import { PatientServicesWorkspace } from "../personal/services/patient-services-workspace";
import type { WorkAppointmentPage } from "@/modules/appointments/services/work-appointment-query-service";
import type { PatientServiceRequestStatusView } from "@/modules/patient-service-requests/services/patient-service-request-service";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/modules/appointments/transport/server-actions", () => ({ createAppointmentAction: vi.fn(), rescheduleAppointmentAction: vi.fn() }));
vi.mock("@/modules/patient-service-requests/transport/server-actions", () => ({ createPatientServiceRequestAction: vi.fn(), withdrawOwnPatientServiceRequestAction: vi.fn() }));

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

const at = new Date("2026-11-01T03:00:00Z");
const appointment = {
  appointmentId: "appointment", type: "EDUCATION" as const, serviceCode: "EMPOWERMENT" as const,
  source: "PATIENT_REQUEST" as const, scheduledAt: at, durationMinutes: 30,
  locationType: "HOME_VISIT" as const, locationDetail: null, status: "SCHEDULED" as const, updatedAt: at,
  responsibleDisplayName: null, responsibleProfession: null, osmAtCreationDisplayName: null,
  acknowledgement: null, cancellationRequests: [],
};
const hospital = { hospitalId: "hospital", hospitalName: "โรงพยาบาล", access: "DIRECT" as const, canCreate: true, canResolveRequests: true, canAcceptAssignments: false };
const page: WorkAppointmentPage = {
  hospital, hospitals: [hospital], tab: "UPCOMING", filters: {}, nextCursor: null, hasNextPage: false,
  canCreate: true, canResolveRequests: true, canAcceptAssignments: false, responsibleOptions: [],
  items: [{ ...appointment, relationshipId: "relationship", patientDisplayName: "ผู้ป่วย", hospitalName: "โรงพยาบาล",
    pendingRequestBadges: { reschedule: false, staleReschedule: false, cancellation: false }, hasUnassignedOsm: false,
    osmAcceptanceStatus: "WAITING", isOneOffVisit: true }],
};

describe("SR-C appointment surfaces", () => {
  it("shows service beside type and a source badge on the patient row and detail, without the one-off note", () => {
    const relationship = { relationshipId: "relationship", hospitalName: "โรงพยาบาล", hospitalCode: "H", hospitalNumber: null, hospitalStatus: "ACTIVE" as const, careEndedAt: null };
    for (const markup of [
      renderToStaticMarkup(<PatientSelfAppointmentRow appointment={appointment} href="/detail" />),
      renderToStaticMarkup(<PatientSelfAppointmentDetailContent detail={{ ...appointment, relationship, parentHospitalName: null, contactPhones: { assignedOsmPhone: null, hospitalPhone: null, patientPhone: null } }} interactions={null} />),
    ]) {
      expect(markup).toContain("ให้ความรู้ · เสริมพลังใจ");
      expect(markup).toContain("ขอรับบริการ");
      expect(markup).not.toContain("เยี่ยมครั้งนี้เท่านั้น");
    }
  });

  const extension = { locationDetail: null, responsibleDisplayName: null, responsibleProfession: null, osmAtCreationDisplayName: null, parentHospitalName: null };
  it("shows service/source on a caregiver v3 projection without changing the other fields", () => {
    const markup = renderToStaticMarkup(<AppointmentFields appointment={{ ...appointment, hospitalName: "โรงพยาบาล", extension }} />);
    expect(markup).toContain("ให้ความรู้ · เสริมพลังใจ");
    expect(markup).toContain("ขอรับบริการ");
    expect(markup).not.toContain("เยี่ยมครั้งนี้เท่านั้น");
    expect(markup.match(/<dt /g)).toHaveLength(9);
  });

  it.each([null, extension])("SR-C1: a v1/v2 caregiver projection has no service/source keys and renders the plain type (%#)", (versionExtension) => {
    const projected = { appointmentId: "appointment", hospitalName: "โรงพยาบาล", type: "EDUCATION" as const, scheduledAt: at, durationMinutes: 30,
      locationType: "HOME_VISIT" as const, status: "SCHEDULED" as const, extension: versionExtension };
    const markup = renderToStaticMarkup(<AppointmentFields appointment={projected} />);
    expect(markup).toContain("ให้ความรู้");
    for (const text of ["เสริมพลังใจ", "ขอรับบริการ", "โรงพยาบาลนัด"]) expect(markup).not.toContain(text);
    expect(markup.match(/<dt /g)).toHaveLength(versionExtension ? 9 : 6);
  });

  it.each(["DIRECT", "OSM"] as const)("shows both sources and the server-projected one-off note in %s work lists", (access) => {
    const first = page.items[0];
    if (!first) throw new Error("Missing fixture");
    const markup = renderToStaticMarkup(<WorkAppointmentView queryError={null} page={{ ...page, hospital: { ...hospital, access }, items: [first, { ...first, appointmentId: "hospital-booking", source: "HOSPITAL", serviceCode: "SCREENING", isOneOffVisit: false }] }} />);
    for (const text of ["เสริมพลังใจ", "คัดกรอง", "ขอรับบริการ", "โรงพยาบาลนัด"]) expect(markup).toContain(text);
    expect(markup.match(/เยี่ยมครั้งนี้เท่านั้น/g)).toHaveLength(1);
  });

  it("locks type to each selected service and unlocks when the optional service is cleared", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<AppointmentForm mode="create" submissionNonce="nonce" relationshipId="relationship" patient={{ patientHospitalRelationshipId: "relationship", displayName: "ผู้ป่วย", hospitalNumber: null, hospital: { id: "hospital", name: "โรงพยาบาล" } }} responsibleMembers={[]} currentOsmAssignee={null} />));
      const service = container.querySelector<HTMLSelectElement>("#appointment-service");
      const type = container.querySelector<HTMLSelectElement>("#appointment-type");
      if (!service || !type) throw new Error("Missing booking controls");
      expect(type.disabled).toBe(false);
      for (const [code, mapped] of [["SCREENING", "ASSESSMENT"], ["FOLLOW_UP", "FOLLOW_UP"], ["EMPOWERMENT", "EDUCATION"], ["", "FOLLOW_UP"]]) {
        await act(async () => { service.value = code ?? ""; service.dispatchEvent(new Event("change", { bubbles: true })); });
        expect(type.value).toBe(mapped);
        expect(type.disabled).toBe(Boolean(code));
        expect(container.querySelector<HTMLInputElement>('input[name="type"]')?.value).toBe(mapped);
        expect(container.querySelector<HTMLInputElement>('input[name="serviceCode"]')?.value).toBe(code);
      }
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("puts open requests before history and the form; shows Thai statuses, rejection reason and STARTED appointment link", () => {
    const request = (status: PatientServiceRequestStatusView["status"]): PatientServiceRequestStatusView => ({
      requestId: status, relationshipId: "relationship", appointmentId: status === "STARTED" ? "booked" : null,
      serviceCode: "SCREENING", status, preferredOsmName: null, preferredDate: "2026-11-02", preferredSlot: "MORNING",
      note: null, rejectionReason: status === "REJECTED" ? "ไม่มีเจ้าหน้าที่ว่าง" : null, createdAt: at,
    });
    const markup = renderToStaticMarkup(<PatientServicesWorkspace preferredDateBounds={{ min: "2026-11-01", max: "2026-12-30" }} relationships={[{
      relationshipId: "relationship", hospitalName: "โรงพยาบาล", hospitalActive: true, careEnded: false,
      offerings: [{ offeringId: "offering", code: "SCREENING" }], osmChoices: [],
      requests: [request("REJECTED"), request("STARTED"), request("WITHDRAWN"), request("PENDING"), request("APPROVED")],
    }]} />);
    for (const text of ["รอโรงพยาบาลยืนยัน", "ยืนยันนัดแล้ว", "ไม่อนุมัติ", "ไม่มีเจ้าหน้าที่ว่าง", "ถอนคำขอแล้ว"]) expect(markup).toContain(text);
    expect(markup.indexOf("รอโรงพยาบาลยืนยัน")).toBeLessThan(markup.indexOf("ไม่มีเจ้าหน้าที่ว่าง"));
    expect(markup.indexOf("รอโรงพยาบาลยืนยัน")).toBeLessThan(markup.indexOf('<form'));
    expect(markup).toContain('href="/app/personal/appointments/relationship/booked"');
  });
});
