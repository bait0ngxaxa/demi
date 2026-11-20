import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { HomeHospitalChip } from "@/components/home/home-hospital-chip";
import { buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { LINE_WEB_NAVIGATION_PATHS } from "@/modules/line/domain/line-navigation-intents";
import type { ServicesHubTab } from "@/modules/patient-self/presentation/service-progress-card";
import { isPatientAccessUnavailable } from "@/modules/patient-self/transport/patient-access-unavailable";
import { selectPatientPersonalHomeHospital } from "@/modules/patient-self/transport/patient-personal-home-selection";
import {
  getPatientSelfRelationshipNavigationPageContext,
  getPatientServiceProgressPageContext,
  getPatientServicesHubFollowupsPageContext,
} from "@/modules/patient-self/transport/patient-self-care-page-context";

import { PatientAccessUnavailableState } from "../patient-access-unavailable-state";
import { PatientSelfRelationshipNavigation } from "../patient-self-relationship-navigation";
import { PatientServiceProgress } from "../patient-service-progress";
import { PatientFollowupSummaries } from "./patient-followup-summaries";
import { ServicesHubTabs } from "./services-hub-tabs";

export const metadata: Metadata = {
  title: "บริการ",
};

const linkClassName = "inline-flex min-h-11 items-center font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";

type SearchParams = Record<string, string | string[] | undefined>;

/** Only `tab` and `relationshipId` are read; LINE/LIFF platform keys (liff.state, …) on this entry are ignored. */
function readTab(value: SearchParams["tab"]): ServicesHubTab {
  return value === "followups" ? "followups" : "rounds";
}

/** UI-01 rev. 2026-11-20 (owner): "บริการ" — service rounds and behaviour-practice Follow-ups for one Hospital. */
export default async function PatientServicesHubPage({ searchParams }: {
  searchParams?: Promise<SearchParams>;
} = {}): Promise<React.JSX.Element> {
  await connection();
  const paramsPromise: Promise<SearchParams> = searchParams ?? Promise.resolve({});
  const [params, relationships, services] = await Promise.all([
    paramsPromise,
    getPatientSelfRelationshipNavigationPageContext(LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_CARE),
    getPatientServiceProgressPageContext(LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_CARE),
  ]);

  if (isPatientAccessUnavailable(relationships) || isPatientAccessUnavailable(services)) {
    return <PatientAccessUnavailableState title="บริการ" />;
  }

  const tab = readTab(params.tab);
  // Services hold only ongoing relationships at ACTIVE Hospitals; an unknown, ended or foreign ID falls back.
  const selectedRelationship = selectPatientPersonalHomeHospital(
    { hospitalRelationships: services.map(({ relationship }) => relationship) },
    params.relationshipId,
  );
  const selected = services.find(({ relationshipId }) => relationshipId === selectedRelationship?.relationshipId) ?? null;
  const followups = selected
    ? await getPatientServicesHubFollowupsPageContext(selected.relationshipId, LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_CARE)
    : null;

  if (isPatientAccessUnavailable(followups)) {
    return <PatientAccessUnavailableState title="บริการ" />;
  }

  // The selected Hospital's history, plus ended or inactive ones the selector does not offer.
  const historyLinks = relationships.filter(({ relationshipId }) =>
    relationshipId === selected?.relationshipId || !services.some((service) => service.relationshipId === relationshipId));

  return (
    <div className="max-w-5xl">
      <PageHeader
        actions={<Link className={buttonClassName({ variant: "secondary" })} href="/app/personal/services">ขอรับบริการ</Link>}
        breadcrumbs={[{ href: "/app/personal", label: "พื้นที่ส่วนตัว" }, { label: "บริการ" }]}
        context={selected ? <HomeHospitalChip action="/app/personal/care" fieldName="relationshipId" selectId="services-hospital"
          groups={[{ label: null, options: services.map((service) => ({ value: service.relationshipId, label: service.hospitalName })) }]}
          selectedLabel={selected.hospitalName} selectedValue={selected.relationshipId} /> : undefined}
        title="บริการ"
      />
      {selected && followups ? <ServicesHubTabs
        followups={<PatientFollowupSummaries followups={followups.followups} plan={followups.plan} relationshipId={selected.relationshipId} />}
        initialTab={tab}
        key={`${selected.relationshipId}-${tab}`}
        rounds={<PatientServiceProgress service={selected} />}
      /> : <div className="mt-6"><PatientServiceProgress service={null} /></div>}
      {historyLinks.length > 0 ? (
        <nav aria-label="ประวัติการรับบริการ" className="mt-8 border-t border-border pt-4">
          {selected && historyLinks.length === 1 && historyLinks[0]?.relationshipId === selected.relationshipId ? (
            <Link className={linkClassName} href={`/app/personal/care/${encodeURIComponent(selected.relationshipId)}`}>
              ประวัติการรับบริการ
            </Link>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-text">ประวัติการรับบริการ</h2>
              <PatientSelfRelationshipNavigation area="care" emptyMessage="ยังไม่มีประวัติการรับบริการ" relationships={historyLinks} />
            </>
          )}
        </nav>
      ) : null}
    </div>
  );
}
