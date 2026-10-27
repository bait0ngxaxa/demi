import { countValue, type ReportingChartCategory } from "@/components/reporting-charts/chart-value";
import type {
  HospitalReportingPageProjection,
  HospitalReportingServiceProcessSummary,
} from "@/modules/reporting/projections/hospital-report-projection";

export const SERVICE_PROCESS_CHART_DESCRIPTION =
  "จำนวน Program ที่มีบันทึกกิจกรรม ไม่ใช่การยืนยันว่าจัดบริการเสร็จสิ้นหรือเกิดผลสำเร็จทางการรักษา";

export function serviceProcessNote(programsTotal: number): string {
  return `Program หนึ่งอาจมีบันทึกได้หลายประเภท จึงห้ามนำตัวเลขแต่ละแถวมารวมกัน · ความยาวแถบเทียบกับ Program ทั้งหมด ${programsTotal.toLocaleString("th-TH")} รายการ`;
}

/** The four exact-Hospital record-presence counts, in the order the Service 1 report lists them. */
export function serviceProcessCategories(summary: HospitalReportingServiceProcessSummary): readonly ReportingChartCategory[] {
  return [
    { key: "routine", axisLabel: "ตารางกิจวัตร", label: "Program ที่มีบันทึกตารางกิจวัตร (Routine)", value: countValue(summary.programsWithRoutineRecord.value) },
    { key: "floatingChart", axisLabel: "กราฟวัดลอยจม", label: "Program ที่มีบันทึกกราฟวัดลอยจม (Floating Chart)", value: countValue(summary.programsWithFloatingChartRecord.value) },
    { key: "dreamCard", axisLabel: "การ์ดความฝัน", label: "Program ที่มีบันทึกการ์ดความฝัน (Dream Card)", value: countValue(summary.programsWithDreamCardRecord.value) },
    { key: "confidence", axisLabel: "คะแนนความมั่นใจ", label: "Program ที่มีบันทึกคะแนนความมั่นใจ (Confidence)", value: countValue(summary.programsWithConfidenceRecord.value) },
  ];
}

/**
 * The mutually exclusive progress buckets of the report cohort, each linked to its existing `progress` filter.
 * `progressHref` builds the link from the existing query contract; no new drill-down is introduced.
 */
export function roundProgressCategories(
  roundProgress: HospitalReportingPageProjection["roundProgress"],
  progressHref: (progress: string) => string,
): readonly ReportingChartCategory[] {
  return [
    ...roundProgress.rounds.map((count, round) => ({
      key: `round-${round}`,
      axisLabel: round === 6 ? "6 รอบ · รอ After" : `${round} รอบ`,
      label: round === 6 ? "ครบ 6 รอบ · รอ After" : `ครบ ${round} รอบ`,
      value: countValue(count),
      href: progressHref(String(round)),
    })),
    {
      key: "after-recorded",
      axisLabel: "มี After · รอจบ",
      label: "บันทึก After แล้ว · รอจบ Program",
      value: countValue(roundProgress.afterRecorded),
      href: progressHref("AFTER_RECORDED"),
    },
    {
      key: "completed",
      axisLabel: "สิ้นสุด Program",
      label: "สิ้นสุด Program",
      value: countValue(roundProgress.completed),
      href: progressHref("COMPLETED"),
    },
  ];
}
