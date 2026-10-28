"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button, buttonClassName } from "@/components/ui/button";
import { inputClassName } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { submitPreservingInput, useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { getEvidenceImageOptimizationErrorMessage } from "@/modules/patient-evidence/client/patient-evidence-image-optimizer";
import { replacePatientEvidenceFile } from "@/modules/patient-evidence/client/patient-evidence-upload-payload";
import { PATIENT_EVIDENCE_FILE_ACCEPT } from "@/modules/patient-evidence/policies/patient-evidence-image-policy";
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
  PatientProgramServiceOneRoundProjection,
} from "@/modules/patient-program/services/patient-program-service-one-query-service";
import {
  FLOATING_CHART_DIMENSIONS,
  ROUTINE_MAX_ENTRIES,
  type PatientProgramServiceOneActivity,
  type PatientProgramServiceOneArtifactActivity,
  type PatientProgramServiceOneFloatingChartScores,
} from "@/modules/patient-program/schemas/patient-program-service-one-schemas";

import {
  FloatingChartComparison,
  FloatingChartVisualization,
} from "@/modules/patient-program/presentation/floating-chart-display";

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
  | { status: "processing" }
  | { status: "uploading" }
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
  roundNumber: number;
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
  roundNumber,
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
  associationFormData.append("roundNumber", String(roundNumber));
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

