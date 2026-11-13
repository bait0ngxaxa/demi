import ExcelJS from "exceljs";
import { PatientProgramStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type {
  HospitalReportProgramRow,
  HospitalReportingSummary,
  NetworkReportingDataset,
  NetworkReportingSection,
} from "../projections/hospital-report-projection";
import { generateHospitalReportWorkbook, generateNetworkReportWorkbook } from "./hospital-report-workbook-service";

const DASHBOARD = "Dashboard ภาพรวม";
const SERVICE = "รายงานการจัดบริการ";
const SUMMARY = "สรุปรายหน่วยบริการ";

function programId(index: number): string {
  return `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`;
}

function program(index: number, givenName: string, followupCount = 0): HospitalReportProgramRow {
  const followups = Array.from({ length: followupCount }, (_, followupIndex) => ({
    id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index * 100 + followupIndex).padStart(12, "0")}`,
    roundNumber: followupIndex + 1,
    recordedAt: "2026-09-01T05:00:00.000Z",
    serviceDate: null,
    planAdjusted: null,
    hasObstacle: null,
    achievement: null,
    measurements: {
      bloodSugar: { state: "RECORDED" as const, value: followupIndex + 100 },
      weight: { state: "NOT_RECORDED" as const },
      waistCircumference: { state: "NOT_RECORDED" as const },
      systolicBloodPressure: { state: "NOT_RECORDED" as const },
      diastolicBloodPressure: { state: "NOT_RECORDED" as const },
    },
    activityProgress: [],
  }));
  return {
    rounds: [],
    extraRoundsCompleted: 0,
    patientProgramId: programId(index),
    patientHospitalRelationshipId: `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`,
    patient: {
      displayName: `${givenName} ทดสอบ`,
      givenName,
      familyName: "ทดสอบ",
      hospitalNumber: { state: "RECORDED", value: `HN-${index}` },
    },
    currentRelationshipOsmAssignment: { state: "MISSING" },
    lifecycle: { status: PatientProgramStatus.ACTIVE, startedAt: "2026-08-17T05:00:00.000Z", completedAt: { state: "NOT_RECORDED" } },
    baseline: { state: "MISSING" },
    serviceOne: {
      routine: { state: "MISSING" },
      floatingChart: { state: "MISSING" },
      dreamCard: { state: "MISSING" },
      confidence: { state: "MISSING" },
    },
    goalPlans: { totalCount: 0, hasMore: false, items: [] },
    followups: { totalCount: followups.length, items: followups, hasMore: false },
    finalAssessment: { state: "MISSING" },
    roundVitals: { round1: { state: "MISSING" }, round2: { state: "MISSING" } },
    latestHeightCm: { state: "NOT_RECORDED" },
    bmi: { baseline: { state: "NOT_RECORDED" }, after: { state: "NOT_RECORDED" } },
    screening: { pam: { state: "MISSING" }, proms: { state: "MISSING" } },
    illnessDuration: { state: "NOT_RECORDED" },
    weeklyExercise: { before: { state: "NOT_RECORDED" }, after: { state: "NOT_RECORDED" } },
    unavailable: { outcome: "SOURCE_MISSING" },
  };
}

function counts(relationships: number, active: number, completed: number, withoutProgram: number): HospitalReportingSummary {
  return {
    patientHospitalRelationships: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: relationships },
    relationshipsWithoutProgram: { grain: "PATIENT_HOSPITAL_RELATIONSHIP", value: withoutProgram },
    programs: { grain: "PATIENT_PROGRAM", total: active + completed, active, completed },
  };
}

const parentSection: NetworkReportingSection = {
  hospital: { id: "11111111-1111-4111-8111-000000000001", hospitalCode: "P-001", name: "โรงพยาบาลแม่ข่าย", kind: "PARENT" },
  counts: counts(3, 2, 0, 1),
  // Five Follow-ups: the first Program spans two rows on both sheets.
  programs: [program(1, "แม่หนึ่ง", 5), program(2, "แม่สอง")],
};
const childSection: NetworkReportingSection = {
  hospital: { id: "11111111-1111-4111-8111-000000000002", hospitalCode: "C-002", name: "รพ.สต.ลูกข่าย ก", kind: "CHILD" },
  counts: counts(1, 1, 0, 0),
  programs: [program(3, "ลูกหนึ่ง")],
};

function networkDataset(): NetworkReportingDataset {
  return {
    parent: { id: parentSection.hospital.id, hospitalCode: "P-001", name: "โรงพยาบาลแม่ข่าย" },
    cohort: "ACTIVE",
    counts: counts(4, 3, 0, 1),
    hospitals: [parentSection, childSection],
  };
}

async function load(bytes: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
  return workbook;
}

function sheet(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const found = workbook.getWorksheet(name);
  if (!found) throw new Error(`Missing worksheet ${name}`);
  return found;
}

describe("ADR-0025 network report workbook", () => {
  it("adds the summary sheet after the two template sheets", async () => {
    const workbook = await load(await generateNetworkReportWorkbook(networkDataset()));

    expect(workbook.worksheets.map(({ name }) => name)).toEqual([DASHBOARD, SERVICE, SUMMARY]);
  });

  it("appends หน่วยบริการ after the round report columns without moving any existing column", async () => {
    const dataset = networkDataset();
    const network = await load(await generateNetworkReportWorkbook(dataset));
    const single = await load(await generateHospitalReportWorkbook({
      hospital: dataset.parent,
      cohort: dataset.cohort,
      counts: dataset.counts,
      programs: dataset.hospitals.flatMap(({ programs }) => programs),
    }));

    for (const [name, lastExistingColumn] of [[DASHBOARD, 52], [SERVICE, 74]] as const) {
      const networkSheet = sheet(network, name);
      const singleSheet = sheet(single, name);
      expect(singleSheet.columnCount).toBe(lastExistingColumn);
      expect(networkSheet.columnCount).toBe(lastExistingColumn + 1);
      expect(networkSheet.getCell(8, lastExistingColumn + 1).value).toBe("หน่วยบริการ");
      expect(networkSheet.getCell(8, lastExistingColumn + 1).font).toEqual(networkSheet.getCell(8, lastExistingColumn).font);
      // Header rows differ only in the Hospital label; every data and column header cell is unchanged.
      for (let row = 5; row <= 12; row += 1) {
        for (let column = 1; column <= lastExistingColumn; column += 1) {
          expect(networkSheet.getCell(row, column).value, `${name} R${row}C${column}`).toEqual(singleSheet.getCell(row, column).value);
        }
      }
    }
  });

  it("groups rows by Hospital in dataset order with continuous numbering and labels every row", async () => {
    const workbook = await load(await generateNetworkReportWorkbook(networkDataset()));

    for (const [name, unitColumn] of [[DASHBOARD, "BA"], [SERVICE, "BW"]] as const) {
      const target = sheet(workbook, name);
      expect([9, 10, 11, 12].map((row) => target.getCell(`B${row}`).value)).toEqual(["แม่หนึ่ง", "แม่หนึ่ง", "แม่สอง", "ลูกหนึ่ง"]);
      expect([9, 10, 11, 12].map((row) => target.getCell(`A${row}`).value)).toEqual([1, "", 2, 3]);
      expect([9, 10, 11, 12].map((row) => target.getCell(`${unitColumn}${row}`).value)).toEqual([
        "โรงพยาบาลแม่ข่าย (P-001)",
        "โรงพยาบาลแม่ข่าย (P-001)",
        "โรงพยาบาลแม่ข่าย (P-001)",
        "รพ.สต.ลูกข่าย ก (C-002)",
      ]);
      expect(target.getCell(`${unitColumn}13`).value).toBeNull();
    }
  });

  it("labels the header with the Parent and network size and sums the counts", async () => {
    const workbook = await load(await generateNetworkReportWorkbook(networkDataset()));
    const dashboard = sheet(workbook, DASHBOARD);
    const service = sheet(workbook, SERVICE);

    expect(dashboard.getCell("A1").value).toBe("โรงพยาบาล: โรงพยาบาลแม่ข่าย และเครือข่าย (2 แห่ง)");
    expect(service.getCell("A2").value).toBe("โรงพยาบาล: โรงพยาบาลแม่ข่าย และเครือข่าย (2 แห่ง)");
    expect(dashboard.getCell("B2").value).toBe(4);
    expect(dashboard.getCell("F2").value).toBe(3);
    expect(dashboard.getCell("B3").value).toBe(1);
    expect(dashboard.getCell("D2").value ?? null).toBeNull();
    expect(service.getCell("B3").value).toBe(4);
    expect(service.getCell("F4").value).toBe("3 / 0");
  });

  it("writes one count-only summary row per Hospital and a total row", async () => {
    const workbook = await load(await generateNetworkReportWorkbook(networkDataset()));
    const summary = sheet(workbook, SUMMARY);
    const rows = [1, 2, 3, 4].map((row) => (summary.getRow(row).values as unknown[]).slice(1));

    expect(rows).toEqual([
      ["หน่วยบริการ", "รหัส", "ประเภท", "จำนวนเคส", "Program ทั้งหมด", "ACTIVE", "COMPLETED", "ความสัมพันธ์ที่ยังไม่มี Program"],
      ["โรงพยาบาลแม่ข่าย", "P-001", "แม่ข่าย", 3, 2, 2, 0, 1],
      ["รพ.สต.ลูกข่าย ก", "C-002", "ลูกข่าย", 1, 1, 1, 0, 0],
      ["รวม", "", "", 4, 3, 3, 0, 1],
    ]);
    expect(summary.rowCount).toBe(4);
    expect(JSON.stringify(rows)).not.toContain("แม่หนึ่ง");
  });
});
