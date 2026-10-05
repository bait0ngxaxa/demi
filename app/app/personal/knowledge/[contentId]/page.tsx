import type { Metadata } from "next";
import { connection } from "next/server";
import { getHospitalContentPatientDetailContext } from "@/modules/hospital-content/transport/hospital-content-patient-page-context";
import { PatientContentDetail } from "../patient-content-detail";
import { PatientContentPrivateBoundary } from "../patient-content-private-boundary";

export const metadata: Metadata = { title: "ข่าวสารและความรู้" };
export default async function PatientKnowledgeDetailPage({ params }: {
  params: Promise<{ contentId: string }>;
}): Promise<React.JSX.Element> {
  await connection();
  const context = await getHospitalContentPatientDetailContext((await params).contentId);
  return <PatientContentPrivateBoundary key={context.requestId} requestId={context.requestId}><PatientContentDetail content={context.content} /></PatientContentPrivateBoundary>;
}
