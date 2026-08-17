import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getAppointmentCreateContext } from "@/modules/appointments/services/appointment-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { AppointmentForm } from "./appointment-form";

export const metadata: Metadata = {
  title: "สร้าง Appointment",
};

type NewAppointmentPageProps = {
  params: Promise<{ relationshipId: string }>;
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

export default async function NewAppointmentPage({
  params,
}: NewAppointmentPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId } = await params;
  let context;

  try {
    context = await getAppointmentCreateContext(actor, relationshipId);
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
    <AppointmentForm
      mode="create"
      patient={context.patient}
      relationshipId={relationshipId}
      responsibleMembers={context.responsibleMembers}
      submissionNonce={randomUUID()}
    />
  );
}

