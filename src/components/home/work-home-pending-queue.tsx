import Link from "next/link";

import { getMoreNavigationIcon, MobileNavigationGlyph } from "@/components/app-shell/mobile-navigation-glyph";
import { ChevronGlyph } from "@/components/ui/glyphs";
import type { PendingActionIndicator, PendingActionsResult } from "@/modules/pending-actions/services/pending-action-service";

const numberFormat = new Intl.NumberFormat("th-TH");

function formatHospitalQueue(
  hospitalQueue: PendingActionIndicator["hospitalQueue"],
  hospitalNames: ReadonlyMap<string, string>,
): string | null {
  const hospitals = (hospitalQueue?.hospitals ?? []).flatMap(({ hospitalId, count }) => {
    const name = hospitalNames.get(hospitalId);
    return name && count > 0 ? [`${name} ${numberFormat.format(count)}`] : [];
  });
  if (hospitals.length < 2) return null;

  const remaining = hospitals.length - 3;
  const visible = hospitals.slice(0, 3).join(" · ");
  return remaining > 0 ? `${visible} และอีก ${numberFormat.format(remaining)} แห่ง` : visible;
}

export function WorkHomePendingQueue({
  result,
  hospitalNames,
}: {
  result: PendingActionsResult;
  hospitalNames: ReadonlyMap<string, string>;
}): React.JSX.Element {
  const indicators = result.status === "READY" ? result.indicators.filter(({ count }) => count > 0) : [];

  return (
    <section aria-labelledby="work-home-pending-heading">
      <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="work-home-pending-heading">
        รอคุณดำเนินการ
      </h2>
      <p className="mt-1 text-sm text-text-muted">
        {result.status === "UNAVAILABLE"
          ? "ยังตรวจสอบงานที่รอดำเนินการไม่ได้ ลองโหลดหน้าใหม่อีกครั้ง"
          : indicators.length === 0 ? "ไม่มีงานรอดำเนินการในตอนนี้" : "รวมทุกโรงพยาบาลที่คุณมีสิทธิ์"}
      </p>
      {indicators.length > 0 ? (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-panel border border-border bg-surface">
          {indicators.map((indicator, index) => {
            const rowId = `work-home-pending-${index}`;
            const hospitalQueue = formatHospitalQueue(indicator.hospitalQueue, hospitalNames);

            return (
              <li key={indicator.navigationHref}>
                <Link
                  aria-describedby={hospitalQueue ? `${rowId}-hospitals` : undefined}
                  aria-labelledby={`${rowId}-label ${rowId}-count`}
                  className="grid min-h-15 grid-cols-[1.25rem_minmax(0,1fr)_auto_auto] items-center gap-4 px-4 py-2.5 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-inset"
                  href={indicator.href}
                  prefetch={false}
                >
                  <span className="text-brand-strong"><MobileNavigationGlyph icon={getMoreNavigationIcon(indicator.navigationHref)} /></span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-medium text-text" id={`${rowId}-label`}>{indicator.label}</span>
                    {hospitalQueue ? (
                      <span className="block text-sm text-text-muted" id={`${rowId}-hospitals`}>{hospitalQueue}</span>
                    ) : null}
                  </span>
                  <span className="text-[22px] font-bold tabular-nums text-brand-deep" id={`${rowId}-count`}>
                    {numberFormat.format(indicator.count)}<span className="sr-only"> รายการ</span>
                  </span>
                  <span aria-hidden="true" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-strong">
                    เปิด <ChevronGlyph className="size-4" direction="right" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
