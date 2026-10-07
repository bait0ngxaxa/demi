import type { Metadata } from "next";
import { connection } from "next/server";

import { getPatientPersonalHomePageContext } from "@/modules/patient-self/transport/patient-self-page-context";
import { scheduleCurrentLineAccountReconciliation } from "@/modules/line/transport/line-reconciliation-scheduler";

import { PatientPersonalHome } from "./patient-personal-home";

export const metadata: Metadata = {
  title: "พื้นที่ส่วนตัว",
};

export default async function PatientPersonalPage(): Promise<React.JSX.Element> {
  await connection();
  const patient = await getPatientPersonalHomePageContext();
  await scheduleCurrentLineAccountReconciliation();

  return <PatientPersonalHome patient={patient} />;
}
