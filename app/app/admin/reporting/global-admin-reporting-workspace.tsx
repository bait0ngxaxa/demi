"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ChevronGlyph } from "@/components/ui/glyphs";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { HospitalHierarchyUnit } from "@/modules/hospital-hierarchy/services/hospital-hierarchy-service";
import type { GlobalReportingDirectory } from "@/modules/reporting/projections/global-reporting-projection";
import { HOSPITAL_SEARCH_MAX_LENGTH } from "@/shared/search/hospital-search";

import {
  globalHospitalReportHref,
  hospitalStatusLabel,
  hospitalStatusVariant,
  parseHospitalStatusFilter,
  type HospitalStatusFilter,
} from "./hospital-status";

const URL_SYNC_DELAY_MS = 300;

function normalizeSearch(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("th-TH");
}

function matchesHospital(
  hospital: HospitalHierarchyUnit,
  query: string,
  statusFilter: HospitalStatusFilter,
): boolean {
  if (statusFilter !== "ALL" && hospital.status !== statusFilter) return false;
  if (!query) return true;
  return normalizeSearch(hospital.name).includes(query);
}

/**
 * Keeps `?q=` and `?hospitalStatus=` in step with the filters without a navigation: the native History API keeps the
 * Next.js router in sync, so returning from a Hospital report restores the filters while the directory is not read
 * again on every keystroke.
 */
function useDirectoryUrlSync(search: string, statusFilter: HospitalStatusFilter): void {
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const query = search.trim();
      if (query) params.set("q", query);
      else params.delete("q");
      if (statusFilter === "ALL") params.delete("hospitalStatus");
      else params.set("hospitalStatus", statusFilter);
      const nextSearch = params.toString();
      const next = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
      if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", next);
    }, URL_SYNC_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search, statusFilter]);
}

