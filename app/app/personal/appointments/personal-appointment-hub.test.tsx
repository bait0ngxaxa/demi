import { AppointmentLocationType, AppointmentStatus, AppointmentType, HospitalStatus } from "@prisma/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PersonalAppointmentHubPageContext } from "@/modules/patient-self/transport/patient-self-care-page-context";

const mocks = vi.hoisted(() => ({ history: vi.fn(), redirect: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), redirect: mocks.redirect }));
vi.mock("@/modules/patient-self/transport/patient-self-care-page-context", () => ({
  getPatientSelfAppointmentHistoryPageContext: mocks.history,
}));

import LegacyHospitalAppointmentsPage from "./[relationshipId]/page";
import { PersonalAppointmentHub } from "./personal-appointment-hub";

const ownA = "44444444-4444-4444-8444-444444444444";
const ownB = "55555555-5555-4555-8555-555555555555";
const ended = "66666666-6666-4666-8666-666666666666";
const grantId = "77777777-7777-4777-8777-777777777777";
const appointmentId = "88888888-8888-4888-8888-888888888888";
const scheduledAt = new Date("2026-11-01T03:00:00.000Z");
const relationship = (relationshipId: string, hospitalName: string, careEndedAt: Date | null = null) => ({
  relationshipId, hospitalCode: hospitalName, hospitalName, hospitalNumber: null, hospitalStatus: HospitalStatus.ACTIVE, careEndedAt,
});
const appointment = {
  serviceCode: null, source: "HOSPITAL" as const,
  appointmentId, type: AppointmentType.FOLLOW_UP, scheduledAt, durationMinutes: 30, locationType: AppointmentLocationType.CLINIC,
  locationDetail: null, status: AppointmentStatus.SCHEDULED, updatedAt: scheduledAt, responsibleDisplayName: null,
  responsibleProfession: null, osmAtCreationDisplayName: null, acknowledgement: null, cancellationRequests: [],
};
const family = {
  kind: "FAMILY" as const, key: grantId, grantId, caregiverRelationshipId: "99999999-9999-4999-8999-999999999999", contractVersion: "family-appointment-read-v1" as const, patient: { givenName: "แม่", familyName: "ใจดี" }, hospitalName: "รพ.สต. บ้านใหม่",
};
const selfContext: PersonalAppointmentHubPageContext = {
  subjects: [{ kind: "SELF", key: "me" }, family],
  selected: { kind: "SELF", key: "me" },
  tab: "upcoming",
  self: {
    tab: "upcoming",
    relationships: [relationship(ownA, "โรงพยาบาล ก"), relationship(ownB, "รพ.สต. ข")],
    endedRelationships: [relationship(ended, "โรงพยาบาล ค", new Date("2026-01-01T00:00:00.000Z"))],
    selectedRelationshipId: ownB,
    appointments: [{ ...appointment, relationshipId: ownB, hospitalName: "รพ.สต. ข" }],
    nextCursor: appointmentId,
  },
  family: null,
};

