"use client";

import type { ReactNode } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

import { countValue, formatReportingCount, type ReportingChartCategory } from "./chart-value";
import { ReportingChartFrame } from "./reporting-chart-frame";

const DONUT_HEIGHT = 208;

const PROGRAM_STATUS_SLICES = [
  { key: "ACTIVE", label: "Program ที่กำลังดำเนิน", fill: "var(--brand)" },
  { key: "COMPLETED", label: "Program ที่สิ้นสุดแล้ว", fill: "var(--brand-muted)" },
] as const;

/** ACTIVE / COMPLETED Program counts of the full report cohort. Status is lifecycle, not a clinical outcome. */
export function ProgramStatusDonut({
  headingId,
  active,
  completed,
  description,
  hrefs,
}: {
  headingId: string;
  active: number;
  completed: number;
  description?: ReactNode;
  /** Existing authorized status filters, when the page offers them. */
  hrefs?: { active: string; completed: string };
}): React.JSX.Element {
  const total = active + completed;
  const values = { ACTIVE: active, COMPLETED: completed } as const;
  const slices = PROGRAM_STATUS_SLICES.map((slice) => ({ ...slice, value: values[slice.key] }));
  const categories: readonly ReportingChartCategory[] = PROGRAM_STATUS_SLICES.map((slice) => ({
    key: slice.key,
    axisLabel: slice.label,
    label: slice.label,
    value: countValue(values[slice.key]),
    href: hrefs ? (slice.key === "ACTIVE" ? hrefs.active : hrefs.completed) : undefined,
    swatch: slice.fill,
  }));

  return (
    <ReportingChartFrame
      categories={categories}
      chart={(
        <div className="relative">
          <ResponsiveContainer height={DONUT_HEIGHT} minWidth={0} width="100%">
            <PieChart accessibilityLayer={false}>
              <Pie
                data={slices}
                dataKey="value"
                innerRadius="64%"
                isAnimationActive={false}
                nameKey="label"
                outerRadius="92%"
                paddingAngle={active > 0 && completed > 0 ? 2 : 0}
                stroke="var(--surface)"
                strokeWidth={2}
              >
                {slices.map((slice) => <Cell fill={slice.fill} key={slice.key} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold tabular-nums text-text">{formatReportingCount(total)}</span>
            <span className="text-xs text-text-muted">Program ทั้งหมด</span>
          </div>
        </div>
      )}
      description={description ?? "สถานะ Program บอกว่ายังดำเนินอยู่หรือสิ้นสุดแล้ว ไม่ใช่ผลลัพธ์หรือความสำเร็จทางการรักษา"}
      headingId={headingId}
      listLabel="จำนวน Program แยกตามสถานะ"
      message={total === 0 ? "ยังไม่มี Program ในชุดข้อมูลนี้" : undefined}
      title="สถานะ Program"
    />
  );
}
