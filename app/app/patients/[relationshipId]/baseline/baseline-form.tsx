"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, inputClassName } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { PatientBaselinePatientSummary } from "@/modules/patient-baseline/services/patient-baseline-access-service";
import {
  initialPatientBaselineActionState,
  type PatientBaselineActionState,
} from "@/modules/patient-baseline/transport/action-state";
import { createPatientBaselineAction } from "@/modules/patient-baseline/transport/server-actions";

type PatientBaselineFormProps = {
  relationshipId: string;
  patient: PatientBaselinePatientSummary;
};

const labelClassName = "block space-y-2 text-sm font-semibold text-text";

function getTodayDateOnly(): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "Asia/Bangkok",
      year: "numeric",
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>;

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function ActionFeedback({ state }: { state: PatientBaselineActionState }): React.JSX.Element | null {
  if (state.status !== "ERROR") {
    return null;
  }

  return (
    <Alert className="mt-5" variant={state.code === "CONFLICT" ? "warning" : "danger"}>
      <p className="font-semibold">บันทึกข้อมูลตั้งต้นไม่สำเร็จ</p>
      <p className="mt-1">{state.message}</p>
    </Alert>
  );
}

export function PatientBaselineForm({
  patient,
  relationshipId,
}: PatientBaselineFormProps): React.JSX.Element {
  const router = useRouter();
  const [state, action, pending] = useActionState<PatientBaselineActionState, FormData>(
    createPatientBaselineAction,
    initialPatientBaselineActionState,
  );
  const [recordedOn, setRecordedOn] = useState<string>(getTodayDateOnly);
  const [weight, setWeight] = useState("");
  const [waistCircumference, setWaistCircumference] = useState("");
  const [bloodPressureSystolic, setBloodPressureSystolic] = useState("");
  const [bloodPressureDiastolic, setBloodPressureDiastolic] = useState("");
  const [bloodSugarDtx, setBloodSugarDtx] = useState("");
  const [adaptationSummary, setAdaptationSummary] = useState("");
  const [adaptationObstacles, setAdaptationObstacles] = useState("");
  const [adaptationOpportunities, setAdaptationOpportunities] = useState("");
  const [confidenceScore, setConfidenceScore] = useState("");
  const [confidenceImprovementPlan, setConfidenceImprovementPlan] = useState("");
  const [summary, setSummary] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [confirmationRequested, setConfirmationRequested] = useState(false);

  useEffect(() => {
    if (state.status === "SUCCESS") {
      router.replace(
        `/app/patients/${encodeURIComponent(relationshipId)}/baseline`,
      );
    }
  }, [relationshipId, router, state]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    if (!confirmationRequested) {
      event.preventDefault();
      setConfirmationRequested(true);
    }
  }

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={<StatusBadge variant="info">ข้อมูลตั้งต้น</StatusBadge>}
        breadcrumbs={[
          {
            href: `/app/patients/${encodeURIComponent(relationshipId)}`,
            label: "รายละเอียดผู้ป่วย",
          },
          { label: "ข้อมูลตั้งต้น" },
        ]}
        description="บันทึกข้อมูลอ้างอิงเริ่มต้นของผู้ป่วยในโรงพยาบาลนี้"
        title="ข้อมูลตั้งต้น"
      />

      <form action={action} className="space-y-6 pt-8" onSubmit={handleSubmit}>
        <input name="patientHospitalRelationshipId" type="hidden" value={relationshipId} />

        <Alert variant="warning">
          <p className="font-semibold">ตรวจสอบข้อมูลก่อนบันทึก</p>
          <p className="mt-1">
            ข้อมูลตั้งต้นจะถูกบันทึกเป็นข้อมูลอ้างอิงและยังไม่รองรับการแก้ไข กรุณาตรวจสอบข้อมูลก่อนบันทึก
          </p>
          <p className="mt-2">
            ช่องว่างหมายถึงยังไม่มีข้อมูล ระบบจะไม่เติมค่าแทนและจะไม่คำนวณการแปลผลทางคลินิกอัตโนมัติ
          </p>
        </Alert>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">ผู้ป่วยและบริบทโรงพยาบาล</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-text-muted">ผู้ป่วย</p>
              <p className="mt-1 text-lg font-semibold text-text">{patient.displayName}</p>
            </div>
            <div>
              <p className="text-sm text-text-muted">โรงพยาบาล</p>
              <p className="mt-1 text-lg font-semibold text-text">{patient.hospital.name}</p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-text-muted">
            HN ของโรงพยาบาลนี้: {patient.hospitalNumber ?? "ไม่ระบุ"}
          </p>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">ข้อมูลตั้งต้น</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className={labelClassName} htmlFor="baseline-recorded-on">
              <span>วันที่บันทึก</span>
              <Input
                aria-required="true"
                id="baseline-recorded-on"
                name="recordedOn"
                onChange={(event) => setRecordedOn(event.target.value)}
                readOnly={pending}
                required
                type="date"
                value={recordedOn}
              />
              <span className="text-xs font-normal leading-5 text-text-muted">
                วันที่นี้คือวันที่ข้อมูลเริ่มต้นถูกบันทึกหรือใช้เป็นจุดอ้างอิง ไม่ใช่เวลาที่ระบบสร้างรายการ
              </span>
            </label>
          </div>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">ข้อมูลสุขภาพตั้งต้น</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            กรอกเฉพาะข้อมูลที่มี โดยระบบจะเก็บตามหน่วยที่ระบุและยังไม่แปลผลหรือจัดกลุ่มความเสี่ยงอัตโนมัติ
          </p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className={labelClassName} htmlFor="baseline-weight">
              <span>น้ำหนัก (kg)</span>
              <Input
                id="baseline-weight"
                inputMode="decimal"
                max={1_000_000}
                min={0.01}
                name="weight"
                onChange={(event) => setWeight(event.target.value)}
                placeholder="ไม่บังคับ"
                readOnly={pending}
                step="any"
                type="number"
                value={weight}
              />
            </label>
            <label className={labelClassName} htmlFor="baseline-waist">
              <span>รอบเอว (cm)</span>
              <Input
                id="baseline-waist"
                inputMode="decimal"
                max={1_000_000}
                min={0.01}
                name="waistCircumference"
                onChange={(event) => setWaistCircumference(event.target.value)}
                placeholder="ไม่บังคับ"
                readOnly={pending}
                step="any"
                type="number"
                value={waistCircumference}
              />
            </label>
            <label className={labelClassName} htmlFor="baseline-blood-pressure-systolic">
              <span>ความดันตัวบน (mmHg)</span>
              <Input
                id="baseline-blood-pressure-systolic"
                inputMode="decimal"
                max={1_000_000}
                min={0.01}
                name="bloodPressureSystolic"
                onChange={(event) => setBloodPressureSystolic(event.target.value)}
                placeholder="ไม่บังคับ"
                readOnly={pending}
                step="any"
                type="number"
                value={bloodPressureSystolic}
              />
            </label>
            <label className={labelClassName} htmlFor="baseline-blood-pressure-diastolic">
              <span>ความดันตัวล่าง (mmHg)</span>
              <Input
                id="baseline-blood-pressure-diastolic"
                inputMode="decimal"
                max={1_000_000}
                min={0.01}
                name="bloodPressureDiastolic"
                onChange={(event) => setBloodPressureDiastolic(event.target.value)}
                placeholder="ไม่บังคับ"
                readOnly={pending}
                step="any"
                type="number"
                value={bloodPressureDiastolic}
              />
            </label>
            <label className={`${labelClassName} sm:col-span-2`} htmlFor="baseline-blood-sugar-dtx">
              <span>ระดับน้ำตาลในเลือด (DTX / mg%)</span>
              <Input
                id="baseline-blood-sugar-dtx"
                inputMode="decimal"
                max={1_000_000}
                min={0.01}
                name="bloodSugarDtx"
                onChange={(event) => setBloodSugarDtx(event.target.value)}
                placeholder="ไม่บังคับ"
                readOnly={pending}
                step="any"
                type="number"
                value={bloodSugarDtx}
              />
            </label>
          </div>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">การปรับตัว / สภาพเริ่มต้น</h2>
          <div className="mt-6 grid gap-5">
            <label className={labelClassName} htmlFor="baseline-adaptation-summary">
              <span>สรุปการปรับตัว</span>
              <textarea
                className={`${inputClassName} min-h-28 py-3`}
                id="baseline-adaptation-summary"
                maxLength={2_000}
                name="adaptationSummary"
                onChange={(event) => setAdaptationSummary(event.target.value)}
                placeholder="บันทึกสภาพเริ่มต้นตามที่สังเกตหรือพูดคุย"
                readOnly={pending}
                value={adaptationSummary}
              />
            </label>
            <label className={labelClassName} htmlFor="baseline-adaptation-obstacles">
              <span>อุปสรรค</span>
              <textarea
                className={`${inputClassName} min-h-28 py-3`}
                id="baseline-adaptation-obstacles"
                maxLength={2_000}
                name="adaptationObstacles"
                onChange={(event) => setAdaptationObstacles(event.target.value)}
                placeholder="สิ่งที่ทำให้การปรับตัวทำได้ยาก"
                readOnly={pending}
                value={adaptationObstacles}
              />
            </label>
            <label className={labelClassName} htmlFor="baseline-adaptation-opportunities">
              <span>โอกาส / ปัจจัยสนับสนุน</span>
              <textarea
                className={`${inputClassName} min-h-28 py-3`}
                id="baseline-adaptation-opportunities"
                maxLength={2_000}
                name="adaptationOpportunities"
                onChange={(event) => setAdaptationOpportunities(event.target.value)}
                placeholder="ปัจจัยที่ช่วยสนับสนุนการดูแลต่อไป"
                readOnly={pending}
                value={adaptationOpportunities}
              />
            </label>
          </div>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">ความมั่นใจ</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            คะแนน 0–10 ใช้เพื่อบันทึกระดับความมั่นใจ ไม่ใช่คะแนนวินิจฉัยหรือผลลัพธ์ทางคลินิก
          </p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className={labelClassName} htmlFor="baseline-confidence-score">
              <span>คะแนนความมั่นใจ (0–10)</span>
              <Input
                id="baseline-confidence-score"
                inputMode="numeric"
                max={10}
                min={0}
                name="confidenceScore"
                onChange={(event) => setConfidenceScore(event.target.value)}
                placeholder="ไม่บังคับ"
                readOnly={pending}
                step={1}
                type="number"
                value={confidenceScore}
              />
            </label>
            <label className={labelClassName} htmlFor="baseline-confidence-plan">
              <span>แนวทางเพิ่มความมั่นใจ</span>
              <textarea
                className={`${inputClassName} min-h-28 py-3`}
                id="baseline-confidence-plan"
                maxLength={2_000}
                name="confidenceImprovementPlan"
                onChange={(event) => setConfidenceImprovementPlan(event.target.value)}
                placeholder="สิ่งที่อยากทดลองหรือสนับสนุนต่อ"
                readOnly={pending}
                value={confidenceImprovementPlan}
              />
            </label>
          </div>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">สรุป</h2>
          <div className="mt-6 grid gap-5">
            <label className={labelClassName} htmlFor="baseline-summary">
              <span>สรุปข้อมูลตั้งต้น</span>
              <textarea
                className={`${inputClassName} min-h-32 py-3`}
                id="baseline-summary"
                maxLength={2_000}
                name="summary"
                onChange={(event) => setSummary(event.target.value)}
                placeholder="สรุปข้อมูลที่ต้องการเก็บไว้เป็นจุดอ้างอิง"
                readOnly={pending}
                value={summary}
              />
            </label>
            <label className={labelClassName} htmlFor="baseline-recommendations">
              <span>คำแนะนำ</span>
              <textarea
                className={`${inputClassName} min-h-32 py-3`}
                id="baseline-recommendations"
                maxLength={2_000}
                name="recommendations"
                onChange={(event) => setRecommendations(event.target.value)}
                placeholder="ข้อความที่ต้องการบันทึกไว้ โดยไม่มีการสร้างคำแนะนำอัตโนมัติ"
                readOnly={pending}
                value={recommendations}
              />
            </label>
          </div>
        </Panel>

        <Panel>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">ตรวจสอบและบันทึก</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            เมื่อบันทึกแล้ว ข้อมูลตั้งต้นจะเป็นข้อมูลอ่านอย่างเดียว ไม่มีการแก้ไข ลบ หรือแทนที่รายการเดิม
          </p>
          <ActionFeedback state={state} />
          {confirmationRequested ? (
            <Alert className="mt-5" variant="warning">
              <p className="font-semibold">ยืนยันการบันทึกข้อมูลตั้งต้น</p>
              <p className="mt-1">ตรวจสอบข้อมูลครบแล้วหรือยัง? การบันทึกครั้งนี้จะสร้างข้อมูลอ้างอิงเริ่มต้นแบบอ่านอย่างเดียว</p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Button disabled={pending} loading={pending} type="submit">
                  {pending ? "กำลังบันทึก…" : "ยืนยันบันทึกข้อมูลตั้งต้น"}
                </Button>
                <Button
                  disabled={pending}
                  onClick={() => setConfirmationRequested(false)}
                  type="button"
                  variant="secondary"
                >
                  กลับไปตรวจสอบ
                </Button>
              </div>
            </Alert>
          ) : (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button disabled={pending} loading={pending} type="submit">
                ตรวจสอบข้อมูลก่อนบันทึก
              </Button>
              <Link
                className="inline-flex min-h-12 items-center justify-center rounded-control border border-border-strong bg-surface px-5 py-2.5 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                href={`/app/patients/${encodeURIComponent(relationshipId)}`}
              >
                ยกเลิก
              </Link>
            </div>
          )}
        </Panel>
      </form>
    </div>
  );
}
