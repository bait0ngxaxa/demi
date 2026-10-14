import type { Metadata } from "next";
import { connection } from "next/server";

import { getPatientSelfCareJourneyPageContext } from "@/modules/patient-self/transport/patient-self-care-page-context";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { PatientHealthHistorySection } from "../../../patients/[relationshipId]/patient-health-history-section";
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

  return <PatientSelfCareJourneyView journey={journey} healthHistory={<PatientHealthHistorySection actor={await getProtectedApplicationActor()} relationshipId={relationshipId} />} />;
}
