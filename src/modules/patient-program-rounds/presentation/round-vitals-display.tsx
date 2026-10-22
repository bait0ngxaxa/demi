import { StatusBadge } from "@/components/ui/status-badge";

import type { RoundHealthPathRow, RoundVitalsView } from "../services/round-query-service";
import { formatRoundDate, formatRoundNumber, HEALTH_PATH_TIMEPOINT_LABELS } from "./round-labels";
import { bloodPressureBand, bloodSugarBand, type VitalsBand } from "./vitals-bands";

function BandBadge({ band }: { band: VitalsBand | null }): React.JSX.Element | null {
  return band ? <StatusBadge variant={band.variant}>{band.label}</StatusBadge> : null;
}

type VitalsRow = { label: string; value: string; band?: VitalsBand | null };

function vitalsRows(vitals: RoundVitalsView): VitalsRow[] {
  return [
    { label: "วันที่", value: formatRoundDate(vitals.serviceDate) },
    { label: "น้ำหนัก (kg)", value: formatRoundNumber(vitals.weight) },
    { label: "ส่วนสูง (cm)", value: formatRoundNumber(vitals.heightCm) },
    { label: "รอบเอว (cm)", value: formatRoundNumber(vitals.waistCircumference) },
    { label: "ดัชนีมวลกาย (kg/m²)", value: formatRoundNumber(vitals.bmi) },
    {
      label: "ค่าน้ำตาล (มก./ดล.)",
      value: formatRoundNumber(vitals.bloodSugar),
      band: bloodSugarBand(vitals.bloodSugar),
    },
    {
      label: "ความดัน (มม.ปรอท)",
      value: `${formatRoundNumber(vitals.systolicBloodPressure)} / ${formatRoundNumber(vitals.diastolicBloodPressure)}`,
      band: bloodPressureBand(vitals.systolicBloodPressure, vitals.diastolicBloodPressure),
    },
  ];
}

/** R2-D: one round's vitals with the booklet colour bands; shared by the stepper and the patient view. */
export function RoundVitalsValues({
  vitals,
  recorder,
}: {
  vitals: RoundVitalsView;
  /** Staff views show who recorded the values. */
  recorder?: boolean;
}): React.JSX.Element {
  const rows = recorder
    ? [...vitalsRows(vitals), { label: "ผู้บันทึก", value: vitals.recordedByDisplayName ?? "ไม่ระบุ" }]
    : vitalsRows(vitals);

  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {rows.map((row) => (
        <div className="min-w-0" key={row.label}>
          <dt className="text-sm text-text-muted">{row.label}</dt>
          <dd className="mt-1 flex flex-wrap items-center gap-2 break-words font-semibold text-text">
            <span>{row.value}</span>
            <BandBadge band={row.band ?? null} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** R2-H / SR-D9: ทบทวนเส้นทาง — the booklet timepoints, derived from each round's vitals (display only). */
export function HealthPathTimeline({ rows }: { rows: readonly RoundHealthPathRow[] }): React.JSX.Element {
  return (
    <ol className="divide-y divide-border rounded-control border border-border">
      {rows.map((row) => (
        <li className="space-y-3 px-4 py-4" key={row.roundNumber}>
          <p className="font-semibold text-text">
            {HEALTH_PATH_TIMEPOINT_LABELS[row.roundNumber]}
            <span className="ml-2 text-sm font-normal text-text-muted">ครั้งที่ {row.roundNumber}</span>
          </p>
          {row.vitals ? (
            <RoundVitalsValues vitals={row.vitals} />
          ) : (
            <p className="text-sm text-text-muted">ยังไม่มีสัญญาณชีพ</p>
          )}
        </li>
      ))}
    </ol>
  );
}
