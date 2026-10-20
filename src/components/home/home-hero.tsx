import Link from "next/link";

export type HomeAppointment = {
  href: string;
  scheduledAt: Date;
};

function formatAppointmentTime(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(value);
}

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
    <section aria-labelledby={headingId} className="min-w-0 rounded-panel bg-brand-deep p-5 text-white sm:p-7 lg:px-6 lg:py-5">
      {/* lg+: title and Hospital chip share one row so the menu starts above the fold (UI-4.1). */}
      <div className="min-w-0 lg:flex lg:flex-wrap lg:items-center lg:justify-between lg:gap-x-6 lg:gap-y-2">
        <h1 className="break-words text-2xl font-bold leading-tight tracking-[-0.03em] sm:text-3xl lg:text-2xl" id={headingId}>
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
    <article aria-labelledby={headingId} className="mt-5 rounded-control border border-white/25 bg-white/10 p-4 sm:p-5 lg:mt-4 lg:flex lg:min-w-0 lg:items-center lg:gap-4 lg:px-4 lg:py-2">
      <h2 className="text-base font-semibold text-white lg:shrink-0" id={headingId}>{heading}</h2>
      <div className="min-w-0 lg:flex-1">{children}</div>
    </article>
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
        <p className="mt-2 text-sm leading-6 text-white lg:mt-0">ยังโหลดนัดหมายไม่ได้</p>
      ) : nextAppointment ? (
        <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between lg:mt-0">
          <time className="text-sm leading-6 text-white" dateTime={nextAppointment.scheduledAt.toISOString()}>
            {formatAppointmentTime(nextAppointment.scheduledAt)}
          </time>
          <Link
            className="inline-flex min-h-12 items-center rounded-control font-semibold text-white underline decoration-white/60 underline-offset-4 hover:decoration-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-bright"
            href={nextAppointment.href}
            prefetch={false}
          >
            ดูรายละเอียดนัด
          </Link>
        </div>
      ) : (
        <p className="mt-2 text-sm leading-6 text-white lg:mt-0">ยังไม่มีนัดหมาย</p>
      )}
    </HomeHeroCard>
  );
}
