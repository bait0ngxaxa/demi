import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { listHospitalReportMemberExportHospitals } from "@/modules/reporting/services/hospital-report-access-service";
import {
  getHospitalReportExportPreview,
  getNetworkReportExportPreview,
  type HospitalReportExportPreview,
  type NetworkReportExportPreview,
} from "@/modules/reporting/services/hospital-report-query-service";
import { listNetworkReportExportParents } from "@/modules/reporting/services/network-report-access-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { ExportPreview, PROGRAM_ENTRY_HREF } from "../export-preview";
import { ExportButton } from "../hospital-report-workspace";
import { NetworkExportPanel } from "./network-export-panel";

export const metadata: Metadata = { title: "ส่งออกรายงานโรงพยาบาล" };

type NetworkPreviews = Record<"ACTIVE" | "INCLUDE_ENDED", NetworkReportExportPreview>;

/**
 * Export-only entry. ACTIVE MEMBER staff export their Hospital (Product Owner decision 2026-10-21, no OWNER grant);
 * an ACTIVE OWNER or MEMBER of a network Parent exports the Parent and all or selected network Hospitals
 * (ADR-0025) instead of the Parent's single-Hospital file.
 */
export default async function HospitalReportExportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  await connection();
  if (Object.keys(await searchParams).length > 0) notFound();

  let hospitals: Awaited<ReturnType<typeof listHospitalReportMemberExportHospitals>>;
  let previews: HospitalReportExportPreview[];
  let networks: NetworkPreviews[];
  try {
    const actor = await getProtectedApplicationActor();
    const parents = await listNetworkReportExportParents(actor);
    const parentIds = new Set(parents.map(({ parent }) => parent.id));
    hospitals = (await listHospitalReportMemberExportHospitals(actor)).filter(({ id }) => !parentIds.has(id));
    previews = await Promise.all(hospitals.map((hospital) => getHospitalReportExportPreview(actor, { hospitalId: hospital.id })));
    networks = await Promise.all(parents.map(async ({ parent }) => {
      const [active, includeEnded] = await Promise.all([
        getNetworkReportExportPreview(actor, { parentHospitalId: parent.id }),
        getNetworkReportExportPreview(actor, { parentHospitalId: parent.id, cohort: "INCLUDE_ENDED" }),
      ]);
      return { ACTIVE: active, INCLUDE_ENDED: includeEnded };
    }));
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }

  if (hospitals.length === 0 && networks.length === 0) redirect("/app");

  return (
    <div className="min-w-0 max-w-3xl space-y-6">
      <PageHeader
        title="ส่งออกรายงานโรงพยาบาล"
        description="ดาวน์โหลดไฟล์รายงาน (Excel) ของผู้ป่วยในความดูแล ทุกการส่งออกถูกบันทึกไว้ กรุณาใช้และเก็บไฟล์ตามนโยบายข้อมูลของโรงพยาบาล"
      />
      {networks.length > 0 ? (
        <ul className="space-y-4">
          {networks.map((network) => (
            <li key={network.ACTIVE.parent.id}>
              <NetworkExportPanel previews={network} />
            </li>
          ))}
        </ul>
      ) : null}
      {hospitals.length > 0 ? (
        <ul className="space-y-4">
          {hospitals.map((hospital, index) => (
            <li key={hospital.id}>
              <Panel className="space-y-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="min-w-0 break-words font-semibold text-text">{hospital.name}</p>
                  <ExportButton endpoint="/api/v1/hospital/reporting/export" hospitalId={hospital.id} />
                </div>
                <ExportPreview
                  hospitalName={previews[index].hospital.name}
                  programEntryHref={PROGRAM_ENTRY_HREF}
                  programRows={previews[index].programRows}
                  relationshipsWithoutProgram={previews[index].relationshipsWithoutProgram}
                />
              </Panel>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
