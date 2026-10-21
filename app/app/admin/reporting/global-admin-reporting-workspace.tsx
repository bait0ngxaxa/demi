"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import type {
  HospitalHierarchyUnit,
  HospitalHierarchyContext,
} from "@/modules/hospital-hierarchy/services/hospital-hierarchy-service";
import type { HospitalReportingPageProjection } from "@/modules/reporting/projections/hospital-report-projection";
import type { GlobalReportingDirectory } from "@/modules/reporting/projections/global-reporting-projection";

import { HospitalReportWorkspace } from "../../hospitals/reporting/hospital-report-workspace";

type StatusFilter = "ALL" | HospitalHierarchyUnit["status"];

function statusLabel(status: HospitalHierarchyUnit["status"]): string {
  switch (status) {
    case "ACTIVE": return "ใช้งานอยู่";
    case "SUSPENDED": return "ถูกระงับ";
    case "PENDING_VERIFICATION": return "รอยืนยันการขึ้นทะเบียน";
    case "RETIRED": return "ถอนออกจากรายชื่อ";
  }
}

function statusVariant(status: HospitalHierarchyUnit["status"]): StatusVariant {
  switch (status) {
    case "ACTIVE": return "success";
    case "SUSPENDED": return "danger";
    case "PENDING_VERIFICATION": return "warning";
    case "RETIRED": return "neutral";
  }
}

function classificationLabel(classification: HospitalHierarchyContext["classification"]): string {
  switch (classification) {
    case "MAIN": return "โรงพยาบาลแม่ข่าย";
    case "SUBORDINATE": return "โรงพยาบาลลูกข่าย / หน่วยบริการในเครือ";
    case "UNASSIGNED": return "ยังไม่อยู่ในเครือข่าย";
  }
}

function normalizeSearch(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("th-TH");
}

function matchesHospital(
  hospital: HospitalHierarchyUnit,
  query: string,
  statusFilter: StatusFilter,
): boolean {
  if (statusFilter !== "ALL" && hospital.status !== statusFilter) return false;
  if (!query) return true;
  return normalizeSearch(hospital.name).includes(query);
}

function HospitalAction({
  hospital,
  selectedHospitalId,
}: {
  hospital: HospitalHierarchyUnit;
  selectedHospitalId: string | null;
}): React.JSX.Element {
  const isCurrent = selectedHospitalId === hospital.id;
  return (
    <Link
      aria-current={isCurrent ? "page" : undefined}
      className="min-h-11 rounded-control px-3 py-2 text-sm font-semibold text-brand-strong underline-offset-4 hover:bg-brand-soft hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      href={`/app/admin/reporting?hospitalId=${encodeURIComponent(hospital.id)}`}
      prefetch={false}
    >
      {hospital.status === "ACTIVE" ? "เปิดรายงานเฉพาะแห่ง" : "ดูสถานะและเหตุผลที่รายงานยังไม่พร้อม"}
    </Link>
  );
}

function HospitalIdentity({
  hospital,
  label,
}: {
  hospital: HospitalHierarchyUnit;
  label: string;
}): React.JSX.Element {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className="mt-1 break-words font-semibold text-text">{hospital.name}</p>
    </div>
  );
}

