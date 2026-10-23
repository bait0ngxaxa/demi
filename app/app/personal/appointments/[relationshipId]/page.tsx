import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getPatientSelfAppointmentHistoryPageContext } from "@/modules/patient-self/transport/patient-self-care-page-context";

import { PatientSelfAppointmentHistoryView } from "../../patient-self-record-detail-views";
import { personalAppointmentHubHref } from "../personal-appointment-hub-href";

export const metadata: Metadata = {
  title: "นัดหมาย",
};

type PatientSelfAppointmentHistoryPageProps = {
  params: Promise<{ relationshipId: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

export default async function PatientSelfAppointmentHistoryPage({
  params,
  searchParams,
}: PatientSelfAppointmentHistoryPageProps): Promise<React.JSX.Element> {
  await connection();
  const { relationshipId } = await params;
  const query = await searchParams;
  const requestedPage = Array.isArray(query.page) ? query.page[0] : query.page;
  const history = await getPatientSelfAppointmentHistoryPageContext(
    relationshipId,
    requestedPage,
  );

  // AF-4: ongoing care lives in the hub; a Hospital whose care ended keeps this read-only list (Phase F).
  if (history.relationship.careEndedAt === null) {
    redirect(personalAppointmentHubHref({ subject: "me", hospital: history.relationship.relationshipId }));
  }

  return <PatientSelfAppointmentHistoryView history={history} />;
}
