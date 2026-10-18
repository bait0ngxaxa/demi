import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { randomUUID } from "node:crypto";

import { StatusBadge } from "@/components/ui/status-badge";
import {
  APPOINTMENT_STATUS_LABELS,
  type AppointmentStatusValue,
} from "@/modules/appointments/domain/appointment-definitions";
import { lineWorkflowAppointmentLinks } from "@/modules/line/domain/line-workflow-routes";
import { loadLineWorkflowAppointmentDetail } from "@/modules/line/transport/workflow-scoped-appointments";

import { RescheduleRequestHistory } from "../../../../../app/patients/[relationshipId]/appointments/reschedule-request-history";
import {
  appointmentStatusVariant,
  PatientSelfAppointmentDetailContent,
} from "../../../../../app/personal/patient-self-appointment-content";
import { LineWorkflowAppointmentInteractions } from "../../line-workflow-appointment-interactions";
import { LineWorkflowScopedFailure, lineWorkflowScopedSecondaryButtonClass } from "../../line-workflow-scoped-states";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "รายละเอียดนัดหมายใน LINE",
};

type LineWorkflowAppointmentDetailPageProps = {
  params: Promise<{ relationshipId: string; appointmentId: string }>;
};

export default async function LineWorkflowAppointmentDetailPage({
  params,
}: LineWorkflowAppointmentDetailPageProps): Promise<React.JSX.Element> {
  await connection();
  const { relationshipId, appointmentId } = await params;
  const result = await loadLineWorkflowAppointmentDetail(relationshipId, appointmentId);
  if (result.status === "DENIED") {
    return <LineWorkflowScopedFailure retryHref={lineWorkflowAppointmentLinks.detail(relationshipId, appointmentId)} state={result.state} />;
  }
  const { detail, rescheduleRequests } = result.data;

  return (
    <>
      <header className="mt-5 flex min-w-0 flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="text-3xl font-bold tracking-[-0.03em] text-ink">รายละเอียดนัดหมาย</h1>
          <p className="type-readable mt-3 text-base text-muted">นัดหมายของคุณตามข้อมูลที่โรงพยาบาลบันทึกไว้</p>
        </div>
        <StatusBadge variant={appointmentStatusVariant(detail.status as AppointmentStatusValue)}>
          {APPOINTMENT_STATUS_LABELS[detail.status as AppointmentStatusValue]}
        </StatusBadge>
      </header>
      <div className="space-y-6 pt-6">
        <PatientSelfAppointmentDetailContent
          detail={detail}
          interactions={<LineWorkflowAppointmentInteractions appointment={detail} cancellationRequestNonce={randomUUID()} />}
          rescheduleRequests={<RescheduleRequestHistory requests={rescheduleRequests} />}
        />
        <nav aria-label="กลับจากรายละเอียดนัดหมาย" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link className={lineWorkflowScopedSecondaryButtonClass} href={lineWorkflowAppointmentLinks.history(detail.relationship.relationshipId)} prefetch={false}>
            กลับไปนัดหมายของโรงพยาบาลนี้
          </Link>
          <Link className={lineWorkflowScopedSecondaryButtonClass} href={lineWorkflowAppointmentLinks.root} prefetch={false}>
            กลับไปเลือกโรงพยาบาล
          </Link>
        </nav>
      </div>
    </>
  );
}
