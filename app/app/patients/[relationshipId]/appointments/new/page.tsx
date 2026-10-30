import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getAppointmentCreateContext } from "@/modules/appointments/services/appointment-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { AppointmentForm } from "./appointment-form";

export const metadata: Metadata = {
  title: "สร้างนัดหมาย",
};

type NewAppointmentPageProps = {
  params: Promise<{ relationshipId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const appointmentReturnToSchema = z.literal("/app/appointments");

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
  searchParams,
}: NewAppointmentPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const [{ relationshipId }, query] = await Promise.all([params, searchParams]);
  const returnToValues = query.returnTo;
  const parsedReturnTo = appointmentReturnToSchema.safeParse(
    Array.isArray(returnToValues) ? returnToValues[0] : returnToValues,
  );
  let context;

  try {
    context = await getAppointmentCreateContext(actor, relationshipId, {});
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
      homeVisitOnly={context.homeVisitOnly}
      mode="create"
      patient={context.patient}
      currentOsmAssignee={context.currentOsmAssignee}
      relationshipId={relationshipId}
      returnTo={parsedReturnTo.success ? parsedReturnTo.data : undefined}
      responsibleMembers={context.responsibleMembers}
      submissionNonce={randomUUID()}
    />
  );
}

