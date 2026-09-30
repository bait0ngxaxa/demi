import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { getPatientSelfHospitalProfilePageContext } from "@/modules/patient-self/transport/patient-self-page-context";

import { PatientHospitalProfileEditor } from "./profile-editor";

export const metadata: Metadata = {
  title: "ข้อมูลสำหรับโรงพยาบาล",
};

export default async function PatientHospitalProfilePage({
  params,
}: {
  params: Promise<{ relationshipId: string }>;
}): Promise<React.JSX.Element> {
  await connection();
  const { relationshipId } = await params;
  const profile = await getPatientSelfHospitalProfilePageContext(relationshipId);

  if (profile.relationshipId.toLowerCase() !== relationshipId.toLowerCase()) {
    notFound();
  }

  return <PatientHospitalProfileEditor profile={profile} />;
}
