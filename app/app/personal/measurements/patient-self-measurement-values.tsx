import type { ReactNode } from "react";

import { StatusBadge } from "@/components/ui/status-badge";
import {
  PATIENT_SELF_MEASUREMENT_BLOOD_SUGAR_UNIT,
  PATIENT_SELF_MEASUREMENT_LABEL,
  type PatientSelfMeasurementDto,
} from "@/modules/patient-self-measurements/domain/patient-self-measurement";

import { SavedRecordActions, SavedRecordCard } from "../saved-record-card";

const formatter = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

function MeasurementValue({ label, value, unit }: { label: string; value: number | string; unit: string }): React.JSX.Element {
  return <div className="min-w-0">
    <dt className="text-sm text-text-muted">{label}</dt>
    <dd className="mt-1 break-words font-semibold tabular-nums text-text">{value} <span className="font-normal">{unit}</span></dd>
  </div>;
}

/** Readback of the values that were recorded; absent fields are omitted rather than represented by placeholders. */
export function PatientSelfMeasurementValues({ item }: { item: PatientSelfMeasurementDto }): React.JSX.Element {
  const hasBloodPressure = item.systolicBloodPressure !== null || item.diastolicBloodPressure !== null;

  return <>
    <dl className="mt-4 grid min-w-0 grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
      {item.weight !== null ? <MeasurementValue label="น้ำหนัก" unit="กก." value={item.weight} /> : null}
      {item.bloodSugar !== null ? <MeasurementValue label="ระดับน้ำตาลในเลือด" unit={PATIENT_SELF_MEASUREMENT_BLOOD_SUGAR_UNIT} value={item.bloodSugar} /> : null}
      {item.systolicBloodPressure !== null && item.diastolicBloodPressure !== null ? (
        <MeasurementValue label="ความดันโลหิต (ตัวบน / ตัวล่าง)" unit="mmHg" value={`${item.systolicBloodPressure} / ${item.diastolicBloodPressure}`} />
      ) : null}
      {hasBloodPressure && (item.systolicBloodPressure === null || item.diastolicBloodPressure === null) ? <>
        {item.systolicBloodPressure !== null ? <MeasurementValue label="ความดันตัวบน" unit="mmHg" value={item.systolicBloodPressure} /> : null}
        {item.diastolicBloodPressure !== null ? <MeasurementValue label="ความดันตัวล่าง" unit="mmHg" value={item.diastolicBloodPressure} /> : null}
      </> : null}
    </dl>
    {item.note ? <div className="mt-4 min-w-0">
      <p className="text-sm text-text-muted">บันทึกเพิ่มเติม</p>
      <p className="mt-1 break-words whitespace-pre-wrap text-text">{item.note}</p>
    </div> : null}
  </>;
}

/** One persisted patient-reported measurement, shared by the patient and read-only care-team views. */
export function PatientSelfMeasurementRecordCard({ item, as = "div", children }: {
  item: PatientSelfMeasurementDto;
  as?: "div" | "li";
  children?: ReactNode;
}): React.JSX.Element {
  const measuredAt = new Date(item.measuredAt);

  return <SavedRecordCard as={as}>
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-2">
      <h3 className="min-w-0 break-words font-semibold text-text">
        วัดเมื่อ <time dateTime={measuredAt.toISOString()}>{formatter.format(measuredAt)}</time>
      </h3>
      <StatusBadge variant="info">{PATIENT_SELF_MEASUREMENT_LABEL}</StatusBadge>
    </div>
    <PatientSelfMeasurementValues item={item} />
    {children ? <SavedRecordActions>{children}</SavedRecordActions> : null}
  </SavedRecordCard>;
}
