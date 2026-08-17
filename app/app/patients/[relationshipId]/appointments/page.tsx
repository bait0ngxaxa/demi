import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getAppointmentHistory } from "@/modules/appointments/services/appointment-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { AppointmentHistoryView } from "./appointment-history-view";

export const metadata: Metadata = {
  title: "Appointments",
};

type AppointmentHistoryPageProps = {
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

export default async function AppointmentHistoryPage({
  params,
}: AppointmentHistoryPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId } = await params;
  let history;

  try {
    history = await getAppointmentHistory(actor, relationshipId);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  return <AppointmentHistoryView history={history} />;
}

