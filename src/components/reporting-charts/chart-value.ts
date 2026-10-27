/**
 * A chart cell is a source-backed count or an explicit non-numeric state. Unavailable and suppressed
 * values are never drawn and never turned into zero; only an authorized query result is a count.
 */
export type ReportingChartValue =
  | { state: "COUNT"; value: number }
  | { state: "UNAVAILABLE" }
  | { state: "SUPPRESSED" };

export type ReportingChartCategory = {
  key: string;
  /** Short label drawn on the chart axis. */
  axisLabel: string;
  /** Full label for the text equivalent. */
  label: string;
  value: ReportingChartValue;
  /** Existing authorized navigation for this category, such as a report filter. */
  href?: string;
  /** Colour key matching the drawn mark; the label, not the colour, carries the meaning. */
  swatch?: string;
};

export type ReportingChartBar = { key: string; axisLabel: string; value: number };

export function countValue(value: number): ReportingChartValue {
  return { state: "COUNT", value };
}

export function formatReportingCount(value: number): string {
  return value.toLocaleString("th-TH");
}

export function reportingChartValueText(value: ReportingChartValue): string {
  switch (value.state) {
    case "COUNT": return formatReportingCount(value.value);
    case "UNAVAILABLE": return "ยังไม่พร้อมใช้งาน";
    case "SUPPRESSED": return "ไม่แสดงค่า";
  }
}

/** Bars for the categories that hold a count; non-numeric categories stay text-only. */
export function chartableBars(categories: readonly ReportingChartCategory[]): readonly ReportingChartBar[] {
  return categories.flatMap((category) => category.value.state === "COUNT"
    ? [{ key: category.key, axisLabel: category.axisLabel, value: category.value.value }]
    : []);
}
