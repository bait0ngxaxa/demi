import type { Metadata } from "next";
import { connection } from "next/server";

import { PageHeader } from "@/components/ui/page-header";
import { getPatientSelfRelationshipNavigationPageContext } from "@/modules/patient-self/transport/patient-self-care-page-context";
import { LINE_WEB_NAVIGATION_PATHS } from "@/modules/line/domain/line-navigation-intents";
import { isPatientAccessUnavailable } from "@/modules/patient-self/transport/patient-access-unavailable";

import { PatientAccessUnavailableState } from "../patient-access-unavailable-state";
import { PatientSelfRelationshipNavigation } from "../patient-self-relationship-navigation";

export const metadata: Metadata = {
  title: "นัดหมาย",
};

export default async function PatientSelfAppointmentsPage(): Promise<React.JSX.Element> {
  await connection();
  const relationships = await getPatientSelfRelationshipNavigationPageContext(
    LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_APPOINTMENTS,
  );

  if (isPatientAccessUnavailable(relationships)) {
    return <PatientAccessUnavailableState title="นัดหมาย" />;
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        breadcrumbs={[{ href: "/app/personal", label: "พื้นที่ส่วนตัว" }, { label: "นัดหมาย" }]}
        description="เลือกโรงพยาบาลเพื่อดูรายการนัดหมายในบริบทนั้น"
        title="นัดหมาย"
      />
      <PatientSelfRelationshipNavigation
        area="appointments"
        emptyMessage="เมื่อมีข้อมูลความสัมพันธ์กับโรงพยาบาล รายการนัดหมายจะปรากฏที่นี่"
        relationships={relationships}
      />
    </div>
  );
}
