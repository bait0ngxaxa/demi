import type { Metadata } from "next";
import { connection } from "next/server";

import { getPatientSelfProgramDetailPageContext } from "@/modules/patient-self/transport/patient-self-care-page-context";

import { PatientSelfProgramDetailView } from "../../../../patient-self-program-detail-view";

export const metadata: Metadata = {
  title: "Program",
};

type PatientSelfProgramPageProps = {
  params: Promise<{ relationshipId: string; programId: string }>;
  searchParams: Promise<{ goalPlanPage?: string | string[]; followupPage?: string | string[] }>;
};

export default async function PatientSelfProgramPage({
  params,
  searchParams,
}: PatientSelfProgramPageProps): Promise<React.JSX.Element> {
  await connection();
  const { relationshipId, programId } = await params;
  const query = await searchParams;
  const detail = await getPatientSelfProgramDetailPageContext(relationshipId, programId, {
    goalPlanPage: Array.isArray(query.goalPlanPage)
      ? query.goalPlanPage[0]
      : query.goalPlanPage,
    followupPage: Array.isArray(query.followupPage)
      ? query.followupPage[0]
      : query.followupPage,
  });

  return <PatientSelfProgramDetailView detail={detail} relationshipId={relationshipId} />;
}
