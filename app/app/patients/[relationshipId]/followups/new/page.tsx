import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getFollowupCreateContext } from "@/modules/followups/services/followup-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { FollowupForm } from "./followup-form";

export const metadata: Metadata = {
  title: "บันทึก Follow-up",
};

type NewFollowupPageProps = {
  params: Promise<{ relationshipId: string }>;
  searchParams: Promise<{ appointmentId?: string | string[] }>;
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

export default async function NewFollowupPage({
  params,
  searchParams,
}: NewFollowupPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId } = await params;
  const query = await searchParams;
  const requestedAppointmentId = Array.isArray(query.appointmentId)
    ? query.appointmentId
    : query.appointmentId;
  let context;

  try {
    context = await getFollowupCreateContext(actor, relationshipId, requestedAppointmentId);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  return (
    <FollowupForm
      appointments={context.appointments.map((appointment) => ({
        appointmentId: appointment.appointmentId,
        type: appointment.type,
        scheduledAt: appointment.scheduledAt.toISOString(),
      }))}
      goalPlans={context.goalPlans.map((plan) => ({
        goalPlanId: plan.goalPlanId,
        roundNumber: plan.roundNumber,
        createdAt: plan.createdAt.toISOString(),
        primaryGoalLabel: plan.primaryGoalLabel,
        items: plan.items,
      }))}
      patient={context.patient}
      relationshipId={relationshipId}
      selectedAppointmentId={context.selectedAppointmentId}
      submissionNonce={randomUUID()}
    />
  );
}
