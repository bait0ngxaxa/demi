import { getAppointmentRescheduleHistory } from "@/modules/appointments/services/appointment-reschedule-history-service";
import { RescheduleRequestSection } from "../reschedule-request-section";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { randomUUID } from "node:crypto";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import {
  APPOINTMENT_LOCATION_LABELS,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_TYPE_LABELS,
  appointmentResponsiblePresentation,
  type AppointmentStatusValue,
} from "@/modules/appointments/domain/appointment-definitions";
import { getFollowupHistoryForProgram } from "@/modules/followups/services/followup-query-service";
import {
  getAppointmentDetail,
  type AppointmentDetail,
} from "@/modules/appointments/services/appointment-query-service";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  getPatientProgramPageContext,
  type PatientProgramProjection,
} from "@/modules/patient-program/services/patient-program-query-service";
import { getAppointmentFollowupContext } from "@/modules/appointments/presentation/appointment-followup-context";
import { ForbiddenError, NotFoundError, UnauthenticatedError } from "@/shared/errors/application-error";

import { AppointmentMutationControls } from "./appointment-mutation-controls";
import { AppointmentInteractionControls } from "./appointment-interaction-controls";
import { AppointmentAssignmentControls } from "./appointment-assignment-controls";
import type { AppointmentContactPhones } from "@/modules/appointments/domain/appointment-contact-phones";
import { AppointmentContactPhoneEntries } from "../../../../appointment-contact-phones";

