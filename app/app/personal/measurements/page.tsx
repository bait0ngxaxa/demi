import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { listOwnPatientSelfMeasurements } from "@/modules/patient-self-measurements/services/patient-self-measurement-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { PatientSelfMeasurementWorkspace } from "./patient-self-measurement-workspace";

export const metadata: Metadata = { title: "ตัวฉันในตอนนี้" };

export default async function PatientSelfMeasurementPage(): Promise<React.JSX.Element> {
  await connection();
  let items: Awaited<ReturnType<typeof listOwnPatientSelfMeasurements>>;
  try {
    items = await listOwnPatientSelfMeasurements(await getProtectedApplicationActor());
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
  // Thailand local "YYYY-MM-DDTHH:mm" for the datetime-local default.
  const defaultMeasuredAt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date()).replace(" ", "T");
  return <PatientSelfMeasurementWorkspace defaultMeasuredAt={defaultMeasuredAt} items={items} nonce={randomUUID()} />;
}
