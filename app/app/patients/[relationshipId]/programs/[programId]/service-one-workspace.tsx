"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button, buttonClassName } from "@/components/ui/button";
import { inputClassName } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  associatePatientProgramServiceOneArtifactAction,
  recordPatientProgramServiceOneConfidenceAction,
  recordPatientProgramServiceOneDreamCardAction,
  recordPatientProgramServiceOneFloatingChartAction,
  recordPatientProgramServiceOneRoutineAction,
} from "@/modules/patient-program/transport/patient-program-service-one-server-actions";
import {
  initialPatientProgramServiceOneActionState,
  type PatientProgramServiceOneActionState,
  type PatientProgramServiceOneEvidenceActionState,
} from "@/modules/patient-program/transport/patient-program-service-one-action-state";
import type {
  PatientProgramDetail,
} from "@/modules/patient-program/services/patient-program-query-service";
import type {
  PatientProgramServiceOneActivityProjection,
  PatientProgramServiceOneEvidenceProjection,
  PatientProgramServiceOneProjection,
} from "@/modules/patient-program/services/patient-program-service-one-query-service";
import type {
  PatientProgramServiceOneActivity,
  PatientProgramServiceOneArtifactActivity,
} from "@/modules/patient-program/schemas/patient-program-service-one-schemas";

type ServiceOneActivityKey = PatientProgramServiceOneActivity;

type ServiceOneActivity = PatientProgramServiceOneActivityProjection;

type UploadPayload = {
  artifactId?: unknown;
  error?: {
    message?: unknown;
  };
};

type EvidenceFeedback =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

function activityStatusLabel(recorded: boolean): string {
  return recorded ? "บันทึกแล้ว" : "ยังไม่ได้บันทึก";
}

function activityStatusVariant(recorded: boolean): "success" | "neutral" {
  return recorded ? "success" : "neutral";
}

function getContentPath(relationshipId: string, artifactId: string): string {
  return `/app/patients/${encodeURIComponent(relationshipId)}/evidence/${encodeURIComponent(artifactId)}/content`;
}

function isUploadPayload(value: unknown): value is UploadPayload {
  return typeof value === "object" && value !== null;
}

async function readUploadPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getUploadErrorMessage(payload: unknown): string {
  if (
    isUploadPayload(payload) &&
    payload.error &&
    typeof payload.error.message === "string" &&
    payload.error.message.trim()
  ) {
    return payload.error.message;
  }

  return "บันทึกหลักฐานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
}

function getAssociationErrorMessage(state: PatientProgramServiceOneEvidenceActionState): string {
  if (state.status === "ERROR") {
    return `อัปโหลดรูปแล้ว แต่ยังแนบกับกิจกรรมไม่สำเร็จ: ${state.message} รูปยังอยู่ในรายการหลักฐานของผู้ป่วย และจะไม่แสดงเป็นหลักฐานของกิจกรรมจนกว่าจะเชื่อมโยงสำเร็จ`;
  }

  return "อัปโหลดรูปแล้ว แต่ยังแนบกับกิจกรรมไม่สำเร็จ รูปยังอยู่ในรายการหลักฐานของผู้ป่วย กรุณาตรวจสอบข้อมูลล่าสุดแล้วลองใหม่";
}

type UploadAndAssociateEvidenceOptions = {
  activityKey: PatientProgramServiceOneArtifactActivity;
  formData: FormData;
  programId: string;
  relationshipId: string;
  fetcher?: typeof fetch;
  associateAction?: (
    formData: FormData,
  ) => Promise<PatientProgramServiceOneEvidenceActionState>;
  refresh?: () => void;
};

