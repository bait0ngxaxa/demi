import { connection } from "next/server";
import { PageHeader } from "@/components/ui/page-header";
import { getDelegatedAppointmentPageContext } from "@/modules/family/transport/appointment-grant-page-context";
import { AppointmentStatusBadge } from "../../../../../appointment-summary";
import { FamilyAppointmentSummary } from "../appointment-fields";
import { RefreshDelegatedRead } from "../refresh-delegated-read";
import { personalAppointmentHubHref } from "../../../../../personal/appointments/personal-appointment-hub-href";

export default async function DelegatedAppointmentPage({ params }: { params: Promise<{ grantId: string; appointmentId: string }> }): Promise<React.JSX.Element> {
  await connection();
  const { grantId, appointmentId } = await params;
  const appointment = await getDelegatedAppointmentPageContext(grantId, appointmentId);
  return <div className="max-w-4xl"><RefreshDelegatedRead />
    <PageHeader actions={<AppointmentStatusBadge status={appointment.status} />} title="นัดหมาย" breadcrumbs={[{ label: "ผู้ดูแล", href: "/app/family" }, { label: "นัดหมาย", href: personalAppointmentHubHref({ subject: grantId, tab: "upcoming" }) }, { label: "รายละเอียด" }]} />
    <div className="pt-6"><FamilyAppointmentSummary appointment={appointment} /></div>
  </div>;
}
