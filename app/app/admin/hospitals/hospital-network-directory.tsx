import Form from "next/form";
import Link from "next/link";

import { NetworkMutationForm } from "@/components/hospital-network/network-mutation-form";
import { Input } from "@/components/ui/input";
import { PageNumberPagination } from "@/components/ui/page-number-pagination";
import { Panel } from "@/components/ui/panel";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import {
  HOSPITAL_DIRECTORY_SEARCH_MAX_LENGTH,
  type HOSPITAL_DIRECTORY_FILTER_VALUES,
} from "@/modules/hospital-service-areas/schemas/hospital-service-area-schemas";
import type {
  HospitalNetworkDirectoryEntry,
  HospitalNetworkDirectoryPage,
} from "@/modules/hospital-service-areas/services/hospital-network-governance-service";
import { createNetworkHospitalAction } from "@/modules/hospital-service-areas/transport/server-actions";

import { HospitalBulkRegistration } from "./hospital-bulk-registration";
import { PendingHospitalRetirement } from "./pending-hospital-retirement";

/** Directory views: the network (without RETIRED), the public onboarding list, and withdrawn Hospitals. */
export const HOSPITAL_DIRECTORY_FILTERS = [
  { value: "network", label: "เครือข่าย" },
  { value: "pending", label: "รอขึ้นทะเบียน" },
  { value: "retired", label: "ถอนแล้ว" },
] as const satisfies readonly { value: (typeof HOSPITAL_DIRECTORY_FILTER_VALUES)[number]; label: string }[];

export type HospitalDirectoryFilter = (typeof HOSPITAL_DIRECTORY_FILTERS)[number]["value"];

export function hospitalStatusLabel(status: HospitalNetworkDirectoryEntry["status"]): string {
  switch (status) {
    case "ACTIVE":
      return "ใช้งานอยู่";
    case "SUSPENDED":
      return "ระงับการใช้งาน";
    case "PENDING_VERIFICATION":
      return "รอขึ้นทะเบียน";
    case "RETIRED":
      return "ถอนออกจากรายชื่อ";
  }
}

export function hospitalStatusVariant(status: HospitalNetworkDirectoryEntry["status"]): StatusVariant {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "SUSPENDED":
      return "danger";
    case "PENDING_VERIFICATION":
      return "warning";
    case "RETIRED":
      return "neutral";
  }
}

export function networkRoleLabel(role: HospitalNetworkDirectoryEntry["role"]): string {
  return role === "PARENT" ? "แม่ข่าย" : role === "CHILD" ? "ลูกข่าย" : "ยังไม่กำหนดประเภท";
}

/** ADR-0024: which first-OWNER path is open for a Parent (a public application or a platform ADMIN invitation). */
export type ParentOnboardingPathLabels = Readonly<Record<string, "PENDING_APPLICATION" | "OPEN_INVITATION">>;

export function onboardingPathLabel(path: ParentOnboardingPathLabels[string] | undefined): string | null {
  return path === "PENDING_APPLICATION" ? "มีคำขอรออนุมัติ" : path === "OPEN_INVITATION" ? "มีคำเชิญเปิดอยู่" : null;
}

function CreateHospitalPanel({ submissionNonce }: { submissionNonce: string }): React.JSX.Element {
  return (
    <Panel aria-labelledby="create-hospital-heading">
      <h2 className="text-xl font-semibold tracking-[-0.02em]" id="create-hospital-heading">เพิ่มโรงพยาบาลแม่ข่าย</h2>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        โรงพยาบาลแม่ข่ายที่รอขึ้นทะเบียนต้องมีผู้รับผิดชอบสมัครผ่านหน้าขึ้นทะเบียน เมื่อได้รับอนุมัติ ผู้สมัครจะได้สิทธิ์แอดมินโรงพยาบาลคนแรก
        หรือผู้ดูแลระบบ DEMI เชิญแอดมินโรงพยาบาลคนแรกได้จากหน้ารายละเอียด
        แอดมินโรงพยาบาลแม่ข่ายเพิ่ม รพ.สต. และหน่วยบริการลูกข่ายได้จากหน้าจัดการลูกข่าย
      </p>
      <NetworkMutationForm
        action={createNetworkHospitalAction}
        className="mt-5"
        // N1-D5: rendered per request, so the refresh after a successful registration brings a new nonce.
        hidden={{ submissionNonce }}
        submitLabel="เพิ่มโรงพยาบาลแม่ข่าย"
        submitVariant="primary"
      >
        <div className="max-w-xl">
          <div className="min-w-0">
            <label className="text-sm font-semibold text-text" htmlFor="create-hospital-name">ชื่อโรงพยาบาล</label>
            <Input className="mt-2" id="create-hospital-name" maxLength={200} name="name" required />
            <p className="mt-1 text-xs text-text-muted">ระบบสร้างรหัสโรงพยาบาลให้อัตโนมัติ</p>
          </div>
        </div>
      </NetworkMutationForm>
    </Panel>
  );
}

