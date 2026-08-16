import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getPrototypeQuestionSet } from "@/modules/screening/domain/question-sets";
import { getScreeningPatientForSubmission } from "@/modules/screening/services/screening-query-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { ScreeningForm } from "./screening-form";

export const metadata: Metadata = {
  title: "Screening ใหม่",
};

type NewScreeningPageProps = {
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

export default async function NewScreeningPage({
  params,
}: NewScreeningPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId } = await params;
  let patient;

  try {
    patient = await getScreeningPatientForSubmission(actor, relationshipId);
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
    <ScreeningForm
      patient={patient}
      questionSet={getPrototypeQuestionSet()}
      relationshipId={relationshipId}
      submissionNonce={randomUUID()}
    />
  );
}
