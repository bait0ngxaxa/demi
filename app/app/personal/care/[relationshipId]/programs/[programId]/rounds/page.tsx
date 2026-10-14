import type { Metadata } from "next";
import { connection } from "next/server";

import { getPatientSelfProgramRoundsPageContext } from "@/modules/patient-self/transport/patient-self-care-page-context";

import { PatientSelfProgramRoundsView } from "../../../../../patient-self-program-rounds-view";

export const metadata: Metadata = {
  title: "ประวัติการรับบริการรายครั้ง",
};

type PatientSelfProgramRoundsPageProps = {
  params: Promise<{ relationshipId: string; programId: string }>;
};

export default async function PatientSelfProgramRoundsPage({
  params,
}: PatientSelfProgramRoundsPageProps): Promise<React.JSX.Element> {
  await connection();
  const { relationshipId, programId } = await params;
  const rounds = await getPatientSelfProgramRoundsPageContext(relationshipId, programId);

  return (
    <PatientSelfProgramRoundsView programId={programId} relationshipId={relationshipId} rounds={rounds} />
  );
}
