import { connection } from "next/server";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getDelegatedAppointmentPageContext } from "@/modules/family/transport/appointment-grant-page-context";
import { AppointmentFields } from "../appointment-fields";
import { RefreshDelegatedRead } from "../refresh-delegated-read";

export default async function DelegatedAppointmentPage({ params }: { params: Promise<{ grantId: string; appointmentId: string }> }): Promise<React.JSX.Element> {
  await connection();
  const { grantId, appointmentId } = await params;
  const appointment = await getDelegatedAppointmentPageContext(grantId, appointmentId);
  return <div className="max-w-4xl"><RefreshDelegatedRead />
    <PageHeader title="รายละเอียดนัดหมาย" description="ข้อมูลนัดหมายที่ผู้ป่วยอนุญาตให้ดูเท่านั้น" breadcrumbs={[{ label: "ผู้ดูแล", href: "/app/family" }, { label: "นัดหมาย", href: `/app/family/grants/${grantId}/appointments` }, { label: "รายละเอียด" }]} />
    <Panel className="mt-6"><AppointmentFields appointment={appointment} /></Panel>
  </div>;
}