function DirectoryUnitRow({
  hospital,
  parentHospital,
  selectedHospitalId,
}: {
  hospital: HospitalHierarchyUnit;
  parentHospital: HospitalHierarchyUnit | null;
  selectedHospitalId: string | null;
}): React.JSX.Element {
  return (
    <li className="flex min-w-0 flex-col gap-2 border-t border-border py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <HospitalIdentity hospital={hospital} label="โรงพยาบาลลูกข่าย / รพ.สต. / หน่วยบริการในเครือ" />
        {parentHospital ? (
          <p className="mt-1 break-words text-sm text-text-muted">
            แม่ข่าย {parentHospital.name}
          </p>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0">
        <StatusBadge variant={statusVariant(hospital.status)}>{statusLabel(hospital.status)}</StatusBadge>
        <HospitalAction hospital={hospital} selectedHospitalId={selectedHospitalId} />
      </div>
    </li>
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
  selectedHospitalId,
}: {
  directory: GlobalReportingDirectory;
  selectedHospitalId: string | null;
}): React.JSX.Element {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
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
            แสดงหน่วยงานที่มีอยู่ในฐานข้อมูลปัจจุบันตามความสัมพันธ์แม่ข่ายและลูกข่ายโดยตรง
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
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="พิมพ์ชื่อหรือรหัส"
            type="search"
            value={search}
          />
        </div>
        <div className="min-w-0">
          <label className="type-label mb-2 block text-text" htmlFor="global-hospital-status">สถานะโรงพยาบาล</label>
          <select
            className="type-control min-h-12 w-full rounded-control border border-border-strong bg-surface px-4 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            id="global-hospital-status"
            onChange={(event) => setStatusFilter(event.currentTarget.value as StatusFilter)}
            value={statusFilter}
          >
            <option value="ALL">ทุกสถานะ</option>
            <option value="ACTIVE">ใช้งานอยู่</option>
            <option value="PENDING_VERIFICATION">รอยืนยันการขึ้นทะเบียน</option>
            <option value="SUSPENDED">ถูกระงับ</option>
          </select>
        </div>
      </div>

      {directory.hierarchy.hospitalCount === 0 ? (
        <Panel className="mt-5 border-dashed text-center">
          <p className="font-semibold text-text">ยังไม่มีโรงพยาบาลในฐานข้อมูล</p>
          <p className="mt-2 text-sm leading-6 text-text-muted">หน่วยงานที่เพิ่มเข้าสู่ระบบจะแสดงตามสถานะและความสัมพันธ์ปัจจุบัน</p>
        </Panel>
      ) : visibleCount === 0 ? (
        <Panel className="mt-5 border-dashed text-center">
          <p className="font-semibold text-text">ไม่พบโรงพยาบาลตามเงื่อนไขนี้</p>
          <p className="mt-2 text-sm leading-6 text-text-muted">ลองค้นหาด้วยชื่อหรือรหัสอื่น หรือเลือกทุกสถานะ</p>
        </Panel>
      ) : (
        <ul className="mt-5 grid min-w-0 gap-4">
          {visibleGroups.map(({ mainHospital, directChildren, visibleChildren, showMainAsResult }) => (
            <li className="min-w-0" key={mainHospital.id}>
              <section className="min-w-0 rounded-panel border border-border bg-surface p-4 sm:p-5">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <HospitalIdentity
                      hospital={mainHospital}
                      label={showMainAsResult ? "โรงพยาบาลแม่ข่าย" : "แม่ข่ายของหน่วยที่ตรงกับคำค้น"}
                    />
                    <p className="mt-2 text-sm text-text-muted">
                      โรงพยาบาลลูกข่ายโดยตรง {directChildren.length.toLocaleString("th-TH")} แห่ง
                    </p>
                  </div>
                  {showMainAsResult ? (
                    <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                      <StatusBadge variant={statusVariant(mainHospital.status)}>{statusLabel(mainHospital.status)}</StatusBadge>
                      <HospitalAction hospital={mainHospital} selectedHospitalId={selectedHospitalId} />
                    </div>
                  ) : null}
                </div>

                {visibleChildren.length > 0 ? (
                  <details className="mt-4 border-t border-border pt-3" open={Boolean(query)}>
                    <summary className="flex min-h-11 cursor-pointer items-center rounded-control text-sm font-semibold text-brand-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2">
                      ดูรายชื่อโรงพยาบาลลูกข่าย {visibleChildren.length.toLocaleString("th-TH")} แห่ง
                    </summary>
                    <ul className="mt-2 divide-y divide-border">
                      {visibleChildren.map((hospital) => (
                        <DirectoryUnitRow
                          hospital={hospital}
                          key={hospital.id}
                          parentHospital={mainHospital}
                          selectedHospitalId={selectedHospitalId}
                        />
                      ))}
                    </ul>
                  </details>
                ) : showMainAsResult ? (
                  <p className="mt-3 border-t border-border pt-3 text-sm text-text-muted">ไม่มีโรงพยาบาลลูกข่ายตรงตามตัวกรองนี้</p>
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
              <li className="flex min-w-0 flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between" key={hospital.id}>
                <div className="min-w-0">
                  <HospitalIdentity hospital={hospital} label="ยังไม่อยู่ในเครือข่าย" />
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0">
                  <StatusBadge variant={statusVariant(hospital.status)}>{statusLabel(hospital.status)}</StatusBadge>
                  <HospitalAction hospital={hospital} selectedHospitalId={selectedHospitalId} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

export function GlobalAdminReportingWorkspace({
  directory,
  selectedHospital,
  hierarchy,
  page,
  selectedHospitalId,
  initialView,
}: {
  directory: GlobalReportingDirectory;
  selectedHospital: HospitalHierarchyUnit | null;
  hierarchy: HospitalHierarchyContext | null;
  page: HospitalReportingPageProjection | null;
  selectedHospitalId: string | null;
  initialView: "overview" | "service";
}): React.JSX.Element {
  const summary = directory.hierarchy;

  return (
    <div className="min-w-0">
      <PageHeader
        breadcrumbs={[{ label: "หน้าหลัก", href: "/app" }, { label: "ผู้ดูแลระบบ" }, { label: "รายงานระบบ" }]}
        description="ดูโครงสร้างโรงพยาบาลและรายงานของแห่งที่เลือก ข้อมูลผู้ป่วยและ Program จำกัดอยู่ในโรงพยาบาลนั้น ไม่รวมแม่ข่ายหรือลูกข่าย"
        title="รายงานสำหรับผู้ดูแลระบบ"
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
            <SummaryValue label="ถูกระงับ" value={directory.statusCounts.SUSPENDED} />
          </dl>
        </Panel>
      </section>

      <GlobalHospitalDirectory directory={directory} selectedHospitalId={selectedHospitalId} />

      {selectedHospital && hierarchy ? (
        <section aria-labelledby="selected-global-hospital-heading" className="mt-9 border-t border-border pt-7">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="selected-global-hospital-heading">
            {selectedHospital.name}
          </h2>
          <p className="mt-1 break-words text-sm text-text-muted">
            {classificationLabel(hierarchy.classification)}
          </p>
          {selectedHospital.status !== "ACTIVE" ? (
            <Alert className="mt-4" variant={selectedHospital.status === "SUSPENDED" ? "warning" : "info"}>
              <p className="font-semibold">รายงานผู้ป่วยและ Program ยังไม่พร้อมใช้งาน</p>
              <p className="mt-1 text-sm leading-6">
                สถานะปัจจุบัน: {statusLabel(selectedHospital.status)} ไม่มีการโหลดหรือแสดงค่ารายงานเป็นศูนย์
              </p>
            </Alert>
          ) : page ? (
            <HospitalReportWorkspace
              audience="GLOBAL_ADMIN"
            key={`${selectedHospital.id}:${initialView}`}
              hospitals={[{
                id: selectedHospital.id,
                hospitalCode: selectedHospital.hospitalCode,
                name: selectedHospital.name,
                status: selectedHospital.status,
              }]}
              hierarchy={hierarchy}
              initialView={initialView}
              page={page}
              selectedHospitalId={selectedHospital.id}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
