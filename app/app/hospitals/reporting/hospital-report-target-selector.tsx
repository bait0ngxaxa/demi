"use client";

import Form from "next/form";
import Link from "next/link";
import type { HospitalReportTargetSelection } from "@/modules/reporting/schemas/hospital-report-schemas";
import type { HospitalReportingHospital } from "@/modules/reporting/services/hospital-report-access-service";
import type { ParentChildHospitalReportTargetGroup } from "@/modules/reporting/services/parent-child-hospital-report-access-service";
import { buttonClassName } from "@/components/ui/button";

export function HospitalReportTargetSelector({ hospitals, parentGroups, selection, routeBase, view }: {
  hospitals: readonly HospitalReportingHospital[];
  parentGroups: readonly ParentChildHospitalReportTargetGroup[];
  selection: HospitalReportTargetSelection;
  routeBase: string;
  view?: "overview" | "service";
}): React.JSX.Element {
  const ownId = selection.kind === "PARENT_CHILD" ? selection.parentHospitalId : selection.hospitalId;
  const network = selection.kind === "PARENT_CHILD";
  const count = parentGroups.reduce((sum, group) => sum + group.children.length, 0);
  return <div className="mt-5 min-w-0 space-y-3">
    <nav aria-label="ขอบเขตรายงาน" className="flex flex-wrap gap-2">
      <Link aria-current={!network ? "page" : undefined} className={buttonClassName({ variant: !network ? "primary" : "secondary" })} href={`${routeBase}?hospitalId=${encodeURIComponent(ownId)}`}>โรงพยาบาลของฉัน</Link>
      {parentGroups.length > 0 ? <Link aria-current={network ? "page" : undefined} className={buttonClassName({ variant: network ? "primary" : "secondary" })} href={`${routeBase}?scope=network`}>ลูกข่าย ({count})</Link> : null}
    </nav>
    {!network && hospitals.length > 1 ? <Form action={routeBase} className="max-w-xl">
      <label className="type-label mb-2 block" htmlFor="hospital-report-target">โรงพยาบาลของฉัน</label>
      <select className="type-control min-h-12 w-full rounded-control border border-border-strong bg-surface px-3 text-text focus-visible:ring-4 focus-visible:ring-focus-ring" defaultValue={ownId} key={ownId} id="hospital-report-target" name="hospitalId" onChange={(event) => event.currentTarget.form?.requestSubmit()}>
        {hospitals.map((hospital) => <option key={hospital.id} value={hospital.id}>{hospital.name}</option>)}
      </select>
      {view ? <input type="hidden" name="view" value={view} /> : null}
      <noscript><button className={buttonClassName({ variant: "secondary" })} type="submit">เปิดรายงาน</button></noscript>
    </Form> : null}
  </div>;
}
