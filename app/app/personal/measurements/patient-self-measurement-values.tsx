import type { PatientSelfMeasurementDto } from "@/modules/patient-self-measurements/domain/patient-self-measurement";

const formatter = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

/** Shared read view for the Patient and the care team; values are Patient-reported. */
export function PatientSelfMeasurementValues({ item }: { item: PatientSelfMeasurementDto }): React.JSX.Element {
  const values = [
    item.weight === null ? null : `น้ำหนัก ${item.weight} กก.`,
    item.bloodSugar === null ? null : `น้ำตาล ${item.bloodSugar} mg/dL`,
    item.systolicBloodPressure === null && item.diastolicBloodPressure === null
      ? null
      : `ความดัน ${item.systolicBloodPressure ?? "-"}/${item.diastolicBloodPressure ?? "-"} mmHg`,
  ].filter((value): value is string => value !== null);

  return (
    <div className="mt-2">
      <p className="text-sm text-text-muted">
        วัดเมื่อ <time dateTime={new Date(item.measuredAt).toISOString()}>{formatter.format(new Date(item.measuredAt))}</time>
      </p>
      <p className="mt-1 break-words font-semibold text-text">{values.join(" · ")}</p>
      {item.note ? <p className="mt-1 break-words whitespace-pre-wrap text-sm text-text">{item.note}</p> : null}
    </div>
  );
}
