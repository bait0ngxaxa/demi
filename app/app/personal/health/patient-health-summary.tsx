import Link from "next/link";
import type { PatientHospitalHealthHistory } from "@prisma/client";

import { HomeHospitalChip } from "@/components/home/home-hospital-chip";
import { Alert } from "@/components/ui/alert";
import { HomeHero } from "@/components/home/home-hero";
import { ageInBangkok } from "@/modules/family/domain/family-health-summary";
import type { PersonalMedicationDetailDto } from "@/modules/medications/domain/personal-medication-definitions";
import type { PatientSelfGoalPlanDetail, PatientSelfHomeNextAppointment } from "@/modules/patient-self/services/patient-self-care-query-service";
import type { PatientHealthMeasurement, PatientHealthMeasurements, PatientSelfAssignedOsm } from "@/modules/patient-self/services/patient-self-health-query-service";
import type { PatientSelfMeasurementDto } from "@/modules/patient-self-measurements/domain/patient-self-measurement";

import { PatientSelfMeasurementValues } from "../measurements/patient-self-measurement-values";
import { formatPatientDateOnly, formatPatientDateTime } from "../patient-self-care-presentation";

export type PatientHealthSummaryData = {
  person: { givenName: string | null; familyName: string | null } | null;
  dateOfBirth: Date | null;
  history: PatientHospitalHealthHistory | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  measurements: PatientHealthMeasurements | null;
  selfMeasurement: PatientSelfMeasurementDto | null;
  medications: { items: PersonalMedicationDetailDto[]; hasMore: boolean } | null;
  appointment: PatientSelfHomeNextAppointment | null;
  osm: PatientSelfAssignedOsm | null;
  plan: PatientSelfGoalPlanDetail | null;
  readFailures: {
    profile: boolean;
    health: boolean;
    measurements: boolean;
    selfMeasurement: boolean;
    medications: boolean;
    appointment: boolean;
    osm: boolean;
    plan: boolean;
  };
};

const empty = "โรงพยาบาลยังไม่ได้บันทึก";
const linkClass = "inline-flex min-h-11 items-center rounded-control font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";
const answer = (value: string | null | undefined): string => value === "YES" ? "มี" : value === "NO" ? "ไม่มี" : "ไม่ทราบ";

function HealthItem({ number, title, children }: { number: number; title: string; children: React.ReactNode }): React.JSX.Element {
  return <div className="min-w-0 border-b border-border py-5 last:border-b-0" data-health-item={number}>
    <h3 className="font-semibold text-text">{title}</h3>
    <div className="mt-2 break-words text-text-muted">{children}</div>
  </div>;
}

function HealthReadFailure({ retryHref }: { retryHref: string }): React.JSX.Element {
  return <Alert className="mt-2" role="alert" variant="warning">
    โหลดข้อมูลส่วนนี้ไม่สำเร็จ กรุณา <Link className={linkClass} href={retryHref}>ลองโหลดหน้าใหม่</Link>
  </Alert>;
}

function Measurement({ fact, unit, unavailable = false }: {
  fact: PatientHealthMeasurement | null;
  unit: string;
  unavailable?: boolean;
}): React.JSX.Element {
  if (unavailable) return <p>ข้อมูลไม่พร้อมแสดง</p>;
  return fact ? <>
    <p className="font-semibold tabular-nums text-text">{fact.value}{unit ? ` ${unit}` : ""}</p>
    <p className="mt-1 text-sm">{formatPatientDateOnly(fact.date)} · {fact.source}</p>
  </> : <p>{empty}</p>;
}

function Phone({ value }: { value: string | null }): React.JSX.Element {
  return value ? <a className={linkClass} href={`tel:${value.replace(/[^0-9+]/g, "")}`}>{value}</a> : <span>{empty}</span>;
}

