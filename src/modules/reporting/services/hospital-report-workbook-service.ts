import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import ExcelJS from "exceljs";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { summarizeFollowupAchievements } from "@/modules/followups/domain/followup-achievement";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { ValidationError } from "@/shared/errors/application-error";

import type {
  HospitalReportFact,
  HospitalReportFollowup,
  HospitalReportGoalPlan,
  HospitalReportProgramRow,
  HospitalReportingDataset,
} from "../projections/hospital-report-projection";
import { GLOBAL_REPORTING_CAPABILITIES } from "../policies/global-reporting-policy";
import { hospitalReportExportRequestSchema } from "../schemas/hospital-report-schemas";
import {
  HospitalReportExportLimitError,
  getGlobalAdminHospitalReportingDatasetForExport,
  getHospitalReportingDatasetForExport,
} from "./hospital-report-query-service";
import { resolveHospitalReportingAccessContext } from "./hospital-report-access-service";
import {
  globalReportingAuditReasonForError,
  recordGlobalReportingAudit,
  resolveGlobalReportingAccessContext,
} from "./global-reporting-access-service";

const WORKBOOK_TEMPLATE_PATH = join(process.cwd(), "docs", "Dashboard App Demi.xlsx");
const DASHBOARD_SHEET_NAME = "Dashboard ภาพรวม";
const SERVICE_SHEET_NAME = "รายงานการจัดบริการ";
const DATA_START_ROW = 9;
// Dashboard rounds 1–6 (R24A-D11): round 1 = Service 1, round 2 = Goal Plan, rounds 3–6 = Follow-ups.
const DASHBOARD_FOLLOWUPS_PER_ROW = 4;
const SERVICE_FOLLOWUPS_PER_ROW = 4;
const EXCEL_CELL_TEXT_LIMIT = 32_767;
// Owner decision BR-03: "การลดมื้ออาหาร" is the reduce-rice/starch goal; other FOOD goals are "การเปลี่ยนอาหาร".
const REDUCE_MEAL_ACTIVITY_CODE = "reduce_rice";
const GOAL_TARGET_MINUTES_UNIT = "minutes";

const unavailableLabels = {
  SOURCE_MISSING: "ไม่มีแหล่งข้อมูลในระบบ",
  CLINICAL_SEMANTICS_UNAPPROVED: "ยังไม่พร้อมใช้งาน: หน่วยหรือความหมายยังไม่ได้รับรอง",
  NOT_PROGRAM_SCOPED: "ยังไม่พร้อมใช้งาน: ไม่มีข้อมูลที่ผูกกับ Program นี้",
  DERIVATION_UNAPPROVED: "ยังไม่พร้อมใช้งาน: ยังไม่มีสูตรที่ได้รับรอง",
  DISCLOSURE_UNAPPROVED: "ยังไม่พร้อมใช้งาน: รอฐานความยินยอมการเปิดเผยข้อมูล",
} as const;

const progressStatusLabels = {
  DONE: "บันทึกว่าทำได้",
  PARTIAL: "บันทึกว่าทำได้บางส่วน",
  NOT_DONE: "บันทึกว่ายังทำไม่ได้",
  NOT_APPLICABLE: "บันทึกว่าไม่เกี่ยวข้อง",
} as const;

function assertCellText(value: string): string {
  if (value.length > EXCEL_CELL_TEXT_LIMIT) {
    throw new HospitalReportExportLimitError("ข้อความในรายงานยาวเกินขีดจำกัดของ Excel");
  }
  return value;
}

function excelArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  if (!(copy instanceof ArrayBuffer)) throw new Error("Workbook bytes are not available as an ArrayBuffer");
  return copy;
}

function factCell<T extends number | string>(fact: HospitalReportFact<T>): number | string {
  if (fact.state === "RECORDED") return fact.value;
  if (fact.state === "NOT_RECORDED") return "ยังไม่บันทึก";
  return unavailableLabels[fact.reason];
}

function toExcelDate(isoDate: string): Date {
  return new Date(isoDate);
}

function setExcelDate(row: ExcelJS.Row, column: number): void {
  const cell = row.getCell(column);
  // Template cells share one style object; assigning numFmt in place would date-format the whole row.
  cell.style = { ...cell.style, numFmt: "dd/mm/yyyy" };
}

function setExcelPercent(row: ExcelJS.Row, column: number, ratePercent: number): void {
  const cell = row.getCell(column);
  cell.value = ratePercent / 100;
  cell.style = { ...cell.style, numFmt: "0%" };
}

const NO_ACHIEVEMENT_LABEL = "ไม่มีข้อมูลจำนวนวันที่ทำได้ที่คำนวณได้";
const NOT_RECORDED_LEGACY_LABEL = "ไม่ได้บันทึก";

// Owner decision BR-04: the Follow-up achievement rate as a percentage cell, or why it is missing.
function writeAchievementRateCell(row: ExcelJS.Row, column: number, followup: HospitalReportFollowup): void {
  if (followup.achievement === null) {
    row.getCell(column).value = NO_ACHIEVEMENT_LABEL;
    return;
  }
  setExcelPercent(row, column, followup.achievement.ratePercent);
}

