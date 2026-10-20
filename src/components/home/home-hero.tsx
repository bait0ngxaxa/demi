import Link from "next/link";

import type { HomeHospitalOption } from "./home-hospital-chip";
import { HomeHospitalChip } from "./home-hospital-chip";

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
  activeHospitals,
  displayName,
  nextAppointment,
  selectedHospital,
}: {
  activeHospitals: readonly HomeHospitalOption[];
  displayName: string | null;
  nextAppointment: HomeAppointment | null;
  selectedHospital: HomeHospitalOption | null;
}): React.JSX.Element {
  return (
    <section aria-labelledby="personal-home-heading" className="min-w-0 rounded-panel bg-brand-deep p-5 text-white sm:p-7">
      <h1 className="break-words text-2xl font-bold leading-tight tracking-[-0.03em] sm:text-3xl" id="personal-home-heading">
        {displayName ? `สวัสดี, ${displayName}` : "สวัสดี"}
      </h1>
      <HomeHospitalChip
        options={activeHospitals}
        selectedHospitalName={selectedHospital?.hospitalName ?? null}
        selectedRelationshipId={selectedHospital?.relationshipId ?? null}
      />
      <article aria-labelledby="personal-next-appointment-heading" className="mt-5 rounded-control border border-white/25 bg-white/10 p-4 sm:p-5">
        <h2 className="text-base font-semibold text-white" id="personal-next-appointment-heading">นัดถัดไป</h2>
        {nextAppointment ? (
          <div className="mt-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <time className="text-sm leading-6 text-white" dateTime={nextAppointment.scheduledAt.toISOString()}>
              {formatAppointmentTime(nextAppointment.scheduledAt)}
            </time>
            <Link
              className="inline-flex min-h-12 items-center rounded-control font-semibold text-white underline decoration-white/60 underline-offset-4 hover:decoration-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
              href={nextAppointment.href}
              prefetch={false}
            >
              ดูรายละเอียดนัด
            </Link>
          </div>
        ) : (
          <p className="mt-2 text-sm leading-6 text-white">ยังไม่มีนัดหมาย</p>
        )}
      </article>
    </section>
  );
}
