import type { Metadata } from "next";
import { connection } from "next/server";

import { getPatientSelfPageContext } from "@/modules/patient-self/transport/patient-self-page-context";

import { PatientPersonalHome } from "./patient-personal-home";

export const metadata: Metadata = {
  title: "พื้นที่ส่วนตัว",
};

export default async function PatientPersonalPage(): Promise<React.JSX.Element> {
  await connection();
  const patient = await getPatientSelfPageContext();

  return <PatientPersonalHome patient={patient} />;
}