function DirectoryFilterNavigation({ filter }: { filter: HospitalDirectoryFilter }): React.JSX.Element {
  return (
    <nav aria-label="มุมมองรายชื่อโรงพยาบาล" className="flex w-fit max-w-full flex-wrap gap-1 rounded-panel bg-surface-muted p-1">
      {HOSPITAL_DIRECTORY_FILTERS.map((item) => {
        const selected = item.value === filter;
        return (
          <Link
            aria-current={selected ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-control px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring ${
              selected ? "bg-surface text-brand-strong shadow-surface" : "text-text-muted hover:bg-surface/70 hover:text-text"
            }`}
            href={item.value === "network" ? "/app/admin/hospitals" : `/app/admin/hospitals?status=${item.value}`}
            key={item.value}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The directory URL for a filter, search and page; the network view is the default. */
export function hospitalDirectoryHref(filter: HospitalDirectoryFilter, value: string, page = 1): string {
  const params = new URLSearchParams();
  if (filter !== "network") params.set("status", filter);
  if (value) params.set("value", value);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/app/admin/hospitals?${query}` : "/app/admin/hospitals";
}

function DirectorySearch({ filter, value }: { filter: HospitalDirectoryFilter; value: string }): React.JSX.Element {
  return (
    // A new search starts again on page 1: the form sends no page.
    <Form action="/app/admin/hospitals" className="flex max-w-xl flex-col gap-2 sm:flex-row sm:items-end" role="search">
      {filter !== "network" ? <input name="status" type="hidden" value={filter} /> : null}
      <label className="min-w-0 flex-1 text-sm font-semibold text-text" htmlFor="hospital-directory-search">
        ค้นหาชื่อหรือรหัสโรงพยาบาล
        <Input
          className="mt-2"
          defaultValue={value}
          id="hospital-directory-search"
          key={`${filter}\n${value}`}
          maxLength={HOSPITAL_DIRECTORY_SEARCH_MAX_LENGTH}
          name="value"
          type="search"
        />
      </label>
      <PendingSubmitButton className="shrink-0" pendingLabel="กำลังค้นหา..." variant="secondary">
        ค้นหา
      </PendingSubmitButton>
    </Form>
  );
}

function DirectoryPagination({
  directory,
  filter,
  value,
}: {
  directory: HospitalNetworkDirectoryPage;
  filter: HospitalDirectoryFilter;
  value: string;
}): React.JSX.Element | null {
  return (
    <PageNumberPagination
      className="mt-4 border-t border-border pt-4"
      label="หน้ารายชื่อโรงพยาบาล"
      next={directory.hasNextPage ? { href: hospitalDirectoryHref(filter, value, directory.page + 1) } : null}
      page={directory.page}
      previous={directory.hasPreviousPage ? { href: hospitalDirectoryHref(filter, value, directory.page - 1) } : null}
      totalPages={directory.totalPages}
    />
  );
}

function resultSummary(directory: HospitalNetworkDirectoryPage, value: string): string {
  const total = directory.total.toLocaleString("th-TH");
  return value ? `พบ ${total} แห่งที่ตรงกับ “${value}”` : `ทั้งหมด ${total} แห่ง`;
}

function RetiredHospitalList({
  directory,
  value,
}: {
  directory: HospitalNetworkDirectoryPage;
  value: string;
}): React.JSX.Element {
  const hospitals = directory.items;
  return (
    <Panel aria-labelledby="retired-hospitals-heading">
      <h2 className="text-lg font-semibold" id="retired-hospitals-heading">
        ถอนออกจากรายชื่อแล้ว ({directory.total.toLocaleString("th-TH")})
      </h2>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        ไม่แสดงในหน้าขึ้นทะเบียนสาธารณะและไม่อยู่ในเครือข่าย ข้อมูลยังอยู่ครบ รหัสโรงพยาบาลยังสงวนไว้ และคืนสู่รายชื่อรอสมัครได้จากหน้ารายละเอียด
      </p>
      {hospitals.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">{value ? "ไม่พบโรงพยาบาลที่ตรงกับคำค้นหา" : "ไม่มี"}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border border-t border-border">
          {hospitals.map((hospital) => (
            <li className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2" key={hospital.id}>
              <span className="min-w-0 break-words">
                <span className="font-medium text-text">{hospital.name}</span>{" "}
                <span className="text-sm text-text-muted">({hospital.hospitalCode}) · {networkRoleLabel(hospital.role)}</span>
              </span>
              <Link
                className="text-sm font-semibold text-brand-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                href={`/app/admin/hospitals/${hospital.id}#hospital-retirement-heading`}
              >
                คืนสู่รายชื่อรอสมัคร
              </Link>
            </li>
          ))}
        </ul>
      )}
      <DirectoryPagination directory={directory} filter="retired" value={value} />
    </Panel>
  );
}

/** ADR-0018: which Parent registered this Child, shown from the names the page loaded. */
function provenanceLabel(hospital: HospitalNetworkDirectoryEntry): string {
  return hospital.registeredForParentHospitalName ? ` · สร้างโดยแม่ข่าย ${hospital.registeredForParentHospitalName}` : "";
}

/** ADR-0015: the operational network (not canonical Master placement) is the authoritative structure. */
function networkPlacementLabel(hospital: HospitalNetworkDirectoryEntry): string {
  if (hospital.role === "CHILD") {
    return hospital.networkParentName ? `ลูกข่ายของ ${hospital.networkParentName}` : "ลูกข่ายที่ยังไม่มีแม่ข่าย";
  }
  return networkRoleLabel(hospital.role);
}

function NetworkHospitalRow({
  hospital,
  onboardingPath,
}: {
  hospital: HospitalNetworkDirectoryEntry;
  onboardingPath: string | null;
}): React.JSX.Element {
  return (
    <li className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <div className="min-w-0">
        <Link
          className="break-words font-medium text-brand-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
          href={`/app/admin/hospitals/${hospital.id}`}
        >
          {hospital.name} <span className="text-sm font-normal text-text-muted">({hospital.hospitalCode})</span>
        </Link>
        <p className="mt-0.5 break-words text-sm text-text-muted">{networkPlacementLabel(hospital)}{provenanceLabel(hospital)}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onboardingPath ? <StatusBadge variant="info">{onboardingPath}</StatusBadge> : null}
        <StatusBadge variant={hospitalStatusVariant(hospital.status)}>{hospitalStatusLabel(hospital.status)}</StatusBadge>
      </div>
    </li>
  );
}

export function HospitalNetworkDirectory({
  filter,
  value,
  directory,
  onboardingPaths = {},
  submissionNonce,
  bulkSubmissionNonce,
}: {
  filter: HospitalDirectoryFilter;
  /** The trimmed name or code search; empty for none. */
  value: string;
  /** One page (at most 25) of the filtered directory. */
  directory: HospitalNetworkDirectoryPage;
  onboardingPaths?: ParentOnboardingPathLabels;
  submissionNonce: string;
  /** O1-A: a separate per-request nonce for the file import. */
  bulkSubmissionNonce: string;
}): React.JSX.Element {
  if (filter !== "network") {
    return (
      <div className="space-y-6 pt-8">
        <DirectoryFilterNavigation filter={filter} />
        <DirectorySearch filter={filter} value={value} />
        {filter === "pending" ? (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">{resultSummary(directory, value)}</p>
            <PendingHospitalRetirement
              hospitals={directory.items.map((hospital) => ({
                id: hospital.id,
                hospitalCode: hospital.hospitalCode,
                name: hospital.name,
                roleLabel: [
                  `${networkRoleLabel(hospital.role)}${provenanceLabel(hospital)}`,
                  onboardingPathLabel(onboardingPaths[hospital.id]),
                ].filter(Boolean).join(" · "),
              }))}
            />
            <DirectoryPagination directory={directory} filter="pending" value={value} />
          </div>
        ) : (
          <RetiredHospitalList directory={directory} value={value} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-8">
      <CreateHospitalPanel submissionNonce={submissionNonce} />

      <HospitalBulkRegistration submissionNonce={bulkSubmissionNonce} />

      <DirectoryFilterNavigation filter={filter} />

      {/* N1-D3: a RETIRED Hospital is outside the network; it is listed only under "ถอนแล้ว". */}
      <section aria-labelledby="network-directory-heading" className="space-y-4">
        <h2 className="text-xl font-semibold tracking-[-0.02em]" id="network-directory-heading">
          เครือข่ายโรงพยาบาล
        </h2>
        <DirectorySearch filter={filter} value={value} />
        <Panel>
          <p className="text-sm text-text-muted">{resultSummary(directory, value)}</p>
          {directory.items.length === 0 ? (
            <p className="mt-3 text-sm text-text-muted">{value ? "ไม่พบโรงพยาบาลที่ตรงกับคำค้นหา" : "ยังไม่มีโรงพยาบาลในเครือข่าย"}</p>
          ) : (
            <ul className="mt-3 divide-y divide-border border-t border-border">
              {directory.items.map((hospital) => (
                <NetworkHospitalRow
                  hospital={hospital}
                  key={hospital.id}
                  onboardingPath={onboardingPathLabel(onboardingPaths[hospital.id])}
                />
              ))}
            </ul>
          )}
          <DirectoryPagination directory={directory} filter={filter} value={value} />
        </Panel>
      </section>
    </div>
  );
}