// Yes/no pair columns (e.g. ปรับ/ไม่ปรับ); Follow-ups recorded before the answer existed say so.
function setAnswerCells(
  row: ExcelJS.Row,
  column: number,
  answer: boolean | null,
  labels: readonly [string, string],
): void {
  if (answer === null) {
    row.getCell(column).value = NOT_RECORDED_LEGACY_LABEL;
    row.getCell(column + 1).value = "";
    return;
  }
  row.getCell(column).value = answer ? labels[0] : "";
  row.getCell(column + 1).value = answer ? "" : labels[1];
}

// Owner decision BR-01: report the service date; older Follow-ups fall back to the recorded date.
function followupDate(followup: HospitalReportFollowup): Date {
  return followup.serviceDate === null
    ? toExcelDate(followup.recordedAt)
    : toExcelDate(`${followup.serviceDate}T00:00:00.000Z`);
}

// Owner decision BR-04: number of scorable Follow-ups with an achievement rate strictly above 70%.
function achievementOver70Cell(program: HospitalReportProgramRow): number | string {
  if (program.followups.items.length === 0) return "ไม่มีการติดตาม";
  const summary = summarizeFollowupAchievements(program.followups.items.map((followup) => followup.achievement));
  return summary.scoredCount === 0 ? "ไม่มีการติดตามที่คำนวณได้" : summary.aboveThresholdCount;
}

function unavailable(reason: keyof typeof unavailableLabels): string {
  return unavailableLabels[reason];
}

function assignmentCell(program: HospitalReportProgramRow): string {
  return program.currentRelationshipOsmAssignment.state === "PRESENT"
    ? `${program.currentRelationshipOsmAssignment.value.displayName} (มอบหมายปัจจุบัน)`
    : "ไม่มีการมอบหมายปัจจุบัน";
}

function finalMeasurementCell(
  program: HospitalReportProgramRow,
  key: "bloodSugar" | "weight" | "waistCircumference" | "systolicBloodPressure" | "diastolicBloodPressure",
): number | string {
  if (program.finalAssessment.state === "MISSING") return "ไม่มี Final Assessment";
  return factCell(program.finalAssessment.value.measurements[key]);
}

function baselineMeasurementCell(
  program: HospitalReportProgramRow,
  key: "bloodSugar" | "weight" | "waistCircumference" | "systolicBloodPressure" | "diastolicBloodPressure",
): number | string {
  if (program.baseline.state === "MISSING") return "ไม่มี Baseline ที่เชื่อมกับ Program";
  return factCell(program.baseline.value.measurements[key]);
}

const NO_BASELINE_LABEL = "ไม่มี Baseline ที่เชื่อมกับ Program";
const NO_FINAL_ASSESSMENT_LABEL = "ไม่มี Final Assessment";
const NO_ROUND_VITALS_LABEL = "ยังไม่บันทึกสัญญาณชีพครั้งนี้";
const NO_PROGRAM_SCREENING_LABEL = "ไม่มีแบบประเมินที่บันทึกในครั้งที่ 1";

// Phase A: Dashboard rounds 1-2 DTX/BW come from PatientProgramRoundVitals (WB-DF-01).
function roundVitalsCell(
  record: HospitalReportProgramRow["roundVitals"]["round1"],
  key: "bloodSugar" | "weight",
): number | string {
  return record.state === "MISSING" ? NO_ROUND_VITALS_LABEL : factCell(record.value.measurements[key]);
}

function baselineBmiCell(program: HospitalReportProgramRow): number | string {
  return program.baseline.state === "MISSING" ? NO_BASELINE_LABEL : factCell(program.bmi.baseline);
}

function afterBmiCell(program: HospitalReportProgramRow): number | string {
  return program.finalAssessment.state === "MISSING" ? NO_FINAL_ASSESSMENT_LABEL : factCell(program.bmi.after);
}

function afterHba1cCell(program: HospitalReportProgramRow): number | string {
  return program.finalAssessment.state === "MISSING"
    ? NO_FINAL_ASSESSMENT_LABEL
    : factCell(program.finalAssessment.value.hba1c);
}

// D7/D8: staff-entered Baseline facts (HbA1c %, confidence ruler 0-10, CVD risk %).
function baselineFactCell(
  program: HospitalReportProgramRow,
  key: "hba1c" | "confidenceScore" | "cvdRiskScore",
): number | string {
  return program.baseline.state === "MISSING" ? NO_BASELINE_LABEL : factCell(program.baseline.value[key]);
}

function afterCvdRiskCell(program: HospitalReportProgramRow): number | string {
  return program.finalAssessment.state === "MISSING"
    ? NO_FINAL_ASSESSMENT_LABEL
    : factCell(program.finalAssessment.value.cvdRiskScore);
}

const NO_EXERCISE_RECORD_LABEL = "ไม่มีบันทึก";

// D9: Patient self-reported minutes per week; After needs the Final Assessment service date.
function weeklyExerciseCell(program: HospitalReportProgramRow, stage: "before" | "after"): number | string {
  const fact = program.weeklyExercise[stage];
  if (fact.state === "UNAVAILABLE") return unavailable(fact.reason);
  if (stage === "after" && program.finalAssessment.state === "MISSING") return NO_FINAL_ASSESSMENT_LABEL;
  return fact.state === "RECORDED" ? fact.value : NO_EXERCISE_RECORD_LABEL;
}

