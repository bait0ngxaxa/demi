import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { listHospitalReportExportGrantHospitals } from "@/modules/reporting/services/hospital-report-access-service";
import {
  getHospitalReportExportPreview,
  type HospitalReportExportPreview,
} from "@/modules/reporting/services/hospital-report-query-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { ExportPreview, PROGRAM_ENTRY_HREF } from "../export-preview";
import { ExportButton } from "../hospital-report-workspace";

export const metadata: Metadata = { title: "ส่งออกรายงานโรงพยาบาล" };

/** Customer decision E1 (ก-15): export-only entry for MEMBER staff holding an OWNER grant. */
export default async function HospitalReportExportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  await connection();
  if (Object.keys(await searchParams).length > 0) notFound();

  let hospitals: Awaited<ReturnType<typeof listHospitalReportExportGrantHospitals>>;
  let previews: HospitalReportExportPreview[];
  try {
    const actor = await getProtectedApplicationActor();
    hospitals = await listHospitalReportExportGrantHospitals(actor);
    previews = await Promise.all(hospitals.map((hospital) => getHospitalReportExportPreview(actor, { hospitalId: hospital.id })));
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }

  if (hospitals.length === 0) redirect("/app");

  return (
    <div className="min-w-0 max-w-3xl space-y-6">
      <PageHeader
        title="ส่งออกรายงานโรงพยาบาล"
        description="เจ้าของโรงพยาบาลให้สิทธิ์คุณดาวน์โหลดไฟล์รายงาน (Excel) ทุกการส่งออกถูกบันทึกไว้ กรุณาใช้และเก็บไฟล์ตามนโยบายข้อมูลของโรงพยาบาล"
      />
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
    </div>
  );
}
