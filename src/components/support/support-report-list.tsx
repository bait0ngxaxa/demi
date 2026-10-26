import type { SupportReportCategory, SupportReportStatus } from "@prisma/client";
import Link from "next/link";

import { SUPPORT_REPORT_CATEGORY_LABELS } from "@/modules/support/domain/support-report";

import { SupportReportStatusBadge } from "./support-report-status-badge";

export type SupportReportListRow = {
  id: string;
  category: SupportReportCategory;
  status: SupportReportStatus;
  createdAt: string;
  hospitalName: string | null;
};

const dateTime = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" });

/** One bordered panel of report rows: category as the row title, date and Hospital as metadata, status as a badge. */
export function SupportReportList({ items, detailHref, emptyText }: { items: readonly SupportReportListRow[]; detailHref: (id: string) => string; emptyText: string }): React.JSX.Element {
  if (items.length === 0) {
    return <p className="rounded-panel border border-dashed border-border bg-surface px-5 py-10 text-center text-text-muted">{emptyText}</p>;
  }
  return <ul className="divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface">
    {items.map((item) => <li key={item.id}>
      <Link className="flex flex-col gap-3 px-5 py-4 transition-[background-color] hover:bg-brand-soft/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-focus-ring sm:flex-row sm:items-center sm:justify-between sm:px-6" href={detailHref(item.id)}>
        <div className="min-w-0">
          <p className="font-semibold text-text">{SUPPORT_REPORT_CATEGORY_LABELS[item.category]}</p>
          <p className="mt-1 break-words text-sm leading-6 text-text-muted"><time dateTime={item.createdAt}>{dateTime.format(new Date(item.createdAt))}</time> · {item.hospitalName ?? "ไม่เจาะจงโรงพยาบาล"}</p>
        </div>
        <SupportReportStatusBadge status={item.status} />
      </Link>
    </li>)}
  </ul>;
}