function screeningScoreCell(program: HospitalReportProgramRow, key: "pamScore" | "promsScore"): number | string {
  return program.screening.state === "MISSING" ? NO_PROGRAM_SCREENING_LABEL : program.screening.value[key];
}

function rowsPerProgram(program: HospitalReportProgramRow, followupsPerRow: number): number {
  return Math.max(1, Math.ceil(program.followups.items.length / followupsPerRow));
}

function programContinuationGroups(
  programs: readonly HospitalReportProgramRow[],
  followupsPerRow: number,
): Array<{ program: HospitalReportProgramRow; followups: readonly HospitalReportFollowup[]; continuation: number }> {
  return programs.flatMap((program) => {
    const rowCount = rowsPerProgram(program, followupsPerRow);
    return Array.from({ length: rowCount }, (_, index) => ({
      program,
      followups: program.followups.items.slice(index * followupsPerRow, (index + 1) * followupsPerRow),
      continuation: index + 1,
    }));
  });
}

function copyDataStyle(sheet: ExcelJS.Worksheet, rowNumber: number, width: number): void {
  const row = sheet.getRow(rowNumber);
  const templateRow = sheet.getRow(DATA_START_ROW);
  const templateWidth = sheet.name === DASHBOARD_SHEET_NAME ? 43 : 65;
  if (rowNumber <= 29 && rowNumber <= sheet.rowCount) {
    for (let column = templateWidth + 1; column <= width; column += 1) {
      const templateCell = templateRow.getCell(templateWidth);
      const cell = row.getCell(column);
      cell.style = {
        ...templateCell.style,
        alignment: { ...templateCell.style.alignment, vertical: "top", wrapText: true },
      };
    }
    return;
  }

  row.height = templateRow.height;
  for (let column = 1; column <= width; column += 1) {
    const templateCell = templateRow.getCell(Math.min(column, templateWidth));
    const cell = row.getCell(column);
    cell.style = {
      ...templateCell.style,
      alignment: {
        ...templateCell.style.alignment,
        vertical: "top",
        wrapText: true,
      },
    };
  }
}

function styleExtensionHeaders(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  sourceColumn: number,
  columns: readonly { column: number; label: string; width: number }[],
): void {
  const sourceStyle = sheet.getRow(rowNumber).getCell(sourceColumn).style;
  for (const { column, label, width } of columns) {
    const cell = sheet.getCell(rowNumber, column);
    cell.value = label;
    cell.style = {
      ...sourceStyle,
      alignment: { ...sourceStyle.alignment, vertical: "middle", wrapText: true },
    };
    sheet.getColumn(column).width = width;
  }
}

function clearReportBody(sheet: ExcelJS.Worksheet): void {
  for (let rowNumber = DATA_START_ROW; rowNumber <= sheet.rowCount; rowNumber += 1) {
    sheet.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell) => {
      cell.value = null;
    });
  }
}

function setHeaderFacts(sheet: ExcelJS.Worksheet, dataset: HospitalReportingDataset): void {
  const hospitalLabel = `โรงพยาบาล: ${assertCellText(dataset.hospital.name)}`;
  sheet.getCell("A1").value = sheet.name === SERVICE_SHEET_NAME
    ? `Service Process record · ${hospitalLabel}`
    : hospitalLabel;
  sheet.getCell("A2").value = "จำนวนความสัมพันธ์ผู้ป่วยกับโรงพยาบาล";
  sheet.getCell("B2").value = dataset.counts.patientHospitalRelationships.value;
  sheet.getCell("C2").value = "เบาหวาน (DM)";
  sheet.getCell("D2").value = "ยังไม่มีนิยามและตัวหารที่ได้รับรอง";
  sheet.getCell("E2").value = "Program ทั้งหมด";
  sheet.getCell("F2").value = dataset.counts.programs.total;
  sheet.getCell("A3").value = "ความสัมพันธ์ผู้ป่วยที่ยังไม่มี Program";
  sheet.getCell("B3").value = dataset.counts.relationshipsWithoutProgram.value;
  sheet.getCell("C3").value = "กลุ่มเสี่ยง (Pre-DM)";
  sheet.getCell("D3").value = "ยังไม่มีนิยามและตัวหารที่ได้รับรอง";
  sheet.getCell("E3").value = "Program ACTIVE / COMPLETED";
  sheet.getCell("F3").value = `${dataset.counts.programs.active} / ${dataset.counts.programs.completed}`;
}

function programIdentity(program: HospitalReportProgramRow): readonly (string | number | Date)[] {
  return [
    "",
    program.patient.givenName ?? "ไม่ระบุชื่อ",
    program.patient.familyName ?? "ไม่ระบุนามสกุล",
    program.patient.hospitalNumber.state === "RECORDED"
      ? program.patient.hospitalNumber.value
      : program.patient.hospitalNumber.state === "NOT_RECORDED"
        ? "ยังไม่บันทึก"
        : unavailable(program.patient.hospitalNumber.reason),
    program.illnessDuration.state === "RECORDED" ? program.illnessDuration.value : "ไม่ทราบปีวินิจฉัย",
    assignmentCell(program),
    toExcelDate(program.lifecycle.startedAt),
  ];
}

