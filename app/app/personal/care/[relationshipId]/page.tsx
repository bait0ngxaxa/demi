import type { Metadata } from "next";
import { connection } from "next/server";

import { getPatientSelfCareJourneyPageContext } from "@/modules/patient-self/transport/patient-self-care-page-context";

import { PatientSelfCareJourneyView } from "../../patient-self-care-journey-view";

export const metadata: Metadata = {
  title: "ข้อมูลการดูแล",
};

type PatientSelfCareJourneyPageProps = {
  params: Promise<{ relationshipId: string }>;
};

export default async function PatientSelfCareJourneyPage({
  params,
}: PatientSelfCareJourneyPageProps): Promise<React.JSX.Element> {
  await connection();
  const { relationshipId } = await params;
  const journey = await getPatientSelfCareJourneyPageContext(relationshipId);

  return <PatientSelfCareJourneyView journey={journey} />;
}
