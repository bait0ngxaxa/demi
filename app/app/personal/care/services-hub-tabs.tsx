"use client";

import { useState } from "react";

import { LocalNavigation } from "@/components/ui/local-navigation";
import type { ServicesHubTab } from "@/modules/patient-self/presentation/service-progress-card";

const TABS = [
  { value: "rounds", label: "ครั้งบริการ" },
  { value: "followups", label: "การติดตาม" },
] as const satisfies readonly { value: ServicesHubTab; label: string }[];

/**
 * Both panels arrive rendered from the server. Switching only toggles them and records the tab in `?tab=` with
 * the native History API, so nothing is fetched again and the scroll position stays.
 */
export function ServicesHubTabs({ initialTab, rounds, followups }: {
  initialTab: ServicesHubTab;
  rounds: React.ReactNode;
  followups: React.ReactNode;
}): React.JSX.Element {
  const [tab, setTab] = useState<ServicesHubTab>(initialTab);

  function changeTab(next: ServicesHubTab): void {
    setTab(next);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", next);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }

  return <div className="mt-6">
    <LocalNavigation ariaLabel="มุมมองบริการ" items={TABS} onChange={changeTab} value={tab} />
    <div className="mt-5" data-services-tab="rounds" hidden={tab !== "rounds"}>{rounds}</div>
    <div className="mt-5" data-services-tab="followups" hidden={tab !== "followups"}>{followups}</div>
  </div>;
}
