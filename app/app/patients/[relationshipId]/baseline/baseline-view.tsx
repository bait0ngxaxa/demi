import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import type {
  PatientBaselinePatientSummary,
  PatientBaselineProjection,
} from "@/modules/patient-baseline/services/patient-baseline-query-service";

type BaselineField = {
  label: string;
  value: string;
  wide?: boolean;
};

function displayText(value: string | null): string {
  return value?.trim() || "ไม่ระบุ";
}

function displayNumber(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "ไม่ระบุ" : String(value);
}

function displayMeasurement(value: number | null, unit: string): string {
  const displayed = displayNumber(value);
  return displayed === "ไม่ระบุ" ? displayed : `${displayed} ${unit}`;
}

function displayBloodPressure(
  systolic: number | null,
  diastolic: number | null,
): string {
  if (systolic === null && diastolic === null) {
    return "ไม่ระบุ";
  }

  return `${displayNumber(systolic)} / ${displayNumber(diastolic)} mmHg`;
}

function formatDateOnly(value: Date): string {
  const calendarDate = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(calendarDate);
}

function BaselineSection({
  fields,
  title,
}: {
  fields: readonly BaselineField[];
  title: string;
}): React.JSX.Element {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">{title}</h2>
      <dl className="mt-5 grid min-w-0 gap-x-8 gap-y-5 sm:grid-cols-2">
        {fields.map((field) => (
          <div className={field.wide ? "min-w-0 sm:col-span-2" : "min-w-0"} key={field.label}>
            <dt className="text-sm font-semibold text-text-muted">{field.label}</dt>
            <dd className="mt-1 break-words text-base font-semibold leading-7 text-text">
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function PatientBaselineView({
  baseline,
  patient,
}: {
  baseline: PatientBaselineProjection;
  patient: PatientBaselinePatientSummary;
}): React.JSX.Element {
  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href={`/app/patients/${encodeURIComponent(patient.patientHospitalRelationshipId)}`}
          >
            กลับรายละเอียดผู้ป่วย
          </Link>
        }
        breadcrumbs={[
          {
            href: `/app/patients/${encodeURIComponent(patient.patientHospitalRelationshipId)}`,
            label: "รายละเอียดผู้ป่วย",
          },
          { label: "ข้อมูลตั้งต้น" },
        ]}
        description="ภาพรวมข้อมูลอ้างอิงเริ่มต้นของผู้ป่วยในโรงพยาบาลนี้"
        title="ข้อมูลตั้งต้น"
      />

      <div className="space-y-6 pt-8">
        <Alert variant="info">
          <p className="font-semibold">ข้อมูลอ้างอิงเริ่มต้น (อ่านอย่างเดียว)</p>
          <p className="mt-1">
            ข้อมูลนี้เป็นข้อมูลอ้างอิงที่อ่านได้อย่างเดียว แสดงข้อมูลที่บันทึกไว้เท่านั้น
            ยังไม่มีการแปลผลทางคลินิกหรือการเปรียบเทียบกับรายการติดตามผล
          </p>
        </Alert>

        <Panel>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em] text-text">
                {patient.displayName}
              </h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">{patient.hospital.name}</p>
            </div>
            <p className="text-sm text-text-muted">
              HN ของโรงพยาบาลนี้: {patient.hospitalNumber ?? "ไม่ระบุ"}
            </p>
          </div>
          <dl className="mt-6 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-semibold text-text-muted">วันที่บันทึก</dt>
              <dd className="mt-1 font-semibold text-text">{formatDateOnly(baseline.recordedOn)}</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-text-muted">ผู้บันทึก</dt>
              <dd className="mt-1 break-words font-semibold text-text">{baseline.recorder.displayName}</dd>
            </div>
          </dl>
        </Panel>

        <Panel>
          <BaselineSection
            fields={[
              { label: "น้ำหนัก (kg)", value: displayMeasurement(baseline.measurements.weight, "kg") },
              {
                label: "รอบเอว (cm)",
                value: displayMeasurement(baseline.measurements.waistCircumference, "cm"),
              },
              {
                label: "ความดันโลหิต (mmHg)",
                value: displayBloodPressure(
                  baseline.measurements.bloodPressureSystolic,
                  baseline.measurements.bloodPressureDiastolic,
                ),
              },
              {
                label: "ระดับน้ำตาลในเลือด (DTX / mg%)",
                value: displayMeasurement(baseline.measurements.bloodSugarDtx, "DTX / mg%"),
              },
            ]}
            title="ข้อมูลสุขภาพตั้งต้น"
          />
        </Panel>

        <Panel>
          <BaselineSection
            fields={[
              { label: "สรุปการปรับตัว", value: displayText(baseline.adaptation.summary), wide: true },
              { label: "อุปสรรค", value: displayText(baseline.adaptation.obstacles), wide: true },
              {
                label: "โอกาส / ปัจจัยสนับสนุน",
                value: displayText(baseline.adaptation.opportunities),
                wide: true,
              },
            ]}
            title="การปรับตัว / สภาพเริ่มต้น"
          />
        </Panel>

        <Panel>
          <BaselineSection
            fields={[
              { label: "คะแนนความมั่นใจ (0–10)", value: displayNumber(baseline.confidence.score) },
              {
                label: "แนวทางเพิ่มความมั่นใจ",
                value: displayText(baseline.confidence.improvementPlan),
                wide: true,
              },
            ]}
            title="ความมั่นใจ"
          />
        </Panel>

        <Panel>
          <BaselineSection
            fields={[
              { label: "สรุปข้อมูลตั้งต้น", value: displayText(baseline.summary), wide: true },
              { label: "คำแนะนำ", value: displayText(baseline.recommendations), wide: true },
            ]}
            title="สรุป"
          />
        </Panel>
      </div>
    </div>
  );
}
