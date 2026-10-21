import Link from "next/link";

import { NetworkMutationForm } from "@/components/hospital-network/network-mutation-form";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import type { HospitalNetworkDirectoryEntry } from "@/modules/hospital-service-areas/services/hospital-network-governance-service";
import { createNetworkHospitalAction } from "@/modules/hospital-service-areas/transport/server-actions";

import { HospitalBulkRegistration } from "./hospital-bulk-registration";
import { PendingHospitalRetirement } from "./pending-hospital-retirement";

/** Directory views: the network (without RETIRED), the public onboarding list, and withdrawn Hospitals. */
export const HOSPITAL_DIRECTORY_FILTERS = [
  { value: "network", label: "เครือข่าย" },
  { value: "pending", label: "รอขึ้นทะเบียน" },
  { value: "retired", label: "ถอนแล้ว" },
] as const;

export type HospitalDirectoryFilter = (typeof HOSPITAL_DIRECTORY_FILTERS)[number]["value"];

export function hospitalStatusLabel(status: HospitalNetworkDirectoryEntry["status"]): string {
  switch (status) {
    case "ACTIVE":
      return "ใช้งานอยู่";
    case "SUSPENDED":
      return "ถูกระงับ";
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

function HospitalLine({ hospital }: { hospital: HospitalNetworkDirectoryEntry }): React.JSX.Element {
  return (
    <li className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2">
      <Link
        className="min-w-0 break-words font-medium text-brand-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
        href={`/app/admin/hospitals/${hospital.id}`}
      >
        {hospital.name} <span className="text-sm font-normal text-text-muted">({hospital.hospitalCode})</span>
      </Link>
      <StatusBadge variant={hospitalStatusVariant(hospital.status)}>{hospitalStatusLabel(hospital.status)}</StatusBadge>
    </li>
  );
}

function CreateHospitalPanel({ submissionNonce }: { submissionNonce: string }): React.JSX.Element {
  return (
    <Panel aria-labelledby="create-hospital-heading">
      <h2 className="text-xl font-semibold tracking-[-0.02em]" id="create-hospital-heading">เพิ่มโรงพยาบาลแม่ข่าย</h2>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        โรงพยาบาลที่เพิ่มเป็นแม่ข่ายในสถานะรอขึ้นทะเบียน ผู้รับผิดชอบสมัครใช้งานผ่านหน้าขึ้นทะเบียนโรงพยาบาล และเมื่อได้รับอนุมัติจะเป็นเจ้าของโรงพยาบาลคนแรก
        รพ.สต. และหน่วยบริการลูกข่ายให้เจ้าของโรงพยาบาลแม่ข่ายสร้างเองที่หน้าจัดการลูกข่าย
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

function RetiredHospitalList({ hospitals }: { hospitals: readonly HospitalNetworkDirectoryEntry[] }): React.JSX.Element {
  return (
    <Panel aria-labelledby="retired-hospitals-heading">
      <h2 className="text-lg font-semibold" id="retired-hospitals-heading">
        ถอนออกจากรายชื่อแล้ว ({hospitals.length.toLocaleString("th-TH")})
      </h2>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        ไม่แสดงในหน้าขึ้นทะเบียนสาธารณะและไม่อยู่ในเครือข่าย ข้อมูลยังอยู่ครบ รหัสโรงพยาบาลยังสงวนไว้ และคืนสู่รายชื่อรอสมัครได้จากหน้ารายละเอียด
      </p>
      {hospitals.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">ไม่มี</p>
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
    </Panel>
  );
}

/** ADR-0015: the operational network (not canonical Master placement) is the authoritative structure. */
function provenanceLabel(hospital: HospitalNetworkDirectoryEntry, nameById: ReadonlyMap<string, string>): string {
  const parentName = hospital.registeredForParentHospitalId ? nameById.get(hospital.registeredForParentHospitalId) : undefined;
  return parentName ? ` · สร้างโดยแม่ข่าย ${parentName}` : "";
}

export function HospitalNetworkDirectory({
  filter,
  hospitals: allHospitals,
  submissionNonce,
  bulkSubmissionNonce,
}: {
  filter: HospitalDirectoryFilter;
  hospitals: readonly HospitalNetworkDirectoryEntry[];
  submissionNonce: string;
  /** O1-A: a separate per-request nonce for the file import. */
  bulkSubmissionNonce: string;
}): React.JSX.Element {
  if (filter !== "network") {
    const nameById = new Map(allHospitals.map(({ id, name }) => [id, name]));
    return (
      <div className="space-y-6 pt-8">
        <DirectoryFilterNavigation filter={filter} />
        {filter === "pending" ? (
          <PendingHospitalRetirement
            hospitals={allHospitals
              .filter(({ status }) => status === "PENDING_VERIFICATION")
              .map((hospital) => ({
                id: hospital.id,
                hospitalCode: hospital.hospitalCode,
                name: hospital.name,
                roleLabel: `${networkRoleLabel(hospital.role)}${provenanceLabel(hospital, nameById)}`,
              }))}
          />
        ) : (
          <RetiredHospitalList hospitals={allHospitals.filter(({ status }) => status === "RETIRED")} />
        )}
      </div>
    );
  }

  // N1-D3: a RETIRED Hospital is outside the network; it is listed only under "ถอนแล้ว".
  const hospitals = allHospitals.filter(({ status }) => status !== "RETIRED");
  const parents = hospitals.filter(({ role }) => role === "PARENT");
  const childrenByParent = new Map<string, HospitalNetworkDirectoryEntry[]>();
  for (const hospital of hospitals) {
    if (hospital.networkParentId) {
      childrenByParent.set(hospital.networkParentId, [...(childrenByParent.get(hospital.networkParentId) ?? []), hospital]);
    }
  }
  const freeChildren = hospitals.filter(({ role, networkParentId }) => role === "CHILD" && networkParentId === null);
  const unclassified = hospitals.filter(({ role }) => role === null);

  return (
    <div className="space-y-6 pt-8">
      <CreateHospitalPanel submissionNonce={submissionNonce} />

      <HospitalBulkRegistration submissionNonce={bulkSubmissionNonce} />

      <DirectoryFilterNavigation filter={filter} />

      <section aria-labelledby="network-directory-heading" className="space-y-4">
        <h2 className="text-xl font-semibold tracking-[-0.02em]" id="network-directory-heading">
          เครือข่ายโรงพยาบาล
        </h2>
        <p className="text-sm leading-6 text-text-muted">
          แม่ข่าย {parents.length.toLocaleString("th-TH")} แห่ง · ลูกข่ายที่ยังไม่มีแม่ข่าย {freeChildren.length.toLocaleString("th-TH")} แห่ง · ทั้งหมด {hospitals.length.toLocaleString("th-TH")} แห่ง
        </p>
        <ul className="grid min-w-0 gap-4">
          {parents.map((parent) => {
            const children = childrenByParent.get(parent.id) ?? [];
            return (
              <li className="min-w-0" key={parent.id}>
                <Panel aria-labelledby={`network-parent-${parent.id}`} className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                    <h3 className="min-w-0 break-words text-lg font-semibold" id={`network-parent-${parent.id}`}>
                      <Link
                        className="text-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                        href={`/app/admin/hospitals/${parent.id}`}
                      >
                        {parent.name}
                      </Link>
                      <span className="ml-2 text-sm font-normal text-text-muted">({parent.hospitalCode})</span>
                    </h3>
                    <StatusBadge variant={hospitalStatusVariant(parent.status)}>{hospitalStatusLabel(parent.status)}</StatusBadge>
                  </div>
                  {children.length === 0 ? (
                    <p className="mt-3 text-sm text-text-muted">ยังไม่มีลูกข่าย</p>
                  ) : (
                    <ul className="mt-3 divide-y divide-border border-t border-border">
                      {children.map((child) => <HospitalLine hospital={child} key={child.id} />)}
                    </ul>
                  )}
                </Panel>
              </li>
            );
          })}
        </ul>
      </section>

      {[
        { id: "free-children", title: "ลูกข่ายที่ยังไม่มีแม่ข่าย", items: freeChildren, empty: "ไม่มี" },
        { id: "unclassified", title: "ยังไม่กำหนดประเภท", items: unclassified, empty: "ไม่มี" },
      ].map((group) => (
        <section aria-labelledby={`network-${group.id}-heading`} key={group.id}>
          <Panel>
            <h2 className="text-lg font-semibold" id={`network-${group.id}-heading`}>
              {group.title} ({group.items.length.toLocaleString("th-TH")})
            </h2>
            {group.items.length === 0 ? (
              <p className="mt-2 text-sm text-text-muted">{group.empty}</p>
            ) : (
              <ul className="mt-3 divide-y divide-border border-t border-border">
                {group.items.map((hospital) => <HospitalLine hospital={hospital} key={hospital.id} />)}
              </ul>
            )}
          </Panel>
        </section>
      ))}
    </div>
  );
}
