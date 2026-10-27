import Link from "next/link";
import type { ReactNode } from "react";

import { Panel } from "@/components/ui/panel";

import { reportingChartValueText, type ReportingChartCategory } from "./chart-value";

/**
 * Shared frame for reporting charts: heading, meaning, the drawn chart (hidden from assistive technology)
 * and a text equivalent that carries every value. Splits into chart + list when the frame is wide.
 */
export function ReportingChartFrame({
  headingId,
  title,
  description,
  chart,
  message,
  categories,
  note,
  listLabel,
}: {
  headingId: string;
  title: string;
  description: ReactNode;
  chart: ReactNode;
  /** Replaces the drawn chart when nothing can be drawn honestly (empty or non-numeric data). */
  message?: string;
  categories: readonly ReportingChartCategory[];
  note?: ReactNode;
  listLabel: string;
}): React.JSX.Element {
  return (
    <Panel aria-labelledby={headingId} className="@container/chart flex flex-col">
      <h3 className="text-lg font-semibold text-text" id={headingId}>{title}</h3>
      <p className="mt-1 max-w-prose text-sm leading-6 text-text-muted">{description}</p>
      <div className="mt-5 grid min-w-0 flex-1 gap-5 @2xl/chart:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] @2xl/chart:items-center">
        {message
          ? <ReportingChartMessage>{message}</ReportingChartMessage>
          : <div aria-hidden="true" className="min-w-0">{chart}</div>}
        <ul aria-label={listLabel} className="min-w-0 divide-y divide-border border-y border-border">
          {categories.map((category) => (
            <li className="flex min-h-11 min-w-0 items-center justify-between gap-4 py-2 text-sm" key={category.key}>
              <span className="flex min-w-0 items-center gap-2">
                {category.swatch
                  ? <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: category.swatch }} />
                  : null}
                {category.href ? (
                  <Link
                    className="min-w-0 break-words rounded-control text-brand-strong underline underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                    href={category.href}
                    prefetch={false}
                  >
                    {category.label}
                  </Link>
                ) : <span className="min-w-0 break-words text-text">{category.label}</span>}
              </span>
              <span className={`shrink-0 tabular-nums ${category.value.state === "COUNT" ? "font-semibold text-text" : "text-text-muted"}`}>
                {reportingChartValueText(category.value)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {note ? <p className="mt-4 text-xs leading-5 text-text-muted">{note}</p> : null}
    </Panel>
  );
}

function ReportingChartMessage({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-control bg-surface-muted px-4 py-6 text-center text-sm leading-6 text-text-muted">
      {children}
    </div>
  );
}