function writeDashboardRows(sheet: ExcelJS.Worksheet, programs: readonly HospitalReportProgramRow[]): void {
  const groups = programContinuationGroups(programs, DASHBOARD_FOLLOWUPS_PER_ROW);
  const startColumn = 17;
  const followupStartColumn = startColumn + 6;
  const programIdColumn = 45;
  const statusColumn = 44;
  const continuationColumn = 46;
  styleExtensionHeaders(sheet, 7, 43, [
    { column: statusColumn, label: "สถานะ Program", width: 18 },
    { column: programIdColumn, label: "Program ID", width: 40 },
    { column: continuationColumn, label: "ชุดข้อมูลติดตาม", width: 16 },
  ]);

  groups.forEach(({ program, followups, continuation }, index) => {
    const rowNumber = DATA_START_ROW + index;
    copyDataStyle(sheet, rowNumber, continuationColumn);
    const row = sheet.getRow(rowNumber);
    const identity = programIdentity(program);
    row.getCell(1).value = index === 0 || groups[index - 1]?.program.patientProgramId !== program.patientProgramId ? index + 1 : "";
    row.getCell(2).value = identity[1];
    row.getCell(3).value = identity[2];
    row.getCell(4).value = identity[3];
    row.getCell(5).value = identity[4];
    row.getCell(6).value = identity[5];
    row.getCell(7).value = identity[6];
    setExcelDate(row, 7);
    row.getCell(8).value = baselineFactCell(program, "cvdRiskScore");
    row.getCell(9).value = baselineFactCell(program, "hba1c");
    row.getCell(10).value = baselineMeasurementCell(program, "bloodSugar");
    row.getCell(11).value = baselineMeasurementCell(program, "weight");
    row.getCell(12).value = baselineBmiCell(program);
    row.getCell(13).value = program.baseline.state === "PRESENT" ? factCell(program.baseline.value.heightCm) : "ไม่มี Baseline ที่เชื่อมกับ Program";
    row.getCell(14).value = baselineMeasurementCell(program, "waistCircumference");
    row.getCell(15).value = baselineMeasurementCell(program, "systolicBloodPressure");
    row.getCell(16).value = baselineMeasurementCell(program, "diastolicBloodPressure");

    if (continuation === 1) {
      for (const [roundColumn, roundVitals] of [
        [startColumn, program.roundVitals.round1],
        [startColumn + 3, program.roundVitals.round2],
      ] as const) {
        row.getCell(roundColumn).value = roundVitalsCell(roundVitals, "bloodSugar");
        row.getCell(roundColumn + 1).value = roundVitalsCell(roundVitals, "weight");
        row.getCell(roundColumn + 2).value = unavailable(program.unavailable.achievementRate);
      }
    }
    followups.forEach((followup, followupIndex) => {
      const column = followupStartColumn + followupIndex * 3;
      row.getCell(column).value = factCell(followup.measurements.bloodSugar);
      row.getCell(column + 1).value = factCell(followup.measurements.weight);
      writeAchievementRateCell(row, column + 2, followup);
    });
    if (followups.length < DASHBOARD_FOLLOWUPS_PER_ROW) {
      const nextFollowupColumn = followupStartColumn + followups.length * 3;
      row.getCell(nextFollowupColumn).value = "ไม่มี Follow-up ในช่องที่เหลือ";
    }

    row.getCell(35).value = program.lifecycle.completedAt.state === "RECORDED"
      ? toExcelDate(program.lifecycle.completedAt.value)
      : program.lifecycle.status === "ACTIVE"
        ? "ยังดำเนิน Program"
        : "ยังไม่บันทึกวันที่สิ้นสุด";
    if (program.lifecycle.completedAt.state === "RECORDED") setExcelDate(row, 35);
    row.getCell(36).value = afterCvdRiskCell(program);
    row.getCell(37).value = afterHba1cCell(program);
    row.getCell(38).value = finalMeasurementCell(program, "bloodSugar");
    row.getCell(39).value = finalMeasurementCell(program, "weight");
    row.getCell(40).value = afterBmiCell(program);
    row.getCell(41).value = finalMeasurementCell(program, "waistCircumference");
    row.getCell(42).value = finalMeasurementCell(program, "systolicBloodPressure");
    row.getCell(43).value = finalMeasurementCell(program, "diastolicBloodPressure");
    row.getCell(statusColumn).value = program.lifecycle.status;
    row.getCell(programIdColumn).value = program.patientProgramId;
    row.getCell(continuationColumn).value = continuation;
  });

  sheet.getCell("AR6").value = "สถานะและรหัส Program ใช้ระบุแถวต่อเนื่อง";
  sheet.getCell("AR6").alignment = { wrapText: true, vertical: "middle" };
}

function serviceOnePresence(
  program: HospitalReportProgramRow,
  key: keyof HospitalReportProgramRow["serviceOne"],
): boolean {
  return program.serviceOne[key].state === "PRESENT";
}

function firstGoalPlan(program: HospitalReportProgramRow): HospitalReportGoalPlan | null {
  return program.goalPlans.items.reduce<HospitalReportGoalPlan | null>(
    (first, plan) => (first === null || plan.roundNumber < first.roundNumber ? plan : first),
    null,
  );
}

