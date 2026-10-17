import "server-only";

import type { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
} from "@/shared/errors/application-error";

import { HOSPITAL_NETWORK_CHILD_REPORT_CAPABILITIES } from "../policies/hospital-network-child-report-policy";
import type { ParentChildHospitalReportingProjection } from "../projections/hospital-report-projection";
import { parentChildSummaryFields } from "../projections/parent-child-summary-fields";
import { parentChildHospitalReportRequestSchema } from "../schemas/hospital-report-schemas";
import { getParentChildHospitalReportingSummaryForExport } from "./hospital-report-query-service";
import { resolveParentChildHospitalReportAccessContext } from "./parent-child-hospital-report-access-service";
import {
  parentChildHospitalReportingAuditReasonForError,
  recordParentChildHospitalReportingAudit,
} from "./parent-child-hospital-report-audit-service";

const SHEET_NAME = "สรุปรายลูกข่าย";
const grainLabels = {
  PATIENT_HOSPITAL_RELATIONSHIP: "ความสัมพันธ์ผู้ป่วยกับโรงพยาบาล",
  PATIENT_PROGRAM: "Program",
} as const;

function toBangkokExcelDate(value: Date): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    calendar: "gregory",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: string): number => {
    const match = parts.find((item) => item.type === type);
    if (!match) throw new Error("Report generation time could not be formatted");
    return Number(match.value);
  };

  return new Date(Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
    value.getUTCMilliseconds(),
  ));
}

/** RPT-32 workbook: Parent/Child names, generation time and the nine summary values only — no IDs or Patient data. */
export async function generateParentChildHospitalReportWorkbook(
  summary: ParentChildHospitalReportingProjection,
  generatedAt: Date,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DEMI";
  workbook.lastModifiedBy = "DEMI";
  workbook.created = generatedAt;
  workbook.modified = generatedAt;

  const sheet = workbook.addWorksheet(SHEET_NAME);
  sheet.columns = [{ width: 44 }, { width: 44 }, { width: 34 }];
  sheet.addRow(["รายงานสรุปโรงพยาบาลลูกข่าย (ดาวน์โหลดตามเขต)"]).font = { bold: true, size: 14 };
  sheet.addRow(["โรงพยาบาลแม่ข่าย", summary.parent.name]);
  sheet.addRow(["โรงพยาบาลลูกข่าย (เขตความรับผิดชอบ)", summary.hospital.name]);
  const generatedRow = sheet.addRow(["เวลาที่สร้างไฟล์ (เวลาไทย)", toBangkokExcelDate(generatedAt)]);
  generatedRow.getCell(2).numFmt = "dd/mm/yyyy hh:mm";
  sheet.addRow(["ชุดข้อมูล", "ไม่รวมผู้ที่สิ้นสุดการดูแลกับโรงพยาบาลแล้ว"]);
  sheet.addRow([]);
  sheet.addRow(["รายการ", "จำนวน", "หน่วยนับ"]).font = { bold: true };
  for (const field of parentChildSummaryFields(summary.content)) {
    sheet.addRow([field.label, field.value, grainLabels[field.grain]]);
  }
  sheet.addRow([]);
  sheet.addRow(["หมายเหตุ: ค่าทั้งหมดเป็นจำนวนรวมของโรงพยาบาลลูกข่ายที่เลือก ไม่มีข้อมูลระบุตัวผู้ป่วย"]);
  sheet.addRow(["ขั้นตอนบริการนับจำนวน Program ที่มีบันทึก ไม่ได้ยืนยันว่าบริการเสร็จสิ้นหรือเกิดผลสำเร็จ"]);
  sheet.addRow(["เวลาที่สร้างไฟล์เป็นเวลาไทย ไม่ใช่เวลาอ้างอิงของข้อมูล"]);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * ADR-0013 RPT-32: the active Parent OWNER downloads one exact active direct Child's nine-value summary.
 * Authority is resolved inside the read snapshot, re-checked after the file is built, and every outcome is audited.
 */
export async function exportParentChildHospitalReportWorkbook(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: { database?: PrismaClient } = {},
): Promise<{ buffer: Buffer; generatedAt: Date; summary: ParentChildHospitalReportingProjection }> {
  const parsed = parentChildHospitalReportRequestSchema.safeParse(input);
  const database = dependencies.database ?? getPrisma();
  const generatedAt = new Date();
  let summary: ParentChildHospitalReportingProjection;
  let buffer: Buffer;
  try {
    if (!parsed.success) throw new NotFoundError();
    summary = await getParentChildHospitalReportingSummaryForExport(actor, parsed.data, { database });
    buffer = await generateParentChildHospitalReportWorkbook(summary, generatedAt);
    await resolveParentChildHospitalReportAccessContext(
      actor,
      parsed.data.parentHospitalId,
      parsed.data.hospitalId,
      database,
      HOSPITAL_NETWORK_CHILD_REPORT_CAPABILITIES.export,
    );
  } catch (error: unknown) {
    const denied = error instanceof ForbiddenError || error instanceof NotFoundError;
    try {
      await recordParentChildHospitalReportingAudit({
        actor,
        ...(parsed.success
          ? { parentHospitalId: parsed.data.parentHospitalId, hospitalId: parsed.data.hospitalId }
          : {}),
        operation: "export",
        outcome: denied ? "denied" : "failed",
        reason: parentChildHospitalReportingAuditReasonForError(error),
      }, database);
    } catch {
      throw new InfrastructureError("Parent-to-Child Hospital report export could not be prepared");
    }

    if (denied || error instanceof InfrastructureError) throw error;
    throw new InfrastructureError("Parent-to-Child Hospital report export could not be prepared");
  }

  try {
    await recordParentChildHospitalReportingAudit({
      actor,
      parentHospitalId: summary.parent.id,
      hospitalId: summary.hospital.id,
      operation: "export",
      outcome: "prepared",
    }, database);
  } catch {
    // No audit, no file: an unaudited disclosure must not reach the browser.
    throw new InfrastructureError("Parent-to-Child Hospital report export could not be prepared");
  }

  return { buffer, generatedAt, summary };
}