async function uploadAndAssociateEvidence({
  activityKey,
  formData,
  programId,
  relationshipId,
  fetcher = fetch,
  associateAction = associatePatientProgramServiceOneArtifactAction,
  refresh,
}: UploadAndAssociateEvidenceOptions): Promise<EvidenceFeedback> {
  const response = await fetcher(
    `/app/patients/${encodeURIComponent(relationshipId)}/evidence/upload`,
    {
      body: formData,
      method: "POST",
    },
  );
  const payload = await readUploadPayload(response);

  if (!response.ok) {
    return { status: "error", message: getUploadErrorMessage(payload) };
  }

  if (!isUploadPayload(payload) || typeof payload.artifactId !== "string") {
    refresh?.();
    return {
      status: "error",
      message: "อัปโหลดรูปแล้ว แต่ระบบไม่พบข้อมูลหลักฐาน กรุณาตรวจสอบรายการหลักฐานและข้อมูลล่าสุด",
    };
  }

  const associationFormData = new FormData();
  associationFormData.append("patientProgramId", programId);
  associationFormData.append("activity", activityKey);
  associationFormData.append("patientEvidenceArtifactId", payload.artifactId);

  let associationState: PatientProgramServiceOneEvidenceActionState;

  try {
    associationState = await associateAction(associationFormData);
  } catch {
    refresh?.();
    return {
      status: "error",
      message:
        "อัปโหลดรูปเรียบร้อยแล้ว แต่ยังยืนยันสถานะการเชื่อมโยงกับกิจกรรมไม่ได้ กรุณาตรวจสอบข้อมูลล่าสุดก่อนลองอีกครั้ง",
    };
  }

  if (associationState.status !== "SUCCESS") {
    refresh?.();
    return { status: "error", message: getAssociationErrorMessage(associationState) };
  }

  refresh?.();
  return {
    status: "success",
    message:
      associationState.result.operation === "ALREADY_ASSOCIATED"
        ? "หลักฐานรูปนี้ถูกแนบไว้แล้ว"
        : "แนบหลักฐานรูปเรียบร้อยแล้ว",
  };
}

function ActionFeedback({ state }: { state: PatientProgramServiceOneActionState }): React.JSX.Element | null {
  if (state.status === "IDLE") {
    return null;
  }

  if (state.status === "ERROR") {
    return (
      <Alert className="mt-4" variant={state.code === "CONFLICT" ? "warning" : "danger"}>
        {state.message}
      </Alert>
    );
  }

  return (
    <Alert className="mt-4" variant="success">
      {state.result.operation === "ALREADY_RECORDED"
        ? "กิจกรรมนี้ถูกบันทึกไว้แล้ว"
        : "บันทึกกิจกรรมเรียบร้อยแล้ว"}
    </Alert>
  );
}

function RecordedMeta({ activity }: { activity: ServiceOneActivity }): React.JSX.Element {
  return (
    <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-text-muted">บันทึกเมื่อ</dt>
        <dd className="mt-1 font-semibold text-text">{activity.recordedAt ? formatDateTime(activity.recordedAt) : "ไม่ระบุ"}</dd>
      </div>
      <div>
        <dt className="text-text-muted">ผู้บันทึก</dt>
        <dd className="mt-1 break-words font-semibold text-text">{activity.recordedBy?.displayName ?? "ไม่ระบุผู้บันทึก"}</dd>
      </div>
    </dl>
  );
}