function setPresenceCells(row: ExcelJS.Row, column: number, present: boolean, labels: readonly [string, string]): void {
  row.getCell(column).value = present ? labels[0] : "";
  row.getCell(column + 1).value = present ? "" : labels[1];
}

function maxTargetDays(items: HospitalReportGoalPlan["items"]): number | string {
  return items.length === 0 ? "" : Math.max(...items.map((item) => item.targetDays));
}

function weeklyExerciseMinutes(items: HospitalReportGoalPlan["items"]): number | string {
  if (items.length === 0) return "";
  let total = 0;
  for (const item of items) {
    if (
      item.targetValue.state !== "RECORDED" ||
      item.targetUnit.state !== "RECORDED" ||
      item.targetUnit.value !== GOAL_TARGET_MINUTES_UNIT
    ) {
      return "ยังไม่บันทึกเวลาครบทุกกิจกรรม";
    }
    total += item.targetDays * item.targetValue.value;
  }
  return total;
}

// Round 2 (Goal Plan) cells Y–AG from the Program's first Goal Plan, per Owner decision BR-03.
function writeRoundTwoGoalCells(row: ExcelJS.Row, program: HospitalReportProgramRow): void {
  const plan = firstGoalPlan(program);
  if (plan === null) {
    row.getCell(25).value = "ไม่มี Goal Plan ที่ผูกกับ Program นี้";
    row.getCell(30).value = "ไม่มี Goal Plan ที่ผูกกับ Program นี้";
    return;
  }
  const foodItems = plan.items.filter((item) => item.category === "FOOD");
  const exerciseItems = plan.items.filter((item) => item.category === "EXERCISE");
  const hasReduceMeal = foodItems.some((item) => item.activityCode === REDUCE_MEAL_ACTIVITY_CODE);
  const hasFoodChange = foodItems.some((item) => item.activityCode !== REDUCE_MEAL_ACTIVITY_CODE);

  setPresenceCells(row, 25, hasReduceMeal, ["มี", "ไม่มี"]);
  setPresenceCells(row, 27, hasFoodChange, ["มี", "ไม่มี"]);
  row.getCell(29).value = maxTargetDays(foodItems);
  setPresenceCells(row, 30, exerciseItems.length > 0, ["มี", "ไม่มี"]);
  row.getCell(32).value = maxTargetDays(exerciseItems);
  row.getCell(33).value = weeklyExerciseMinutes(exerciseItems);
}

function writeServiceFollowupCells(
  row: ExcelJS.Row,
  program: HospitalReportProgramRow,
  followups: readonly HospitalReportFollowup[],
): void {
  followups.forEach((followup, index) => {
    const baseColumn = 34 + index * 8;
    row.getCell(baseColumn).value = followupDate(followup);
    setExcelDate(row, baseColumn);
    row.getCell(baseColumn + 1).value = followup.achievement?.achievedDays ?? NO_ACHIEVEMENT_LABEL;
    writeAchievementRateCell(row, baseColumn + 2, followup);
    row.getCell(baseColumn + 3).value = unavailable(program.unavailable.outcome);
    setAnswerCells(row, baseColumn + 4, followup.planAdjusted, ["ปรับ", "ไม่ปรับ"]);
    setAnswerCells(row, baseColumn + 6, followup.hasObstacle, ["มี", "ไม่มี"]);
  });
  if (followups.length < SERVICE_FOLLOWUPS_PER_ROW) {
    const nextFollowupColumn = 34 + followups.length * 8;
    row.getCell(nextFollowupColumn).value = "ไม่มี Follow-up ในช่องที่เหลือ";
  }
}