/** The Hospital name is the row's link; the link's area covers the whole row. */
function HospitalRow({
  hospital,
  label,
  detail,
}: {
  hospital: HospitalHierarchyUnit;
  label: string;
  detail?: string;
}): React.JSX.Element {
  return (
    <div className="relative flex min-w-0 flex-col gap-2 -mx-2 rounded-control px-2 py-3 sm:flex-row sm:items-center sm:justify-between has-[a:hover]:bg-brand-soft">
      <div className="min-w-0">
        <p className="text-xs font-medium text-text-muted">{label}</p>
        <Link
          className="mt-0.5 inline-flex min-h-11 items-center break-words font-semibold text-text underline-offset-4 after:absolute after:inset-0 after:rounded-control after:content-[''] hover:text-brand-strong hover:underline focus-visible:outline-none focus-visible:after:ring-4 focus-visible:after:ring-focus-ring"
          href={globalHospitalReportHref(hospital.id)}
          prefetch={false}
        >
          {hospital.name}
        </Link>
        {detail ? <p className="break-words text-sm text-text-muted">{detail}</p> : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-3 sm:shrink-0">
        <StatusBadge variant={hospitalStatusVariant(hospital.status)}>{hospitalStatusLabel(hospital.status)}</StatusBadge>
        <span aria-hidden="true" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-strong">
          {hospital.status === "ACTIVE" ? "เปิดรายงาน" : "ดูสถานะ"}
          <ChevronGlyph direction="right" className="size-4" />
        </span>
      </div>
    </div>
  );
}

function SummaryValue({
  label,
  value,
}: {
  label: string;
  value: number;
}): React.JSX.Element {
  return (
    <div className="min-w-0 border-b border-border py-3 last:border-b-0 sm:border-b-0 sm:py-2">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="mt-1 tabular-nums text-lg font-semibold text-text">{value.toLocaleString("th-TH")}</dd>
    </div>
  );
}

function GlobalHospitalDirectory({
  directory,
}: {
  directory: GlobalReportingDirectory;
}): React.JSX.Element {
  // The URL is the source of the initial filters, including after Back restores this page from the router cache.
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(() => (searchParams.get("q") ?? "").slice(0, HOSPITAL_SEARCH_MAX_LENGTH));
  const [statusFilter, setStatusFilter] = useState<HospitalStatusFilter>(
    () => parseHospitalStatusFilter(searchParams.get("hospitalStatus")) ?? "ALL",
  );
  useDirectoryUrlSync(search, statusFilter);
  const query = normalizeSearch(search.trim());

  const visibleGroups = useMemo(() => directory.hierarchy.groups.flatMap((group) => {
    const mainMatches = matchesHospital(group.mainHospital, query, statusFilter);
    const matchingChildren = group.directChildren.filter((hospital) =>
      matchesHospital(hospital, query, statusFilter),
    );
    if (!mainMatches && matchingChildren.length === 0) return [];
    return [{ ...group, showMainAsResult: mainMatches, visibleChildren: matchingChildren }];
  }), [directory.hierarchy.groups, query, statusFilter]);

  const visibleOutsideNetwork = useMemo(
    () => directory.hierarchy.outsideNetwork.filter((hospital) => matchesHospital(hospital, query, statusFilter)),
    [directory.hierarchy.outsideNetwork, query, statusFilter],
  );

  const visibleCount = visibleGroups.reduce(
    (count, group) => count + Number(group.showMainAsResult) + group.visibleChildren.length,
    visibleOutsideNetwork.length,
  );

  return (
    <section aria-labelledby="global-hospital-directory-heading" className="mt-8">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="global-hospital-directory-heading">
            เลือกโรงพยาบาล
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
            แสดงโรงพยาบาลและหน่วยบริการลูกข่ายที่ขึ้นทะเบียนไว้ โดยจัดตามเครือข่ายแม่ข่ายและลูกข่ายโดยตรง
          </p>
        </div>
        <p aria-live="polite" className="text-sm text-text-muted">
          พบ {visibleCount.toLocaleString("th-TH")} แห่ง จากทั้งหมด {directory.hierarchy.hospitalCount.toLocaleString("th-TH")} แห่ง
        </p>
      </div>

      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0">
          <label className="type-label mb-2 block text-text" htmlFor="global-hospital-search">ค้นหาชื่อโรงพยาบาล</label>
          <input
            autoComplete="off"
            className="type-control min-h-12 w-full rounded-control border border-border-strong bg-surface px-4 py-2 text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            id="global-hospital-search"
            maxLength={HOSPITAL_SEARCH_MAX_LENGTH}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="พิมพ์ชื่อโรงพยาบาล"
            type="search"
            value={search}
          />
        </div>
        <div className="min-w-0">
          <label className="type-label mb-2 block text-text" htmlFor="global-hospital-status">สถานะโรงพยาบาล</label>
          <select
            className="type-control min-h-12 w-full rounded-control border border-border-strong bg-surface px-4 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            id="global-hospital-status"
            onChange={(event) => setStatusFilter(parseHospitalStatusFilter(event.currentTarget.value) ?? "ALL")}
            value={statusFilter}
          >
            <option value="ALL">ทุกสถานะ</option>
            <option value="ACTIVE">ใช้งานอยู่</option>
            <option value="PENDING_VERIFICATION">รอยืนยันการขึ้นทะเบียน</option>
            <option value="SUSPENDED">ระงับการใช้งาน</option>
          </select>
        </div>
      </div>

      {directory.hierarchy.hospitalCount === 0 ? (
        <Panel className="mt-5 border-dashed text-center">
          <p className="font-semibold text-text">ยังไม่มีโรงพยาบาลในฐานข้อมูล</p>
          <p className="mt-2 text-sm leading-6 text-text-muted">โรงพยาบาลและหน่วยบริการจะแสดงตามสถานะและโครงสร้างเครือข่ายปัจจุบัน</p>
        </Panel>
      ) : visibleCount === 0 ? (
        <Panel className="mt-5 border-dashed text-center">
          <p className="font-semibold text-text">ไม่พบโรงพยาบาลตามเงื่อนไขนี้</p>
          <p className="mt-2 text-sm leading-6 text-text-muted">ลองค้นหาด้วยชื่ออื่น หรือเลือกทุกสถานะ</p>
        </Panel>
      ) : (
        <ul className="mt-5 grid min-w-0 gap-4">
          {visibleGroups.map(({ mainHospital, directChildren, visibleChildren, showMainAsResult }) => (
            <li className="min-w-0" key={mainHospital.id}>
              <section className="min-w-0 rounded-panel border border-border bg-surface px-4 py-2 sm:px-5 sm:py-3">
                {showMainAsResult ? (
                  <HospitalRow
                    detail={`โรงพยาบาลลูกข่ายโดยตรง ${directChildren.length.toLocaleString("th-TH")} แห่ง`}
                    hospital={mainHospital}
                    label="โรงพยาบาลแม่ข่าย"
                  />
                ) : (
                  <div className="min-w-0 py-3">
                    <p className="text-xs font-medium text-text-muted">แม่ข่ายของหน่วยที่ตรงกับคำค้น</p>
                    <p className="mt-1 break-words font-semibold text-text">{mainHospital.name}</p>
                  </div>
                )}

                {visibleChildren.length > 0 ? (
                  <details className="mb-1 border-t border-border pt-2" open={Boolean(query)}>
                    <summary className="flex min-h-11 cursor-pointer items-center rounded-control text-sm font-semibold text-brand-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2">
                      ดูรายชื่อโรงพยาบาลลูกข่าย {visibleChildren.length.toLocaleString("th-TH")} แห่ง
                    </summary>
                    <ul className="mt-1 divide-y divide-border">
                      {visibleChildren.map((hospital) => (
                        <li className="min-w-0" key={hospital.id}>
                          <HospitalRow
                            detail={`แม่ข่าย ${mainHospital.name}`}
                            hospital={hospital}
                            label="โรงพยาบาลลูกข่าย / รพ.สต. / หน่วยบริการในเครือ"
                          />
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : showMainAsResult ? (
                  <p className="mb-2 border-t border-border pt-3 text-sm text-text-muted">ไม่มีโรงพยาบาลลูกข่ายตรงตามตัวกรองนี้</p>
                ) : null}
              </section>
            </li>
          ))}
        </ul>
      )}

      {visibleOutsideNetwork.length > 0 ? (
        <section aria-labelledby="global-hospital-outside-network-heading" className="mt-7">
          <h3 className="font-semibold text-text" id="global-hospital-outside-network-heading">
            ยังไม่อยู่ในเครือข่าย ({visibleOutsideNetwork.length.toLocaleString("th-TH")})
          </h3>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            ลูกข่ายที่ยังไม่มีแม่ข่าย หรือโรงพยาบาลที่ยังไม่กำหนดประเภท จัดการได้ที่หน้าการกำกับดูแลโรงพยาบาล
          </p>
          <ul className="mt-3 divide-y divide-border rounded-panel border border-border bg-surface px-4 sm:px-5">
            {visibleOutsideNetwork.map((hospital) => (
              <li className="min-w-0" key={hospital.id}>
                <HospitalRow hospital={hospital} label="ยังไม่อยู่ในเครือข่าย" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

/** The system report directory: the organisation summary, then every Hospital; each opens its own report page. */
export function GlobalAdminReportingWorkspace({
  directory,
}: {
  directory: GlobalReportingDirectory;
}): React.JSX.Element {
  const summary = directory.hierarchy;

  return (
    <div className="min-w-0">
      <PageHeader
        breadcrumbs={[{ label: "หน้าหลัก", href: "/app" }, { label: "รายงานระบบ" }]}
        title="รายงานระบบ"
      />

      <section aria-labelledby="global-reporting-organization-heading" className="mt-7">
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="global-reporting-organization-heading">
          โครงสร้างองค์กรในระบบ
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
          จำนวนนี้นับโรงพยาบาลที่ลงทะเบียนในระบบตามเครือข่ายปัจจุบัน ไม่ใช่จำนวนผู้ป่วยหรือยอดทางคลินิก
        </p>
        <Panel className="mt-4 p-4 sm:p-5">
          <dl className="grid min-w-0 grid-cols-2 gap-x-6 sm:grid-cols-3 xl:grid-cols-6">
            <SummaryValue label="โรงพยาบาลทั้งหมด" value={summary.hospitalCount} />
            <SummaryValue label="โรงพยาบาลแม่ข่าย" value={summary.mainHospitalCount} />
            <SummaryValue label="โรงพยาบาลลูกข่าย" value={summary.subordinateHospitalCount} />
            <SummaryValue label="ใช้งานอยู่" value={directory.statusCounts.ACTIVE} />
            <SummaryValue label="รอยืนยัน" value={directory.statusCounts.PENDING_VERIFICATION} />
            <SummaryValue label="ระงับการใช้งาน" value={directory.statusCounts.SUSPENDED} />
          </dl>
        </Panel>
      </section>

      <GlobalHospitalDirectory directory={directory} />
    </div>
  );
}
