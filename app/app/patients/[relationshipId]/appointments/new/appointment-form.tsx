"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  APPOINTMENT_DEFAULT_DURATION_MINUTES,
  APPOINTMENT_LOCATION_LABELS,
  APPOINTMENT_LOCATION_VALUES,
  APPOINTMENT_TYPE_LABELS,
  APPOINTMENT_TYPE_VALUES,
  type AppointmentLocationValue,
  type AppointmentTypeValue,
} from "@/modules/appointments/domain/appointment-definitions";
import {
  initialAppointmentActionState,
  type AppointmentActionState,
} from "@/modules/appointments/transport/action-state";
import {
  createAppointmentAction,
  rescheduleAppointmentAction,
} from "@/modules/appointments/transport/server-actions";

type PatientContext = {
  patientHospitalRelationshipId: string;
  displayName: string;
  hospitalNumber: string | null;
  hospital: {
    id: string;
    name: string;
  };
};

type ResponsibleMember = {
  userId: string;
  displayName: string;
  profession: string | null;
  membershipType: string;
};

type AppointmentFormValue = {
  appointmentId: string;
  type: AppointmentTypeValue;
  scheduledAt: string;
  durationMinutes: number | null;
  locationType: AppointmentLocationValue | null;
  locationDetail: string | null;
  note: string | null;
  responsibleUserId: string | null;
  updatedAt: string;
};

type CommonProps = {
  relationshipId: string;
  patient: PatientContext;
  responsibleMembers: readonly ResponsibleMember[];
};

type CreateProps = CommonProps & {
  mode: "create";
  submissionNonce: string;
  appointment?: never;
};

type RescheduleProps = CommonProps & {
  mode: "reschedule";
  appointment: AppointmentFormValue;
  submissionNonce?: never;
};

export type AppointmentFormProps = CreateProps | RescheduleProps;

const inputClassName =
  "min-h-12 w-full rounded-control border border-border bg-surface px-4 py-2.5 text-base font-normal text-text outline-none transition-[border-color,box-shadow] placeholder:text-text-subtle focus:border-action-primary focus:ring-4 focus:ring-focus-ring disabled:cursor-not-allowed disabled:bg-surface-muted";

const labelClassName = "block space-y-2 text-sm font-semibold text-text";

const professionLabels: Record<string, string> = {
  DOCTOR: "แพทย์",
  NURSE: "พยาบาล",
  COORDINATOR: "ผู้ประสานงาน",
  OTHER: "บุคลากรอื่น",
};

const membershipLabels: Record<string, string> = {
  OWNER: "เจ้าของโรงพยาบาล",
  MEMBER: "สมาชิกโรงพยาบาล",
};

function formatBangkokDateTimeInput(value: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get("year")}-${values.get("month")}-${values.get("day")}T${values.get("hour")}:${values.get("minute")}`;
}

function formatBangkokIso(value: string): string {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00+07:00` : "";
}

function professionLabel(value: string | null): string {
  return value ? professionLabels[value] ?? value : "ไม่ระบุวิชาชีพ";
}

function ActionFeedback({ state }: { state: AppointmentActionState }): React.JSX.Element | null {
  if (state.status !== "ERROR") {
    return null;
  }

  return (
    <Alert className="mt-5" variant={state.code === "CONFLICT" ? "warning" : "danger"}>
      <p className="font-semibold">บันทึก Appointment ไม่สำเร็จ</p>
      <p className="mt-1">{state.message}</p>
    </Alert>
  );
}

