import Link from "next/link";

import { NetworkMutationForm } from "@/components/hospital-network/network-mutation-form";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge, type StatusVariant } from "@/components/ui/status-badge";
import type { HospitalNetworkDirectoryEntry } from "@/modules/hospital-service-areas/services/hospital-network-governance-service";
import { createNetworkHospitalAction } from "@/modules/hospital-service-areas/transport/server-actions";

export function hospitalStatusLabel(status: HospitalNetworkDirectoryEntry["status"]): string {
  switch (status) {
    case "ACTIVE":
      return "ใช้งานอยู่";
    case "SUSPENDED":
      return "ถูกระงับ";
    case "PENDING_VERIFICATION":
      return "รอขึ้นทะเบียน";
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

function CreateHospitalPanel(): React.JSX.Element {
  return (
    <Panel aria-labelledby="create-hospital-heading">
      <h2 className="text-xl font-semibold tracking-[-0.02em]" id="create-hospital-heading">เพิ่มโรงพยาบาล</h2>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        โรงพยาบาลที่เพิ่มจะอยู่ในสถานะรอขึ้นทะเบียน ผู้รับผิดชอบสมัครใช้งานผ่านหน้าขึ้นทะเบียนโรงพยาบาล และเมื่อได้รับอนุมัติจะเป็นเจ้าของโรงพยาบาลคนแรก
      </p>
      <NetworkMutationForm
        action={createNetworkHospitalAction}
        className="mt-5"
        hidden={{}}
        submitLabel="เพิ่มโรงพยาบาล"
        submitVariant="primary"
      >
        <div className="grid gap-4 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,14rem)]">
          <div className="min-w-0">
            <label className="text-sm font-semibold text-text" htmlFor="create-hospital-code">
              รหัส <span className="font-normal text-text-muted">(ไม่บังคับ)</span>
            </label>
            <Input
              aria-describedby="create-hospital-code-hint"
              autoCapitalize="characters"
              className="mt-2"
              id="create-hospital-code"
              maxLength={32}
              name="hospitalCode"
            />
            <p className="mt-1 text-xs text-text-muted" id="create-hospital-code-hint">เว้นว่างเพื่อให้ระบบสร้างให้</p>
          </div>
          <div className="min-w-0">
            <label className="text-sm font-semibold text-text" htmlFor="create-hospital-name">ชื่อโรงพยาบาล</label>
            <Input className="mt-2" id="create-hospital-name" maxLength={200} name="name" required />
          </div>
          <div className="min-w-0">
            <label className="text-sm font-semibold text-text" htmlFor="create-hospital-role">ประเภท</label>
            <Select className="mt-2" defaultValue="" id="create-hospital-role" name="networkRole" required>
              <option disabled value="">เลือกประเภท</option>
              <option value="PARENT">โรงพยาบาลแม่ข่าย</option>
              <option value="CHILD">รพ.สต. / หน่วยบริการลูกข่าย</option>
            </Select>
          </div>
        </div>
      </NetworkMutationForm>
    </Panel>
  );
}

/** ADR-0015: the operational network (not canonical Master placement) is the authoritative structure. */
export function HospitalNetworkDirectory({ hospitals }: { hospitals: readonly HospitalNetworkDirectoryEntry[] }): React.JSX.Element {
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
      <CreateHospitalPanel />

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