function EvidencePreview({
  evidence,
  label,
  relationshipId,
}: {
  evidence: PatientProgramServiceOneEvidenceProjection;
  label: string;
  relationshipId: string;
}): React.JSX.Element {
  const contentPath = getContentPath(relationshipId, evidence.artifactId);

  return (
    <div className="mt-5 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-text">หลักฐานรูปภาพ</p>
          <p className="mt-1 text-xs leading-5 text-text-muted">แนบแล้วเมื่อ {formatDateTime(evidence.associatedAt)}</p>
        </div>
        <StatusBadge variant="success">แนบแล้ว</StatusBadge>
      </div>
      <div className="mt-4 overflow-hidden rounded-control border border-border bg-surface-muted">
        {/* This protected route authorizes the relationship before redirecting to a short-lived URL. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={`หลักฐานรูปภาพของกิจกรรม${label}`}
          className="h-48 w-full object-contain sm:h-56"
          loading="lazy"
          src={contentPath}
        />
      </div>
      <a
        className={buttonClassName({ className: "mt-3 w-full", size: "compact", variant: "secondary" })}
        href={contentPath}
        rel="noreferrer"
        target="_blank"
      >
        เปิดดูรูปหลักฐาน
      </a>
    </div>
  );
}

function EvidenceAttachmentControl({
  activityKey,
  canManage,
  evidence,
  label,
  programId,
  recorded,
  relationshipId,
}: {
  activityKey: PatientProgramServiceOneArtifactActivity;
  canManage: boolean;
  evidence: PatientProgramServiceOneEvidenceProjection | null;
  label: string;
  programId: string;
  recorded: boolean;
  relationshipId: string;
}): React.JSX.Element | null {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<EvidenceFeedback>({ status: "idle" });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (pending) {
      return;
    }

    const form = formRef.current;
    if (!form) {
      setFeedback({ status: "error", message: "ไม่พบแบบฟอร์มแนบหลักฐาน กรุณาลองใหม่อีกครั้ง" });
      return;
    }

    const fileInput = form.elements.namedItem("file");

    if (!(fileInput instanceof HTMLInputElement) || !fileInput.files?.[0]) {
      setFeedback({ status: "error", message: "กรุณาเลือกรูปหลักฐานก่อนแนบ" });
      return;
    }

    setPending(true);
    setFeedback({ status: "idle" });

    try {
      const result = await uploadAndAssociateEvidence({
        activityKey,
        formData: new FormData(form),
        programId,
        refresh: router.refresh,
        relationshipId,
      });

      if (result.status === "error") {
        setFeedback(result);
        return;
      }

      form.reset();
      setFeedback(result);
    } catch {
      setFeedback({
        status: "error",
        message: "ไม่สามารถเชื่อมต่อเพื่อแนบหลักฐานได้ กรุณาลองใหม่",
      });
    } finally {
      setPending(false);
    }
  }

  if (!recorded) {
    return null;
  }

  return (
    <div>
      {evidence ? (
        <EvidencePreview evidence={evidence} label={label} relationshipId={relationshipId} />
      ) : canManage ? (
        <div className="mt-5 border-t border-border pt-5">
          <div>
            <p className="text-sm font-semibold text-text">แนบหลักฐานรูปภาพ (ไม่บังคับ)</p>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              เลือกได้หนึ่งรูปต่อกิจกรรม รูปจะถูกตรวจสอบและเก็บผ่านระบบฝั่งเซิร์ฟเวอร์
            </p>
          </div>
          <form className="mt-4 space-y-4" ref={formRef} onSubmit={handleSubmit}>
            <label className="block space-y-2 text-sm font-semibold text-text" htmlFor={`service-one-${activityKey.toLowerCase()}-file`}>
              <span>รูปภาพ</span>
              <input
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                capture="environment"
                className={inputClassName}
                disabled={pending}
                id={`service-one-${activityKey.toLowerCase()}-file`}
                name="file"
                type="file"
              />
              <span className="text-xs font-normal leading-5 text-text-muted">JPEG, PNG หรือ WEBP · ไม่เกิน 5 MB</span>
            </label>
            {feedback.status === "error" ? <Alert variant="danger">{feedback.message}</Alert> : null}
            {feedback.status === "success" ? <Alert variant="success">{feedback.message}</Alert> : null}
            {pending ? <Alert variant="info">กำลังอัปโหลดและแนบหลักฐาน…</Alert> : null}
            <Button disabled={pending} loading={pending} size="compact" type="submit">
              {pending ? "กำลังแนบรูป…" : "แนบหลักฐานรูป"}
            </Button>
          </form>
        </div>
      ) : (
        <p className="mt-5 border-t border-border pt-5 text-sm text-text-muted">ยังไม่มีหลักฐานรูปภาพแนบกับกิจกรรมนี้</p>
      )}
    </div>
  );
}

function ActivityCard({
  activity,
  children,
  description,
  id,
  title,
}: {
  activity: ServiceOneActivity;
  children: React.ReactNode;
  description: string;
  id: ServiceOneActivityKey;
  title: string;
}): React.JSX.Element {
  return (
    <article aria-labelledby={`service-one-${id.toLowerCase()}-heading`} className="rounded-panel border border-border bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold tracking-[-0.02em] text-text" id={`service-one-${id.toLowerCase()}-heading`}>
            {title}
          </h3>
          <p className="mt-1 text-sm leading-6 text-text-muted">{description}</p>
        </div>
        <StatusBadge variant={activityStatusVariant(activity.recorded)}>{activityStatusLabel(activity.recorded)}</StatusBadge>
      </div>
      {children}
    </article>
  );
}

function RoutineCard({
  activity,
  canManage,
  programId,
  relationshipId,
}: {
  activity: PatientProgramServiceOneProjection["routine"];
  canManage: boolean;
  programId: string;
  relationshipId: string;
}): React.JSX.Element {
  const router = useRouter();
  const [state, action, pending] = useActionState<PatientProgramServiceOneActionState, FormData>(
    recordPatientProgramServiceOneRoutineAction,
    initialPatientProgramServiceOneActionState,
  );

  useEffect(() => {
    if (state.status === "SUCCESS" || (state.status === "ERROR" && state.code === "CONFLICT")) {
      router.refresh();
    }
  }, [router, state]);

  return (
    <ActivityCard activity={activity} description="บันทึกกิจวัตรหรือตารางชีวิตของผู้ป่วยในรอบนี้" id="ROUTINE" title="ตารางกิจวัตร">
      {activity.recorded ? <RecordedMeta activity={activity} /> : canManage ? (
        <form className="mt-5" action={action}>
          <input name="patientProgramId" type="hidden" value={programId} />
          <Button disabled={pending} loading={pending} size="compact" type="submit">
            {pending ? "กำลังบันทึก…" : "บันทึกกิจกรรม"}
          </Button>
        </form>
      ) : (
        <p className="mt-5 text-sm text-text-muted">ยังไม่มีการบันทึกกิจกรรมนี้ในโปรแกรม</p>
      )}
      <ActionFeedback state={state} />
      <EvidenceAttachmentControl
        activityKey="ROUTINE"
        canManage={canManage}
        evidence={activity.evidence}
        label="ตารางกิจวัตร"
        programId={programId}
        recorded={activity.recorded}
        relationshipId={relationshipId}
      />
    </ActivityCard>
  );
}

function FloatingChartCard({
  activity,
  canManage,
  programId,
  relationshipId,
}: {
  activity: PatientProgramServiceOneProjection["floatingChart"];
  canManage: boolean;
  programId: string;
  relationshipId: string;
}): React.JSX.Element {
  const router = useRouter();
  const [state, action, pending] = useActionState<PatientProgramServiceOneActionState, FormData>(
    recordPatientProgramServiceOneFloatingChartAction,
    initialPatientProgramServiceOneActionState,
  );

  useEffect(() => {
    if (state.status === "SUCCESS" || (state.status === "ERROR" && state.code === "CONFLICT")) {
      router.refresh();
    }
  }, [router, state]);

  return (
    <ActivityCard activity={activity} description="บันทึกกราฟวัดลอยจมพร้อมสรุปสั้น ๆ ได้ถ้าจำเป็น" id="FLOATING_CHART" title="กราฟวัดลอยจม">
      {activity.recorded ? <RecordedMeta activity={activity} /> : canManage ? (
        <form className="mt-5 space-y-4" action={action}>
          <input name="patientProgramId" type="hidden" value={programId} />
          <label className="block space-y-2 text-sm font-semibold text-text" htmlFor="service-one-floating-summary">
            <span>สรุป (ไม่บังคับ)</span>
            <textarea
              className={`${inputClassName} min-h-28 py-3`}
              disabled={pending}
              id="service-one-floating-summary"
              maxLength={2000}
              name="summary"
              placeholder="เขียนสรุปจากกิจกรรมนี้ได้ถ้าจำเป็น"
              rows={4}
            />
            <span className="text-xs font-normal leading-5 text-text-muted">ไม่เกิน 2,000 ตัวอักษร</span>
          </label>
          <Button disabled={pending} loading={pending} size="compact" type="submit">
            {pending ? "กำลังบันทึก…" : "บันทึกกิจกรรม"}
          </Button>
        </form>
      ) : (
        <p className="mt-5 text-sm text-text-muted">ยังไม่มีการบันทึกกิจกรรมนี้ในโปรแกรม</p>
      )}
      {activity.recorded && activity.summary ? (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-sm text-text-muted">สรุปที่บันทึกไว้</p>
          <p className="mt-1 break-words whitespace-pre-wrap text-text">{activity.summary}</p>
        </div>
      ) : null}
      <ActionFeedback state={state} />
      <EvidenceAttachmentControl
        activityKey="FLOATING_CHART"
        canManage={canManage}
        evidence={activity.evidence}
        label="กราฟวัดลอยจม"
        programId={programId}
        recorded={activity.recorded}
        relationshipId={relationshipId}
      />
    </ActivityCard>
  );
}

function DreamCard({
  activity,
  canManage,
  programId,
  relationshipId,
}: {
  activity: PatientProgramServiceOneProjection["dreamCard"];
  canManage: boolean;
  programId: string;
  relationshipId: string;
}): React.JSX.Element {
  const router = useRouter();
  const [state, action, pending] = useActionState<PatientProgramServiceOneActionState, FormData>(
    recordPatientProgramServiceOneDreamCardAction,
    initialPatientProgramServiceOneActionState,
  );

  useEffect(() => {
    if (state.status === "SUCCESS" || (state.status === "ERROR" && state.code === "CONFLICT")) {
      router.refresh();
    }
  }, [router, state]);

  return (
    <ActivityCard activity={activity} description="บันทึกการ์ดความฝันพร้อมคำอธิบายสั้น ๆ ได้ถ้าจำเป็น" id="DREAM_CARD" title="การ์ดความฝัน">
      {activity.recorded ? <RecordedMeta activity={activity} /> : canManage ? (
        <form className="mt-5 space-y-4" action={action}>
          <input name="patientProgramId" type="hidden" value={programId} />
          <label className="block space-y-2 text-sm font-semibold text-text" htmlFor="service-one-dream-description">
            <span>คำอธิบาย (ไม่บังคับ)</span>
            <textarea
              className={`${inputClassName} min-h-28 py-3`}
              disabled={pending}
              id="service-one-dream-description"
              maxLength={2000}
              name="description"
              placeholder="เขียนคำอธิบายประกอบได้ถ้าจำเป็น"
              rows={4}
            />
            <span className="text-xs font-normal leading-5 text-text-muted">ไม่เกิน 2,000 ตัวอักษร</span>
          </label>
          <Button disabled={pending} loading={pending} size="compact" type="submit">
            {pending ? "กำลังบันทึก…" : "บันทึกกิจกรรม"}
          </Button>
        </form>
      ) : (
        <p className="mt-5 text-sm text-text-muted">ยังไม่มีการบันทึกกิจกรรมนี้ในโปรแกรม</p>
      )}
      {activity.recorded && activity.description ? (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-sm text-text-muted">คำอธิบายที่บันทึกไว้</p>
          <p className="mt-1 break-words whitespace-pre-wrap text-text">{activity.description}</p>
        </div>
      ) : null}
      <ActionFeedback state={state} />
      <EvidenceAttachmentControl
        activityKey="DREAM_CARD"
        canManage={canManage}
        evidence={activity.evidence}
        label="การ์ดความฝัน"
        programId={programId}
        recorded={activity.recorded}
        relationshipId={relationshipId}
      />
    </ActivityCard>
  );
}

function ConfidenceCard({
  activity,
  canManage,
  programId,
}: {
  activity: PatientProgramServiceOneProjection["confidence"];
  canManage: boolean;
  programId: string;
}): React.JSX.Element {
  const router = useRouter();
  const [state, action, pending] = useActionState<PatientProgramServiceOneActionState, FormData>(
    recordPatientProgramServiceOneConfidenceAction,
    initialPatientProgramServiceOneActionState,
  );

  useEffect(() => {
    if (state.status === "SUCCESS" || (state.status === "ERROR" && state.code === "CONFLICT")) {
      router.refresh();
    }
  }, [router, state]);

  return (
    <ActivityCard activity={activity} description="บันทึกคะแนนความมั่นใจ/การสะท้อนตนเองแบบชั่วคราวในช่วง 0–10" id="CONFIDENCE" title="ไม้บรรทัดวัดใจ">
      {activity.recorded ? <RecordedMeta activity={activity} /> : canManage ? (
        <form className="mt-5 space-y-5" action={action}>
          <input name="patientProgramId" type="hidden" value={programId} />
          <fieldset>
            <legend className="text-sm font-semibold text-text">เลือกคะแนนสะท้อนความมั่นใจ 0–10</legend>
            <div className="mt-3 grid grid-cols-6 gap-2 sm:grid-cols-11">
              {Array.from({ length: 11 }, (_, score) => (
                <label className="group cursor-pointer" key={score}>
                  <input className="peer sr-only" name="score" required type="radio" value={score} />
                  <span className="flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface text-sm font-semibold text-text transition-colors group-hover:border-action-primary group-hover:bg-brand-soft peer-checked:border-action-primary peer-checked:bg-brand-soft peer-checked:text-brand-strong peer-focus-visible:outline-none peer-focus-visible:ring-4 peer-focus-visible:ring-focus-ring peer-focus-visible:ring-offset-2">
                    {score}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block space-y-2 text-sm font-semibold text-text" htmlFor="service-one-confidence-plan">
            <span>การสะท้อนผลหรือแผนพัฒนา (ไม่บังคับ)</span>
            <textarea
              className={`${inputClassName} min-h-28 py-3`}
              disabled={pending}
              id="service-one-confidence-plan"
              maxLength={2000}
              name="improvementPlan"
              placeholder="เขียนสิ่งที่อยากลองทำต่อได้ถ้าจำเป็น"
              rows={4}
            />
            <span className="text-xs font-normal leading-5 text-text-muted">ไม่เกิน 2,000 ตัวอักษร</span>
          </label>
          <Button disabled={pending} loading={pending} size="compact" type="submit">
            {pending ? "กำลังบันทึก…" : "บันทึกกิจกรรม"}
          </Button>
        </form>
      ) : (
        <p className="mt-5 text-sm text-text-muted">ยังไม่มีการบันทึกกิจกรรมนี้ในโปรแกรม</p>
      )}
      {activity.recorded && activity.score !== null ? (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-sm text-text-muted">คะแนนที่บันทึกไว้</p>
          <p className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-text">{activity.score} / 10</p>
          {activity.improvementPlan ? (
            <>
              <p className="mt-3 text-sm text-text-muted">การสะท้อนผลหรือแผนพัฒนา</p>
              <p className="mt-1 break-words whitespace-pre-wrap text-text">{activity.improvementPlan}</p>
            </>
          ) : null}
        </div>
      ) : null}
      <ActionFeedback state={state} />
    </ActivityCard>
  );
}

export function PatientProgramServiceOneWorkspace({
  detail,
}: {
  detail: PatientProgramDetail;
}): React.JSX.Element {
  const { serviceOne } = detail;
  const relationshipId = detail.patient.patientHospitalRelationshipId;
  const recordedCount = [
    serviceOne.routine.recorded,
    serviceOne.floatingChart.recorded,
    serviceOne.dreamCard.recorded,
    serviceOne.confidence.recorded,
  ].filter(Boolean).length;
  const canManage = detail.status === "ACTIVE" && detail.canManage;

  return (
    <section aria-labelledby="patient-program-service-one-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="patient-program-service-one-heading">
            Service 1 — รู้จักตัวเอง
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
            บันทึกกิจกรรมแยกกันได้ตามความพร้อมของงานในโปรแกรมนี้ ภาพรวมด้านล่างเป็นความคืบหน้าเชิงโครงสร้าง ไม่ใช่เกณฑ์ผ่านหรือผลลัพธ์ทางคลินิก
          </p>
        </div>
        <StatusBadge variant="neutral">
          {recordedCount} จาก 4 กิจกรรมถูกบันทึกแล้ว
        </StatusBadge>
      </div>

      {detail.status === "COMPLETED" ? (
        <Alert className="mt-5" variant="neutral">
          โปรแกรมนี้เสร็จสิ้นแล้ว จึงอ่านกิจกรรมและหลักฐานเดิมได้ แต่ไม่สามารถบันทึกหรือแนบข้อมูลใหม่
        </Alert>
      ) : !detail.canManage ? (
        <Alert className="mt-5" variant="info">
          บัญชีนี้มีสิทธิ์อ่าน Service 1 ในขอบเขตนี้ แต่ไม่มีสิทธิ์บันทึกกิจกรรมหรือแนบหลักฐานใหม่
        </Alert>
      ) : null}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <RoutineCard
          activity={serviceOne.routine}
          canManage={canManage}
          programId={detail.programId}
          relationshipId={relationshipId}
        />
        <FloatingChartCard
          activity={serviceOne.floatingChart}
          canManage={canManage}
          programId={detail.programId}
          relationshipId={relationshipId}
        />
        <DreamCard
          activity={serviceOne.dreamCard}
          canManage={canManage}
          programId={detail.programId}
          relationshipId={relationshipId}
        />
        <ConfidenceCard
          activity={serviceOne.confidence}
          canManage={canManage}
          programId={detail.programId}
        />
      </div>
    </section>
  );
}

export const patientProgramServiceOneWorkspaceInternals = {
  uploadAndAssociateEvidence,
};
