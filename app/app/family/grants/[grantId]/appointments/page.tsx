import { redirect } from "next/navigation";

import { personalAppointmentHubHref } from "../../../../personal/appointments/personal-appointment-hub-href";

/** AF-4: the delegated list lives in the appointment hub; the hub revalidates the grant on every request. */
export default async function DelegatedAppointmentsPage({ params }: {
  params: Promise<{ grantId: string }>;
}): Promise<never> {
  const { grantId } = await params;
  redirect(personalAppointmentHubHref({ subject: grantId, tab: "upcoming" }));
}
