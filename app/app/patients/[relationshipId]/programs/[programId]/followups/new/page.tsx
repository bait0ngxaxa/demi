import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getFollowupCreateContextForProgram } from "@/modules/followups/services/followup-query-service";
import { getPatientProgramDetail } from "@/modules/patient-program/services/patient-program-query-service";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
} from "@/shared/errors/application-error";

import { FollowupForm } from "../../../../followups/new/followup-form";

export const metadata: Metadata = {
  title: "บันทึกการติดตามผลในโปรแกรม",
};

type NewProgramFollowupPageProps = {
  params: Promise<{ relationshipId: string; programId: string }>;
  searchParams: Promise<{
    appointmentId?: string | string[];
    sourceGoalPlanId?: string | string[];
  }>;
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

export default async function NewProgramFollowupPage({
  params,
  searchParams,
}: NewProgramFollowupPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId, programId } = await params;
  const query = await searchParams;
  const requestedAppointmentId = Array.isArray(query.appointmentId)
    ? query.appointmentId[0]
    : query.appointmentId;
  const requestedGoalPlanId = Array.isArray(query.sourceGoalPlanId)
    ? query.sourceGoalPlanId[0]
    : query.sourceGoalPlanId;
  let programDetail;
  let context;

  try {
    programDetail = await getPatientProgramDetail(actor, relationshipId, programId);
    context = await getFollowupCreateContextForProgram(
      actor,
      programDetail.programId,
      requestedAppointmentId,
      { requestedGoalPlanId },
    );
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    if (error instanceof ConflictError) {
      redirect(
        `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId)}`,
      );
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
      scope={{
        kind: "program",
        patientProgramId: context.patientProgramId,
        relationshipId,
      }}
      selectedAppointmentId={context.selectedAppointmentId}
      selectedGoalPlanId={context.selectedGoalPlanId}
      submissionNonce={randomUUID()}
    />
  );
}
