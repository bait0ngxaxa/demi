import { HospitalStatus, MembershipStatus, MembershipType, Role, UserStatus } from "@prisma/client";
import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import { resolveActorAccessByUserId } from "@/modules/auth/services/actor-context-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { exportHospitalReportingWorkbook } from "@/modules/reporting/services/hospital-report-workbook-service";
import { getHospitalReportExportPreview } from "@/modules/reporting/services/hospital-report-query-service";
import { currentBuddhistYear } from "@/modules/patient-hospital-profile/schemas/patient-health-history-schemas";
import { toServiceDateOnly } from "@/shared/time/service-date";

import { createTemplateUpload, type ImportTestHospital, type TemplateRow } from "./support/patient-import-template-upload";
import { clearProgramRoundCompletions } from "./support/program-rounds";

/**
 * P1 Part D: proves the Hospital workbook export end to end. Every care record is written through the Server
 * Actions the UI posts to; only the authentication boundary (session → actor) and Next's cache revalidation
 * are replaced. The actor is still resolved from the database by the production resolver, so roles,
 * memberships and OSM relationships are checked exactly as in a signed-in request. Fixtures that have no
 * UI path in this flow (the Hospital, its OWNER and its OSM account) are created directly. Patients enter through
 * the strict Excel import (ADR-0019), the only roster creation workflow.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: async (): Promise<ActorContext> => {
    if (!session.userId) throw new Error("No signed-in test actor");
    const access = await resolveActorAccessByUserId(session.userId);
    if (access.status !== "AUTHORIZED") throw new Error(`Test actor is not authorized: ${access.status}`);
    return access.actor;
  },
}));

const { confirmPatientImportAction, previewPatientImportAction } = await import("@/modules/patient-provisioning/transport/server-actions");
const { savePatientHealthHistoryAction } = await import("@/modules/patient-hospital-profile/transport/hospital-patient-edit-actions");
const { assignOsmToPatientAction } = await import("@/modules/patient-assignment/transport/server-actions");
const { createPatientBaselineAction } = await import("@/modules/patient-baseline/transport/server-actions");
const { openPatientProgramAction, completePatientProgramAction } = await import("@/modules/patient-program/transport/server-actions");
const {
  completePatientProgramRoundAction,
  recordPatientProgramRoundReviewAction,
  recordPatientProgramRoundVitalsAction,
} = await import("@/modules/patient-program-rounds/transport/server-actions");
const { submitScreeningAction } = await import("@/modules/screening/transport/server-actions");
const serviceOneActions = await import("@/modules/patient-program/transport/patient-program-service-one-server-actions");
const { submitGoalPlanForProgramAction } = await import("@/modules/goals/transport/server-actions");
const { createFollowupAction, createFollowupForProgramAction } = await import("@/modules/followups/transport/server-actions");
const { createPatientFinalAssessmentAction } = await import("@/modules/patient-final-assessment/transport/server-actions");

const prisma = getPrisma();
const suffix = randomUUID().slice(0, 8);
const hospitalIds: string[] = [];
const userIds: string[] = [];
const personIds: string[] = [];
const IDLE = { status: "IDLE" } as never;

type ActionResult = { status: string; result?: Record<string, unknown>; message?: string };

function form(fields: Record<string, string | number | boolean | null | undefined>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) data.append(key, String(value));
  }
  return data;
}

function expectSuccess(state: ActionResult, step: string): Record<string, unknown> {
  // The step name and any error message make a failing action self-explaining.
  expect({ step, status: state.status, error: state.status === "SUCCESS" ? undefined : state.message })
    .toEqual({ step, status: "SUCCESS", error: undefined });
  return state.result ?? {};
}

/** Uploads one hospital-bound template, previews it and confirms it, exactly as the import page posts. */
async function importPatients(hospital: ImportTestHospital, rows: readonly TemplateRow[]): Promise<void> {
  const upload = await createTemplateUpload(hospital, rows);
  const data = new FormData();
  data.set("file", new File([await upload.arrayBuffer()], upload.name));
  data.set("targetHospitalId", hospital.id);
  const preview = await previewPatientImportAction(data);
  if (preview.status !== "SUCCESS") throw new Error(`Patient import preview failed: ${preview.status}`);
  expect(preview.preview.rows.map(({ classification }) => classification)).toEqual(rows.map(() => "READY"));
  data.set("previewTargetHospitalId", hospital.id);
  data.set("fileFingerprint", preview.preview.fileFingerprint);
  data.set("previewBinding", preview.preview.previewBinding);
  data.set("importContractVersion", preview.preview.importContractVersion);
  const confirmed = await confirmPatientImportAction(data);
  if (confirmed.status !== "SUCCESS") throw new Error(`Patient import confirmation failed: ${confirmed.status}`);
  expect(confirmed.summary).toMatchObject({ imported: rows.length });
}