function writeServiceRows(sheet: ExcelJS.Worksheet, programs: readonly HospitalReportProgramRow[]): void {
  const groups = programContinuationGroups(programs, SERVICE_FOLLOWUPS_PER_ROW);
  const statusColumn = 66;
  const programIdColumn = 67;
  const followupSetColumn = 68;
  const goalPlanCountColumn = 69;
  const followupCountColumn = 70;
  const appendedHeaders: ReadonlyArray<{ column: number; label: string; width: number }> = [
    { column: statusColumn, label: "สถานะ Program", width: 18 },
    { column: programIdColumn, label: "Program ID", width: 40 },
    { column: followupSetColumn, label: "ชุดข้อมูลติดตาม", width: 16 },
    { column: goalPlanCountColumn, label: "จำนวน Goal Plan", width: 16 },
    { column: followupCountColumn, label: "จำนวน Follow-up ทั้งหมด", width: 23 },
  ];
  styleExtensionHeaders(sheet, 8, 65, appendedHeaders);

  groups.forEach(({ program, followups, continuation }, index) => {
    const rowNumber = DATA_START_ROW + index;
    copyDataStyle(sheet, rowNumber, followupCountColumn);
    const row = sheet.getRow(rowNumber);
    const identity = programIdentity(program);
    const priorProgramId = groups[index - 1]?.program.patientProgramId;
    row.getCell(1).value = priorProgramId === program.patientProgramId ? "" : index + 1;
    row.getCell(2).value = identity[1];
    row.getCell(3).value = identity[2];
    row.getCell(4).value = identity[3];
    row.getCell(5).value = identity[4];
    row.getCell(6).value = identity[5];
    row.getCell(7).value = identity[6];
    setExcelDate(row, 7);
    row.getCell(8).value = program.lifecycle.completedAt.state === "RECORDED"
      ? toExcelDate(program.lifecycle.completedAt.value)
      : program.lifecycle.status === "ACTIVE"
        ? "ยังดำเนิน Program"
        : "ยังไม่บันทึกวันที่สิ้นสุด";
    if (program.lifecycle.completedAt.state === "RECORDED") setExcelDate(row, 8);
    row.getCell(9).value = baselineMeasurementCell(program, "bloodSugar");
    row.getCell(10).value = baselineMeasurementCell(program, "weight");
    row.getCell(11).value = screeningScoreCell(program, "pamScore");
    row.getCell(12).value = screeningScoreCell(program, "promsScore");
    row.getCell(13).value = baselineFactCell(program, "confidenceScore");
    row.getCell(14).value = weeklyExerciseCell(program, "before");
    row.getCell(15).value = finalMeasurementCell(program, "bloodSugar");
    row.getCell(16).value = finalMeasurementCell(program, "weight");
    row.getCell(17).value = weeklyExerciseCell(program, "after");
    row.getCell(18).value = achievementOver70Cell(program);
    if (continuation === 1) {
      // Owner decision BR-02: "ทำ" means the Service 1 activity has a record in DEMI.
      setPresenceCells(row, 19, serviceOnePresence(program, "floatingChart"), ["ทำ", "ไม่ทำ"]);
      setPresenceCells(row, 21, serviceOnePresence(program, "dreamCard"), ["ทำ", "ไม่ทำ"]);
      setPresenceCells(row, 23, serviceOnePresence(program, "routine"), ["ทำ", "ไม่ทำ"]);
      writeRoundTwoGoalCells(row, program);
    }
    writeServiceFollowupCells(row, program, followups);
    row.getCell(statusColumn).value = program.lifecycle.status;
    row.getCell(programIdColumn).value = program.patientProgramId;
    row.getCell(followupSetColumn).value = continuation;
    row.getCell(goalPlanCountColumn).value = program.goalPlans.totalCount;
    row.getCell(followupCountColumn).value = program.followups.totalCount;
  });
}

function goalAndProgressDetailRows(programs: readonly HospitalReportProgramRow[]): Array<readonly (string | number | Date | null)[]> {
  const rows: Array<readonly (string | number | Date | null)[]> = [];
  for (const program of programs) {
    const hospitalNumber = program.patient.hospitalNumber.state === "RECORDED"
      ? program.patient.hospitalNumber.value
      : program.patient.hospitalNumber.state === "NOT_RECORDED"
        ? "ยังไม่บันทึก"
        : unavailable(program.patient.hospitalNumber.reason);

    for (const plan of program.goalPlans.items) {
      if (plan.items.length === 0) {
        rows.push([
          program.patientProgramId,
          program.patient.displayName,
          hospitalNumber,
          "มี Goal Plan",
          plan.roundNumber,
          plan.primaryGoalCode,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
        ]);
      }
      for (const item of plan.items) {
        rows.push([
          program.patientProgramId,
          program.patient.displayName,
          hospitalNumber,
          "เป้าหมายกิจกรรม",
          plan.roundNumber,
          plan.primaryGoalCode,
          null,
          null,
          item.activityCode,
          item.activityLabel,
          item.targetDays,
          factCell(item.targetValue),
          factCell(item.targetUnit),
          null,
        ]);
      }
    }

    for (const followup of program.followups.items) {
      if (followup.activityProgress.length === 0) {
        rows.push([
          program.patientProgramId,
          program.patient.displayName,
          hospitalNumber,
          "มี Follow-up",
          null,
          null,
          followup.roundNumber,
          toExcelDate(followup.recordedAt),
          null,
          null,
          null,
          null,
          null,
          null,
        ]);
      }
      for (const progress of followup.activityProgress) {
        rows.push([
          program.patientProgramId,
          program.patient.displayName,
          hospitalNumber,
          "สถานะกิจกรรมที่บันทึก",
          null,
          null,
          followup.roundNumber,
          toExcelDate(followup.recordedAt),
          progress.activityCode,
          progress.activityLabel,
          null,
          null,
          null,
          progressStatusLabels[progress.status],
        ]);
      }
    }
  }
  return rows;
}

function appendNotes(sheet: ExcelJS.Worksheet, afterRow: number, notes: readonly string[]): number {
  let rowNumber = afterRow + 1;
  for (const note of notes) {
    copyDataStyle(sheet, rowNumber, Math.max(2, sheet.columnCount));
    sheet.getCell(rowNumber, 1).value = "หมายเหตุ";
    sheet.getCell(rowNumber, 2).value = assertCellText(note);
    rowNumber += 1;
  }
  return rowNumber;
}

