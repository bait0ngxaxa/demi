import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { getHospitalReportPageContext } from "@/modules/reporting/transport/hospital-report-page-context";

import { NetworkReportWorkspace } from "./network-report-workspace";

import { HospitalReportWorkspace } from "./hospital-report-workspace";
import { ParentChildHospitalReportWorkspace } from "./parent-child-hospital-report-workspace";

export const metadata: Metadata = { title: "รายงานโรงพยาบาล" };

type SearchParams = {
  scope?: string | string[];
  search?: string | string[];
  progress?: string | string[];
  status?: string | string[];
  hospitalId?: string | string[];
  cursor?: string | string[];
  pageSize?: string | string[];
  target?: string | string[];
  view?: string | string[];
  cohort?: string | string[];
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
  if (Object.keys(params).some((key) => !["hospitalId", "cursor", "pageSize", "target", "view", "cohort", "scope", "search", "progress", "status"].includes(key))) notFound();
  const scope = readSingleParameter(params.scope);
  if (scope !== undefined && scope !== "network") notFound();
  if (scope === "network") {
    if (Object.keys(params).some((key) => !["scope", "target"].includes(key))) notFound();
    if (params.target === undefined) return <NetworkReportWorkspace />;
  }
  const filters = { search: readSingleParameter(params.search), progress: readSingleParameter(params.progress), status: readSingleParameter(params.status) };
  const requestedHospitalId = readSingleParameter(params.hospitalId);
  const cursor = readSingleParameter(params.cursor);
  const pageSizeRaw = readSingleParameter(params.pageSize);
  const requestedTarget = readSingleParameter(params.target);
  const requestedView = readSingleParameter(params.view);
  // Phase F: only the opt-in value is a valid parameter; the ACTIVE cohort is the default.
  const requestedCohort = readSingleParameter(params.cohort);
  if (requestedCohort !== undefined && requestedCohort !== "INCLUDE_ENDED") notFound();

  if (requestedView !== undefined && requestedView !== "overview" && requestedView !== "service") {
    notFound();
  }
  const pageSize = pageSizeRaw === undefined ? undefined : Number(pageSizeRaw);
  if (pageSizeRaw !== undefined && !Number.isInteger(pageSize)) notFound();

  const context = await getHospitalReportPageContext(requestedHospitalId, cursor, pageSize, requestedTarget, requestedCohort, filters, scope === "network");
  if (context.mode === "PARENT_CHILD") {
    return (
      <ParentChildHospitalReportWorkspace
        hospitals={context.hospitals}
        parentGroups={context.parentGroups}
        report={context.report}
        selection={context.selection}
      />
    );
  }

  return (
    <HospitalReportWorkspace
      hospitals={context.hospitals}
      hierarchy={context.hierarchy}
      initialView={requestedView ?? "overview"}
      page={context.page}
      parentGroups={context.parentGroups}
      selection={context.selection}
      selectedHospitalId={context.selectedHospitalId}
    />
  );
}
