"use client";

import type { ReactNode } from "react";
import { Bar, BarChart, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";

import { chartableBars, formatReportingCount, type ReportingChartCategory } from "./chart-value";
import { ReportingChartFrame } from "./reporting-chart-frame";

const BAR_ROW_HEIGHT = 36;
const CHART_VERTICAL_PADDING = 16;
const AXIS_LABEL_WIDTH = 116;

/**
 * Horizontal bars for labelled counts. Bars are drawn only for counts; the text list keeps every category,
 * including unavailable or suppressed ones. Pass `scaleMax` to scale bars against a known population
 * (for example all Programs) instead of the largest bar.
 */
export function CountBarChart({
  headingId,
  title,
  description,
  categories,
  emptyMessage,
  listLabel,
  scaleMax,
  note,
}: {
  headingId: string;
  title: string;
  description: ReactNode;
  categories: readonly ReportingChartCategory[];
  emptyMessage: string;
  listLabel: string;
  scaleMax?: number;
  note?: ReactNode;
}): React.JSX.Element {
  const bars = chartableBars(categories);
  const largest = Math.max(0, ...bars.map(({ value }) => value));
  const message = bars.length === 0
    ? "ยังไม่มีค่าที่แสดงเป็นกราฟได้"
    : largest === 0 ? emptyMessage : undefined;
  const domainMax = Math.max(largest, scaleMax ?? 0);

  return (
    <ReportingChartFrame
      categories={categories}
      chart={(
        <ResponsiveContainer height={bars.length * BAR_ROW_HEIGHT + CHART_VERTICAL_PADDING} minWidth={0} width="100%">
          <BarChart
            accessibilityLayer={false}
            barCategoryGap={8}
            data={[...bars]}
            layout="vertical"
            margin={{ top: 8, right: 48, bottom: 8, left: 0 }}
          >
            <XAxis domain={[0, domainMax]} hide type="number" />
            <YAxis
              axisLine={false}
              dataKey="axisLabel"
              // Every category is meaningful; never drop a label because ticks look crowded.
              interval={0}
              tick={{ fill: "var(--muted)", fontSize: 13 }}
              tickLine={false}
              type="category"
              width={AXIS_LABEL_WIDTH}
            />
            <Bar
              background={{ fill: "var(--surface-muted)", radius: 4 }}
              dataKey="value"
              fill="var(--brand)"
              isAnimationActive={false}
              radius={4}
            >
              <LabelList
                dataKey="value"
                fill="var(--ink)"
                fontSize={13}
                formatter={(value: unknown) => (typeof value === "number" ? formatReportingCount(value) : "")}
                position="right"
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      description={description}
      headingId={headingId}
      listLabel={listLabel}
      message={message}
      note={note}
      title={title}
    />
  );
}
