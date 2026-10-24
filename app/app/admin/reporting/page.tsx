import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { hospitalReportHospitalIdSchema } from "@/modules/reporting/schemas/hospital-report-schemas";
import { getGlobalReportingPageContext } from "@/modules/reporting/transport/global-reporting-page-context";

import { GlobalAdminReportingWorkspace } from "./global-admin-reporting-workspace";

export const metadata: Metadata = { title: "รายงานสำหรับผู้ดูแลระบบ" };

type SearchParams = {
  search?: string | string[];
  progress?: string | string[];
  status?: string | string[];
  hospitalId?: string | string[];
  cursor?: string | string[];
  pageSize?: string | string[];
  view?: string | string[];
};

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
  if (Object.keys(params).some((key) => !["hospitalId", "cursor", "pageSize", "view", "search", "progress", "status"].includes(key))) notFound();

  const hospitalIdInput = readSingleParameter(params.hospitalId);
  const cursor = readSingleParameter(params.cursor);
  const pageSizeInput = readSingleParameter(params.pageSize);
  const requestedView = readSingleParameter(params.view);
  if (requestedView !== undefined && requestedView !== "overview" && requestedView !== "service") notFound();

  let hospitalId: string | undefined;
  if (hospitalIdInput !== undefined) {
    const parsedHospitalId = hospitalReportHospitalIdSchema.safeParse(hospitalIdInput);
    if (!parsedHospitalId.success) notFound();
    hospitalId = parsedHospitalId.data;
  }

  const pageSize = pageSizeInput === undefined ? undefined : Number(pageSizeInput);
  if (pageSizeInput !== undefined && (!Number.isInteger(pageSize) || pageSizeInput.trim() !== String(pageSize))) notFound();

  const context = await getGlobalReportingPageContext({ hospitalId, cursor, pageSize, search: readSingleParameter(params.search), progress: readSingleParameter(params.progress), status: readSingleParameter(params.status) });
  return (
    <GlobalAdminReportingWorkspace
      directory={context.directory}
      hierarchy={context.hierarchy}
      initialView={requestedView === "service" ? "service" : "overview"}
      page={context.page}
      selectedHospital={context.selectedHospital}
      selectedHospitalId={context.selectedHospitalId}
    />
  );
}
