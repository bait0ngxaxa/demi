import type { Metadata } from "next";
import { connection } from "next/server";

import { familyManagementCursorSchema } from "@/modules/family/schemas/caregiver-relationship-schemas";

import { FamilyManagementWorkspace } from "./family-management-workspace";
import { getFamilyAppointmentWorkspacePageContext } from "@/modules/family/transport/appointment-grant-page-context";
import { appointmentGrantManagementSchema } from "@/modules/family/schemas/appointment-grant-schemas";
import { AppointmentSharingWorkspace } from "./appointment-sharing-workspace";

export const metadata: Metadata = {
  title: "ความสัมพันธ์ผู้ดูแล",
};

export default async function FamilyManagementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  await connection();
  const search = await searchParams;
  const parsedCursors = familyManagementCursorSchema.safeParse({
    patientInvitationsCursor: search.patientInvitationsCursor,
    patientRelationshipsCursor: search.patientRelationshipsCursor,
    caregiverInvitationsCursor: search.caregiverInvitationsCursor,
    caregiverRelationshipsCursor: search.caregiverRelationshipsCursor,
  });
  const grantCursors = appointmentGrantManagementSchema.safeParse({
    patientGrantsCursor: search.patientGrantsCursor,
    caregiverGrantsCursor: search.caregiverGrantsCursor,
    hospitalsCursor: search.hospitalsCursor,
  });
  const { overview, management } = await getFamilyAppointmentWorkspacePageContext(
    parsedCursors.success ? parsedCursors.data : {}, grantCursors.success ? grantCursors.data : {},
  );

  return <><FamilyManagementWorkspace overview={overview} appointmentSharingEnabled={management !== null} />
    {management ? <AppointmentSharingWorkspace management={management} relationships={overview.patient?.relationships ?? []} /> : null}</>;
}
