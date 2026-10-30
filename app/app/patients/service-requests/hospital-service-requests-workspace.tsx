"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import type { HospitalPatientServiceRequestPage } from "@/modules/patient-service-requests/services/patient-service-request-service";
import {
  formatPatientServicePreferredDate,
  formatPatientServiceRequestDate,
  hospitalServiceRequestGroups,
  hospitalServiceRequestListHref,
  patientServiceLabel,
  patientServiceRequestSlotLabel,
  patientServiceRequestStatusLabel,
  patientServiceRequestStatusVariant,
} from "@/modules/patient-service-requests/presentation/patient-service-request-presentation";
import {
  initialPatientServiceMutationActionState,
  type PatientServiceMutationActionState,
} from "@/modules/patient-service-requests/transport/action-state";
import {
  confirmPatientServiceRequestAction,
  rejectPatientServiceRequestAction,
} from "@/modules/patient-service-requests/transport/server-actions";

import { HospitalPatientServiceRequestReviewControls } from "./hospital-service-request-controls";

function ReviewFeedback({ state }: { state: PatientServiceMutationActionState }): React.JSX.Element | null {
  if (state.status === "SUCCESS") return <Alert variant="success">{state.message ?? "บันทึกผลแล้ว"}</Alert>;
  if (state.status !== "ERROR") return null;
  return (
    <Alert variant={state.conflict ? "warning" : "danger"} role="alert">
      <p>{state.conflict ? "สถานะคำขอเปลี่ยนไปแล้ว" : "บันทึกไม่สำเร็จ"}</p>
      <p>{state.message}</p>
      {state.conflict ? <p>รายการด้านล่างอ่านสถานะล่าสุดจากระบบแล้ว หากคำขอไม่อยู่ในกลุ่มเดิม ให้เลือกดูอีกกลุ่ม</p> : null}
    </Alert>
  );
}

