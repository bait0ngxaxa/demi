import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  FollowupActivityProgressStatus,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  PatientProgramStatus,
  Role,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import type {
  ProgramReportFollowup,
  ProgramReportGoalPlan,
  ProgramReportPage,
  ProgramReportingProjection,
} from "@/modules/reporting/projections/program-report-projection";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

const {
  mockedConnection,
  mockedGetProgramReportingProjection,
  mockedGetProtectedApplicationActor,
  mockedNotFound,
  mockedRedirect,
} = vi.hoisted(() => ({
  mockedConnection: vi.fn(),
  mockedGetProgramReportingProjection: vi.fn(),
  mockedGetProtectedApplicationActor: vi.fn(),
  mockedNotFound: vi.fn(),
  mockedRedirect: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mockedConnection }));
vi.mock("next/navigation", () => ({
  notFound: mockedNotFound,
  redirect: mockedRedirect,
}));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedGetProtectedApplicationActor,
}));
vi.mock("@/modules/reporting/services/program-report-query-service", () => ({
  getProgramReportingProjection: mockedGetProgramReportingProjection,
}));

import PatientProgramReportPage from "../../../../app/app/patients/[relationshipId]/programs/[programId]/report/page";
import { ProgramReportView } from "../../../../app/app/patients/[relationshipId]/programs/[programId]/report/program-report-view";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const programId = "33333333-3333-4333-8333-333333333333";
const baselineId = "44444444-4444-4444-8444-444444444444";
const finalId = "55555555-5555-4555-8555-555555555555";
const actorUserId = "66666666-6666-4666-8666-666666666666";
const recordedAt = new Date("2026-08-22T05:00:00.000Z");

const hospitalActor: ActorContext = {
  userId: actorUserId,
  personId: "77777777-7777-4777-8777-777777777777",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [
    {
      hospitalId,
      membershipType: MembershipType.MEMBER,
      profession: null,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: HospitalStatus.ACTIVE,
    },
  ],
  osmHospitalRelationships: [],
};

const osmActor: ActorContext = {
  userId: actorUserId,
  personId: "77777777-7777-4777-8777-777777777777",
  roles: [Role.OSM],
  hospitalMemberships: [],
  osmHospitalRelationships: [
    {
      hospitalId,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: HospitalStatus.ACTIVE,
    },
  ],
};

function page<T>(items: T[], overrides: Partial<ProgramReportPage<T>> = {}): ProgramReportPage<T> {
  return {
    items,
    totalCount: items.length,
    pageSize: 20,
    hasMore: false,
    nextCursor: null,
    ...overrides,
  };
}

function report(overrides: Partial<ProgramReportingProjection> = {}): ProgramReportingProjection {
  return {
    patientProgramId: programId,
    patientHospitalRelationshipId: relationshipId,
    hospitalId,
    hospital: { id: hospitalId, name: "โรงพยาบาลตัวอย่าง" },
    patient: { displayName: "สมชาย ผู้ป่วย" },
    lifecycle: {
      status: PatientProgramStatus.ACTIVE,
      startedAt: new Date("2026-08-20T05:00:00.000Z"),
      completedAt: null,
      createdAt: new Date("2026-08-20T05:00:00.000Z"),
      createdBy: { id: actorUserId, displayName: "ผู้เปิดโปรแกรม" },
    },
    linkedBaseline: {
      state: "MISSING",
      reason: "PROGRAM_HAS_NO_LINKED_BASELINE",
    },
    serviceOne: {
      routine: { state: "MISSING", recorded: false, reason: "PROGRAM_HAS_NO_SERVICE_ONE_RECORD" },
      floatingChart: { state: "MISSING", recorded: false, reason: "PROGRAM_HAS_NO_SERVICE_ONE_RECORD" },
      dreamCard: { state: "MISSING", recorded: false, reason: "PROGRAM_HAS_NO_SERVICE_ONE_RECORD" },
      confidence: { state: "MISSING", recorded: false, reason: "PROGRAM_HAS_NO_SERVICE_ONE_RECORD" },
    },
    goalPlans: page([]),
    followups: page([]),
    finalAssessment: { state: "MISSING", reason: "PROGRAM_HAS_NO_FINAL" },
    ...overrides,
  };
}

function renderReport(
  input: ProgramReportingProjection,
  cursors: { goal?: string; followup?: string } = {},
): string {
  return renderToStaticMarkup(
    createElement(ProgramReportView, {
      currentFollowupCursor: cursors.followup,
      currentGoalCursor: cursors.goal,
      programId,
      relationshipId,
      report: input,
    }),
  );
}

