import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { hospitalReportHospitalIdSchema } from "@/modules/reporting/schemas/hospital-report-schemas";
import { getGlobalReportingDirectoryPageContext } from "@/modules/reporting/transport/global-reporting-page-context";
import { HOSPITAL_SEARCH_MAX_LENGTH } from "@/shared/search/hospital-search";

import { GlobalAdminReportingWorkspace } from "./global-admin-reporting-workspace";
import { globalHospitalReportHref, parseHospitalStatusFilter } from "./hospital-status";

export const metadata: Metadata = { title: "รายงานระบบ" };

type SearchParams = Record<string, string | string[] | undefined>;

const DIRECTORY_KEYS = ["q", "hospitalStatus"];
/** The report keys an old `?hospitalId=` link may carry; they move to the Hospital's own page unchanged. */
const LEGACY_REPORT_KEYS = ["cursor", "pageSize", "view", "search", "progress", "status"];

function readSingleParameter(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) notFound();
  return value;
}

export default async function GlobalAdminReportingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<React.JSX.Element> {
  await connection();
  const params = await searchParams;

  const legacyHospitalId = readSingleParameter(params.hospitalId);
  if (legacyHospitalId !== undefined) {
    if (Object.keys(params).some((key) => key !== "hospitalId" && !LEGACY_REPORT_KEYS.includes(key))) notFound();
    const parsedHospitalId = hospitalReportHospitalIdSchema.safeParse(legacyHospitalId);
    if (!parsedHospitalId.success) notFound();
    const carried = new URLSearchParams();
    for (const key of LEGACY_REPORT_KEYS) {
      const value = readSingleParameter(params[key]);
      if (value !== undefined) carried.set(key, value);
    }
    const query = carried.toString();
    redirect(`${globalHospitalReportHref(parsedHospitalId.data)}${query ? `?${query}` : ""}`);
  }

  if (Object.keys(params).some((key) => !DIRECTORY_KEYS.includes(key))) notFound();
  const q = readSingleParameter(params.q);
  if (q !== undefined && q.trim().length > HOSPITAL_SEARCH_MAX_LENGTH) notFound();
  const hospitalStatus = readSingleParameter(params.hospitalStatus);
  if (hospitalStatus !== undefined && parseHospitalStatusFilter(hospitalStatus) === null) notFound();

  const context = await getGlobalReportingDirectoryPageContext();
  return <GlobalAdminReportingWorkspace directory={context.directory} />;
}
