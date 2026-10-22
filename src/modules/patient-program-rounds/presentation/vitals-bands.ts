import type { StatusVariant } from "@/components/ui/status-badge";

/** R2-D: a booklet colour band for display only; never stored. */
export type VitalsBand = {
  label: string;
  variant: StatusVariant;
};

/** ค่าน้ำตาล มก./ดล. (booklet labels and colours): <70, 70-130, >130-180, >180-250, >250. */
const BLOOD_SUGAR_BANDS: readonly (VitalsBand & { upTo: number })[] = [
  { upTo: 70, label: "น้อยกว่า 70", variant: "info" },
  { upTo: 130, label: "71 - 130", variant: "success" },
  { upTo: 180, label: "131 - 180", variant: "warning" },
  { upTo: 250, label: "181 - 250", variant: "orange" },
];
const BLOOD_SUGAR_TOP_BAND: VitalsBand = { label: "250 ขึ้นไป", variant: "danger" };

export function bloodSugarBand(value: number | null | undefined): VitalsBand | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  // Below 70 is its own band; 70 itself starts "71 - 130" (implementation boundaries, R2-D).
  if (value < 70) {
    return { label: BLOOD_SUGAR_BANDS[0]!.label, variant: BLOOD_SUGAR_BANDS[0]!.variant };
  }

  const band = BLOOD_SUGAR_BANDS.slice(1).find((candidate) => value <= candidate.upTo);

  return band ? { label: band.label, variant: band.variant } : BLOOD_SUGAR_TOP_BAND;
}

/** ความดัน มม.ปรอท (booklet labels and colours); each band starts at its systolic or diastolic lower bound. */
const BLOOD_PRESSURE_BANDS: readonly (VitalsBand & { systolicFrom: number; diastolicFrom: number })[] = [
  { systolicFrom: 120, diastolicFrom: 80, label: "120/80 - 129/84", variant: "info" },
  { systolicFrom: 130, diastolicFrom: 85, label: "130/85 - 139/89", variant: "success" },
  { systolicFrom: 140, diastolicFrom: 90, label: "140/90 - 179/109", variant: "orange" },
  { systolicFrom: 180, diastolicFrom: 110, label: "180/110 ขึ้นไป", variant: "danger" },
];

function bandIndex(value: number | null | undefined, key: "systolicFrom" | "diastolicFrom"): number {
  if (value == null || !Number.isFinite(value)) {
    return -1;
  }

  let index = -1;

  BLOOD_PRESSURE_BANDS.forEach((band, candidate) => {
    if (value >= band[key]) {
      index = candidate;
    }
  });

  return index;
}

/** The higher band of systolic or diastolic; below 120/80 shows no band. */
export function bloodPressureBand(
  systolic: number | null | undefined,
  diastolic: number | null | undefined,
): VitalsBand | null {
  const band = BLOOD_PRESSURE_BANDS[Math.max(bandIndex(systolic, "systolicFrom"), bandIndex(diastolic, "diastolicFrom"))];

  return band ? { label: band.label, variant: band.variant } : null;
}