describe("AF-4 appointment hub view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); });
  });

  it("renders ฉัน with a merged list, Hospital filter, tabs, paging and ended-Hospital history", () => {
    const markup = renderToStaticMarkup(<PersonalAppointmentHub context={selfContext} />);

    for (const text of ["ฉัน", "แม่ ใจดี", "สมาชิกครอบครัว · รพ.สต. บ้านใหม่", "ทุกโรงพยาบาล", "ที่จะถึง", "ประวัติ", "ประวัติจากโรงพยาบาลที่สิ้นสุดการดูแลแล้ว"]) {
      expect(markup).toContain(text);
    }
    expect(markup).toContain(`href="/app/personal/appointments?subject=${grantId}&amp;tab=upcoming"`);
    expect(markup).toContain(`href="/app/personal/appointments?subject=me&amp;tab=history&amp;hospital=${ownB}"`);
    expect(markup).toContain(`href="/app/personal/appointments?subject=me&amp;tab=upcoming&amp;hospital=${ownA}"`);
    expect(markup).toContain(`href="/app/personal/appointments/${ownB}/${appointmentId}"`);
    expect(markup).toContain(`href="/app/personal/appointments?subject=me&amp;tab=upcoming&amp;hospital=${ownB}&amp;cursor=${appointmentId}"`);
    expect(markup).toContain(`href="/app/personal/appointments/${ended}"`);
    // Breadcrumb, selected subject, selected tab and selected Hospital.
    expect(markup.match(/aria-current="page"/gu)).toHaveLength(4);
  });

  it("shows a family member's shared upcoming appointments read-only through the grant routes", () => {
    const markup = renderToStaticMarkup(<PersonalAppointmentHub context={{
      ...selfContext, selected: family, self: null,
      family: { appointments: [{ appointmentId, hospitalName: family.hospitalName, type: AppointmentType.FOLLOW_UP, scheduledAt, durationMinutes: null, locationType: null, status: AppointmentStatus.SCHEDULED, extension: null }], nextCursor: null, contractVersion: "family-appointment-read-v1" },
    }} />);

    expect(markup).toContain("นัดหมายของ แม่ ใจดี ที่ รพ.สต. บ้านใหม่");
    expect(markup).toContain(`href="/app/family/grants/${grantId}/appointments/${appointmentId}"`);
    expect(markup).not.toMatch(/href="\/app\/personal\/appointments\/|<form|<button|ประวัติจากโรงพยาบาล/u);
  });

  it("explains the consent boundary on a family history tab and a grant that stopped authorizing", () => {
    const history = renderToStaticMarkup(<PersonalAppointmentHub context={{ ...selfContext, selected: family, tab: "history", self: null }} />);
    expect(history).toContain("ภายใต้ความยินยอมปัจจุบัน ผู้ป่วยแชร์เฉพาะนัดหมายที่จะถึง");

    const unavailable = renderToStaticMarkup(<PersonalAppointmentHub context={{ ...selfContext, selected: family, self: null, family: "UNAVAILABLE" }} />);
    expect(unavailable).toContain("สิทธิ์อาจถูกยกเลิกแล้ว");
  });

  it("AF-5: a v2 grant shows the family member's 90-day history and links to the health summary", () => {
    const v2 = { ...family, contractVersion: "family-appointment-read-v2" as const };
    const markup = renderToStaticMarkup(<PersonalAppointmentHub context={{
      ...selfContext, subjects: [selfContext.subjects[0]!, v2], selected: v2, tab: "history", self: null,
      family: { appointments: [], nextCursor: null, contractVersion: "family-appointment-read-v2" },
    }} />);
    expect(markup).toContain("ไม่มีประวัติการนัดหมายในช่วง 90 วันที่ผ่านมา");
    expect(markup).not.toContain("ภายใต้ความยินยอมปัจจุบัน");
    expect(markup).toContain(`href="/app/family/members/${family.caregiverRelationshipId}"`);
  });

  it("hides the switcher when the account has a single entry", () => {
    const markup = renderToStaticMarkup(<PersonalAppointmentHub context={{ ...selfContext, subjects: [{ kind: "SELF", key: "me" }] }} />);
    expect(markup).not.toContain("เลือกผู้รับบริการ");
  });
});

describe("legacy per-Hospital appointment route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); });
  });

  it("lands ongoing care on the hub filtered to that Hospital", async () => {
    mocks.history.mockResolvedValue({ relationship: relationship(ownA, "โรงพยาบาล ก"), appointments: [], historyPage: { page: 1, hasMore: false } });

    await expect(LegacyHospitalAppointmentsPage({ params: Promise.resolve({ relationshipId: ownA }), searchParams: Promise.resolve({}) }))
      .rejects.toThrow(`NEXT_REDIRECT:/app/personal/appointments?subject=me&hospital=${ownA}`);
  });

  it("keeps the read-only list for a Hospital whose care ended", async () => {
    mocks.history.mockResolvedValue({
      relationship: relationship(ended, "โรงพยาบาล ค", new Date("2026-01-01T00:00:00.000Z")),
      appointments: [], historyPage: { page: 1, hasMore: false },
    });

    const markup = renderToStaticMarkup(await LegacyHospitalAppointmentsPage({ params: Promise.resolve({ relationshipId: ended }), searchParams: Promise.resolve({}) }));
    expect(markup).toContain("โรงพยาบาล ค");
    expect(markup).toContain("สิ้นสุดการดูแลแล้ว");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

it.each(["upcoming", "history"] as const)("SR-C shows service/source and request entry on the %s hub", (tab) => {
  const markup = renderToStaticMarkup(<PersonalAppointmentHub context={{ ...selfContext, tab, self: selfContext.self ? { ...selfContext.self, tab, appointments: [{ ...appointment, serviceCode: "FOLLOW_UP", source: "PATIENT_REQUEST", relationshipId: ownA, hospitalName: "โรงพยาบาล ก" }] } : null }} />);
  expect(markup).toContain("ติดตาม");
  expect(markup).toContain("ขอรับบริการ");
  expect(markup).toContain('href="/app/personal/services"');
  expect(markup).not.toContain("เยี่ยมครั้งนี้เท่านั้น");
});