async function relationshipIdOf(hospitalId: string, givenName: string): Promise<string> {
  const relationship = await prisma.patientHospitalRelationship.findFirstOrThrow({
    where: { hospitalId, patientProfile: { person: { givenName } } },
    select: { id: true },
  });
  return relationship.id;
}

function signIn(userId: string): void {
  session.userId = userId;
}

/** A synthetic, checksum-valid Thai National ID; province code 98 does not exist, so it cannot be a real ID. */
function syntheticNationalId(seed: number): string {
  const body = `898${String(seed).padStart(9, "0")}`;
  const sum = [...body].reduce((total, digit, index) => total + Number(digit) * (13 - index), 0);
  return `${body}${(11 - (sum % 11)) % 10}`;
}

async function createAccount(role: Role, givenName: string, hospitalId: string, membershipType: MembershipType = MembershipType.OWNER): Promise<string> {
  const person = await prisma.person.create({
    data: { identityKeyHash: `report-pipeline-${role}-${randomUUID()}`, givenName, familyName: `ทดสอบ${suffix}` },
    select: { id: true },
  });
  personIds.push(person.id);
  const user = await prisma.user.create({
    data: { personId: person.id, status: UserStatus.ACTIVE, roles: { create: [{ role }] } },
    select: { id: true },
  });
  userIds.push(user.id);
  if (role === Role.HOSPITAL) {
    await prisma.hospitalMembership.create({
      data: { userId: user.id, hospitalId, membershipType, status: MembershipStatus.ACTIVE },
    });
  } else {
    await prisma.osmHospitalRelationship.create({ data: { userId: user.id, hospitalId, status: MembershipStatus.ACTIVE } });
  }
  return user.id;
}

