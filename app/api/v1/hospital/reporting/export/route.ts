import { NextResponse } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { exportHospitalReportingWorkbook } from "@/modules/reporting/services/hospital-report-workbook-service";
import { HospitalReportExportLimitError } from "@/modules/reporting/services/hospital-report-query-service";
import { hospitalReportExportRequestSchema } from "@/modules/reporting/schemas/hospital-report-schemas";
import {
  ApplicationError,
  UnauthenticatedError,
} from "@/shared/errors/application-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function errorResponse(error: unknown): NextResponse {
  if (error instanceof UnauthenticatedError) {
    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อนส่งออกรายงาน" }, { status: 401 });
  }
  if (error instanceof HospitalReportExportLimitError) {
    return NextResponse.json({ error: error.message }, { status: 413 });
  }
  if (error instanceof ApplicationError && error.code === "NOT_FOUND") {
    return NextResponse.json({ error: "ไม่พบรายงานหรือไม่มีสิทธิ์เข้าถึง" }, { status: 404 });
  }
  if (error instanceof ApplicationError && error.code === "FORBIDDEN") {
    return NextResponse.json({ error: "ไม่มีสิทธิ์ส่งออกรายงานของโรงพยาบาลนี้" }, { status: 403 });
  }
  if (error instanceof ApplicationError && error.code === "VALIDATION") {
    return NextResponse.json({ error: "ข้อมูลคำขอส่งออกรายงานไม่ถูกต้อง" }, { status: 400 });
  }
  return NextResponse.json({ error: "ระบบส่งออกรายงานไม่พร้อมใช้งาน กรุณาลองอีกครั้ง" }, { status: 503 });
}

function safeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || "hospital";
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const queryEntries = [...url.searchParams.entries()];
  if (
    queryEntries.length !== 1 ||
    queryEntries[0]?.[0] !== "hospitalId" ||
    url.searchParams.getAll("hospitalId").length !== 1
  ) {
    return NextResponse.json({ error: "ข้อมูลคำขอส่งออกรายงานไม่ถูกต้อง" }, { status: 400 });
  }

  const parsed = hospitalReportExportRequestSchema.safeParse({
    hospitalId: url.searchParams.get("hospitalId"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "ข้อมูลคำขอส่งออกรายงานไม่ถูกต้อง" }, { status: 400 });
  }

  try {
    const actor = await getProtectedApplicationActor();
    const { buffer, generatedAt } = await exportHospitalReportingWorkbook(actor, parsed.data);
    const filename = `demi-hospital-report-${safeFilenamePart(parsed.data.hospitalId)}-${generatedAt.toISOString().slice(0, 10)}.xlsx`;
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.byteLength),
        "Content-Type": XLSX_CONTENT_TYPE,
        "X-Report-Generated-At": generatedAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
