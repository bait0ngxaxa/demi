import type { Metadata } from "next";
import { connection } from "next/server";
import { getHospitalContentPatientFeedContext } from "@/modules/hospital-content/transport/hospital-content-patient-page-context";
import { PatientContentFeed } from "./patient-content-feed";
import { PatientContentPrivateBoundary } from "./patient-content-private-boundary";

export const metadata: Metadata = { title: "ข่าวสารและความรู้" };
export default async function PatientKnowledgePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  await connection();
  const context = await getHospitalContentPatientFeedContext(await searchParams);
  return <PatientContentPrivateBoundary key={context.requestId} requestId={context.requestId}><PatientContentFeed context={context} /></PatientContentPrivateBoundary>;
}