export const metadata: Metadata = {
  title: "รายละเอียดนัดหมาย",
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

function AppointmentDetailView({
  activeProgram,
  canRecordProgram,
  detail, rescheduleRequests,
}: {
  activeProgram: PatientProgramProjection | null;
  canRecordProgram: boolean;
  detail: AppointmentDetail & { contactPhones: AppointmentContactPhones };
  rescheduleRequests?: React.ReactNode;
}): React.JSX.Element {
  const relationshipId = detail.patient.patientHospitalRelationshipId;
  const locationLabel = detail.locationType
    ? APPOINTMENT_LOCATION_LABELS[detail.locationType]
    : "ไม่ระบุสถานที่";
  const responsiblePresentation = appointmentResponsiblePresentation(
    detail.responsibleDisplayName,
    detail.responsibleProfession,
  );
  const followupContext = getAppointmentFollowupContext({
    activeProgram,
    appointmentId: detail.appointmentId,
    canRecordProgram,
    relationshipId,
  });

  return (
    <div className="max-w-5xl">
      <PageHeader
        breadcrumbs={[
          {
            href: `/app/patients/${encodeURIComponent(relationshipId)}`,
            label: "รายละเอียดผู้ป่วย",
          },
          {
            href: `/app/patients/${encodeURIComponent(relationshipId)}/appointments`,
            label: "นัดหมาย",
          },
          { label: "รายละเอียดนัดหมาย" },
        ]}
        description="รายละเอียดนัดหมายของผู้ป่วยในโรงพยาบาลนี้"
        title="รายละเอียดนัดหมาย"
      />

      <div className="space-y-6 pt-8">
        {detail.status === "COMPLETED" ? (
          <Alert variant="info">
            <p className="font-semibold">นัดหมายนี้เสร็จสิ้นแล้ว</p>
            <p className="mt-1">สถานะนัดหมายไม่ได้ยืนยันว่ามีบันทึกการติดตามผลหรือการจบโปรแกรม ต้องตรวจรายการดูแลแยกกัน</p>
            <p className="mt-1">{followupContext.description}</p>
            <Link
              className="mt-3 inline-flex min-h-11 items-center rounded-control border border-border-strong bg-surface px-3 py-2 text-sm font-semibold text-brand-strong transition-colors hover:border-action-primary hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              href={followupContext.href}
              prefetch={false}
            >
              {followupContext.label}
            </Link>
          </Alert>
        ) : null}

        <Panel>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 className="break-words text-2xl font-semibold tracking-[-0.03em] text-text">
                {detail.patient.displayName}
              </h2>
              <p className="mt-1 break-words text-sm leading-6 text-text-muted">
                {detail.patient.hospital.name}
              </p>
            </div>
            <p className="break-words text-sm text-text-muted">
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
              <dt className="text-sm text-text-muted">{responsiblePresentation.heading}</dt>
              <dd className="mt-1 break-words font-semibold text-text">
                {responsiblePresentation.displayName}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">OSM ที่เกี่ยวข้องเมื่อนัดถูกสร้าง</dt>
              <dd className="mt-1 break-words font-semibold text-text">
                {detail.osmAtCreationDisplayName ?? "ไม่มีข้อมูล OSM ณ วันที่สร้างนัด"}
              </dd>
              <dd className="mt-1 text-sm leading-6 text-text-muted">เป็นข้อมูลเมื่อสร้างนัด ไม่ยืนยันผู้รับผิดชอบปัจจุบันหรือการตอบรับงาน</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">ระยะเวลา</dt>
              <dd className="mt-1 font-semibold text-text">
                {detail.durationMinutes ? `${detail.durationMinutes} นาที` : "ไม่ระบุ"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">สถานที่</dt>
              <dd className="mt-1 break-words font-semibold text-text">{locationLabel}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">สร้างเมื่อ</dt>
              <dd className="mt-1 font-semibold text-text">{formatDate(detail.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">ผู้สร้าง</dt>
              <dd className="mt-1 break-words font-semibold text-text">
                {detail.createdByDisplayName}
              </dd>
            </div>
            <AppointmentContactPhoneEntries
              contactPhones={detail.contactPhones}
              showPatientPhone={detail.canProxyPatientActions || Boolean(detail.canHospitalManage)}
            />
          </dl>

          {detail.locationDetail ? (
            <div className="border-b border-border py-5">
              <h3 className="text-sm font-semibold text-text">รายละเอียดสถานที่</h3>
              <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-6 text-text">
                {detail.locationDetail}
              </p>
            </div>
          ) : null}

          <div className="pt-5">
            <h3 className="text-sm font-semibold text-text">หมายเหตุ</h3>
            <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-6 text-text">
              {detail.note ?? "ไม่ได้ระบุ"}
            </p>
          </div>
        </Panel>

        {rescheduleRequests}
        <AppointmentAssignmentControls
          acceptedAt={detail.currentAssigneeAcceptance?.acceptedAt ?? null}
          appointmentId={detail.appointmentId}
          assignedOsmDisplayName={detail.assignedOsmDisplayName ?? ""}
          canAcceptAssignment={detail.canAcceptAssignment}
          expectedUpdatedAt={detail.updatedAt.toISOString()}
          relationshipId={relationshipId}
          submissionNonce={randomUUID()}
        />
        <AppointmentInteractionControls
          acknowledgement={detail.currentAcknowledgement}
          cancellationRequestNonce={randomUUID()}
          cancellationRequests={detail.cancellationRequests}
          canManage={detail.canHospitalManage ?? detail.canManage}
          canProxyPatientActions={detail.canProxyPatientActions}
          canRecordCoordination={detail.canRecordCoordination}
          coordinationEvents={detail.coordinationEvents}
          coordinationSubmissionNonce={randomUUID()}
          appointmentId={detail.appointmentId}
          expectedUpdatedAt={detail.updatedAt.toISOString()}
          relationshipId={relationshipId}
          status={detail.status}
        />

        {detail.canManage ? (
          <Panel>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">จัดการนัดหมาย</h2>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              การเลื่อนนัดเปลี่ยนกำหนดการ ส่วนการยกเลิก เสร็จสิ้น และไม่มาตามนัดเป็นผลของนัด ไม่สร้างบันทึกการติดตามผลหรือจบโปรแกรมอัตโนมัติ
            </p>
            <div className="mt-5 flex flex-col gap-5">
              {detail.status === "SCHEDULED" ? (
                <Link
                  className="inline-flex min-h-11 w-fit items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                  href={`/app/patients/${encodeURIComponent(relationshipId)}/appointments/${encodeURIComponent(detail.appointmentId)}/edit`}
                  prefetch={false}
                >
                  เลื่อนนัดหมาย
                </Link>
              ) : null}
              <AppointmentMutationControls
                appointmentId={detail.appointmentId}
                canManage={detail.canManage}
                canComplete={detail.canHospitalManage ?? detail.canManage}
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
            prefetch={false}
          >
            กลับไปประวัตินัดหมาย
          </Link>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href={`/app/patients/${encodeURIComponent(relationshipId)}#patient-care`}
            prefetch={false}
          >
            กลับไปดูแลผู้ป่วยต่อ
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
  let programContext;
  let rescheduleHistory;
  let canRecordProgram = false;

  try {
    [detail, programContext, rescheduleHistory] = await Promise.all([
      getAppointmentDetail(actor, relationshipId, appointmentId),
      // ADR-0023 (SR-B): a one-off visiting อสม. reads this appointment only, never the patient's Program.
      getPatientProgramPageContext(actor, relationshipId).catch((error: unknown) => {
        if (error instanceof ForbiddenError) return { active: null };
        throw error;
      }),
      getAppointmentRescheduleHistory(actor, relationshipId, appointmentId),
    ]);
    if (programContext.active) {
      const followupHistory = await getFollowupHistoryForProgram(actor, programContext.active.programId);
      canRecordProgram = followupHistory.canRecord;
    }
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    if (error instanceof ForbiddenError) {
      redirect("/app");
    }

    throw error;
  }

  return (
    <AppointmentDetailView
      rescheduleRequests={<RescheduleRequestSection history={rescheduleHistory} relationshipId={relationshipId} appointmentId={appointmentId} />}
      activeProgram={programContext.active}
      canRecordProgram={canRecordProgram}
      detail={detail}
    />
  );
}

