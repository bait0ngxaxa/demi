import type { Metadata } from "next";
import { connection } from "next/server";

import { PageHeader } from "@/components/ui/page-header";
import { getPatientSelfRelationshipNavigationPageContext } from "@/modules/patient-self/transport/patient-self-care-page-context";

import { PatientSelfRelationshipNavigation } from "../patient-self-relationship-navigation";

export const metadata: Metadata = {
  title: "ข้อมูลการดูแล",
};

export default async function PatientSelfCarePage(): Promise<React.JSX.Element> {
  await connection();
  const relationships = await getPatientSelfRelationshipNavigationPageContext();

  return (
    <div className="max-w-5xl">
      <PageHeader
        breadcrumbs={[{ href: "/app/personal", label: "พื้นที่ส่วนตัว" }, { label: "ข้อมูลการดูแล" }]}
        description="เลือกโรงพยาบาลเพื่อดูประวัติการดูแลของคุณในบริบทนั้น"
        title="ข้อมูลการดูแล"
      />
      <PatientSelfRelationshipNavigation
        emptyMessage="เมื่อมีข้อมูลความสัมพันธ์กับโรงพยาบาล รายการประวัติจะปรากฏที่นี่"
        relationships={relationships}
      />
    </div>
  );
}
