import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import type { ScreeningDetail } from "@/modules/screening/services/screening-query-service";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  getScreeningDetail: vi.fn(),
  getProgramContext: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }),
}));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mocks.getActor,
}));
vi.mock("@/modules/screening/services/screening-query-service", () => ({
  getScreeningDetail: mocks.getScreeningDetail,
}));
vi.mock("@/modules/patient-program/services/patient-program-query-service", () => ({
  getPatientProgramPageContext: mocks.getProgramContext,
}));

import ScreeningDetailPage from "./page";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const hospitalId = "22222222-2222-4222-8222-222222222222";
const screeningId = "33333333-3333-4333-8333-333333333333";

const osmActor: ActorContext = {
  userId: "44444444-4444-4444-8444-444444444444",
  personId: "55555555-5555-4555-8555-555555555555",
  roles: [Role.OSM],
  hospitalMemberships: [],
  osmHospitalRelationships: [
    { hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE },
  ],
};

const hospitalActor: ActorContext = {
  ...osmActor,
  roles: [Role.HOSPITAL],
  osmHospitalRelationships: [],
  hospitalMemberships: [{
    hospitalId,
    membershipType: MembershipType.MEMBER,
    profession: null,
    status: MembershipStatus.ACTIVE,
    hospitalStatus: HospitalStatus.ACTIVE,
  }],
} as ActorContext;

const detail = {
  patient: {
    patientHospitalRelationshipId: relationshipId,
    displayName: "สมชาย ผู้ป่วย",
    hospitalNumber: "HN-001",
    hospital: { id: hospitalId, name: "โรงพยาบาล ก" },
  },
  screeningAssessmentId: screeningId,
  submittedAt: new Date("2026-10-19T03:00:00.000Z"),
  conductedByDisplayName: "อสม. ทดสอบ",
  instrument: "COMBINED",
  questionSetKey: "unknown",
  questionSetVersion: "unknown",
  scoringVersion: "unknown",
  responses: { kind: "LEGACY", pam: {}, proms: {}, confidenceScore: 7, confidenceImprovementPlan: null },
  outcome: { kind: "LEGACY", level: "L2", zone: "GREEN", pamTotal: 30, promsTotal: 20 },
} as unknown as ScreeningDetail;

const promsDetail = {
  ...detail,
  instrument: "PROMS",
  questionSetKey: "demi-proms",
  questionSetVersion: "booklet-v1",
  scoringVersion: "proms-booklet-v1",
  responses: { kind: "INSTRUMENT", answers: { "proms-1": 2, "proms-2": 4, "proms-3": 4, "proms-4": 5 } },
  outcome: {
    kind: "PROMS",
    itemScores: { "proms-1": 2, "proms-2": 4, "proms-3": 4, "proms-4": 5 },
    hasProblem: true,
    problemItemKeys: ["proms-1"],
  },
} as unknown as ScreeningDetail;

async function render(): Promise<string> {
  return renderToStaticMarkup(await ScreeningDetailPage({
    params: Promise.resolve({ relationshipId, screeningId }),
  }));
}

describe("Screening detail fieldwork continuation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getScreeningDetail.mockResolvedValue(detail);
    mocks.getProgramContext.mockResolvedValue({ active: null, canManage: false });
  });

  it("offers an assigned OSM the fixed screening task list after saving", async () => {
    mocks.getActor.mockResolvedValue(osmActor);
    const html = await render();

    expect(html).toContain('href="/app/patients/assigned?task=screening"');
    expect(html).toContain("เลือกผู้ป่วยรายถัดไปเพื่อคัดกรอง");
    expect(html).toContain(`href="/app/patients/${relationshipId}/screenings"`);
  });

  it("shows a PROMs result without a total, the booklet rule and the assessor guidance to staff", async () => {
    mocks.getActor.mockResolvedValue(hospitalActor);
    mocks.getScreeningDetail.mockResolvedValue(promsDetail);
    const html = await render();

    expect(html).toContain("มีปัญหา");
    expect(html).toContain("คะแนนข้อใดข้อหนึ่ง น้อยกว่าหรือเท่ากับ 2 จัดว่า “มีปัญหา” ทันที (ไม่มีการวัดจากคะแนนรวม)");
    expect(html).toContain("ดูตามเท่าที่ผู้ป่วย “รู้สึก” ว่าเป็นปัญหา");
    expect(html).not.toContain("คะแนนรวม PROMs");
    // PROMs never sources a Goal Plan.
    expect(html).not.toContain("screeningId=");
  });

  it("does not offer the OSM task list without a current OSM scope", async () => {
    mocks.getActor.mockResolvedValue(hospitalActor);
    expect(await render()).not.toContain("/app/patients/assigned");

    mocks.getActor.mockResolvedValue({
      ...osmActor,
      osmHospitalRelationships: [
        { hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.SUSPENDED },
      ],
    });
    expect(await render()).not.toContain("/app/patients/assigned");
  });
});
