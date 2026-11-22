import { getAppointmentRescheduleHistory } from "@/modules/appointments/services/appointment-reschedule-history-service";
import { getRequestApplicationActor } from "@/modules/auth/services/request-application-actor";
import type { Metadata } from "next";
import { connection } from "next/server";
import { randomUUID } from "node:crypto";

import { getPatientSelfAppointmentDetailPageContext } from "@/modules/patient-self/transport/patient-self-care-page-context";

import { PatientSelfAppointmentDetailView } from "../../../patient-self-record-detail-views";

export const metadata: Metadata = {
  title: "รายละเอียดนัดหมาย",
};

type PatientSelfAppointmentDetailPageProps = {
  params: Promise<{ relationshipId: string; appointmentId: string }>;
};

export default async function PatientSelfAppointmentDetailPage({
  params,
}: PatientSelfAppointmentDetailPageProps): Promise<React.JSX.Element> {
  await connection();
  const { relationshipId, appointmentId } = await params;
  const detail = await getPatientSelfAppointmentDetailPageContext(
    relationshipId,
    appointmentId,
  );

  const rescheduleHistory = await getAppointmentRescheduleHistory(await getRequestApplicationActor(), relationshipId, appointmentId);

  return (
    <PatientSelfAppointmentDetailView
      cancellationRequestNonce={randomUUID()}
      detail={detail}
      rescheduleHistory={rescheduleHistory}
      rescheduleNonce={randomUUID()}
    />
  );
}
