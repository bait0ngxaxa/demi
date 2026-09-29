import type { Metadata } from "next";
import { connection } from "next/server";

import { getPatientSelfProgramDetailPageContext } from "@/modules/patient-self/transport/patient-self-care-page-context";

import { PatientSelfProgramDetailView } from "../../../../patient-self-program-detail-view";

export const metadata: Metadata = {
  title: "Program",
};

type PatientSelfProgramPageProps = {
  params: Promise<{ relationshipId: string; programId: string }>;
};

export default async function PatientSelfProgramPage({
  params,
}: PatientSelfProgramPageProps): Promise<React.JSX.Element> {
  await connection();
  const { relationshipId, programId } = await params;
  const detail = await getPatientSelfProgramDetailPageContext(relationshipId, programId);

  return <PatientSelfProgramDetailView detail={detail} relationshipId={relationshipId} />;
}