export function HospitalPatientServiceRequestsWorkspace({
  page,
  invalidQuery = false,
  submissionNonces = {},
}: {
  page: HospitalPatientServiceRequestPage;
  invalidQuery?: boolean;
  /** Request id to its server-issued confirmation nonce. */
  submissionNonces?: Readonly<Record<string, string>>;
}): React.JSX.Element {
  // Keep feedback above the list: a successful transition removes the card from its group.
  const [confirmState, confirmAction, confirmPending, confirmUnknown] = useMutationActionState(
    confirmPatientServiceRequestAction,
    initialPatientServiceMutationActionState,
  );
  const [rejectState, rejectAction, rejectPending, rejectUnknown] = useMutationActionState(
    rejectPatientServiceRequestAction,
    initialPatientServiceMutationActionState,
  );
  const pending = confirmPending || rejectPending;
  const unknownOutcome = confirmUnknown || rejectUnknown;
  const feedbackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pending && (confirmState.status !== "IDLE" || rejectState.status !== "IDLE")) {
      feedbackRef.current?.focus();
    }
  }, [pending, confirmState, rejectState]);
  const group = hospitalServiceRequestGroups.find(({ key }) => key === page.group) ?? hospitalServiceRequestGroups[0];

  return (
    <div className="max-w-5xl">
      <PageHeader
        breadcrumbs={[{ href: "/app", label: "งาน" }, { label: "คำขอบริการผู้ป่วย" }]}
        description="ตรวจสอบคำขอและส่งต่องานดูแลผู้ป่วยตามสิทธิ์ของโรงพยาบาล"
        title="คำขอบริการผู้ป่วย"
      />
      <p className="mt-4 max-w-prose text-sm leading-6 text-text-muted">
        รวมคำขอจากทุกโรงพยาบาลที่คุณเป็นสมาชิกโดยตรงและมีสิทธิ์ตรวจสอบ
        หน้านี้ไม่ได้เลือกกรองโรงพยาบาล แต่ละคำขอแยกตามความสัมพันธ์ผู้ป่วยกับโรงพยาบาล
      </p>

      <nav aria-label="กลุ่มคำขอบริการ" className="mt-6 flex flex-wrap gap-2">
        {hospitalServiceRequestGroups.map(({ key, label }) => (
          <Link
            aria-current={key === page.group ? "page" : undefined}
            className={buttonClassName({ variant: key === page.group ? "primary" : "secondary", size: "compact" })}
            href={hospitalServiceRequestListHref(key)}
            key={key}
            prefetch={false}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div aria-atomic="true" aria-live="polite" className="mt-4 rounded-panel focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" ref={feedbackRef} tabIndex={-1}>
        {pending ? <Alert variant="info">กำลังบันทึกผลการดำเนินการ กรุณารอสักครู่</Alert> : null}
        {!pending ? <ReviewFeedback state={confirmState} /> : null}
        {!pending ? <ReviewFeedback state={rejectState} /> : null}
        <UnknownOutcomeAlert active={!pending && unknownOutcome} recovery={{ kind: "reload" }} />
      </div>
      {invalidQuery ? <Alert className="mt-4" variant="warning">รูปแบบกลุ่มหรือหน้ารายการไม่ถูกต้อง แสดงคำขอรอตรวจสอบหน้าแรกแทน</Alert> : null}

      <section aria-labelledby="request-group-heading" className="mt-8">
        <h2 className="text-xl font-semibold text-text" id="request-group-heading">{group.label}</h2>
        <p className="mt-2 max-w-prose text-sm leading-6 text-text-muted">{group.description}</p>
        <p className="mt-2 text-sm text-text-muted">แสดงครั้งละไม่เกิน 20 คำขอ เรียงตามวันที่ส่งล่าสุด</p>

        {page.requests.length === 0 ? (
          <Alert className="mt-5" variant="neutral">
            {page.after ? "ไม่มีคำขอถัดจากตำแหน่งนี้ในกลุ่มที่เลือก สถานะรายการอาจเปลี่ยนไปแล้ว" : group.empty}
          </Alert>
        ) : (
          <div className="mt-5 space-y-4">
            {page.requests.map((request) => (
              <Panel aria-labelledby={`service-request-${request.requestId}`} className="break-words" key={request.requestId}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold tracking-[-0.02em] text-text" id={`service-request-${request.requestId}`}>
                      {request.patientName}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-text-muted">ผู้ป่วยของ {request.hospitalName}</p>
                  </div>
                  <StatusBadge variant={request.status === "STARTED" ? "neutral" : patientServiceRequestStatusVariant(request.status)}>
                    {patientServiceRequestStatusLabel(request.status)}
                  </StatusBadge>
                </div>

                <dl className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm text-text-muted">บริการที่ต้องการ</dt>
                    <dd className="mt-1 font-semibold text-text">{patientServiceLabel(request.serviceCode)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-text-muted">ส่งคำขอเมื่อ</dt>
                    <dd className="mt-1 text-text">{formatPatientServiceRequestDate(request.createdAt, "Asia/Bangkok")}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-text-muted">วันที่สะดวก</dt>
                    <dd className="mt-1 text-text">
                      {request.preferredDate && request.preferredSlot
                        ? `${formatPatientServicePreferredDate(request.preferredDate)} · ${patientServiceRequestSlotLabel(request.preferredSlot)}`
                        : "ไม่ระบุ"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-text-muted">อสม.ที่ต้องการ (ความประสงค์ของผู้ป่วย)</dt>
                    <dd className="mt-1 text-text">{request.preferredOsmName ?? "ให้โรงพยาบาลจัดให้"}</dd>
                    <dd className="mt-1 text-sm text-text-muted">เป็นความประสงค์เท่านั้น ไม่ใช่ผู้รับผิดชอบที่ได้รับมอบหมายหรือการตอบรับงาน</dd>
                  </div>
                  {request.note ? (
                    <div className="sm:col-span-2">
                      <dt className="text-sm text-text-muted">หมายเหตุจากผู้ป่วย</dt>
                      <dd className="mt-1 break-words text-text">{request.note}</dd>
                    </div>
                  ) : null}
                  {request.rejectionReason ? (
                    <div className="sm:col-span-2">
                      <dt className="text-sm text-text-muted">เหตุผลที่ไม่อนุมัติ</dt>
                      <dd className="mt-1 break-words text-text">{request.rejectionReason}</dd>
                    </div>
                  ) : null}
                  <div className="sm:col-span-2">
                    <dt className="text-sm text-text-muted">อสม. ผู้ดูแลปัจจุบัน</dt>
                    <dd className="mt-1 text-text">{request.currentOsmName ?? "ยังไม่มีผู้ดูแล"}</dd>
                  </div>
                </dl>

                {request.status === "APPROVED" || request.status === "STARTED" ? (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="max-w-prose text-sm leading-6 text-text-muted">
                      {request.status === "APPROVED"
                        ? "คำขอนี้อนุมัติไว้ก่อนเปลี่ยนเป็นการยืนยันนัด ยืนยันนัดเพื่อสร้างนัดหมายให้ อสม."
                        : "ยืนยันนัดจากคำขอนี้แล้ว สถานะไม่ได้ยืนยันว่าบริการเสร็จสิ้น"}
                    </p>
                    {request.status === "STARTED" && request.appointmentId ? (
                      <Link
                        className="mt-2 inline-flex min-h-11 items-center rounded-control font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                        href={`/app/patients/${encodeURIComponent(request.relationshipId)}/appointments/${encodeURIComponent(request.appointmentId)}`}
                        prefetch={false}
                      >
                        เปิดนัดหมายที่เชื่อมโยง
                      </Link>
                    ) : null}
                  </div>
                ) : null}
                {submissionNonces[request.requestId] ? (
                  <HospitalPatientServiceRequestReviewControls
                    blocked={unknownOutcome}
                    confirmAction={confirmAction}
                    pending={pending}
                    rejectAction={rejectAction}
                    request={request}
                    submissionNonce={submissionNonces[request.requestId] ?? ""}
                  />
                ) : null}
                {request.status === "STARTED" || request.status === "REJECTED" || request.status === "WITHDRAWN" ? (
                  <p className="mt-4 text-sm text-text-muted">ประวัติคำขอ · อ่านอย่างเดียว</p>
                ) : null}
              </Panel>
            ))}
          </div>
        )}
        <nav aria-label="หน้ารายการคำขอบริการ" className="mt-5 flex flex-wrap gap-3">
          {page.after ? <Link className={buttonClassName({ variant: "secondary", size: "compact" })} href={hospitalServiceRequestListHref(page.group)} prefetch={false}>กลับหน้าแรกของกลุ่ม</Link> : null}
          {page.nextCursor ? <Link className={buttonClassName({ variant: "secondary", size: "compact" })} href={hospitalServiceRequestListHref(page.group, page.nextCursor)} prefetch={false}>คำขอถัดไปในกลุ่มนี้</Link> : null}
        </nav>
      </section>
    </div>
  );
}
