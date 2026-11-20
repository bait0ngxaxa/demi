import { redirect } from "next/navigation";

import { assertFamilyWorkspacePageAccess } from "@/modules/family/transport/appointment-grant-page-context";

import { personalAppointmentHubHref } from "../../../../personal/appointments/personal-appointment-hub-href";

/** AF-4: the delegated list lives in the appointment hub; the hub revalidates the grant on every request. */
export default async function DelegatedAppointmentsPage({ params }: {
  params: Promise<{ grantId: string }>;
}): Promise<never> {
  await assertFamilyWorkspacePageAccess();
  const { grantId } = await params;
  redirect(personalAppointmentHubHref({ subject: grantId, tab: "upcoming" }));
}