function appendDetailTable(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  rows: readonly (readonly (string | number | Date | null)[])[],
): void {
  const titleRow = startRow + 1;
  const headerRow = titleRow + 1;
  const headers = [
    "Program ID",
    "ผู้ป่วย",
    "Hospital-local ID",
    "ประเภทข้อมูล",
    "รอบ Goal Plan",
    "รหัสเป้าหมายหลัก",
    "รอบ Follow-up",
    "วันที่บันทึก Follow-up",
    "รหัสกิจกรรม",
    "กิจกรรม/คำอธิบาย",
    "วันเป้าหมายต่อสัปดาห์",
    "ค่าที่ตั้งเป้า",
    "หน่วย",
    "สถานะที่บันทึก",
  ];
  copyDataStyle(sheet, titleRow, headers.length);
  sheet.getCell(titleRow, 1).value = "รายละเอียดเป้าหมายและความคืบหน้าที่บันทึก (ไม่ใช่คะแนนผลสำเร็จ)";

  const sourceHeaderRow = sheet.getRow(8);
  const detailHeader = sheet.getRow(headerRow);
  for (let column = 1; column <= headers.length; column += 1) {
    const sourceStyle = sourceHeaderRow.getCell(Math.min(column, 65)).style;
    detailHeader.getCell(column).style = { ...sourceStyle };
    detailHeader.getCell(column).value = headers[column - 1];
  }
  detailHeader.height = 36;

  rows.forEach((values, index) => {
    const rowNumber = headerRow + 1 + index;
    copyDataStyle(sheet, rowNumber, headers.length);
    const row = sheet.getRow(rowNumber);
    values.forEach((value, columnIndex) => {
      const cell = row.getCell(columnIndex + 1);
      cell.value = typeof value === "string" ? assertCellText(value) : value;
      cell.numFmt = "General";
      if (value instanceof Date) setExcelDate(row, columnIndex + 1);
    });
  });
}