async function cleanup(): Promise<void> {
  if (hospitalIds.length === 0) return;
  const relationships = await prisma.patientHospitalRelationship.findMany({
    where: { hospitalId: { in: hospitalIds } },
    select: { id: true, patientProfileId: true, patientProfile: { select: { personId: true, person: { select: { user: { select: { id: true } } } } } } },
  });
  const relationshipIds = relationships.map((relationship) => relationship.id);
  const programWhere = { patientHospitalRelationshipId: { in: relationshipIds } };
  await clearProgramRoundCompletions((await prisma.patientProgram.findMany({ where: programWhere, select: { id: true } })).map((program) => program.id));
  await prisma.patientProgramRoundActivity.deleteMany({ where: { patientProgram: programWhere } });
  await prisma.patientProgramRoundVitals.deleteMany({ where: { patientProgram: programWhere } });
  await prisma.patientProgramServiceOneRoutine.deleteMany({ where: { patientProgram: programWhere } });
  await prisma.patientProgramServiceOneFloatingChart.deleteMany({ where: { patientProgram: programWhere } });
  await prisma.patientProgramServiceOneDreamCard.deleteMany({ where: { patientProgram: programWhere } });
  await prisma.patientProgramServiceOneConfidence.deleteMany({ where: { patientProgram: programWhere } });
  await prisma.patientFollowupActivityProgress.deleteMany({ where: { followup: programWhere } });
  await prisma.patientGoalPlan.updateMany({ where: programWhere, data: { sourceFollowupId: null } });
  await prisma.patientFollowup.deleteMany({ where: programWhere });
  await prisma.patientFinalAssessment.deleteMany({ where: programWhere });
  await prisma.patientGoalItem.deleteMany({ where: { goalPlan: programWhere } });
  await prisma.patientGoalPlan.deleteMany({ where: programWhere });
  await prisma.screeningAssessment.deleteMany({ where: programWhere });
  await prisma.patientProgram.deleteMany({ where: programWhere });
  await prisma.patientBaseline.deleteMany({ where: programWhere });
  await prisma.patientHospitalHealthHistory.deleteMany({ where: programWhere });
  await prisma.patientOsmAssignment.deleteMany({ where: programWhere });
  await prisma.patientActivation.deleteMany({ where: { hospitalId: { in: hospitalIds } } });
  await prisma.patientHospitalRelationship.deleteMany({ where: { id: { in: relationshipIds } } });
  const patientUserIds = relationships.flatMap((relationship) => relationship.patientProfile.person.user?.id ?? []);
  await prisma.patientProfile.deleteMany({ where: { id: { in: relationships.map((relationship) => relationship.patientProfileId) } } });
  const allUserIds = [...userIds, ...patientUserIds];
  await prisma.auditEvent.deleteMany({ where: { OR: [{ actorUserId: { in: allUserIds } }, { resourceId: { in: [...hospitalIds, ...relationshipIds] } }] } });
  await prisma.osmHospitalRelationship.deleteMany({ where: { hospitalId: { in: hospitalIds } } });
  await prisma.hospitalMembership.deleteMany({ where: { hospitalId: { in: hospitalIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: allUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
  await prisma.person.deleteMany({ where: { id: { in: [...personIds, ...relationships.map((relationship) => relationship.patientProfile.personId)] } } });
  await prisma.hospital.deleteMany({ where: { id: { in: hospitalIds } } });
}

describe("report pipeline end to end (P1 Part D)", () => {
  let ownerUserId: string;
  let osmUserId: string;
  let memberUserId: string;
  let hospitalId: string;
  let importHospital: ImportTestHospital;

  beforeAll(async () => {
    const hospital = await prisma.hospital.create({
      data: { hospitalCode: `PIPELINE-${suffix}`, name: `โรงพยาบาลทดสอบ Pipeline ${suffix}`, status: HospitalStatus.ACTIVE },
      select: { id: true, hospitalCode: true, name: true },
    });
    importHospital = hospital;
    hospitalId = hospital.id;
    hospitalIds.push(hospital.id);
    ownerUserId = await createAccount(Role.HOSPITAL, "ทดสอบเจ้าของ", hospitalId);
    osmUserId = await createAccount(Role.OSM, "ทดสอบอสม", hospitalId);
    memberUserId = await createAccount(Role.HOSPITAL, "ทดสอบเจ้าหน้าที่", hospitalId, MembershipType.MEMBER);
  });

  afterAll(async () => {
    session.userId = null;
    await cleanup();
  });

  it("records a full Program through Server Actions and exports its exact workbook cells", async () => {
    const today = toServiceDateOnly(new Date());
    const diagnosisYear = currentBuddhistYear() - 4;

    // The Hospital OWNER imports both Patients in one Excel file.
    signIn(ownerUserId);
    await importPatients(importHospital, [
      {
        nationalId: syntheticNationalId(Number.parseInt(suffix, 16) % 1_000_000),
        givenName: "ทดสอบสมชาย",
        familyName: `รายงาน${suffix}`,
        hospitalNumber: `HN-${suffix}`,
      },
      {
        nationalId: syntheticNationalId((Number.parseInt(suffix, 16) % 1_000_000) + 1),
        givenName: "ทดสอบนอกโปรแกรม",
        familyName: `รายงาน${suffix}`,
      },
    ]);
    const relationshipId = await relationshipIdOf(hospitalId, "ทดสอบสมชาย");
    const outsideRelationshipId = await relationshipIdOf(hospitalId, "ทดสอบนอกโปรแกรม");

    expectSuccess(await savePatientHealthHistoryAction(relationshipId, IDLE, form({
      expectedVersion: 0,
      diabetes: "YES",
      hypertension: "NO",
      otherConditions: "",
      familyHypertension: "UNKNOWN",
      familyDiabetes: "YES",
      familyHeartDisease: "NO",
      familyStroke: "NO",
      diagnosisYear,
    })), "health history");
    expectSuccess(await assignOsmToPatientAction(IDLE, form({ patientHospitalRelationshipId: relationshipId, osmUserId })), "assign OSM");

    // Baseline (Before) and Program opening.
    expectSuccess(await createPatientBaselineAction(IDLE, form({
      patientHospitalRelationshipId: relationshipId,
      recordedOn: today,
      weight: 80,
      heightCm: 160,
      waistCircumference: 95,
      bloodPressureSystolic: 140,
      bloodPressureDiastolic: 90,
      bloodSugarDtx: 180,
      hba1c: 8.2,
      cvdRiskScore: 22,
      confidenceScore: 6,
    })), "baseline");
    const program = expectSuccess(await openPatientProgramAction(IDLE, form({ patientHospitalRelationshipId: relationshipId })), "open Program");
    const programId = String(program.patientProgramId);

    // Phase R1: every round records its whole checklist and is completed before the next opens (SR-D1/D5).
    const completeRound = async (roundNumber: number): Promise<void> => {
      expectSuccess(await completePatientProgramRoundAction(IDLE, form({
        patientProgramId: programId, roundNumber, submissionNonce: randomUUID(),
      })), `complete round ${roundNumber}`);
    };
    const ruler = async (roundNumber: number, score: number): Promise<void> => {
      expectSuccess(await serviceOneActions.recordPatientProgramServiceOneConfidenceAction(IDLE, form({
        patientProgramId: programId, roundNumber, score, improvementPlan: "ทดสอบ",
      })), `round ${roundNumber} ruler`);
    };
    const routine = async (roundNumber: number): Promise<void> => {
      expectSuccess(await serviceOneActions.recordPatientProgramServiceOneRoutineAction(IDLE, form({ patientProgramId: programId, roundNumber })), `round ${roundNumber} routine`);
    };

    // Round 1 (OSM): vitals with the preferred name, Program screening and the per-round tools.
    signIn(osmUserId);
    expectSuccess(await recordPatientProgramRoundVitalsAction(IDLE, form({
      patientProgramId: programId, roundNumber: 1, submissionNonce: randomUUID(), serviceDate: today, weight: 79, heightCm: 160, bloodSugar: 170,
      waistCircumference: 94, systolicBloodPressure: 138, diastolicBloodPressure: 88,
      preferredName: "ทดสอบลุงชาย", profileVersion: (await prisma.patientHospitalProfile.findUnique({
        where: { patientHospitalRelationshipId: relationshipId }, select: { version: true },
      }))?.version,
    })), "round 1 vitals");
    expectSuccess(await submitScreeningAction(IDLE, form({
      patientHospitalRelationshipId: relationshipId,
      patientProgramId: programId,
      submissionNonce: randomUUID(),
      "pam-1": 3, "pam-2": 3, "pam-3": 2, "pam-4": 4, "pam-5": 3,
      "proms-1": 5, "proms-2": 4, "proms-3": 6, "proms-4": 5,
      confidenceScore: 7,
    })), "round 1 screening");
    expectSuccess(await serviceOneActions.recordPatientProgramServiceOneFloatingChartAction(IDLE, form({ patientProgramId: programId, roundNumber: 1, summary: "ทดสอบกราฟวัดลอยจม" })), "floating chart");
    await routine(1);
    // R1-E: the round 1 ruler (5) is the report's Before score, not the Baseline score (6).
    await ruler(1, 5);
    await completeRound(1);

    // Round 2: vitals, the first Goal Plan, ruler and routine.
    expectSuccess(await recordPatientProgramRoundVitalsAction(IDLE, form({
      patientProgramId: programId, roundNumber: 2, submissionNonce: randomUUID(), serviceDate: today, weight: 78, heightCm: 161, bloodSugar: 160,
      waistCircumference: 93, systolicBloodPressure: 134, diastolicBloodPressure: 86,
    })), "round 2 vitals");
    const firstPlan = expectSuccess(await submitGoalPlanForProgramAction(IDLE, form({
      patientProgramId: programId,
      submissionNonce: randomUUID(),
      primaryGoalCode: "glucose",
      items: JSON.stringify([
        { activityCode: "reduce_rice", targetDays: 5 },
        { activityCode: "cardio", targetDays: 3, targetValue: 30, targetUnit: "minutes" },
      ]),
    })), "round 2 Goal Plan");
    const firstPlanId = String(firstPlan.goalPlanId);
    await ruler(2, 6);
    await routine(2);
    await completeRound(2);

    // Rounds 3–6: Follow-ups 1–4; round 4 adjusts the plan, so rounds 5–6 follow the adjusted v2 plan.
    const followup = async (input: {
      sourceGoalPlanId: string; bloodSugar: number; weight: number; planAdjusted: boolean; hasObstacle: boolean;
      progress: Array<{ goalActivityCode: string; status: string; achievedDays: number }>;
    }): Promise<string> => String(expectSuccess(await createFollowupForProgramAction(IDLE, form({
      patientProgramId: programId,
      submissionNonce: randomUUID(),
      sourceGoalPlanId: input.sourceGoalPlanId,
      serviceDate: today,
      planAdjusted: input.planAdjusted,
      hasObstacle: input.hasObstacle,
      obstacleNote: input.hasObstacle ? "ทดสอบอุปสรรค" : undefined,
      weight: input.weight,
      waistCircumference: 92,
      systolicBloodPressure: 130,
      diastolicBloodPressure: 84,
      bloodSugar: input.bloodSugar,
      activityProgress: JSON.stringify(input.progress),
    })), `follow-up ${input.bloodSugar}`).followupId);

    await followup({ sourceGoalPlanId: firstPlanId, bloodSugar: 150, weight: 77, planAdjusted: false, hasObstacle: true, progress: [
      { goalActivityCode: "reduce_rice", status: "PARTIAL", achievedDays: 3 },
      { goalActivityCode: "cardio", status: "PARTIAL", achievedDays: 1 },
    ] });
    await ruler(3, 6);
    // SR-D11: ความฝันของฉัน is recorded in round 3.
    expectSuccess(await serviceOneActions.recordPatientProgramServiceOneDreamCardAction(IDLE, form({ patientProgramId: programId, roundNumber: 3, description: "ทดสอบการ์ดความฝัน" })), "dream card");
    await completeRound(3);
    const adjustingFollowupId = await followup({ sourceGoalPlanId: firstPlanId, bloodSugar: 140, weight: 76, planAdjusted: true, hasObstacle: false, progress: [
      { goalActivityCode: "reduce_rice", status: "DONE", achievedDays: 5 },
      { goalActivityCode: "cardio", status: "PARTIAL", achievedDays: 2 },
    ] });
    const adjustedPlan = expectSuccess(await submitGoalPlanForProgramAction(IDLE, form({
      patientProgramId: programId,
      sourceFollowupId: adjustingFollowupId,
      submissionNonce: randomUUID(),
      primaryGoalCode: "glucose",
      items: JSON.stringify([
        { activityCode: "reduce_rice", targetDays: 5 },
        { activityCode: "cardio", targetDays: 4, targetValue: 30, targetUnit: "minutes" },
      ]),
    })), "round 4 adjusted Goal Plan v2");
    const adjustedPlanId = String(adjustedPlan.goalPlanId);
    expectSuccess(await serviceOneActions.recordPatientProgramServiceOneFloatingChartAction(IDLE, form({ patientProgramId: programId, roundNumber: 4, summary: "ทดสอบกราฟครั้งที่ 4" })), "round 4 floating chart");
    await ruler(4, 7);
    await routine(4);
    await completeRound(4);
    await followup({ sourceGoalPlanId: adjustedPlanId, bloodSugar: 132, weight: 75, planAdjusted: false, hasObstacle: false, progress: [
      { goalActivityCode: "reduce_rice", status: "DONE", achievedDays: 5 },
      { goalActivityCode: "cardio", status: "DONE", achievedDays: 4 },
    ] });
    await routine(5);
    await completeRound(5);
    await followup({ sourceGoalPlanId: adjustedPlanId, bloodSugar: 125, weight: 74, planAdjusted: false, hasObstacle: false, progress: [
      { goalActivityCode: "reduce_rice", status: "DONE", achievedDays: 4 },
      { goalActivityCode: "cardio", status: "NOT_DONE", achievedDays: 0 },
    ] });
    expectSuccess(await recordPatientProgramRoundReviewAction(IDLE, form({
      patientProgramId: programId, roundNumber: 6, toolCode: "HEALTH_PATH", submissionNonce: randomUUID(),
    })), "round 6 health path review");
    await ruler(6, 8);
    await completeRound(6);

    // Final Assessment (After) and Program completion by Hospital staff.
    signIn(ownerUserId);
    expectSuccess(await createPatientFinalAssessmentAction(IDLE, form({
      patientHospitalRelationshipId: relationshipId,
      patientProgramId: programId,
      serviceDate: today,
      weight: 72,
      waistCircumference: 88,
      systolicBloodPressure: 128,
      diastolicBloodPressure: 82,
      bloodSugar: 118,
      hba1c: 6.9,
      cvdRiskScore: 14,
    })), "Final Assessment");
    expectSuccess(await completePatientProgramAction(IDLE, form({ patientProgramId: programId })), "complete Program");

    // The second Patient has care data recorded only outside a Program (relationship scope).
    expectSuccess(await submitScreeningAction(IDLE, form({
      patientHospitalRelationshipId: outsideRelationshipId,
      submissionNonce: randomUUID(),
      "pam-1": 2, "pam-2": 2, "pam-3": 2, "pam-4": 2, "pam-5": 2,
      "proms-1": 3, "proms-2": 3, "proms-3": 3, "proms-4": 3,
      confidenceScore: 5,
    })), "outside-Program screening");
    expectSuccess(await createFollowupAction(IDLE, form({
      patientHospitalRelationshipId: outsideRelationshipId,
      submissionNonce: randomUUID(),
      serviceDate: today,
      planAdjusted: false,
      hasObstacle: false,
      weight: 70,
      bloodSugar: 130,
      activityProgress: "[]",
    })), "outside-Program follow-up");

    // The export page preview reads the same counts the workbook header reports.
    const owner = await resolveActorAccessByUserId(ownerUserId);
    if (owner.status !== "AUTHORIZED") throw new Error("OWNER must resolve");
    await expect(getHospitalReportExportPreview(owner.actor, { hospitalId })).resolves.toEqual({
      hospital: { id: hospitalId, name: `โรงพยาบาลทดสอบ Pipeline ${suffix}` },
      cohort: "ACTIVE",
      programRows: 1,
      relationships: 2,
      relationshipsWithoutProgram: 1,
    });
    // The preview is authorized exactly like the export: every ACTIVE MEMBER may export (2026-10-21).
    const member = await resolveActorAccessByUserId(memberUserId);
    if (member.status !== "AUTHORIZED") throw new Error("MEMBER must resolve");
    await expect(getHospitalReportExportPreview(member.actor, { hospitalId }))
      .resolves.toEqual(await getHospitalReportExportPreview(owner.actor, { hospitalId }));

    const { buffer } = await exportHospitalReportingWorkbook(owner.actor, { hospitalId });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
    const dashboard = workbook.getWorksheet("Dashboard ภาพรวม")!;
    const service = workbook.getWorksheet("รายงานการจัดบริการ")!;
    const cells = (sheet: ExcelJS.Worksheet, row: number, from: number, to: number): unknown[] =>
      Array.from({ length: to - from + 1 }, (_, index) => {
        const value = sheet.getRow(row).getCell(from + index).value;
        return value instanceof Date ? value.toISOString().slice(0, 10) : value;
      });
    const programRecord = await prisma.patientProgram.findUniqueOrThrow({ where: { id: programId }, select: { startedAt: true, completedAt: true } });
    const startedOn = programRecord.startedAt.toISOString().slice(0, 10);
    const completedOn = programRecord.completedAt!.toISOString().slice(0, 10);
    const roundAchievementUnavailable = "ยังไม่พร้อมใช้งาน: ยังไม่มีสูตรที่ได้รับรอง";

    // Header counts: both relationships are counted, only the Program becomes a row.
    for (const sheet of [dashboard, service]) {
      expect(cells(sheet, 2, 1, 6)).toEqual(["จำนวนความสัมพันธ์ผู้ป่วยกับโรงพยาบาล", 2, "เบาหวาน (DM)", "ยังไม่มีนิยามและตัวหารที่ได้รับรอง", "Program ทั้งหมด", 1]);
      expect(cells(sheet, 3, 1, 6)).toEqual(["ความสัมพันธ์ผู้ป่วยที่ยังไม่มี Program", 1, "กลุ่มเสี่ยง (Pre-DM)", "ยังไม่มีนิยามและตัวหารที่ได้รับรอง", "Program ACTIVE / COMPLETED", "0 / 1"]);
    }

    const identity = ["ทดสอบสมชาย", `รายงาน${suffix}`, `HN-${suffix}`, 4, `ทดสอบอสม ทดสอบ${suffix} (มอบหมายปัจจุบัน)`, startedOn];
    expect(cells(dashboard, 9, 1, 46)).toEqual([
      1, ...identity,
      // Before: CVD %, HbA1c, DTX, BW, BMI, height, waist, systolic, diastolic.
      22, 8.2, 180, 80, 31.2, 160, 95, 140, 90,
      // Rounds 1–2 (round vitals) and rounds 3–6 (Follow-ups 1–4): DTX, BW, achievement.
      170, 79, roundAchievementUnavailable,
      160, 78, roundAchievementUnavailable,
      150, 77, 0.5,
      140, 76, 0.88,
      132, 75, 1,
      125, 74, 0.44,
      // After: completion date, CVD %, HbA1c, DTX, BW, BMI (round 2 height 161 cm), waist, systolic, diastolic.
      completedOn, 14, 6.9, 118, 72, 27.8, 88, 128, 82,
      "COMPLETED", programId, 1,
    ]);

    expect(cells(service, 9, 1, 70)).toEqual([
      1, ...identity, completedOn,
      // Before DTX/BW, PAM, PROMs, confidence ruler, exercise before; After DTX/BW, exercise after; follow-ups > 70%.
      180, 80, 15, 20, 5, "ไม่มีบันทึก", 118, 72, "ไม่มีบันทึก", 2,
      // Service 1 marks: floating chart and routine of round 1, dream card of round 3.
      "ทำ", "", "ทำ", "", "ทำ", "",
      // Round 2 first Goal Plan: reduce meal, food change, food days, exercise, exercise days, weekly minutes.
      "มี", "", "", "ไม่มี", 5, "มี", "", 3, 90,
      // Follow-ups 1–4: date, achieved days, rate, outcome, plan adjusted pair, obstacle pair.
      today, 4, 0.5, "ไม่มีแหล่งข้อมูลในระบบ", "", "ไม่ปรับ", "มี", "",
      today, 7, 0.88, "ไม่มีแหล่งข้อมูลในระบบ", "ปรับ", "", "", "ไม่มี",
      today, 9, 1, "ไม่มีแหล่งข้อมูลในระบบ", "", "ไม่ปรับ", "", "ไม่มี",
      today, 4, 0.44, "ไม่มีแหล่งข้อมูลในระบบ", "", "ไม่ปรับ", "", "ไม่มี",
      "COMPLETED", programId, 1, 2, 4,
    ]);

    // Exactly one Program row: the rest of the template's data-entry grid stays empty (Dashboard rows 10–29,
    // รายงานการจัดบริการ rows 10–30), notes start below it, and the outside Patient appears nowhere.
    for (const [sheet, gridEnd] of [[dashboard, 29], [service, 30]] as const) {
      for (let rowNumber = 10; rowNumber <= gridEnd + 1; rowNumber += 1) expect(sheet.getRow(rowNumber).getCell(1).value ?? null).toBeNull();
      expect(sheet.getRow(gridEnd + 2).getCell(1).value).toBe("หมายเหตุ");
    }
    for (const sheet of [dashboard, service]) {
      sheet.eachRow((row) => row.eachCell((cell) => expect(String(cell.value ?? "")).not.toContain("ทดสอบนอกโปรแกรม")));
    }
  });
});
