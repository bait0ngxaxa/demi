"use server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";
import type { ServerSearchPageResult } from "@/shared/search/server-search-result";

import {
  searchGlobalReportingHospitals,
  type GlobalReportingHospitalOption,
} from "../services/global-reporting-service";

export type GlobalReportingHospitalSearchActionResult = ServerSearchPageResult<GlobalReportingHospitalOption>;

/** Platform ADMIN: at most ten Hospitals by name, to switch the system report to another Hospital. */
export async function searchGlobalReportingHospitalsAction(value: string): Promise<GlobalReportingHospitalSearchActionResult> {
  try {
    const actor = await getProtectedApplicationActor();
    const items = await searchGlobalReportingHospitals(actor, { value });
    return { status: "OK", items, page: 1, totalPages: 1, hasPreviousPage: false, hasNextPage: false };
  } catch (error: unknown) {
    if (error instanceof ApplicationError && error.code === "VALIDATION") {
      return { status: "ERROR", message: "กรุณาพิมพ์ชื่อโรงพยาบาล (ไม่เกิน 100 ตัวอักษร)" };
    }
    return { status: "ERROR", message: "ไม่สามารถค้นหาโรงพยาบาลได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง" };
  }
}