export async function generateHospitalReportWorkbook(
  dataset: HospitalReportingDataset,
  generatedAt: Date = new Date(),
): Promise<Buffer> {
  const template = await readFile(WORKBOOK_TEMPLATE_PATH);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(excelArrayBuffer(template));

  if (
    workbook.worksheets.length !== 2 ||
    workbook.getWorksheet(DASHBOARD_SHEET_NAME) === undefined ||
    workbook.getWorksheet(SERVICE_SHEET_NAME) === undefined
  ) {
    throw new Error("The customer report workbook no longer has the expected two worksheets");
  }

  const dashboardSheet = workbook.getWorksheet(DASHBOARD_SHEET_NAME);
  const serviceSheet = workbook.getWorksheet(SERVICE_SHEET_NAME);
  if (!dashboardSheet || !serviceSheet) throw new Error("The customer report worksheets are unavailable");

  workbook.creator = "DEMI";
  workbook.lastModifiedBy = "DEMI";
  workbook.created = generatedAt;
  workbook.modified = generatedAt;
  clearReportBody(dashboardSheet);
  clearReportBody(serviceSheet);
  setHeaderFacts(dashboardSheet, dataset);
  setHeaderFacts(serviceSheet, dataset);
  writeDashboardRows(dashboardSheet, dataset.programs);
  writeServiceRows(serviceSheet, dataset.programs);

  const dashboardRowCount = programContinuationGroups(dataset.programs, DASHBOARD_FOLLOWUPS_PER_ROW).length;
  const serviceRowCount = programContinuationGroups(dataset.programs, SERVICE_FOLLOWUPS_PER_ROW).length;
  appendNotes(dashboardSheet, DATA_START_ROW + dashboardRowCount, [
    "จำนวนผู้ป่วยนับตาม Patient-Hospital relationship; จำนวน Program นับตาม PatientProgram และผู้ป่วยที่ไม่มี Program จะไม่มีแถว Program",
    "ผู้ดูแลที่แสดงเป็นการมอบหมายปัจจุบันของ relationship ณ เวลาที่อ่านข้อมูล ไม่ใช่ผู้ให้บริการย้อนหลังของ Program",
    "ระหว่างโปรแกรม ครั้งที่ 1 = Service 1, ครั้งที่ 2 = Goal Plan, ครั้งที่ 3–6 = Follow-up ลำดับที่ 1–4; Service 1 และ Goal Plan ยังไม่มีการบันทึกค่าวัดในระบบ",
    "แถวต่อเนื่องใช้เก็บ Follow-up ทุกครั้ง; ช่องคะแนนความสำเร็จและข้อมูลทางคลินิกที่ยังไม่มีแหล่งหรือสูตรรับรองแสดงสถานะที่ตรงไปตรงมา",
    "CVD risk score (%) เจ้าหน้าที่กรอกเองที่ Baseline (Before) และ Final Assessment (After) ไม่ได้คำนวณ; HbA1c หน่วย %",
  ]);
  const detailStartRow = appendNotes(serviceSheet, DATA_START_ROW + serviceRowCount, [
    "ครั้งที่ 1 “ทำ” หมายถึงมีบันทึกกิจกรรมนั้นใน DEMI ไม่ยืนยันผลการรักษา",
    "ครั้งที่ 2 ใช้ Goal Plan รอบแรกของ Program: การลดมื้ออาหาร = เป้าหมายลดข้าว/แป้ง, การเปลี่ยนอาหาร = เป้าหมายอาหารอื่น, จำนวนมื้อและจำนวนวันต่อสัปดาห์ = วันเป้าหมายสูงสุดของหมวด, รวมเวลา = ผลรวมวันเป้าหมาย × นาทีต่อครั้ง ของกิจกรรมออกกำลังกาย",
    "Goal Plan เป็นค่าเป้าหมาย ไม่ใช่ผลที่ทำได้; Follow-up ที่เกิน 4 ครั้งแสดงในแถวต่อเนื่องและตารางรายละเอียดท้ายรายงาน",
    "วันที่ติดตาม = วันที่ให้บริการ (รายการก่อนมีช่องนี้ใช้วันที่บันทึก); จำนวนวันที่ทำได้ = ผลรวมวันที่ทำได้ใน 7 วันก่อนวันให้บริการ; อัตราความสำเร็จ = จำนวนวันที่ทำได้ ÷ วันเป้าหมายของแผนที่อ้างอิง ไม่นับกิจกรรมที่ไม่เกี่ยวข้อง; >70% นับเฉพาะการติดตามที่คำนวณได้",
    "ผลลัพธ์ที่ได้ ยังรอรายการคำจาก Owner; ปรับแผนและอุปสรรคมาจากคำตอบในแบบบันทึกการติดตาม (รายการก่อนมีช่องนี้แสดง ไม่ได้บันทึก)",
    "Program COMPLETED เป็นสถานะ lifecycle ไม่ได้ยืนยันผลลัพธ์ทางคลินิก; generatedAt เป็นเวลาสร้างไฟล์ ไม่ใช่ dataAsOf",
    "ไม้บรรทัดวัดใจ = คะแนน 0–10 จาก Baseline",
    "เวลาออกกำลังกาย/สัปดาห์ (ผู้ป่วยบันทึกเอง) = นาทีที่ผู้ป่วยบันทึกในบันทึกการออกกำลังกายช่วง 28 วันก่อนวันเริ่ม Program (Before) หรือก่อนวันประเมินหลังจบ (After) ÷ 4; ไม่นับรายการที่ไม่ระบุเวลา; ไม่มีรายการในช่วง = ไม่มีบันทึก",
  ]);
  appendDetailTable(serviceSheet, detailStartRow, goalAndProgressDetailRows(dataset.programs));

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function exportHospitalReportingWorkbook(
  actor: ActorContext | null | undefined,
  input: unknown,
): Promise<{ buffer: Buffer; generatedAt: Date }> {
  const dataset = await getHospitalReportingDatasetForExport(actor, input);
  const buffer = await generateHospitalReportWorkbook(dataset);
  const generatedAt = new Date();

  const access = await resolveHospitalReportingAccessContext(
    actor,
    dataset.hospital.id,
    "hospital:report:export",
  );
  await recordAuditEvent({
    actorUserId: access.actor.userId,
    action: "hospital_reporting.export.prepared",
    resourceType: "Hospital",
    resourceId: access.hospital.id,
    metadata: {
      capability: "hospital:report:export",
      generatedAt: generatedAt.toISOString(),
      outcome: "prepared",
      programCount: dataset.programs.length,
    },
  });

  return { buffer, generatedAt };
}

export async function exportGlobalAdminHospitalReportingWorkbook(
  actor: ActorContext | null | undefined,
  input: unknown,
): Promise<{ buffer: Buffer; generatedAt: Date; hospitalCode: string }> {
  const parsed = hospitalReportExportRequestSchema.safeParse(input);
  if (!parsed.success) {
    await recordGlobalReportingAudit({
      actorUserId: actor?.userId,
      capability: GLOBAL_REPORTING_CAPABILITIES.export,
      outcome: "denied",
      reason: "INVALID_REQUEST",
    });
    throw new ValidationError("ข้อมูลคำขอส่งออกรายงานไม่ถูกต้อง");
  }

  let dataset: HospitalReportingDataset;
  let buffer: Buffer;
  const generatedAt = new Date();
  try {
    dataset = await getGlobalAdminHospitalReportingDatasetForExport(actor, parsed.data);
    buffer = await generateHospitalReportWorkbook(dataset, generatedAt);
    await resolveGlobalReportingAccessContext(
      actor,
      GLOBAL_REPORTING_CAPABILITIES.export,
      dataset.hospital.id,
    );
  } catch (error: unknown) {
    await recordGlobalReportingAudit({
      actorUserId: actor?.userId,
      capability: GLOBAL_REPORTING_CAPABILITIES.export,
      hospitalId: parsed.data.hospitalId,
      outcome: "denied",
      reason: globalReportingAuditReasonForError(error),
    });
    throw error;
  }

  await recordGlobalReportingAudit({
    actorUserId: actor?.userId,
    capability: GLOBAL_REPORTING_CAPABILITIES.export,
    hospitalId: dataset.hospital.id,
    outcome: "prepared",
  });

  return { buffer, generatedAt, hospitalCode: dataset.hospital.hospitalCode };
}

export const hospitalReportWorkbookInternals = {
  assignmentCell,
  factCell,
  goalAndProgressDetailRows,
  programContinuationGroups,
  rowsPerProgram,
  setHeaderFacts,
  writeDashboardRows,
  writeServiceRows,
};
