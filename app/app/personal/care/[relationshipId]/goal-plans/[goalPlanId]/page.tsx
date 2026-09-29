import type { Metadata } from "next";
import { connection } from "next/server";

import { getPatientSelfGoalPlanDetailPageContext } from "@/modules/patient-self/transport/patient-self-care-page-context";

import { PatientSelfGoalPlanDetailView } from "../../../../patient-self-record-detail-views";

export const metadata: Metadata = {
  title: "รายละเอียดแผนเป้าหมาย",
};

type PatientSelfGoalPlanPageProps = {
  params: Promise<{ relationshipId: string; goalPlanId: string }>;
};

export default async function PatientSelfGoalPlanPage({
  params,
}: PatientSelfGoalPlanPageProps): Promise<React.JSX.Element> {
  await connection();
  const { relationshipId, goalPlanId } = await params;
  const detail = await getPatientSelfGoalPlanDetailPageContext(relationshipId, goalPlanId);

  return <PatientSelfGoalPlanDetailView detail={detail} />;
}