export function AppointmentForm(props: AppointmentFormProps): React.JSX.Element {
  const router = useRouter();
  const appointment = props.mode === "reschedule" ? props.appointment : null;
  const [createState, createAction, createPending] = useActionState<
    AppointmentActionState,
    FormData
  >(createAppointmentAction, initialAppointmentActionState);
  const [rescheduleState, rescheduleAction, reschedulePending] = useActionState<
    AppointmentActionState,
    FormData
  >(rescheduleAppointmentAction, initialAppointmentActionState);
  const [scheduledAtLocal, setScheduledAtLocal] = useState(
    formatBangkokDateTimeInput(appointment?.scheduledAt ?? null),
  );
  const [type, setType] = useState<AppointmentTypeValue>(appointment?.type ?? "FOLLOW_UP");
  const [responsibleUserId, setResponsibleUserId] = useState(appointment?.responsibleUserId ?? "");
  const [durationMinutes, setDurationMinutes] = useState(
    appointment?.durationMinutes?.toString() ?? String(APPOINTMENT_DEFAULT_DURATION_MINUTES),
  );
  const [locationType, setLocationType] = useState<AppointmentLocationValue | "">(
    appointment?.locationType ?? "CLINIC",
  );
  const [locationDetail, setLocationDetail] = useState(appointment?.locationDetail ?? "");
  const [note, setNote] = useState(appointment?.note ?? "");
  const state = props.mode === "create" ? createState : rescheduleState;
  const pending = props.mode === "create" ? createPending : reschedulePending;
  const formAction = props.mode === "create" ? createAction : rescheduleAction;
  const detailHref = appointment
    ? `/app/patients/${encodeURIComponent(props.relationshipId)}/appointments/${encodeURIComponent(appointment.appointmentId)}`
    : null;

  useEffect(() => {
    if (state.status === "SUCCESS") {
      router.push(
        `/app/patients/${encodeURIComponent(props.relationshipId)}/appointments/${encodeURIComponent(state.result.appointmentId)}`,
      );
    }
  }, [props.relationshipId, router, state]);

  const title = props.mode === "create" ? "สร้าง Appointment" : "Reschedule Appointment";
  const description =
    props.mode === "create"
      ? "สร้างนัดหมายในประวัติของผู้ป่วยและโรงพยาบาลนี้"
      : "แก้ไขรายละเอียดนัดหมายที่ยังอยู่ในสถานะนัดหมายแล้ว";

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={<StatusBadge variant="warning">ต้นแบบเพื่อเก็บ Requirement</StatusBadge>}
        breadcrumbs={[
          {
            href: `/app/patients/${encodeURIComponent(props.relationshipId)}`,
            label: "รายละเอียดผู้ป่วย",
          },
          {
            href: `/app/patients/${encodeURIComponent(props.relationshipId)}/appointments`,
            label: "Appointments",
          },
          { label: title },
        ]}
        description={description}
        title={title}
      />

      <form action={formAction} className="space-y-6 pt-8">
        <input
          name="patientHospitalRelationshipId"
          type="hidden"
          value={props.relationshipId}
        />
        {props.mode === "create" ? (
          <input name="submissionNonce" type="hidden" value={props.submissionNonce} />
        ) : props.mode === "reschedule" ? (
          <>
            <input name="appointmentId" type="hidden" value={props.appointment.appointmentId} />
            <input name="expectedUpdatedAt" type="hidden" value={props.appointment.updatedAt} />
          </>
        ) : null}
        <input name="scheduledAt" readOnly type="hidden" value={formatBangkokIso(scheduledAtLocal)} />
        <input name="type" readOnly type="hidden" value={type} />
        <input name="responsibleUserId" readOnly type="hidden" value={responsibleUserId} />
        <input name="durationMinutes" readOnly type="hidden" value={durationMinutes} />
        <input name="locationType" readOnly type="hidden" value={locationType} />
        <input name="locationDetail" readOnly type="hidden" value={locationDetail} />
        <input name="note" readOnly type="hidden" value={note} />

        <Alert variant="warning">
          <p className="font-semibold">ต้นแบบเพื่อเก็บ Requirement</p>
          <p className="mt-1">
            ประเภท สถานะ ผู้รับผิดชอบ และอำนาจของผู้ใช้งานในหน้านี้เป็นพฤติกรรมต้นแบบ
            ที่รอการยืนยันจากลูกค้า ยังไม่ใช่ข้อกำหนดทางคลินิกหรือการปฏิบัติงานฉบับสุดท้าย
          </p>
          <p className="mt-2 text-xs">
            เวลาในฟอร์มตีความเป็นเวลาไทย (Asia/Bangkok, UTC+07:00) และส่งเป็น ISO timestamp ที่มี offset
          </p>
        </Alert>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">ผู้ป่วยและบริบทโรงพยาบาล</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-text-muted">ผู้ป่วย</p>
              <p className="mt-1 text-lg font-semibold text-text">{props.patient.displayName}</p>
            </div>
            <div>
              <p className="text-sm text-text-muted">โรงพยาบาล</p>
              <p className="mt-1 text-lg font-semibold text-text">{props.patient.hospital.name}</p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-text-muted">
            HN ของโรงพยาบาลนี้: {props.patient.hospitalNumber ?? "ไม่ระบุ"}
          </p>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">รายละเอียดนัดหมาย</h2>
          <fieldset className="mt-6 grid gap-5 sm:grid-cols-2" disabled={pending}>
            <label className={labelClassName} htmlFor="appointment-scheduled-at">
              <span>วันและเวลานัดหมาย</span>
              <input
                className={inputClassName}
                id="appointment-scheduled-at"
                onChange={(event) => setScheduledAtLocal(event.target.value)}
                required
                type="datetime-local"
                value={scheduledAtLocal}
              />
              <span className="text-xs font-normal leading-5 text-text-muted">
                กรุณาเลือกวันและเวลาในเขตเวลาไทย
              </span>
            </label>

            <label className={labelClassName} htmlFor="appointment-type">
              <span>ประเภท Appointment</span>
              <Select
                id="appointment-type"
                onChange={(event) => setType(event.target.value as AppointmentTypeValue)}
                value={type}
              >
                {APPOINTMENT_TYPE_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {APPOINTMENT_TYPE_LABELS[value]}
                  </option>
                ))}
              </Select>
              <span className="text-xs font-normal leading-5 text-text-muted">
                ใช้เพื่อจัดประเภทและแสดงผลเท่านั้น ยังไม่มีพฤติกรรมอัตโนมัติตามประเภท
              </span>
            </label>

            <label className={labelClassName} htmlFor="appointment-responsible-user">
              <span>ผู้รับผิดชอบ (ไม่บังคับ)</span>
              <Select
                id="appointment-responsible-user"
                onChange={(event) => setResponsibleUserId(event.target.value)}
                value={responsibleUserId}
              >
                <option value="">ยังไม่ระบุผู้รับผิดชอบ</option>
                {props.responsibleMembers.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.displayName} · {professionLabel(member.profession)} · {membershipLabels[member.membershipType] ?? member.membershipType}
                  </option>
                ))}
              </Select>
              <span className="text-xs font-normal leading-5 text-text-muted">
                รายการนี้มาจากสมาชิกที่ active โดยตรงของโรงพยาบาลนี้เท่านั้น
              </span>
            </label>

            <label className={labelClassName} htmlFor="appointment-duration">
              <span>ระยะเวลา (นาที, ไม่บังคับ)</span>
              <input
                className={inputClassName}
                id="appointment-duration"
                max={480}
                min={5}
                onChange={(event) => setDurationMinutes(event.target.value)}
                type="number"
                value={durationMinutes}
              />
              <span className="text-xs font-normal leading-5 text-text-muted">
                ค่าเริ่มต้น 30 นาทีเป็นค่าชั่วคราวสำหรับการทดลองต้นแบบ
              </span>
            </label>

            <label className={labelClassName} htmlFor="appointment-location-type">
              <span>รูปแบบสถานที่ (ไม่บังคับ)</span>
              <Select
                id="appointment-location-type"
                onChange={(event) => setLocationType(event.target.value as AppointmentLocationValue | "")}
                value={locationType}
              >
                <option value="">ยังไม่ระบุสถานที่</option>
                {APPOINTMENT_LOCATION_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {APPOINTMENT_LOCATION_LABELS[value]}
                  </option>
                ))}
              </Select>
            </label>

            <label className={labelClassName} htmlFor="appointment-location-detail">
              <span>รายละเอียดสถานที่ (ไม่บังคับ)</span>
              <input
                className={inputClassName}
                id="appointment-location-detail"
                maxLength={500}
                onChange={(event) => setLocationDetail(event.target.value)}
                placeholder="เช่น ห้องตรวจ หรือช่องทางติดต่อ"
                type="text"
                value={locationDetail}
              />
            </label>

            <label className={`${labelClassName} sm:col-span-2`} htmlFor="appointment-note">
              <span>หมายเหตุ (ไม่บังคับ)</span>
              <textarea
                className={`${inputClassName} min-h-32 py-3`}
                id="appointment-note"
                maxLength={2000}
                onChange={(event) => setNote(event.target.value)}
                placeholder="บันทึกเฉพาะรายละเอียดการนัดหมายที่จำเป็น"
                value={note}
              />
              <span className="text-xs font-normal leading-5 text-text-muted">
                หมายเหตุจะแสดงเฉพาะใน Appointment ที่ผู้ใช้มีสิทธิ์เข้าถึง และไม่ถูกเขียนลง audit metadata
              </span>
            </label>
          </fieldset>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em]">ตรวจสอบก่อนบันทึก</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            ระบบจะตรวจสอบสิทธิ์ ขอบเขตผู้ป่วย และสมาชิกผู้รับผิดชอบซ้ำฝั่งเซิร์ฟเวอร์
          </p>
          <ActionFeedback state={state} />
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button disabled={pending || !scheduledAtLocal} type="submit">
              {pending ? "กำลังตรวจสอบและบันทึก..." : props.mode === "create" ? "บันทึก Appointment" : "บันทึกการ Reschedule"}
            </Button>
            <Link
              className="inline-flex min-h-12 items-center justify-center rounded-control border border-border-strong bg-surface px-5 py-2.5 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              href={detailHref ?? `/app/patients/${encodeURIComponent(props.relationshipId)}/appointments`}
            >
              ยกเลิก
            </Link>
          </div>
        </Panel>
      </form>
    </div>
  );
}
