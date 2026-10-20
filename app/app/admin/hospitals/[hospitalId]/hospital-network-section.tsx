import Link from "next/link";

import { NetworkMutationForm } from "@/components/hospital-network/network-mutation-form";
import { Input, inputClassName } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import type { HospitalGovernanceProjection } from "@/modules/hospital-governance/services/hospital-governance-service";
import type { HospitalNetworkAdminView } from "@/modules/hospital-service-areas/services/hospital-network-governance-service";
import {
  adminEndServiceAreaAction,
  renameHospitalAction,
  setNetworkRoleAction,
  transferServiceAreaAction,
} from "@/modules/hospital-service-areas/transport/server-actions";

import { hospitalStatusLabel, hospitalStatusVariant, networkRoleLabel } from "../hospital-network-directory";

function ReasonField({ id, name }: { id: string; name: string }): React.JSX.Element {
  return (
    <>
      <label className="text-sm font-semibold text-text" htmlFor={id}>เหตุผล</label>
      <textarea className={`${inputClassName} mt-2 min-h-20 py-3`} id={id} maxLength={500} name={name} required />
    </>
  );
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" }).format(value);
}

/** ADR-0015: Platform ADMIN registry, network role and cross-Parent governance for one Hospital. */
export function HospitalNetworkSection({
  hospital,
  network,
}: {
  hospital: HospitalGovernanceProjection;
  network: HospitalNetworkAdminView;
}): React.JSX.Element {
  const hasActiveAreas = network.children.length > 0 || network.parentArea !== null;

  return (
    <section aria-labelledby="hospital-network-heading" className="space-y-6">
      <h2 className="text-xl font-semibold tracking-[-0.02em]" id="hospital-network-heading">ข้อมูลโรงพยาบาลและเครือข่าย</h2>

      <Panel>
        <h3 className="text-lg font-semibold">ชื่อโรงพยาบาล</h3>
        <NetworkMutationForm
          action={renameHospitalAction}
          className="mt-3"
          hidden={{ hospitalId: hospital.id, expectedUpdatedAt: hospital.updatedAt.toISOString() }}
          submitLabel="บันทึกชื่อ"
        >
          <label className="sr-only" htmlFor="rename-hospital-name">ชื่อโรงพยาบาล</label>
          <Input defaultValue={hospital.name} id="rename-hospital-name" maxLength={200} name="name" required />
        </NetworkMutationForm>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-lg font-semibold">ประเภทในเครือข่าย</h3>
          <StatusBadge variant={network.role ? "info" : "neutral"}>{networkRoleLabel(network.role)}</StatusBadge>
        </div>
        <p className="mt-2 text-sm leading-6 text-text-muted">
          แม่ข่ายเลือกลูกข่ายเข้าเครือข่ายได้เอง และดูผู้ป่วยของลูกข่ายแบบอ่านอย่างเดียว ลูกข่ายจะถูกเลือกได้เมื่อขึ้นทะเบียนใช้งานแล้ว
          {hasActiveAreas ? " โรงพยาบาลนี้ยังมีความสัมพันธ์ในเครือข่ายอยู่ จึงต้องนำออกหรือโอนก่อนเปลี่ยนประเภท" : ""}
        </p>
        <NetworkMutationForm
          action={setNetworkRoleAction}
          className="mt-4 max-w-md"
          hidden={{ hospitalId: hospital.id }}
          submitLabel="บันทึกประเภท"
        >
          <label className="sr-only" htmlFor="network-role">ประเภทในเครือข่าย</label>
          <Select defaultValue={network.role ?? "NONE"} id="network-role" name="kind">
            <option value="PARENT">โรงพยาบาลแม่ข่าย</option>
            <option value="CHILD">รพ.สต. / หน่วยบริการลูกข่าย</option>
            <option value="NONE">ไม่อยู่ในเครือข่าย</option>
          </Select>
        </NetworkMutationForm>
      </Panel>

      {network.role === "PARENT" ? (
        <Panel>
          <h3 className="text-lg font-semibold">ลูกข่าย ({network.children.length.toLocaleString("th-TH")})</h3>
          {network.children.length === 0 ? (
            <p className="mt-2 text-sm text-text-muted">ยังไม่มีลูกข่าย เจ้าของโรงพยาบาลแม่ข่ายเพิ่มได้จากหน้า “จัดการลูกข่าย”</p>
          ) : (
            <ul className="mt-3 divide-y divide-border border-t border-border">
              {network.children.map(({ areaId, createdAt, child }) => (
                <li className="py-3" key={areaId}>
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <Link
                      className="min-w-0 break-words font-medium text-brand-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                      href={`/app/admin/hospitals/${child.id}`}
                    >
                      {child.name} <span className="text-sm font-normal text-text-muted">({child.hospitalCode})</span>
                    </Link>
                    <StatusBadge variant={hospitalStatusVariant(child.status)}>{hospitalStatusLabel(child.status)}</StatusBadge>
                  </div>
                  <p className="mt-1 text-sm text-text-muted">อยู่ในเครือข่ายตั้งแต่ {formatDate(createdAt)} · โอนย้ายได้จากหน้าของลูกข่าย</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {network.parentArea ? (
        <Panel>
          <h3 className="text-lg font-semibold">แม่ข่ายปัจจุบัน</h3>
          <p className="mt-2 text-text">
            <Link
              className="font-medium text-brand-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
              href={`/app/admin/hospitals/${network.parentArea.parent.id}`}
            >
              {network.parentArea.parent.name}
            </Link>
            <span className="text-sm text-text-muted"> · ตั้งแต่ {formatDate(network.parentArea.createdAt)}</span>
          </p>

          <div className="mt-5 grid gap-6 border-t border-border pt-5 lg:grid-cols-2">
            <div className="min-w-0">
              <h4 className="font-semibold">โอนไปแม่ข่ายอื่น</h4>
              {network.transferTargets.length === 0 ? (
                <p className="mt-2 text-sm text-text-muted">ยังไม่มีแม่ข่ายอื่นที่ใช้งานอยู่</p>
              ) : (
                <NetworkMutationForm
                  action={transferServiceAreaAction}
                  className="mt-3"
                  confirmation={{
                    title: "โอนลูกข่ายไปแม่ข่ายใหม่หรือไม่",
                    description: "แม่ข่ายเดิมจะหมดสิทธิ์ดูผู้ป่วยและรายงานของลูกข่ายนี้ทันที และแม่ข่ายใหม่จะเริ่มมีสิทธิ์ ประวัติเดิมยังคงอยู่",
                    confirmLabel: "โอนย้าย",
                  }}
                  hidden={{ areaId: network.parentArea.areaId, confirm: "true" }}
                  submitLabel="โอนย้าย"
                >
                  <label className="text-sm font-semibold text-text" htmlFor="transfer-target">แม่ข่ายปลายทาง</label>
                  <Select className="mb-3 mt-2" defaultValue="" id="transfer-target" name="toParentHospitalId" required>
                    <option disabled value="">เลือกแม่ข่าย</option>
                    {network.transferTargets.map((target) => (
                      <option key={target.id} value={target.id}>{target.name} ({target.hospitalCode})</option>
                    ))}
                  </Select>
                  <ReasonField id="transfer-reason" name="reason" />
                </NetworkMutationForm>
              )}
            </div>
            <div className="min-w-0">
              <h4 className="font-semibold">นำออกจากเครือข่าย</h4>
              <p className="mt-1 text-sm text-text-muted">ใช้เมื่อแม่ข่ายไม่มีเจ้าของที่ดำเนินการได้</p>
              <NetworkMutationForm
                action={adminEndServiceAreaAction}
                className="mt-3"
                confirmation={{
                  title: "นำลูกข่ายออกจากเครือข่ายหรือไม่",
                  description: "แม่ข่ายจะหมดสิทธิ์ดูผู้ป่วยและรายงานของลูกข่ายนี้ทันที ข้อมูลของลูกข่ายจะไม่ถูกลบ",
                  confirmLabel: "นำออกจากเครือข่าย",
                  destructive: true,
                }}
                hidden={{ areaId: network.parentArea.areaId, confirm: "true" }}
                submitLabel="นำออกจากเครือข่าย"
                submitVariant="danger"
              >
                <ReasonField id="admin-end-reason" name="endReason" />
              </NetworkMutationForm>
            </div>
          </div>
        </Panel>
      ) : null}
    </section>
  );
}
