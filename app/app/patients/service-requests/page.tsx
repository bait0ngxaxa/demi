import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { hospitalServiceRequestListSchema } from "@/modules/patient-service-requests/schemas/patient-service-request-schemas";
import { listHospitalPatientServiceRequests } from "@/modules/patient-service-requests/services/patient-service-request-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { HospitalPatientServiceRequestsWorkspace } from "./hospital-service-requests-workspace";

export const metadata: Metadata = {
  title: "คำขอบริการผู้ป่วย",
};

export default async function HospitalPatientServiceRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  await connection();
  const query = await searchParams;
  const parsed = hospitalServiceRequestListSchema.safeParse({
    group: query.group,
    after: query.afterDate !== undefined || query.afterId !== undefined
      ? { createdAt: query.afterDate, requestId: query.afterId }
      : undefined,
  });

  let requests: Awaited<ReturnType<typeof listHospitalPatientServiceRequests>>;
  try {
    const actor = await getProtectedApplicationActor();
    requests = await listHospitalPatientServiceRequests(actor, {}, parsed.success ? parsed.data : {});
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login");
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  // ADR-0023: one confirmation nonce per rendered request, so a retried "ยืนยันนัด" is idempotent.
  const submissionNonces = Object.fromEntries(requests.requests.map(({ requestId }) => [requestId, randomUUID()]));

  return <HospitalPatientServiceRequestsWorkspace page={requests} invalidQuery={!parsed.success} submissionNonces={submissionNonces} />;
}
