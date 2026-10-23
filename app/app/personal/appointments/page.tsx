import type { Metadata } from "next";
import { connection } from "next/server";

import { getPersonalAppointmentHubPageContext } from "@/modules/patient-self/transport/patient-self-care-page-context";
import { LINE_WEB_NAVIGATION_PATHS } from "@/modules/line/domain/line-navigation-intents";
import { isPatientAccessUnavailable } from "@/modules/patient-self/transport/patient-access-unavailable";

import { PatientAccessUnavailableState } from "../patient-access-unavailable-state";
import { PersonalAppointmentHub } from "./personal-appointment-hub";

export const metadata: Metadata = {
  title: "นัดหมาย",
};

export default async function PatientSelfAppointmentsPage(
  { searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {},
): Promise<React.JSX.Element> {
  await connection();
  const context = await getPersonalAppointmentHubPageContext(
    (await searchParams) ?? {},
    LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_APPOINTMENTS,
  );

  if (isPatientAccessUnavailable(context)) {
    return <PatientAccessUnavailableState title="นัดหมาย" />;
  }

  return <PersonalAppointmentHub context={context} />;
}
