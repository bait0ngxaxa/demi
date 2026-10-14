import { getAppointmentRescheduleHistory } from "@/modules/appointments/services/appointment-reschedule-history-service";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { RescheduleRequestSection } from "../../../../patients/[relationshipId]/appointments/reschedule-request-section";
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

  const rescheduleHistory = await getAppointmentRescheduleHistory(await getProtectedApplicationActor(), relationshipId, appointmentId);

  return (
    <PatientSelfAppointmentDetailView
      rescheduleRequests={<RescheduleRequestSection history={rescheduleHistory} relationshipId={relationshipId} appointmentId={appointmentId} />}
      cancellationRequestNonce={randomUUID()}
      detail={detail}
    />
  );
}
