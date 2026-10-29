import { HospitalStatus, MembershipStatus, Role } from "@prisma/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import type { FollowupDetail } from "@/modules/followups/services/followup-query-service";

const mocks = vi.hoisted(() => ({
  getActor: vi.fn(),
  getFollowupDetail: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }),
}));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mocks.getActor,
}));
vi.mock("@/modules/followups/services/followup-query-service", () => ({
  getFollowupDetail: mocks.getFollowupDetail,
}));

import FollowupDetailPage from "./page";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const hospitalId = "22222222-2222-4222-8222-222222222222";
const followupId = "33333333-3333-4333-8333-333333333333";

const osmActor: ActorContext = {
  userId: "44444444-4444-4444-8444-444444444444",
  personId: "55555555-5555-4555-8555-555555555555",
  roles: [Role.OSM],
  hospitalMemberships: [],
  osmHospitalRelationships: [
    { hospitalId, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE },
  ],
};

const detail = {
  patient: {
    patientHospitalRelationshipId: relationshipId,
    displayName: "สมชาย ผู้ป่วย",
    hospitalNumber: "HN-001",
    hospital: { id: hospitalId, name: "โรงพยาบาล ก" },
  },
  followupId,
  patientProgramId: null,
  roundNumber: 2,
  recordedAt: new Date("2026-10-19T03:00:00.000Z"),
  createdAt: new Date("2026-10-19T03:00:00.000Z"),
  serviceDate: null,
  planAdjusted: null,
  adjustedGoalPlan: null,
  hasObstacle: null,
  obstacleNote: null,
  createdByDisplayName: "อสม. ทดสอบ",
  appointment: null,
  sourceGoalPlan: null,
  weight: null,
  waistCircumference: null,
  systolicBloodPressure: null,
  diastolicBloodPressure: null,
  bloodSugar: null,
  confidenceScore: null,
  reflectionNote: null,
  confidencePlan: null,
  generalNote: null,
  activityProgress: [],
} as unknown as FollowupDetail;

async function render(): Promise<string> {
  return renderToStaticMarkup(await FollowupDetailPage({
    params: Promise.resolve({ relationshipId, followupId }),
  }));
}

describe("Follow-up detail fieldwork continuation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFollowupDetail.mockResolvedValue(detail);
  });

  it("offers an assigned OSM the fixed follow-up task list beside the existing links", async () => {
    mocks.getActor.mockResolvedValue(osmActor);
    const html = await render();

    // CT-3: the OSM's next patient is chosen in the จัดบริการ workspace.
    expect(html).toContain('href="/app/services"');
    expect(html).toContain("เลือกผู้ป่วยรายถัดไปเพื่อบันทึกติดตาม");
    expect(html).toContain(`href="/app/patients/${relationshipId}/followups"`);
    expect(html).toContain(`href="/app/patients/${relationshipId}"`);
  });

  it("does not offer the OSM task list when the OSM scope has ended", async () => {
    mocks.getActor.mockResolvedValue({
      ...osmActor,
      osmHospitalRelationships: [
        { hospitalId, status: MembershipStatus.ENDED, hospitalStatus: HospitalStatus.ACTIVE },
      ],
    });

    expect(await render()).not.toContain("/app/patients/assigned");
  });
});