function baselinePresent(): NonNullable<Extract<ProgramReportingProjection["linkedBaseline"], { state: "PRESENT" }>> {
  return {
    state: "PRESENT",
    baselineId,
    recordedOn: new Date("2026-08-19T00:00:00.000Z"),
    createdAt: new Date("2026-08-19T05:00:00.000Z"),
    recordedBy: { id: actorUserId, displayName: "ผู้บันทึก Baseline" },
    measurements: {
      weight: { state: "RECORDED", value: 70.5 },
      waistCircumference: { state: "NOT_RECORDED" },
      bloodPressureSystolic: { state: "RECORDED", value: 120 },
      bloodPressureDiastolic: { state: "NOT_RECORDED" },
      bloodSugarDtx: { state: "RECORDED", value: 95 },
    },
  };
}

function goalPlan(roundNumber = 1): ProgramReportGoalPlan {
  return {
    goalPlanId: "88888888-8888-4888-8888-888888888888",
    roundNumber,
    createdAt: recordedAt,
    createdByDisplayName: "ผู้บันทึกแผน",
    primaryGoalCode: "weight",
    primaryGoalNote: { state: "RECORDED", value: "ติดตามตามแผนที่บันทึก" },
    weeklyNote: { state: "NOT_RECORDED" },
    templateKey: "demi-goals",
    templateVersion: "legacy-prototype-v1",
    items: [
      {
        goalPlanItemId: "99999999-9999-4999-8999-999999999999",
        activityCode: "exercise_walk",
        targetDays: 3,
        targetValue: { state: "RECORDED", value: 15 },
        targetUnit: { state: "RECORDED", value: "minutes" },
        sortOrder: 0,
      },
    ],
  };
}

function followup(roundNumber: number): ProgramReportFollowup {
  return {
    followupId: `aaaaaaaa-aaaa-4aaa-8aaa-${String(roundNumber).padStart(12, "0")}`,
    roundNumber,
    recordedAt,
    createdAt: recordedAt,
    createdByDisplayName: "ผู้บันทึกติดตาม",
    measurements: {
      weight: { state: "NOT_RECORDED" },
      waistCircumference: { state: "NOT_RECORDED" },
      systolicBloodPressure: { state: "RECORDED", value: 118 },
      diastolicBloodPressure: { state: "NOT_RECORDED" },
      bloodSugar: { state: "RECORDED", value: 98 },
    },
    activityProgress: [
      {
        goalActivityCode: "exercise_walk",
        status: FollowupActivityProgressStatus.PARTIAL,
        note: { state: "RECORDED", value: "ทำได้บางส่วน" },
      },
      {
        goalActivityCode: "stop_sweet",
        status: FollowupActivityProgressStatus.NOT_DONE,
        note: { state: "NOT_RECORDED" },
      },
      {
        goalActivityCode: "sleep",
        status: FollowupActivityProgressStatus.NOT_APPLICABLE,
        note: { state: "NOT_RECORDED" },
      },
    ],
  };
}

function finalPresent(): Extract<ProgramReportingProjection["finalAssessment"], { state: "PRESENT" }> {
  return {
    state: "PRESENT",
    finalAssessmentId: finalId,
    recordedAt,
    createdAt: recordedAt,
    recordedBy: { id: actorUserId, displayName: "ผู้บันทึก Final" },
    measurements: {
      weight: { state: "RECORDED", value: 80 },
      waistCircumference: { state: "NOT_RECORDED" },
      systolicBloodPressure: { state: "RECORDED", value: 122 },
      diastolicBloodPressure: { state: "RECORDED", value: 82 },
      bloodSugar: { state: "NOT_RECORDED" },
    },
  };
}

