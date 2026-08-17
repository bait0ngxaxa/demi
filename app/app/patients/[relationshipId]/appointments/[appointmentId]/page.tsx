import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import {
  APPOINTMENT_LOCATION_LABELS,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_TYPE_LABELS,
  type AppointmentStatusValue,
} from "@/modules/appointments/domain/appointment-definitions";
import {
  getAppointmentDetail,
  type AppointmentDetail,
} from "@/modules/appointments/services/appointment-query-service";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { AppointmentMutationControls } from "./appointment-mutation-controls";

export const metadata: Metadata = {
  title: "รายละเอียด Appointment",
};

type AppointmentDetailPageProps = {
  params: Promise<{ relationshipId: string; appointmentId: string }>;
};

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

function statusVariant(status: AppointmentStatusValue): StatusVariant {
  if (status === "COMPLETED") {
    return "success";
  }

  if (status === "CANCELLED") {
    return "danger";
  }

  if (status === "NO_SHOW") {
    return "neutral";
  }

  return "warning";
}

async function resolveActor() {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login");
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }
}

function AppointmentDetailView({ detail }: { detail: AppointmentDetail }): React.JSX.Element {
  const relationshipId = detail.patient.patientHospitalRelationshipId;
  const locationLabel = detail.locationType
    ? APPOINTMENT_LOCATION_LABELS[detail.locationType]
    : "ไม่ระบุสถานที่";

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={
          <StatusBadge variant={statusVariant(detail.status)}>
            {APPOINTMENT_STATUS_LABELS[detail.status]}
          </StatusBadge>
        }
        breadcrumbs={[
          {
            href: `/app/patients/${encodeURIComponent(relationshipId)}`,
            label: "รายละเอียดผู้ป่วย",
          },
          {
            href: `/app/patients/${encodeURIComponent(relationshipId)}/appointments`,
            label: "Appointments",
          },
          { label: "รายละเอียด Appointment" },
        ]}
        description="รายละเอียด Appointment ในขอบเขต Patient–Hospital relationship เดียวกัน"
        title="รายละเอียด Appointment"
      />

      <div className="space-y-6 pt-8">
        <Alert variant="warning">
          <p className="font-semibold">ต้นแบบเพื่อเก็บ Requirement</p>
          <p className="mt-1">
            ประเภท สถานะ ผู้รับผิดชอบ และอำนาจของผู้ใช้งานเป็นพฤติกรรมต้นแบบที่ยังรอการยืนยันจากลูกค้า
          </p>
          {detail.status === "COMPLETED" ? (
            <p className="mt-2">Appointment นี้พร้อมสำหรับการบันทึก Follow-up ในขั้นตอนถัดไป</p>
          ) : null}
        </Alert>

        <Panel>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-text">
                {detail.patient.displayName}
              </h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">{detail.patient.hospital.name}</p>
            </div>
            <p className="text-sm text-text-muted">
              HN ของโรงพยาบาลนี้: {detail.patient.hospitalNumber ?? "ไม่ระบุ"}
            </p>
          </div>
        </Panel>

        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">ข้อมูลนัดหมาย</h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                {APPOINTMENT_TYPE_LABELS[detail.type]}
              </p>
            </div>
            <StatusBadge variant={statusVariant(detail.status)}>
              {APPOINTMENT_STATUS_LABELS[detail.status]}
            </StatusBadge>
          </div>

          <dl className="mt-6 grid gap-4 border-y border-border py-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-text-muted">วันและเวลานัดหมาย</dt>
              <dd className="mt-1 font-semibold text-text">{formatDate(detail.scheduledAt)}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">ผู้รับผิดชอบ</dt>
              <dd className="mt-1 font-semibold text-text">{detail.responsibleDisplayName ?? "ยังไม่ระบุ"}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">ระยะเวลา</dt>
              <dd className="mt-1 font-semibold text-text">
                {detail.durationMinutes ? `${detail.durationMinutes} นาที` : "ไม่ระบุ"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">สถานที่</dt>
              <dd className="mt-1 font-semibold text-text">{locationLabel}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">สร้างเมื่อ</dt>
              <dd className="mt-1 font-semibold text-text">{formatDate(detail.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">ผู้สร้าง</dt>
              <dd className="mt-1 font-semibold text-text">{detail.createdByDisplayName}</dd>
            </div>
          </dl>

          {detail.locationDetail ? (
            <div className="border-b border-border py-5">
              <h3 className="text-sm font-semibold text-text">รายละเอียดสถานที่</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text">{detail.locationDetail}</p>
            </div>
          ) : null}

          <div className="pt-5">
            <h3 className="text-sm font-semibold text-text">หมายเหตุ</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text">
              {detail.note ?? "ไม่ได้ระบุ"}
            </p>
          </div>
        </Panel>

        {detail.canManage && detail.status === "SCHEDULED" ? (
          <Panel>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">การดำเนินการ</h2>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              การเปลี่ยนสถานะต้องทำผ่านเซิร์ฟเวอร์และจะตรวจสอบสถานะล่าสุดอีกครั้ง
            </p>
            <div className="mt-5 flex flex-col gap-5">
              <Link
                className="inline-flex min-h-11 w-fit items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                href={`/app/patients/${encodeURIComponent(relationshipId)}/appointments/${encodeURIComponent(detail.appointmentId)}/edit`}
              >
                Reschedule Appointment
              </Link>
              <AppointmentMutationControls
                appointmentId={detail.appointmentId}
                canManage={detail.canManage}
                expectedUpdatedAt={detail.updatedAt.toISOString()}
                relationshipId={relationshipId}
                status={detail.status}
              />
            </div>
          </Panel>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href={`/app/patients/${encodeURIComponent(relationshipId)}/appointments`}
          >
            กลับไปประวัติ Appointment
          </Link>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href={`/app/patients/${encodeURIComponent(relationshipId)}`}
          >
            กลับไปยังรายละเอียดผู้ป่วย
          </Link>
        </div>
      </div>
    </div>
  );
}

export default async function AppointmentDetailPage({
  params,
}: AppointmentDetailPageProps): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveActor();
  const { relationshipId, appointmentId } = await params;
  let detail;

  try {
    detail = await getAppointmentDetail(actor, relationshipId, appointmentId);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  return <AppointmentDetailView detail={detail} />;
}

