import type { Metadata } from "next";
import { connection } from "next/server";

import { familyManagementCursorSchema } from "@/modules/family/schemas/caregiver-relationship-schemas";
import { getFamilyManagementPageContext } from "@/modules/family/transport/family-management-page-context";

import { FamilyManagementWorkspace } from "./family-management-workspace";

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
  const overview = await getFamilyManagementPageContext(parsedCursors.success ? parsedCursors.data : {});

  return <FamilyManagementWorkspace overview={overview} />;
}
