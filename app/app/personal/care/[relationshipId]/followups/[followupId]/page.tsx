import type { Metadata } from "next";
import { connection } from "next/server";

import { getPatientSelfFollowupDetailPageContext } from "@/modules/patient-self/transport/patient-self-care-page-context";

import { PatientSelfFollowupDetailView } from "../../../../patient-self-record-detail-views";

export const metadata: Metadata = {
  title: "รายละเอียดการติดตาม",
};

type PatientSelfFollowupPageProps = {
  params: Promise<{ relationshipId: string; followupId: string }>;
};

export default async function PatientSelfFollowupPage({
  params,
}: PatientSelfFollowupPageProps): Promise<React.JSX.Element> {
  await connection();
  const { relationshipId, followupId } = await params;
  const detail = await getPatientSelfFollowupDetailPageContext(relationshipId, followupId);

  return <PatientSelfFollowupDetailView detail={detail} />;
}
