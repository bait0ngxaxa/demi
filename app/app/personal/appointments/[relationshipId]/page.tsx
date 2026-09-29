import type { Metadata } from "next";
import { connection } from "next/server";

import { getPatientSelfAppointmentHistoryPageContext } from "@/modules/patient-self/transport/patient-self-care-page-context";

import { PatientSelfAppointmentHistoryView } from "../../patient-self-record-detail-views";

export const metadata: Metadata = {
  title: "นัดหมาย",
};

type PatientSelfAppointmentHistoryPageProps = {
  params: Promise<{ relationshipId: string }>;
};

export default async function PatientSelfAppointmentHistoryPage({
  params,
}: PatientSelfAppointmentHistoryPageProps): Promise<React.JSX.Element> {
  await connection();
  const { relationshipId } = await params;
  const history = await getPatientSelfAppointmentHistoryPageContext(relationshipId);

  return <PatientSelfAppointmentHistoryView history={history} />;
}
