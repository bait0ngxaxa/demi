import type { Metadata } from "next";
import { connection } from "next/server";
import { HospitalContentCategory } from "@prisma/client";
import { getHospitalContentPatientFeedContext } from "@/modules/hospital-content/transport/hospital-content-patient-page-context";
import { PatientContentFeed } from "../knowledge/patient-content-feed";
import { PatientContentPrivateBoundary } from "../knowledge/patient-content-private-boundary";

export const metadata: Metadata = { title: "ข่าวสาร" };

export default async function PatientNewsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  await connection();
  const params = await searchParams;
  const context = await getHospitalContentPatientFeedContext({
    category: HospitalContentCategory.NEWS,
    cursor: params.cursor,
    hospital: params.hospital,
  });
  return <PatientContentPrivateBoundary key={context.requestId} requestId={context.requestId}><PatientContentFeed context={context} kind="NEWS" /></PatientContentPrivateBoundary>;
}
