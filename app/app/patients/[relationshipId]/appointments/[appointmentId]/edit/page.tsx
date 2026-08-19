import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getAppointmentRescheduleContext } from "@/modules/appointments/services/appointment-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { AppointmentForm } from "../../new/appointment-form";

export const metadata: Metadata = {
  title: "เลื่อนนัดหมาย",
};

type RescheduleAppointmentPageProps = {
  params: Promise<{ relationshipId: string; appointmentId: string }>;
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
  params,
}: RescheduleAppointmentPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId, appointmentId } = await params;
  let context;

  try {
    context = await getAppointmentRescheduleContext(actor, relationshipId, appointmentId);
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
      appointment={{
        appointmentId: context.appointment.appointmentId,
        durationMinutes: context.appointment.durationMinutes,
        locationDetail: context.appointment.locationDetail,
        locationType: context.appointment.locationType,
        note: context.appointment.note,
        responsibleUserId: context.appointment.responsibleUserId,
        scheduledAt: context.appointment.scheduledAt.toISOString(),
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

