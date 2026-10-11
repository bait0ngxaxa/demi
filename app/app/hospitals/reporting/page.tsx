import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { getHospitalReportPageContext } from "@/modules/reporting/transport/hospital-report-page-context";

import { HospitalReportWorkspace } from "./hospital-report-workspace";

export const metadata: Metadata = { title: "รายงานโรงพยาบาล" };

type SearchParams = {
  hospitalId?: string | string[];
  cursor?: string | string[];
  pageSize?: string | string[];
  view?: string | string[];
};

function readSingleParameter(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) notFound();
  return value;
}

export default async function HospitalReportingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<React.JSX.Element> {
  await connection();
  const params = await searchParams;
  if (Object.keys(params).some((key) => !["hospitalId", "cursor", "pageSize", "view"].includes(key))) notFound();
  const requestedHospitalId = readSingleParameter(params.hospitalId);
  const cursor = readSingleParameter(params.cursor);
  const pageSizeRaw = readSingleParameter(params.pageSize);
  const requestedView = readSingleParameter(params.view);

  if (requestedView !== undefined && requestedView !== "overview" && requestedView !== "service") {
    notFound();
  }
  const pageSize = pageSizeRaw === undefined ? undefined : Number(pageSizeRaw);
  if (pageSizeRaw !== undefined && !Number.isInteger(pageSize)) notFound();

  const context = await getHospitalReportPageContext(requestedHospitalId, cursor, pageSize);
  return (
    <HospitalReportWorkspace
      hospitals={context.hospitals}
      initialView={requestedView ?? "overview"}
      page={context.page}
      selectedHospitalId={context.selectedHospitalId}
    />
  );
}