export function EvidenceAttachmentControl({
  activityKey,
  canManage,
  evidence,
  label,
  programId,
  recorded,
  relationshipId,
  roundNumber,
}: {
  activityKey: PatientProgramServiceOneArtifactActivity;
  canManage: boolean;
  evidence: PatientProgramServiceOneEvidenceProjection | null;
  label: string;
  programId: string;
  recorded: boolean;
  relationshipId: string;
  roundNumber: number;
}): React.JSX.Element | null {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [feedback, setFeedback] = useState<EvidenceFeedback>({ status: "idle" });
  const pending = feedback.status === "processing" || feedback.status === "uploading";

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

    const uploadFormData = new FormData(form);
    setFeedback({ status: "processing" });

    try {
      await replacePatientEvidenceFile(uploadFormData, fileInput.files[0]);
    } catch (error: unknown) {
      setFeedback({
        status: "error",
        message: getEvidenceImageOptimizationErrorMessage(error),
      });
      return;
    }

    setFeedback({ status: "uploading" });

    try {
      const result = await uploadAndAssociateEvidence({
        activityKey,
        formData: uploadFormData,
        programId,
        roundNumber,
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
                accept={PATIENT_EVIDENCE_FILE_ACCEPT}
                capture="environment"
                className={inputClassName}
                disabled={pending}
                id={`service-one-${activityKey.toLowerCase()}-file`}
                name="file"
                type="file"
              />
              <span className="text-xs font-normal leading-5 text-text-muted">
                JPEG, PNG หรือ WEBP · เลือกรูปได้สูงสุด 25 MB
                <br />
                ระบบจะลดขนาดรูปให้อัตโนมัติก่อนอัปโหลด
              </span>
            </label>
            {feedback.status === "error" ? <Alert variant="danger">{feedback.message}</Alert> : null}
            {feedback.status === "success" ? <Alert variant="success">{feedback.message}</Alert> : null}
            {feedback.status === "processing" ? <Alert variant="info">กำลังเตรียมรูป…</Alert> : null}
            {feedback.status === "uploading" ? <Alert variant="info">กำลังอัปโหลดและแนบหลักฐาน…</Alert> : null}
            <Button disabled={pending} loading={pending} size="compact" type="submit">
              {feedback.status === "processing"
                ? "กำลังเตรียมรูป…"
                : feedback.status === "uploading"
                  ? "กำลังแนบรูป…"
                  : "แนบหลักฐานรูป"}
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

type RoutineEntryDraft = { key: string; timeText: string; activity: string; adjustment: string };

let routineEntryKey = 0;

function emptyRoutineEntry(): RoutineEntryDraft {
  routineEntryKey += 1;
  return { key: `routine-entry-${routineEntryKey}`, timeText: "", activity: "", adjustment: "" };
}

function formatServiceDate(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeZone: "UTC" }).format(value);
}

/** R2-G: the recorded life table (read only). */
function RoutineEntriesView({ activity }: { activity: PatientProgramServiceOneProjection["routine"] }): React.JSX.Element | null {
  if (activity.routineDate === null) {
    return null;
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="text-sm text-text-muted">วัน เดือน ปี: <span className="font-semibold text-text">{formatServiceDate(activity.routineDate)}</span></p>
      {activity.entries.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="text-text-muted">
              <tr>
                <th className="py-2 pr-3 font-semibold" scope="col">เวลา</th>
                <th className="py-2 pr-3 font-semibold" scope="col">กิจวัตรประจำวัน</th>
                <th className="py-2 font-semibold" scope="col">การปรับพฤติกรรม</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {activity.entries.map((entry, index) => (
                <tr key={`${index}-${entry.activity}`}>
                  <td className="py-2 pr-3 align-top text-text">{entry.timeText ?? "–"}</td>
                  <td className="py-2 pr-3 align-top text-text">{entry.activity}</td>
                  <td className="py-2 align-top text-text">{entry.adjustment ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function RoutineCard({
  activity,
  canManage,
  patientMode = false,
  submissionNonce,
  nextHref,
  programId,
  relationshipId,
  roundNumber,
}: {
  activity: PatientProgramServiceOneProjection["routine"];
  canManage: boolean;
  patientMode?: boolean;
  submissionNonce?: string;
  nextHref?: string | null;
  programId: string;
  relationshipId: string;
  roundNumber: number;
}): React.JSX.Element {
  const router = useRouter();
  const [state, action, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState<PatientProgramServiceOneActionState, FormData>(
    recordPatientProgramServiceOneRoutineAction,
    initialPatientProgramServiceOneActionState,
  );
  const [routineDate, setRoutineDate] = useState(activity.routineDate?.toISOString().slice(0, 10) ?? "");
  const [entries, setEntries] = useState<RoutineEntryDraft[]>(() => activity.entries.length ? activity.entries.map((entry, index) => ({ key: `routine-${index}`, timeText: entry.timeText ?? "", activity: entry.activity, adjustment: entry.adjustment ?? "" })) : [emptyRoutineEntry()]);
  const filledEntries = entries.filter((entry) => entry.activity.trim() !== "");
  // R2-G: a table saved without rows still needs its photo, so the stepper stays on this step.
  const awaitsPhoto = filledEntries.length === 0;

  useEffect(() => {
    // SR-D7: inside the round stepper a saved result moves on to the next step.
    if (state.status === "SUCCESS" && nextHref && !awaitsPhoto) {
      router.push(nextHref);
      return;
    }

    if (state.status === "SUCCESS" || (state.status === "ERROR" && state.code === "CONFLICT")) {
      router.refresh();
    }
  }, [awaitsPhoto, nextHref, router, state]);

  const serializedEntries = filledEntries.map((entry) => ({
    timeText: entry.timeText.trim() || null,
    activity: entry.activity.trim(),
    adjustment: entry.adjustment.trim() || null,
  }));
  const locked = pending || unknownOutcome;

  function updateEntry(index: number, next: Partial<RoutineEntryDraft>): void {
    setEntries((current) => current.map((entry, candidate) => (candidate === index ? { ...entry, ...next } : entry)));
  }

  return (
    <ActivityCard activity={activity} description={patientMode ? "บันทึกกิจวัตรและการปรับพฤติกรรมของคุณ" : "บันทึกตารางชีวิตของฉันเป็นรายการ หรือบันทึกวันที่แล้วแนบรูปหน้ากระดาษ"} id="ROUTINE" title="ตารางชีวิตของฉัน">
      {activity.recorded ? (
        <>
          <RecordedMeta activity={activity} />
          <RoutineEntriesView activity={activity} />
        </>
      ) : canManage ? (
        <form className="mt-5 space-y-5" action={action} onSubmit={submitPreservingInput(action)}>
          <input name="patientProgramId" type="hidden" value={programId} />
          <input name="roundNumber" type="hidden" value={roundNumber} />
          {submissionNonce ? <input name="submissionNonce" type="hidden" value={submissionNonce} /> : null}
          <input name="entries" type="hidden" value={JSON.stringify(serializedEntries)} />
          <label className="block max-w-xs space-y-2 text-sm font-semibold text-text" htmlFor="service-one-routine-date">
            <span>วัน เดือน ปี</span>
            <input
              className={inputClassName}
              disabled={locked}
              id="service-one-routine-date"
              name="routineDate"
              onChange={(event) => setRoutineDate(event.target.value)}
              required
              type="date"
              value={routineDate}
            />
          </label>
          <fieldset className="space-y-4" disabled={locked}>
            <legend className="text-sm font-semibold text-text">รายการ ({entries.length}/{ROUTINE_MAX_ENTRIES})</legend>
            {entries.map((entry, index) => (
              <div className="grid gap-3 rounded-control border border-border p-3 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end" key={entry.key}>
                <label className="block space-y-1 text-xs font-semibold text-text">
                  <span>เวลา</span>
                  <input
                    className={inputClassName}
                    maxLength={20}
                    onChange={(event) => updateEntry(index, { timeText: event.target.value })}
                    placeholder="06:00"
                    type="text"
                    value={entry.timeText}
                  />
                </label>
                <label className="block space-y-1 text-xs font-semibold text-text">
                  <span>กิจวัตรประจำวัน</span>
                  <input
                    className={inputClassName}
                    maxLength={500}
                    onChange={(event) => updateEntry(index, { activity: event.target.value })}
                    type="text"
                    value={entry.activity}
                  />
                </label>
                <label className="block space-y-1 text-xs font-semibold text-text">
                  <span>การปรับพฤติกรรม</span>
                  <input
                    className={inputClassName}
                    maxLength={500}
                    onChange={(event) => updateEntry(index, { adjustment: event.target.value })}
                    type="text"
                    value={entry.adjustment}
                  />
                </label>
                <Button
                  disabled={entries.length === 1}
                  onClick={() => setEntries((current) => current.filter((_, candidate) => candidate !== index))}
                  size="compact"
                  type="button"
                  variant="ghost"
                >
                  ลบแถว
                </Button>
              </div>
            ))}
            <Button
              disabled={entries.length >= ROUTINE_MAX_ENTRIES}
              onClick={() => setEntries((current) => [...current, emptyRoutineEntry()])}
              size="compact"
              type="button"
              variant="secondary"
            >
              เพิ่มแถว
            </Button>
          </fieldset>
          <p className="text-sm leading-6 text-text-muted">
            {patientMode ? "กรอกกิจวัตรประจำวันอย่างน้อย 1 แถว แถวที่ไม่มีกิจวัตรจะไม่ถูกบันทึก" : "กรอก “กิจวัตรประจำวัน” อย่างน้อย 1 แถว หรือบันทึกเฉพาะวันที่แล้วแนบรูปหน้ากระดาษ แถวที่ไม่มีกิจวัตรจะไม่ถูกบันทึก"}
          </p>
          <Button disabled={locked || routineDate === "" || (patientMode && filledEntries.length === 0)} loading={pending} size="compact" type="submit">
            {pending ? "กำลังบันทึก…" : patientMode || filledEntries.length > 0 ? "บันทึกตารางชีวิต" : "บันทึกวันที่ แล้วแนบรูป"}
          </Button>
        </form>
      ) : (
        <p className="mt-5 text-sm text-text-muted">ยังไม่มีการบันทึกกิจกรรมนี้ในครั้งนี้</p>
      )}
      {activity.recorded && activity.routineDate !== null && activity.entries.length === 0 && !activity.evidence ? (
        <Alert className="mt-4" variant="warning">ยังไม่มีรายการ แนบรูปหน้ากระดาษเพื่อให้ขั้นตอนนี้ครบ</Alert>
      ) : null}
      <ActionFeedback state={state} />
      <UnknownOutcomeAlert active={unknownOutcome} className="mt-4" recovery={{ kind: "resend", onResend: resendUnconfirmed, resending: pending }} />
      {!patientMode ? <EvidenceAttachmentControl
        activityKey="ROUTINE"
        canManage={canManage}
        evidence={activity.evidence}
        label="ตารางกิจวัตร"
        programId={programId}
        recorded={activity.recorded}
        relationshipId={relationshipId}
        roundNumber={roundNumber}
      /> : null}
    </ActivityCard>
  );
}

function FloatingChartCard({
  activity,
  canManage,
  patientMode = false,
  submissionNonce,
  nextHref,
  programId,
  relationshipId,
  roundNumber,
}: {
  activity: PatientProgramServiceOneProjection["floatingChart"];
  canManage: boolean;
  patientMode?: boolean;
  submissionNonce?: string;
  nextHref?: string | null;
  programId: string;
  relationshipId: string;
  roundNumber: number;
}): React.JSX.Element {
  const router = useRouter();
  const [scores, setScores] = useState<PatientProgramServiceOneFloatingChartScores>(activity.scores ?? {
    familyScore: 0,
    eatingScore: 0,
    workScore: 0,
    healthScore: 0,
    financeScore: 0,
    travelScore: 0,
    exerciseScore: 0,
    wellbeingScore: 0,
  });
  const [state, action, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState<PatientProgramServiceOneActionState, FormData>(
    recordPatientProgramServiceOneFloatingChartAction,
    initialPatientProgramServiceOneActionState,
  );

  useEffect(() => {
    // SR-D7: inside the round stepper a saved result moves on to the next step.
    if (state.status === "SUCCESS" && nextHref) {
      router.push(nextHref);
      return;
    }

    if (state.status === "SUCCESS" || (state.status === "ERROR" && state.code === "CONFLICT")) {
      router.refresh();
    }
  }, [nextHref, router, state]);

  const recordedResult = activity.recorded ? (
    <div className="mt-5 space-y-4">
      <RecordedMeta activity={activity} />
      <FloatingChartVisualization scores={activity.scores} />
      {roundNumber === 4 && activity.scores ? (
        <FloatingChartComparison currentScores={activity.scores} roundOneScores={activity.roundOneScores} />
      ) : null}
    </div>
  ) : null;

  return (
    <ActivityCard activity={activity} description="ให้คะแนนชีวิตแต่ละด้านของตัวเองในตอนนี้หน่อย" id="FLOATING_CHART" title="กราฟวัดลอยจม">
      {activity.recorded ? recordedResult : canManage ? (
        <div className={roundNumber === 4 ? "mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]" : "mt-5"}>
          <form className="space-y-5" action={action} onSubmit={submitPreservingInput(action)}>
            <input name="patientProgramId" type="hidden" value={programId} />
            <input name="roundNumber" type="hidden" value={roundNumber} />
          {submissionNonce ? <input name="submissionNonce" type="hidden" value={submissionNonce} /> : null}
            <fieldset className="space-y-4">
              <legend className="mb-3 text-sm font-semibold leading-6 text-text">ให้คะแนนชีวิตแต่ละด้านของตัวเองในตอนนี้หน่อย</legend>
              {FLOATING_CHART_DIMENSIONS.map(({ field, label }) => {
                const id = `service-one-floating-${roundNumber}-${field}`;

                return (
                  <div className="border-b border-border pb-3 last:border-0" key={field}>
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-sm font-semibold text-text" htmlFor={id}>{label}</label>
                      <output className="min-w-8 text-right text-sm font-semibold tabular-nums text-brand-strong" htmlFor={id}>
                        {scores[field]}
                      </output>
                    </div>
                    <input
                      aria-valuetext={`${scores[field]} คะแนน`}
                      className="mt-2 h-11 w-full cursor-pointer accent-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                      disabled={pending || unknownOutcome}
                      id={id}
                      max={5}
                      min={-5}
                      name={field}
                      onChange={(event) => { const value = Number(event.currentTarget.value); setScores((current) => ({ ...current, [field]: value })); }}
                      required
                      step={1}
                      type="range"
                      value={scores[field]}
                    />
                    <ScoreScale
                      disabled={pending || unknownOutcome}
                      label={label}
                      onSelect={(value) => setScores((current) => ({ ...current, [field]: value }))}
                      value={scores[field]}
                    />
                  </div>
                );
              })}
            </fieldset>

            <fieldset className="space-y-3 border-t border-border pt-4">
              <legend className="font-semibold text-text">ไม้บรรทัดวัดทุกข์สุข</legend>
              <div aria-hidden="true" className="grid grid-cols-11 justify-items-center">
                <span className="col-start-1"><RulerFace mood="sad" /></span>
                <span className="col-start-6"><RulerFace mood="neutral" /></span>
                <span className="col-start-11"><RulerFace mood="happy" /></span>
              </div>
              <label className="sr-only" htmlFor={`service-one-floating-${roundNumber}-wellbeingScore`}>ไม้บรรทัดวัดทุกข์สุข</label>
              <input
                aria-valuetext={`${scores.wellbeingScore} คะแนน`}
                className="h-11 w-full cursor-pointer accent-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                disabled={pending || unknownOutcome}
                id={`service-one-floating-${roundNumber}-wellbeingScore`}
                max={5}
                min={-5}
                name="wellbeingScore"
                onChange={(event) => { const value = Number(event.currentTarget.value); setScores((current) => ({ ...current, wellbeingScore: value })); }}
                required
                step={1}
                type="range"
                value={scores.wellbeingScore}
              />
              <ScoreScale
                disabled={pending || unknownOutcome}
                label="ไม้บรรทัดวัดทุกข์สุข"
                onSelect={(value) => setScores((current) => ({ ...current, wellbeingScore: value }))}
                value={scores.wellbeingScore}
              />
            </fieldset>

            <div className="space-y-3 border-t border-border pt-4">
              <h4 className="font-semibold text-text">กราฟวัดลอยจม</h4>
              <FloatingChartVisualization scores={scores} />
            </div>

            <label className="block space-y-2 text-sm font-semibold text-text" htmlFor={`service-one-floating-${roundNumber}-summary`}>
              <span>สรุป (ไม่บังคับ)</span>
              <textarea
                className={`${inputClassName} min-h-28 py-3`}
                disabled={pending || unknownOutcome}
                id={`service-one-floating-${roundNumber}-summary`}
                maxLength={2000}
                defaultValue={activity.summary ?? ""}
                name="summary"
                placeholder="เขียนสรุปจากกิจกรรมนี้ได้ถ้าจำเป็น"
                rows={4}
              />
              <span className="text-xs font-normal leading-5 text-text-muted">ไม่เกิน 2,000 ตัวอักษร</span>
            </label>
            <Button disabled={pending || unknownOutcome} loading={pending} size="compact" type="submit">
              {pending ? "กำลังบันทึก…" : "บันทึกกิจกรรม"}
            </Button>
          </form>
          {roundNumber === 4 ? (
            <FloatingChartComparison currentScores={scores} roundOneScores={activity.roundOneScores} />
          ) : null}
        </div>
      ) : (
        <p className="mt-5 text-sm text-text-muted">ยังไม่มีการบันทึกกิจกรรมนี้ในครั้งนี้</p>
      )}
      {activity.recorded && activity.summary ? (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-sm text-text-muted">สรุปที่บันทึกไว้</p>
          <p className="mt-1 break-words whitespace-pre-wrap text-text">{activity.summary}</p>
        </div>
      ) : null}
      <ActionFeedback state={state} />
      <UnknownOutcomeAlert active={unknownOutcome} className="mt-4" recovery={{ kind: "resend", onResend: resendUnconfirmed, resending: pending }} />
      {!patientMode ? <EvidenceAttachmentControl
        activityKey="FLOATING_CHART"
        canManage={canManage}
        evidence={activity.evidence}
        label="กราฟวัดลอยจม"
        programId={programId}
        recorded={activity.recorded}
        relationshipId={relationshipId}
        roundNumber={roundNumber}
      /> : null}
    </ActivityCard>
  );
}

const SCORE_SCALE = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5] as const;

/** The booklet's numbered −5…5 scale under each slider; tapping a number sets that score. */
function ScoreScale({
  disabled,
  label,
  onSelect,
  value,
}: {
  disabled: boolean;
  label: string;
  onSelect: (value: number) => void;
  value: number;
}): React.JSX.Element {
  return (
    <div aria-label={`เลือกคะแนน${label}`} className="grid grid-cols-11" role="group">
      {SCORE_SCALE.map((score) => {
        const selected = score === value;
        const anchor = score === -5 || score === 0 || score === 5;

        return (
          <button
            aria-label={`${score} คะแนน`}
            aria-pressed={selected}
            className={`mx-auto flex min-h-11 w-full max-w-11 items-center justify-center rounded-full tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring disabled:cursor-not-allowed ${
              selected
                ? "bg-brand-soft font-bold text-brand-strong"
                : `hover:bg-brand-soft ${anchor ? "text-sm font-bold text-text" : "text-xs text-text-muted"}`
            }`}
            disabled={disabled}
            key={score}
            onClick={() => onSelect(score)}
            type="button"
          >
            {score < 0 ? `−${-score}` : score}
          </button>
        );
      })}
    </div>
  );
}

function RulerFace({ mood }: { mood: "sad" | "neutral" | "happy" }): React.JSX.Element {
  const mouthPath = mood === "sad" ? "M7 18 Q12 13 17 18" : mood === "happy" ? "M7 15 Q12 21 17 15" : "M7 16 H17";

  return (
    <svg aria-hidden="true" className="h-6 w-6" fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" fill="var(--brand-pale)" r="10" stroke="var(--brand-strong)" strokeWidth="1.5" />
      <circle cx="8.5" cy="10" fill="var(--brand-strong)" r="1" />
      <circle cx="15.5" cy="10" fill="var(--brand-strong)" r="1" />
      <path d={mouthPath} stroke="var(--brand-strong)" strokeLinecap="round" strokeWidth="1.5" />
    </svg>
  );
}

/** R2-G: the booklet's three dream card fields (labels verbatim). */
const DREAM_CARD_FIELDS = [
  { name: "dream", label: "ความฝันของฉัน (สิ่งที่อยากทำให้ได้/อยากไป/อยากทำ)", required: true },
  { name: "obstacle", label: "อุปสรรค (ตอนนี้โรคหรือร่างกายขวางอะไรอยู่)", required: false },
  { name: "weeklyGoal", label: "เป้าหมายเล็ก ๆ สัปดาห์นี้ (หนึ่งก้าวเล็ก ๆ เพื่อไปสู่ความฝัน)", required: true },
] as const;

function DreamCard({
  activity,
  canManage,
  patientMode = false,
  submissionNonce,
  nextHref,
  programId,
  relationshipId,
  roundNumber,
}: {
  activity: PatientProgramServiceOneProjection["dreamCard"];
  canManage: boolean;
  patientMode?: boolean;
  submissionNonce?: string;
  nextHref?: string | null;
  programId: string;
  relationshipId: string;
  roundNumber: number;
}): React.JSX.Element {
  const router = useRouter();
  const [state, action, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState<PatientProgramServiceOneActionState, FormData>(
    recordPatientProgramServiceOneDreamCardAction,
    initialPatientProgramServiceOneActionState,
  );

  useEffect(() => {
    // SR-D7: inside the round stepper a saved result moves on to the next step.
    if (state.status === "SUCCESS" && nextHref) {
      router.push(nextHref);
      return;
    }

    if (state.status === "SUCCESS" || (state.status === "ERROR" && state.code === "CONFLICT")) {
      router.refresh();
    }
  }, [nextHref, router, state]);

  return (
    <ActivityCard activity={activity} description="บันทึกความฝันของฉัน อุปสรรค และเป้าหมายเล็ก ๆ สัปดาห์นี้" id="DREAM_CARD" title="ความฝันของฉัน">
      {activity.recorded ? <RecordedMeta activity={activity} /> : canManage ? (
        <form className="mt-5 space-y-4" action={action} onSubmit={submitPreservingInput(action)}>
          <input name="patientProgramId" type="hidden" value={programId} />
          <input name="roundNumber" type="hidden" value={roundNumber} />
          {submissionNonce ? <input name="submissionNonce" type="hidden" value={submissionNonce} /> : null}
          {DREAM_CARD_FIELDS.map((field) => (
            <label className="block space-y-2 text-sm font-semibold text-text" htmlFor={`service-one-dream-${field.name}`} key={field.name}>
              <span>
                {field.label}
                {field.required ? "" : " (ไม่บังคับ)"}
              </span>
              <textarea
                className={`${inputClassName} min-h-24 py-3`}
                disabled={pending || unknownOutcome}
                id={`service-one-dream-${field.name}`}
                maxLength={1000}
                defaultValue={activity[field.name] ?? ""}
                name={field.name}
                required={field.required}
                rows={3}
              />
            </label>
          ))}
          <Button disabled={pending || unknownOutcome} loading={pending} size="compact" type="submit">
            {pending ? "กำลังบันทึก…" : "บันทึกกิจกรรม"}
          </Button>
        </form>
      ) : (
        <p className="mt-5 text-sm text-text-muted">ยังไม่มีการบันทึกกิจกรรมนี้ในครั้งนี้</p>
      )}
      {activity.recorded ? (
        <dl className="mt-4 space-y-3 border-t border-border pt-4">
          {DREAM_CARD_FIELDS.map((field) =>
            activity[field.name] ? (
              <div key={field.name}>
                <dt className="text-sm text-text-muted">{field.label}</dt>
                <dd className="mt-1 break-words whitespace-pre-wrap text-text">{activity[field.name]}</dd>
              </div>
            ) : null,
          )}
          {/* Cards recorded before R2 keep their free-text description. */}
          {activity.description ? (
            <div>
              <dt className="text-sm text-text-muted">คำอธิบายที่บันทึกไว้</dt>
              <dd className="mt-1 break-words whitespace-pre-wrap text-text">{activity.description}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <ActionFeedback state={state} />
      <UnknownOutcomeAlert active={unknownOutcome} className="mt-4" recovery={{ kind: "resend", onResend: resendUnconfirmed, resending: pending }} />
      {!patientMode ? <EvidenceAttachmentControl
        activityKey="DREAM_CARD"
        canManage={canManage}
        evidence={activity.evidence}
        label="การ์ดความฝัน"
        programId={programId}
        recorded={activity.recorded}
        relationshipId={relationshipId}
        roundNumber={roundNumber}
      /> : null}
    </ActivityCard>
  );
}

function ConfidenceCard({
  activity,
  canManage,
  patientMode = false,
  submissionNonce,
  nextHref,
  programId,
  roundNumber,
}: {
  activity: PatientProgramServiceOneProjection["confidence"];
  canManage: boolean;
  patientMode?: boolean;
  submissionNonce?: string;
  nextHref?: string | null;
  programId: string;
  roundNumber: number;
}): React.JSX.Element {
  const router = useRouter();
  const [state, action, pending, unknownOutcome, resendUnconfirmed] = useMutationActionState<PatientProgramServiceOneActionState, FormData>(
    recordPatientProgramServiceOneConfidenceAction,
    initialPatientProgramServiceOneActionState,
  );

  useEffect(() => {
    // SR-D7: inside the round stepper a saved result moves on to the next step.
    if (state.status === "SUCCESS" && nextHref) {
      router.push(nextHref);
      return;
    }

    if (state.status === "SUCCESS" || (state.status === "ERROR" && state.code === "CONFLICT")) {
      router.refresh();
    }
  }, [nextHref, router, state]);

  return (
    <ActivityCard activity={activity} description={patientMode ? "เลือกคะแนนความมั่นใจของคุณ 0–10" : "บันทึกคะแนนความมั่นใจและการสะท้อนตนเองในช่วง 0–10"} id="CONFIDENCE" title="ไม้บรรทัดวัดใจ">
      {activity.recorded ? <RecordedMeta activity={activity} /> : canManage ? (
        <form className="mt-5 space-y-5" action={action} onSubmit={submitPreservingInput(action)}>
          <input name="patientProgramId" type="hidden" value={programId} />
          <input name="roundNumber" type="hidden" value={roundNumber} />
          {submissionNonce ? <input name="submissionNonce" type="hidden" value={submissionNonce} /> : null}
          <fieldset>
            <legend className="text-sm font-semibold text-text">เลือกคะแนนสะท้อนความมั่นใจ 0–10</legend>
            <div className="mt-3 grid grid-cols-6 gap-2 sm:grid-cols-11">
              {Array.from({ length: 11 }, (_, score) => (
                <label className="group cursor-pointer" key={score}>
                  <input className="peer sr-only" defaultChecked={activity.score === score} name="score" required type="radio" value={score} />
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
              disabled={pending || unknownOutcome}
              id="service-one-confidence-plan"
              maxLength={2000}
              defaultValue={activity.improvementPlan ?? ""}
              name="improvementPlan"
              placeholder="เขียนสิ่งที่อยากลองทำต่อได้ถ้าจำเป็น"
              rows={4}
            />
            <span className="text-xs font-normal leading-5 text-text-muted">ไม่เกิน 2,000 ตัวอักษร</span>
          </label>
          <Button disabled={pending || unknownOutcome} loading={pending} size="compact" type="submit">
            {pending ? "กำลังบันทึก…" : "บันทึกกิจกรรม"}
          </Button>
        </form>
      ) : (
        <p className="mt-5 text-sm text-text-muted">ยังไม่มีการบันทึกกิจกรรมนี้ในครั้งนี้</p>
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
      <UnknownOutcomeAlert active={unknownOutcome} className="mt-4" recovery={{ kind: "resend", onResend: resendUnconfirmed, resending: pending }} />
    </ActivityCard>
  );
}

export type ServiceOneToolKey = "routine" | "floatingChart" | "dreamCard" | "confidence";

/** R1-D: one per-round Service 1 tool, embedded as a step of the round stepper. */
export function ServiceOneToolStep({
  canManage,
  patientMode = false,
  submissionNonce,
  nextHref,
  programId,
  relationshipId,
  roundNumber,
  serviceOne,
  tool,
}: {
  canManage: boolean;
  patientMode?: boolean;
  submissionNonce?: string;
  nextHref: string | null;
  programId: string;
  relationshipId: string;
  roundNumber: number;
  serviceOne: PatientProgramServiceOneProjection;
  tool: ServiceOneToolKey;
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const shared = { canManage, nextHref, programId, roundNumber, patientMode, submissionNonce };
  const display: PatientProgramServiceOneProjection = (editing || patientMode) && canManage ? { ...serviceOne, [tool]: { ...serviceOne[tool], recorded: false } } : serviceOne;
  let form: React.JSX.Element;

  switch (tool) {
    case "routine":
      form = <RoutineCard {...shared} activity={display.routine} relationshipId={relationshipId} />;
      break;
    case "floatingChart":
      form = <FloatingChartCard {...shared} activity={display.floatingChart} relationshipId={relationshipId} />;
      break;
    case "dreamCard":
      form = <DreamCard {...shared} activity={display.dreamCard} relationshipId={relationshipId} />;
      break;
    case "confidence":
      form = <ConfidenceCard {...shared} activity={display.confidence} />;
      break;
  }
  return <div className="space-y-4">{canManage && !patientMode && serviceOne[tool].recorded && !editing ? <Button type="button" variant="secondary" onClick={() => setEditing(true)}>บันทึกใหม่</Button> : null}{form}</div>;
}

const TOOL_LABELS: Readonly<Record<ServiceOneToolKey, string>> = {
  routine: "ตารางชีวิตของฉัน",
  floatingChart: "กราฟวัดลอยจม",
  dreamCard: "ความฝันของฉัน",
  confidence: "ไม้บรรทัดวัดใจ",
};

function toolDetail(round: PatientProgramServiceOneRoundProjection, tool: ServiceOneToolKey): string | null {
  if (tool === "confidence") {
    return round.confidence.score === null ? null : `${round.confidence.score} / 10`;
  }

  if (tool === "floatingChart") {
    return round.floatingChart.summary;
  }

  return tool === "dreamCard" ? (round.dreamCard.dream ?? round.dreamCard.description) : null;
}

/**
 * SR-D8: Service 1 results are recorded per round inside the round stepper; the Program page lists
 * them read-only by round.
 */
export function PatientProgramServiceOneWorkspace({
  detail,
}: {
  detail: PatientProgramDetail;
}): React.JSX.Element {
  const relationshipId = detail.patient.patientHospitalRelationshipId;
  const roundsPath = `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(detail.programId)}/rounds`;

  return (
    <section aria-labelledby="patient-program-service-one-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="patient-program-service-one-heading">
            เครื่องมือ Service 1 รายครั้ง
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
            ไม้บรรทัดวัดใจ กราฟวัดลอยจม ตารางชีวิตของฉัน และความฝันของฉัน บันทึกผลใหม่ในทุกครั้งที่รายการของครั้งนั้นกำหนด
            โดยบันทึกผ่านการจัดบริการรายครั้ง ส่วนนี้แสดงผลที่บันทึกแล้วแบบอ่านอย่างเดียว
          </p>
        </div>
        <Link className={buttonClassName({ size: "compact", variant: "secondary" })} href={roundsPath}>
          ไปที่การจัดบริการรายครั้ง
        </Link>
      </div>

      <ul className="mt-6 grid gap-4 lg:grid-cols-2">
        {detail.serviceOne.map((round) => (
          <li className="rounded-panel border border-border bg-surface p-5" key={round.roundNumber}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-text">ครั้งที่ {round.roundNumber}</h3>
              <Link className="text-sm font-semibold text-brand-strong underline underline-offset-4" href={`${roundsPath}/${round.roundNumber}`}>
                เปิดครั้งนี้
              </Link>
            </div>
            <dl className="mt-3 divide-y divide-border">
              {round.listedTools.map((tool) => {
                const activity = round[tool];
                const extra = activity.recorded ? toolDetail(round, tool) : null;

                return (
                  <div className="flex flex-col gap-1 py-2 sm:flex-row sm:items-start sm:justify-between" key={tool}>
                    <dt className="text-sm font-semibold text-text">{TOOL_LABELS[tool]}</dt>
                    <dd className="min-w-0 text-sm text-text-muted sm:text-right">
                      <StatusBadge variant={activityStatusVariant(activity.recorded)}>
                        {activityStatusLabel(activity.recorded)}
                      </StatusBadge>
                      {activity.recordedAt ? <span className="mt-1 block">{formatDateTime(activity.recordedAt)}</span> : null}
                      {extra ? <span className="mt-1 block break-words whitespace-pre-wrap text-text">{extra}</span> : null}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {round.floatingChart.recorded ? (
              <div className="mt-4 space-y-4 border-t border-border pt-4">
                <FloatingChartVisualization scores={round.floatingChart.scores} />
                {round.roundNumber === 4 && round.floatingChart.scores ? (
                  <FloatingChartComparison
                    currentScores={round.floatingChart.scores}
                    roundOneScores={round.floatingChart.roundOneScores}
                  />
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export const patientProgramServiceOneWorkspaceInternals = {
  uploadAndAssociateEvidence,
};
