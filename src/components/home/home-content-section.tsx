import Link from "next/link";

import { HospitalContentImageList } from "@/components/hospital-content/hospital-content-image-list";
import type { HospitalContentPatientListItem } from "@/modules/hospital-content/types/hospital-content-patient-projections";

function formatPublishedAt(value: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

export function HomeContentSection({
  allHref,
  emptyMessage,
  heading,
  id,
  items,
}: {
  allHref: string;
  emptyMessage: string;
  heading: string;
  id: string;
  items: readonly HospitalContentPatientListItem[];
}): React.JSX.Element {
  return (
    <section aria-labelledby={id} className="mt-8 min-w-0">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id={id}>{heading}</h2>
        <Link
          className="inline-flex min-h-12 items-center rounded-control text-sm font-semibold text-brand-strong underline underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
          href={allHref}
          prefetch={false}
        >
          ดูทั้งหมด
        </Link>
      </div>
      {items.length > 0 ? (
        <ul aria-label={`${heading}ล่าสุด`} className="mt-2 divide-y divide-border border-y border-border">
          {items.map((item) => (
            <li className="min-w-0 py-4" key={item.id}>
              <article className="min-w-0">
                <h3 className="min-w-0 break-words text-base font-semibold leading-6 text-text">
                  <Link
                    className="inline-flex min-h-12 max-w-full items-center rounded-control text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                    href={`/app/personal/knowledge/${encodeURIComponent(item.id)}`}
                    prefetch={false}
                  >
                    {item.title}
                  </Link>
                </h3>
                <HospitalContentImageList imageIds={item.imageIds.slice(0, 1)} layout="home" title={item.title} />
                <p className="mt-2 text-sm leading-6 text-text-muted">
                  {item.hospital.name} · เผยแพร่ล่าสุด <time dateTime={item.latestPublishedAt}>{formatPublishedAt(item.latestPublishedAt)}</time>
                </p>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 border-y border-border py-5 text-sm leading-6 text-text-muted">{emptyMessage}</p>
      )}
    </section>
  );
}
