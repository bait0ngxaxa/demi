import type { Metadata } from "next";
import { connection } from "next/server";

import { PageHeader } from "@/components/ui/page-header";
import { getPatientSelfRelationshipNavigationPageContext, getPatientServiceProgressPageContext } from "@/modules/patient-self/transport/patient-self-care-page-context";
import { LINE_WEB_NAVIGATION_PATHS } from "@/modules/line/domain/line-navigation-intents";
import { isPatientAccessUnavailable } from "@/modules/patient-self/transport/patient-access-unavailable";

import { PatientAccessUnavailableState } from "../patient-access-unavailable-state";
import { PatientSelfRelationshipNavigation } from "../patient-self-relationship-navigation";
import { PatientServiceProgress } from "../patient-service-progress";

export const metadata: Metadata = {
  title: "ติดตาม",
};

export default async function PatientSelfCarePage(): Promise<React.JSX.Element> {
  await connection();
  const [relationships, services] = await Promise.all([
    getPatientSelfRelationshipNavigationPageContext(LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_CARE),
    getPatientServiceProgressPageContext(LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_CARE),
  ]);

  if (isPatientAccessUnavailable(relationships) || isPatientAccessUnavailable(services)) {
    return <PatientAccessUnavailableState title="ติดตาม" />;
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        breadcrumbs={[{ href: "/app/personal", label: "พื้นที่ส่วนตัว" }, { label: "ติดตาม" }]}
        description="ดูความคืบหน้าของบริการและบันทึกรายการที่คุณทำเองได้"
        title="ติดตาม"
      />
      <PatientServiceProgress services={services} />
      <section aria-labelledby="care-history-heading" className="mt-8">
        <h2 className="text-xl font-semibold text-text" id="care-history-heading">ประวัติการดูแล</h2>
        <PatientSelfRelationshipNavigation
          area="care"
          emptyMessage="เมื่อมีข้อมูลความสัมพันธ์กับโรงพยาบาล รายการประวัติจะปรากฏที่นี่"
          relationships={relationships}
        />
      </section>
    </div>
  );
}
