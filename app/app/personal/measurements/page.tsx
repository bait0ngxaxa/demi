import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { listOwnPatientSelfMeasurements } from "@/modules/patient-self-measurements/services/patient-self-measurement-service";
import { ForbiddenError, UnauthenticatedError, ValidationError } from "@/shared/errors/application-error";

import { PatientSelfMeasurementWorkspace } from "./patient-self-measurement-workspace";

export const metadata: Metadata = { title: "ค่าที่วัดเอง" };

type PatientSelfMeasurementPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function PatientSelfMeasurementPage({ searchParams }: PatientSelfMeasurementPageProps): Promise<React.JSX.Element> {
  await connection();
  const query = searchParams ? await searchParams : {};
  const cursor = typeof query.cursor === "string" ? query.cursor : query.cursor === undefined ? undefined : "";
  let page: Awaited<ReturnType<typeof listOwnPatientSelfMeasurements>>;
  try {
    page = await listOwnPatientSelfMeasurements(await getProtectedApplicationActor(), { cursor });
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    if (error instanceof ValidationError) notFound();
    throw error;
  }
  // Thailand local "YYYY-MM-DDTHH:mm" for the datetime-local default.
  const defaultMeasuredAt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date()).replace(" ", "T");
  return (
    <PatientSelfMeasurementWorkspace
      defaultMeasuredAt={defaultMeasuredAt}
      hasCursor={Boolean(cursor)}
      items={page.items}
      nextCursor={page.nextCursor}
      nonce={randomUUID()}
    />
  );
}
