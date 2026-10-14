import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getAppointmentRescheduleHistory } from "@/modules/appointments/services/appointment-reschedule-history-service";
import { getAppointmentRescheduleContext, type AppointmentRescheduleContext } from "@/modules/appointments/services/appointment-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { AppointmentForm } from "../../new/appointment-form";

export const metadata: Metadata = {
  title: "เลื่อนนัดหมาย",
};

type RescheduleAppointmentPageProps = {
  params: Promise<{ relationshipId: string; appointmentId: string }>;
  searchParams: Promise<{ requestId?: string }>;
};

async function resolveActor() {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login");
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }
}

export default async function RescheduleAppointmentPage({
  params, searchParams,
}: RescheduleAppointmentPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId, appointmentId } = await params;
  let context: AppointmentRescheduleContext;
  let request;
  const requestId = (await searchParams).requestId;

  try {
    context = await getAppointmentRescheduleContext(actor, relationshipId, appointmentId);
    if (requestId) {
      const history = await getAppointmentRescheduleHistory(actor, relationshipId, appointmentId);
      if (!history.canReview) throw new ForbiddenError();
      request = history.requests.find((row) => row.id === requestId && row.status === "PENDING" && row.sourceAppointmentUpdatedAt.getTime() === context.appointment.updatedAt.getTime());
      if (!request) throw new NotFoundError();
    }
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  if (context.appointment.status !== "SCHEDULED") {
    redirect(
      `/app/patients/${encodeURIComponent(relationshipId)}/appointments/${encodeURIComponent(appointmentId)}`,
    );
  }

  return (
    <AppointmentForm
      rescheduleRequestId={request?.id}
      reschedulePreferredDates={request?.preferredDatetimes.map((date) => date.toISOString())}
      rescheduleReason={request?.reason}
      homeVisitOnly={context.homeVisitOnly}
      appointment={{
        appointmentId: context.appointment.appointmentId,
        durationMinutes: context.appointment.durationMinutes,
        locationDetail: context.appointment.locationDetail,
        locationType: context.appointment.locationType,
        note: context.appointment.note,
        responsibleUserId: context.appointment.responsibleUserId,
        scheduledAt: request?.preferredDatetimes[0]?.toISOString() ?? context.appointment.scheduledAt.toISOString(),
        type: context.appointment.type,
        updatedAt: context.appointment.updatedAt.toISOString(),
      }}
      mode="reschedule"
      patient={context.patient}
      relationshipId={relationshipId}
      responsibleMembers={context.responsibleMembers}
    />
  );
}

