import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { getHospitalContactPageContext } from "@/modules/hospital-contact/transport/hospital-contact-page-context";

import { HospitalContactWorkspace } from "./hospital-contact-workspace";

export const metadata: Metadata = {
  title: "ข้อมูลติดต่อโรงพยาบาล",
};

type HospitalContactPageProps = {
  searchParams: Promise<{ hospitalId?: string | string[] }>;
};

export default async function HospitalContactPage({
  searchParams,
}: HospitalContactPageProps): Promise<React.JSX.Element> {
  await connection();
  const params = await searchParams;

  if (Array.isArray(params.hospitalId) && params.hospitalId.length !== 1) {
    notFound();
  }

  const requestedHospitalId = Array.isArray(params.hospitalId)
    ? params.hospitalId[0]
    : params.hospitalId;
  const context = await getHospitalContactPageContext(requestedHospitalId);

  return (
    <HospitalContactWorkspace
      key={context.selectedHospitalId}
      contact={context.contact}
      hospitals={context.hospitals}
      selectedHospitalId={context.selectedHospitalId}
    />
  );
}
