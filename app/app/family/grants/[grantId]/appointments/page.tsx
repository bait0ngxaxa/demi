import { connection } from "next/server";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getDelegatedAppointmentsPageContext } from "@/modules/family/transport/appointment-grant-page-context";
import { AppointmentFields } from "./appointment-fields";
import { RefreshDelegatedRead } from "./refresh-delegated-read";

export default async function DelegatedAppointmentsPage({ params, searchParams }: {
  params: Promise<{ grantId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  await connection();
  const { grantId } = await params;
  const { cursor } = await searchParams;
  const page = await getDelegatedAppointmentsPageContext({ grantId, ...(cursor !== undefined ? { cursor } : {}) });
  return <div className="max-w-4xl">
    <RefreshDelegatedRead />
    <PageHeader title="นัดหมายที่ได้รับสิทธิ์" description="ดูนัดหมายแบบอ่านอย่างเดียวในช่วง 90 วันข้างหน้า เฉพาะหน่วยบริการที่ผู้ป่วยแชร์" breadcrumbs={[{ label: "ผู้ดูแล", href: "/app/family" }, { label: "นัดหมาย" }]} />
    {page.appointments.length ? <ul className="mt-6 space-y-4">{page.appointments.map((appointment) => <li key={appointment.appointmentId}><Panel>
      <AppointmentFields appointment={appointment} />
      <Link prefetch={false} className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href={`/app/family/grants/${grantId}/appointments/${appointment.appointmentId}`}>ดูรายละเอียดนัดหมาย</Link>
    </Panel></li>)}</ul> : <Panel className="mt-6"><p className="text-text-muted">ไม่มีนัดหมายที่เข้าเกณฑ์ในช่วง 90 วันข้างหน้า</p></Panel>}
    {page.nextCursor ? <Link prefetch={false} className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4" href={`/app/family/grants/${grantId}/appointments?cursor=${page.nextCursor}`}>ดูนัดหมายถัดไป</Link> : null}
  </div>;
}
