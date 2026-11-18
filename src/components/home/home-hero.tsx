import Link from "next/link";

import { ChevronGlyph } from "@/components/ui/glyphs";

export type HomeAppointment = {
  href: string;
  scheduledAt: Date;
};

const appointmentTime = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Asia/Bangkok",
});

const appointmentDate = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Bangkok",
});

export function HomeHero({
  children,
  chip,
  headingId,
  title,
}: {
  children?: React.ReactNode;
  chip: React.ReactNode;
  headingId: string;
  title: string;
}): React.JSX.Element {
  return (
    <section aria-labelledby={headingId} className="min-w-0 rounded-[16px] border border-header-border bg-header-surface p-5 sm:p-7 lg:px-6 lg:py-5">
      {/* lg+: title and Hospital chip share one row so the menu starts above the fold (UI-4.1). */}
      <div className="min-w-0 lg:flex lg:flex-wrap lg:items-center lg:justify-between lg:gap-x-6 lg:gap-y-2">
        <h1 className="min-w-0 text-balance break-words text-2xl font-bold leading-tight tracking-[-0.03em] text-brand-deep sm:text-3xl lg:text-2xl" id={headingId}>
          {title}
        </h1>
        {chip}
      </div>
      {children}
    </section>
  );
}

export function HomeHeroCard({
  children,
  heading,
  headingId,
}: {
  children: React.ReactNode;
  heading: string;
  headingId: string;
}): React.JSX.Element {
  return (
    <article aria-labelledby={headingId} className="mt-5 rounded-control bg-surface p-4 shadow-surface lg:mt-4 lg:flex lg:min-w-0 lg:items-center lg:gap-4 lg:px-4 lg:py-3">
      <h2 className="text-sm font-semibold text-text-muted lg:shrink-0" id={headingId}>{heading}</h2>
      <div className="min-w-0 lg:flex-1">{children}</div>
    </article>
  );
}

function AppointmentDetails({ href, scheduledAt }: HomeAppointment): React.JSX.Element {
  const dateParts = appointmentDate.formatToParts(scheduledAt);

  return (
    <div className="mt-2 flex min-w-0 items-center gap-3 lg:mt-0">
      <div aria-hidden="true" className="flex min-h-[60px] w-14 shrink-0 flex-col items-center justify-center rounded-[10px] border border-border bg-canvas text-brand-strong">
        <span className="text-xs font-semibold">{dateParts.find(({ type }) => type === "month")?.value}</span>
        <span className="text-[22px] font-bold leading-tight">{dateParts.find(({ type }) => type === "day")?.value}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4">
        <time className="break-words text-sm leading-6 text-header-muted" dateTime={scheduledAt.toISOString()}>
          {appointmentTime.format(scheduledAt)}
        </time>
        <Link
          className="inline-flex min-h-11 items-center gap-1 rounded-control font-semibold text-brand-strong no-underline hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          href={href}
          prefetch={false}
        >
          ดูรายละเอียดนัด
          <ChevronGlyph direction="right" className="size-4 shrink-0" />
        </Link>
      </div>
    </div>
  );
}

export function HomeNextAppointment({
  nextAppointment,
}: {
  /** `"UNAVAILABLE"` when the appointment could not be loaded; the rest of the home still renders. */
  nextAppointment: HomeAppointment | null | "UNAVAILABLE";
}): React.JSX.Element {
  return (
    <HomeHeroCard heading="นัดถัดไป" headingId="personal-next-appointment-heading">
      {nextAppointment === "UNAVAILABLE" ? (
        <p className="mt-2 text-sm leading-6 text-header-muted lg:mt-0">ยังโหลดนัดหมายไม่ได้</p>
      ) : nextAppointment ? (
        <AppointmentDetails {...nextAppointment} />
      ) : (
        <p className="mt-2 text-sm leading-6 text-header-muted lg:mt-0">ยังไม่มีนัดหมาย</p>
      )}
    </HomeHeroCard>
  );
}
