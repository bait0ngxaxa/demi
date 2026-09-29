import type { Metadata } from "next";
import { connection } from "next/server";

import { getPatientSelfPageContext } from "@/modules/patient-self/transport/patient-self-page-context";

import { PatientSelfProfileView } from "../patient-self-profile-view";

export const metadata: Metadata = {
  title: "ข้อมูลของฉัน",
};

export default async function PatientSelfProfilePage(): Promise<React.JSX.Element> {
  await connection();
  const patient = await getPatientSelfPageContext();

  return <PatientSelfProfileView patient={patient} />;
}