export function PatientHealthSummary({ hospitals, selected, summary }: {
  hospitals: readonly { relationshipId: string; hospitalName: string }[];
  selected: { relationshipId: string; hospitalName: string; hospitalPhone: string | null } | null;
  summary: PatientHealthSummaryData | null;
}): React.JSX.Element {
  const id = selected?.relationshipId;
  const history = summary?.history;
  const age = summary?.dateOfBirth ? ageInBangkok(summary.dateOfBirth, new Date()) : null;
  const retryHref = id ? `/app/personal/health?relationshipId=${encodeURIComponent(id)}` : "/app/personal/health";
  return <div className="min-w-0 max-w-4xl">
    <HomeHero title="ข้อมูลสุขภาพ" headingId="health-heading" chip={<HomeHospitalChip action="/app/personal/health" fieldName="relationshipId" selectId="health-hospital"
        groups={[{ label: null, options: hospitals.map((hospital) => ({ value: hospital.relationshipId, label: hospital.hospitalName })) }]}
        selectedLabel={selected?.hospitalName ?? null} selectedValue={id ?? null} />}>
      <p className="mt-3 text-sm text-white/85">สรุปข้อมูลสุขภาพของคุณจากโรงพยาบาลที่เลือก</p>
    </HomeHero>
    {!summary || !selected ? <Alert className="mt-6" variant="info">ยังไม่มีโรงพยาบาลที่พร้อมแสดงข้อมูลสุขภาพ ดูประวัติเดิมได้ที่ <Link className={linkClass} href="/app/personal/care">ข้อมูลการดูแล</Link></Alert> : <>
      <section aria-labelledby="health-general" className="mt-8">
        <h2 className="text-xl font-semibold text-text" id="health-general">ข้อมูลทั่วไป</h2>
        <div className="mt-2 grid gap-x-8 sm:grid-cols-2">
          <HealthItem number={1} title="ชื่อ-สกุล">
            {summary.readFailures.profile ? <HealthReadFailure retryHref={retryHref} /> : <p>{[summary.person?.givenName, summary.person?.familyName].filter(Boolean).join(" ") || empty}</p>}
          </HealthItem>
          <HealthItem number={2} title="อายุ">
            {summary.readFailures.health ? <HealthReadFailure retryHref={retryHref} /> : <p>{age === null ? empty : `${age} ปี`}</p>}
          </HealthItem>
        </div>
      </section>
      <section aria-labelledby="health-measurements" className="mt-8">
        <h2 className="text-xl font-semibold text-text" id="health-measurements">ค่าร่างกายล่าสุด</h2>
        <p className="mt-2 text-sm text-text-muted">ค่าที่เจ้าหน้าที่บันทึก แสดงค่าล่าสุดแยกตามรายการ</p>
        {summary.readFailures.measurements ? <HealthReadFailure retryHref={retryHref} /> : null}
        <div className="grid gap-x-8 sm:grid-cols-2">
          <HealthItem number={3} title="น้ำหนัก"><Measurement fact={summary.measurements?.weight ?? null} unit="กก." unavailable={summary.readFailures.measurements} /></HealthItem>
          <HealthItem number={4} title="ส่วนสูง"><Measurement fact={summary.measurements?.heightCm ?? null} unit="ซม." unavailable={summary.readFailures.measurements} /></HealthItem>
          <HealthItem number={5} title="BMI"><Measurement fact={summary.measurements?.bmi ?? null} unit="" unavailable={summary.readFailures.measurements} />
            {summary.measurements?.bmi ? <p className="mt-1 text-sm">คำนวณจากน้ำหนักข้างต้นและส่วนสูงล่าสุด · {formatPatientDateOnly(summary.measurements.bmi.heightDate)} · {summary.measurements.bmi.heightSource}</p> : null}
          </HealthItem>
          <HealthItem number={6} title="รอบเอว"><Measurement fact={summary.measurements?.waistCircumference ?? null} unit="ซม." unavailable={summary.readFailures.measurements} /></HealthItem>
        </div>
        <div className="mt-4 rounded-panel bg-surface-muted p-4 sm:p-5">
          <h3 className="font-semibold text-text">ค่าที่วัดเอง · ไม่ใช่ค่าที่บันทึกโดยเจ้าหน้าที่</h3>
          {summary.readFailures.selfMeasurement ? <HealthReadFailure retryHref={retryHref} /> : summary.selfMeasurement ? <PatientSelfMeasurementValues item={summary.selfMeasurement} /> : <p className="mt-2 text-text-muted">คุณยังไม่ได้บันทึกค่าที่วัดเอง</p>}
          <Link className={linkClass} href="/app/personal/measurements">บันทึกค่าใหม่ / ดูค่าที่วัดเอง</Link>
        </div>
      </section>
      <section aria-labelledby="health-history" className="mt-8">
        <h2 className="text-xl font-semibold text-text" id="health-history">ประวัติสุขภาพและผู้ติดต่อ</h2>
        <HealthItem number={7} title="โรคประจำตัว">
          {summary.readFailures.health ? <HealthReadFailure retryHref={retryHref} /> : <>
            {!history ? <p>{empty}</p> : null}
            <p>เบาหวาน: {answer(history?.diabetes)}</p><p>ความดันโลหิตสูง: {answer(history?.hypertension)}</p>
            <p className="whitespace-pre-wrap">อื่น ๆ: {history?.otherConditions || "ยังไม่มีข้อมูลโรคอื่น ๆ"}</p>
          </>}
        </HealthItem>
        <HealthItem number={8} title="ประวัติครอบครัว (พ่อแม่และญาติสายตรง)">
          {summary.readFailures.health ? <p>ข้อมูลประวัติสุขภาพไม่พร้อมแสดง</p> : <>
            {!history ? <p>{empty}</p> : null}
            <p>ความดันโลหิตสูง: {answer(history?.familyHypertension)}</p><p>เบาหวาน: {answer(history?.familyDiabetes)}</p>
            <p>โรคหัวใจ: {answer(history?.familyHeartDisease)}</p><p>อัมพฤกษ์/อัมพาต: {answer(history?.familyStroke)}</p>
          </>}
        </HealthItem>
        <HealthItem number={9} title="ผู้ติดต่อกรณีฉุกเฉิน">
          {summary.readFailures.profile ? <HealthReadFailure retryHref={retryHref} /> : <><p>{summary.emergencyContactName || empty}</p><Phone value={summary.emergencyContactPhone} /></>}
        </HealthItem>
      </section>
      <section aria-labelledby="health-care" className="mt-8">
        <h2 className="text-xl font-semibold text-text" id="health-care">ยา นัดหมาย และแผนสุขภาพ</h2>
        <HealthItem number={10} title="ยาที่รับประทาน">
          {summary.readFailures.medications ? <HealthReadFailure retryHref={retryHref} /> : summary.medications?.items.length ? <ul className="space-y-3">{summary.medications.items.map((medication) => <li key={medication.id}>
            <p className="font-semibold text-text">{medication.medicationName}</p>
            <p className="whitespace-pre-wrap">{medication.instructionText || "ยังไม่ได้ระบุวิธีรับประทาน"}</p>
            {medication.schedules.length ? <p>เวลา {medication.schedules.map(({ localTime }) => localTime).join(", ")}</p> : null}
          </li>)}</ul> : <p>ยังไม่มียาที่บันทึกไว้และกำลังรับประทาน</p>}
          {!summary.readFailures.medications ? <Link className={linkClass} href="/app/personal/medications">{summary.medications?.hasMore ? "ดูยาทั้งหมด" : "ไปที่ยา"}</Link> : null}
        </HealthItem>
        <HealthItem number={11} title="การนัดหมาย">
          {summary.readFailures.appointment ? <HealthReadFailure retryHref={retryHref} /> : summary.appointment ? <Link className={linkClass} href={`/app/personal/appointments/${id}/${summary.appointment.appointmentId}`}>{formatPatientDateTime(summary.appointment.scheduledAt)}</Link> : <p>ยังไม่มีนัดหมายถัดไป</p>}
          <p><Link className={linkClass} href={`/app/personal/appointments?subject=me&hospital=${id}`}>ดูนัดหมายทั้งหมด</Link></p>
        </HealthItem>
        <HealthItem number={12} title="อสม.ผู้ดูแล + เบอร์ติดต่อ">
          {summary.readFailures.osm ? <HealthReadFailure retryHref={retryHref} /> : <>
          <p>{summary.osm ? summary.osm.displayName || "โรงพยาบาลยังไม่ได้บันทึกชื่อ อสม." : "ยังไม่มี อสม.ผู้ดูแล"}</p>
          {summary.osm?.contactPhone ? <Phone value={summary.osm.contactPhone} /> : <>
            <p>{summary.osm ? "ยังไม่มีเบอร์ อสม." : "โรงพยาบาลยังไม่ได้มอบหมาย อสม."}</p>
            <p className="mt-1">ติดต่อโรงพยาบาล: <Phone value={selected.hospitalPhone} /></p>
          </>}
          </>}
        </HealthItem>
        <HealthItem number={13} title="แผนสุขภาพ">
          {summary.readFailures.plan ? <HealthReadFailure retryHref={retryHref} /> : summary.plan ? <>
            <p>{formatPatientDateOnly(summary.plan.createdAt)}</p><p className="mt-1 font-semibold text-text">{summary.plan.primaryGoalLabel}</p>
            <ul className="mt-2 list-inside list-disc">{summary.plan.items.map((item, index) => <li key={index}>{item.activityLabel}</li>)}</ul>
            <Link className={linkClass} href={`/app/personal/care/${id}/goal-plans/${summary.plan.goalPlanId}`}>ดูแผนสุขภาพ</Link>
          </> : <p>{empty}แผนสุขภาพ</p>}
        </HealthItem>
      </section>
    </>}
    <p className="mt-6"><Link className={linkClass} href="/app/personal/measurements">ค่าที่วัดเอง</Link></p>
  </div>;
}