describe("Program factual report route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedConnection.mockResolvedValue(undefined);
    mockedGetProtectedApplicationActor.mockResolvedValue(hospitalActor);
    mockedGetProgramReportingProjection.mockResolvedValue(report());
    mockedNotFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    mockedRedirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
  });

  it.each([
    ["authorized HOSPITAL", hospitalActor],
    ["authorized assigned OSM", osmActor],
  ])("loads the exact nested report route for an %s actor", async (_label, actor) => {
    mockedGetProtectedApplicationActor.mockResolvedValue(actor);

    const result = await PatientProgramReportPage({
      params: Promise.resolve({ relationshipId, programId }),
      searchParams: Promise.resolve({ goalCursor: "goal-opaque", followupCursor: "followup-opaque" }),
    });

    expect(mockedGetProgramReportingProjection).toHaveBeenCalledWith(
      actor,
      relationshipId,
      programId,
      {
        goalPlans: { cursor: "goal-opaque" },
        followups: { cursor: "followup-opaque" },
      },
    );
    expect(result.type).toBe(ProgramReportView);
    expect(result.props).toMatchObject({ relationshipId, programId });
  });

  it("fails closed when the relationship and Program boundary is not accessible", async () => {
    mockedGetProgramReportingProjection.mockRejectedValue(new NotFoundError());

    await expect(
      PatientProgramReportPage({
        params: Promise.resolve({ relationshipId, programId }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mockedNotFound).toHaveBeenCalledOnce();
  });

  it("does not render report content for a forbidden actor", async () => {
    mockedGetProgramReportingProjection.mockRejectedValue(new ForbiddenError());

    await expect(
      PatientProgramReportPage({
        params: Promise.resolve({ relationshipId, programId }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/app");

    expect(mockedRedirect).toHaveBeenCalledWith("/app");
  });

  it("keeps unauthenticated access on the existing login flow", async () => {
    mockedGetProtectedApplicationActor.mockRejectedValue(new UnauthenticatedError());

    await expect(
      PatientProgramReportPage({
        params: Promise.resolve({ relationshipId, programId }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/login");

    expect(mockedGetProgramReportingProjection).not.toHaveBeenCalled();
  });
});

describe("Program factual report presentation", () => {
  it("renders factual identity and lifecycle without HN or measurement-date wording", () => {
    const markup = renderReport(
      report({
        lifecycle: {
          status: PatientProgramStatus.COMPLETED,
          startedAt: new Date("2026-08-20T05:00:00.000Z"),
          completedAt: new Date("2026-08-25T05:00:00.000Z"),
          createdAt: new Date("2026-08-20T05:00:00.000Z"),
          createdBy: { id: actorUserId, displayName: "ผู้เปิดโปรแกรม" },
        },
      }),
    );

    expect(markup).toContain("สมชาย ผู้ป่วย");
    expect(markup).toContain("โรงพยาบาลตัวอย่าง");
    expect(markup).toContain("เสร็จสิ้นแล้ว");
    expect(markup).toContain("เริ่มโปรแกรมเมื่อ");
    expect(markup).toContain("จบโปรแกรมเมื่อ");
    expect(markup).not.toContain("HN");
    expect(markup).not.toContain("hospitalNumber");
    expect(markup).not.toContain("วัดเมื่อ");
    expect(markup).not.toContain("Before");
    expect(markup).not.toContain("After");
  });

  it("renders the linked Baseline raw facts and explicit null measurement labels", () => {
    const markup = renderReport(report({ linkedBaseline: baselinePresent() }));

    expect(markup).toContain("ข้อมูล Baseline ที่เชื่อมกับโปรแกรม");
    expect(markup).toContain("70.5");
    expect(markup).toContain("120");
    expect(markup).toContain("95");
    expect(markup).toContain("ไม่มีข้อมูล");
    expect(markup).toContain("ผู้บันทึก Baseline");
    expect(markup).not.toContain("ค่าก่อน");
    expect(markup).not.toContain("ค่าหลัง");
  });

  it("renders neutral missing states and safe Service 1 metadata only", () => {
    const markup = renderReport(
      report({
        serviceOne: {
          routine: {
            state: "PRESENT",
            recorded: true,
            recordedAt,
            recordedBy: { displayName: "ผู้บันทึก Service" },
            evidence: {
              artifactId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              mediaType: "image/jpeg",
              byteSize: 2048,
              uploadedAt: recordedAt,
              associatedAt: recordedAt,
            },
          },
          floatingChart: { state: "MISSING", recorded: false, reason: "PROGRAM_HAS_NO_SERVICE_ONE_RECORD" },
          dreamCard: { state: "MISSING", recorded: false, reason: "PROGRAM_HAS_NO_SERVICE_ONE_RECORD" },
          confidence: { state: "MISSING", recorded: false, reason: "PROGRAM_HAS_NO_SERVICE_ONE_RECORD" },
        },
      }),
    );

    expect(markup).toContain("Routine");
    expect(markup).toContain("มีข้อมูล");
    expect(markup).toContain("ยังไม่มีข้อมูล");
    expect(markup).toContain("image/jpeg");
    expect(markup).toContain("2048 ไบต์");
    expect(markup).not.toContain("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    expect(markup).not.toContain("storageObjectKey");
    expect(markup).not.toContain("signedUrl");
    expect(markup).not.toContain("supabase");
  });

  it("renders Goal Plan history and preserves the other cursor on continuation", () => {
    const markup = renderReport(
      report({
        goalPlans: page([goalPlan()], { totalCount: 2, hasMore: true, nextCursor: "goal-next" }),
      }),
      { followup: "followup-current" },
    );

    expect(markup).toContain("แผนรอบที่ 1");
    expect(markup).toContain("เดินออกกำลังกาย");
    expect(markup).toContain("15");
    expect(markup).toContain("minutes");
    expect(markup).toContain("แสดงหน้านี้ 1 รายการ จากทั้งหมด 2 รายการ");
    expect(markup).toContain("goalCursor=goal-next");
    expect(markup).toContain("followupCursor=followup-current");
    expect(markup).toContain("ดูแผนรายการถัดไป");
    expect(markup).not.toContain("achievement");
    expect(markup).not.toContain("เปอร์เซ็นต์");
  });

  it("keeps Follow-up history normalized, exposes round 7 through pagination, and maps statuses neutrally", () => {
    const markup = renderReport(
      report({
        followups: page([followup(7)], { totalCount: 7, hasMore: true, nextCursor: "followup-next" }),
      }),
      { goal: "goal-current" },
    );

    expect(markup).toContain("ครั้งที่ 7");
    expect(markup).toContain("บันทึกในระบบเมื่อ");
    expect(markup).toContain("ทำได้บางส่วน");
    expect(markup).toContain("ยังไม่ได้ทำ");
    expect(markup).toContain("ไม่เกี่ยวข้อง");
    expect(markup).toContain("แสดงหน้านี้ 1 รายการ จากทั้งหมด 7 รายการ");
    expect(markup).toContain("followupCursor=followup-next");
    expect(markup).toContain("goalCursor=goal-current");
    expect(markup).not.toContain("ผ่าน");
    expect(markup).not.toContain("ล้มเหลว");
    expect(markup).not.toContain("สำเร็จ");
  });

  it("renders Final facts and neutral active/completed absence without mutation controls", () => {
    const presentMarkup = renderReport(report({ finalAssessment: finalPresent() }));

    expect(presentMarkup).toContain("ข้อมูล Final Assessment");
    expect(presentMarkup).toContain("80");
    expect(presentMarkup).toContain("บันทึกในระบบเมื่อ");
    expect(presentMarkup).toContain("ผู้บันทึก Final");
    expect(presentMarkup).not.toContain("วัดเมื่อ");
    expect(presentMarkup).not.toContain("<form");
    expect(presentMarkup).not.toContain("<button");
    expect(presentMarkup).not.toContain("ส่งออก");
    expect(presentMarkup).not.toContain("ดาวน์โหลด");
    expect(presentMarkup).not.toContain("BMI");
    expect(presentMarkup).not.toContain("HbA1c");
    expect(presentMarkup).not.toContain("CVD");
    expect(presentMarkup).not.toContain("ส่วนสูง");

    const activeMissingMarkup = renderReport(report());
    expect(activeMissingMarkup).toContain("ยังไม่มีข้อมูล Final Assessment ที่บันทึกในโปรแกรมนี้");

    const completedMissingMarkup = renderReport(
      report({
        lifecycle: {
          status: PatientProgramStatus.COMPLETED,
          startedAt: new Date("2026-08-20T05:00:00.000Z"),
          completedAt: recordedAt,
          createdAt: new Date("2026-08-20T05:00:00.000Z"),
          createdBy: { id: actorUserId, displayName: "ผู้เปิดโปรแกรม" },
        },
      }),
    );
    expect(completedMissingMarkup).toContain("โปรแกรมนี้ไม่มีข้อมูล Final Assessment ที่บันทึกไว้");
  });

  it("uses responsive, semantic markup for narrow screens", () => {
    const markup = renderReport(
      report({
        followups: page([followup(1)]),
      }),
    );

    expect(markup).toContain("<section");
    expect(markup).toContain("<h1");
    expect(markup).toContain("<h2");
    expect(markup).toContain("<dl");
    expect(markup).toContain("break-words");
    expect(markup).toContain("sm:grid-cols-2");
    expect(markup).not.toContain("<table");
  });
});
