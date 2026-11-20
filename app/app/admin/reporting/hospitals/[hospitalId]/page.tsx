import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { hospitalReportHospitalIdSchema } from "@/modules/reporting/schemas/hospital-report-schemas";
import { getGlobalHospitalReportPageContext } from "@/modules/reporting/transport/global-reporting-page-context";

import { GlobalHospitalReportView } from "./global-hospital-report-view";

export const metadata: Metadata = { title: "รายงานโรงพยาบาล · รายงานระบบ" };

type SearchParams = Record<string, string | string[] | undefined>;

const REPORT_KEYS = ["cursor", "pageSize", "view", "search", "progress", "status"];

function readSingleParameter(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) notFound();
  return value;
}

export default async function GlobalHospitalReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ hospitalId: string }>;
  searchParams: Promise<SearchParams>;
}): Promise<React.JSX.Element> {
  await connection();
  const [{ hospitalId: hospitalIdInput }, query] = await Promise.all([params, searchParams]);
  if (Object.keys(query).some((key) => !REPORT_KEYS.includes(key))) notFound();

  const parsedHospitalId = hospitalReportHospitalIdSchema.safeParse(hospitalIdInput);
  if (!parsedHospitalId.success) notFound();

  const cursor = readSingleParameter(query.cursor);
  const pageSizeInput = readSingleParameter(query.pageSize);
  const requestedView = readSingleParameter(query.view);
  if (requestedView !== undefined && requestedView !== "overview" && requestedView !== "service") notFound();

  const pageSize = pageSizeInput === undefined ? undefined : Number(pageSizeInput);
  if (pageSizeInput !== undefined && (!Number.isInteger(pageSize) || pageSizeInput.trim() !== String(pageSize))) notFound();

  const context = await getGlobalHospitalReportPageContext({
    hospitalId: parsedHospitalId.data,
    cursor,
    pageSize,
    search: readSingleParameter(query.search),
    progress: readSingleParameter(query.progress),
    status: readSingleParameter(query.status),
  });
  return (
    <GlobalHospitalReportView
      hierarchy={context.hierarchy}
      initialView={requestedView === "service" ? "service" : "overview"}
      page={context.page}
    />
  );
}
