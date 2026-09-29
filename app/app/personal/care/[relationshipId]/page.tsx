import type { Metadata } from "next";
import { connection } from "next/server";

import { getPatientSelfCareJourneyPageContext } from "@/modules/patient-self/transport/patient-self-care-page-context";

import { PatientSelfCareJourneyView } from "../../patient-self-care-journey-view";

export const metadata: Metadata = {
  title: "ข้อมูลการดูแล",
};

type PatientSelfCareJourneyPageProps = {
  params: Promise<{ relationshipId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PatientSelfCareJourneyPage({
  params,
  searchParams,
}: PatientSelfCareJourneyPageProps): Promise<React.JSX.Element> {
  await connection();
  const { relationshipId } = await params;
  const query = await searchParams;
  const journey = await getPatientSelfCareJourneyPageContext(relationshipId, {
    screeningPage: Array.isArray(query.screeningPage) ? query.screeningPage[0] : query.screeningPage,
    programPage: Array.isArray(query.programPage) ? query.programPage[0] : query.programPage,
    goalPlanPage: Array.isArray(query.goalPlanPage) ? query.goalPlanPage[0] : query.goalPlanPage,
    followupPage: Array.isArray(query.followupPage) ? query.followupPage[0] : query.followupPage,
  });

  return <PatientSelfCareJourneyView journey={journey} />;
}
