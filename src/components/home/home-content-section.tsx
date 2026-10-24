import Link from "next/link";

import { HospitalContentImageList } from "@/components/hospital-content/hospital-content-image-list";
import { Alert } from "@/components/ui/alert";
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
  failure,
  heading,
  id,
  itemHrefBase,
  items,
}: {
  allHref: string;
  emptyMessage: string;
  /** Set when the feed failed to load; the section shows a retry Alert instead of its items. */
  failure?: { message: string; retryHref: string };
  heading: string;
  id: string;
  /** Detail route of the feed the items came from; each item links to `${itemHrefBase}/${id}`. */
  itemHrefBase: string;
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
      {failure ? (
        <Alert className="mt-3" variant="warning">
          <p className="font-semibold">{failure.message}</p>
          <Link
            className="mt-1 inline-flex min-h-12 items-center rounded-control font-semibold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
            href={failure.retryHref}
            prefetch={false}
          >
            ลองอีกครั้ง
          </Link>
        </Alert>
      ) : items.length > 0 ? (
        <ul aria-label={`${heading}ล่าสุด`} className="mt-2 divide-y divide-border border-y border-border">
          {items.map((item) => (
            <li className="min-w-0 py-4" key={item.id}>
              <article className="min-w-0">
                <h3 className="min-w-0 break-words text-base font-semibold leading-6 text-text">
                  <Link
                    className="inline-flex min-h-12 max-w-full items-center rounded-control text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                    href={`${itemHrefBase}/${encodeURIComponent(item.id)}`}
                    prefetch={false}
                  >
                    {item.title}
                  </Link>
                </h3>
                <HospitalContentImageList imageIds={item.imageIds} layout="home" title={item.title} />
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
