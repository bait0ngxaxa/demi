"use client";

import Link from "next/link";
import { useState } from "react";

import { NetworkMutationForm } from "@/components/hospital-network/network-mutation-form";
import { Alert } from "@/components/ui/alert";
import { inputClassName } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { HOSPITAL_BULK_RETIRE_LIMIT } from "@/modules/hospital-governance/schemas/hospital-governance-schemas";
import { retireHospitalsAction } from "@/modules/hospital-service-areas/transport/server-actions";

export type PendingHospitalOption = {
  id: string;
  hospitalCode: string;
  name: string;
  roleLabel: string;
};

/**
 * N1-D4: select unclaimed (PENDING_VERIFICATION) Hospitals and withdraw them from the public onboarding list
 * in one all-or-nothing action. The server re-checks every selected Hospital.
 */
export function PendingHospitalRetirement({
  hospitals,
}: {
  hospitals: readonly PendingHospitalOption[];
}): React.JSX.Element {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Drop selections of Hospitals that left this list after a refresh (retired, onboarded or renamed away).
  const selectedIds = hospitals.filter(({ id }) => selected.has(id)).map(({ id }) => id);
  const count = selectedIds.length;
  const overLimit = count > HOSPITAL_BULK_RETIRE_LIMIT;
  const allSelected = hospitals.length > 0 && count === hospitals.length;

  function toggle(hospitalId: string, checked: boolean): void {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(hospitalId);
      else next.delete(hospitalId);
      return next;
    });
  }

  return (
    <Panel aria-labelledby="pending-hospitals-heading">
      <h2 className="text-lg font-semibold" id="pending-hospitals-heading">
        โรงพยาบาลรอขึ้นทะเบียน ({hospitals.length.toLocaleString("th-TH")})
      </h2>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        รายชื่อนี้แสดงในหน้าขึ้นทะเบียนโรงพยาบาลสาธารณะ เลือกโรงพยาบาลที่จะไม่ใช้งานเพื่อถอนออกจากรายชื่อ ข้อมูลจะไม่ถูกลบและคืนสู่รายชื่อได้ภายหลัง
        โรงพยาบาลที่มีคำขอขึ้นทะเบียนรอพิจารณาต้องปฏิเสธคำขอก่อน
      </p>
      {hospitals.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">ไม่มีโรงพยาบาลรอขึ้นทะเบียน</p>
      ) : (
        <NetworkMutationForm
          action={retireHospitalsAction}
          className="mt-4"
          confirmation={{
            title: `ถอนโรงพยาบาล ${count.toLocaleString("th-TH")} แห่งออกจากรายชื่อหรือไม่`,
            description: "โรงพยาบาลที่เลือกจะหายไปจากรายชื่อในหน้าขึ้นทะเบียนสาธารณะ ข้อมูลไม่ถูกลบ และคืนสู่รายชื่อรอสมัครได้ภายหลัง",
            details: <p>หากมีโรงพยาบาลใดถอนไม่ได้ ระบบจะไม่ถอนโรงพยาบาลใดเลยและแจ้งรายชื่อที่ติดปัญหา</p>,
            confirmLabel: `ถอน ${count.toLocaleString("th-TH")} แห่ง`,
            destructive: true,
          }}
          hidden={{}}
          submitDisabled={count === 0 || overLimit}
          submitLabel={count === 0 ? "เลือกโรงพยาบาลก่อน" : `ถอน ${count.toLocaleString("th-TH")} แห่งออกจากรายชื่อ`}
          submitVariant="danger"
        >
          <label className="flex min-h-11 items-center gap-3 border-b border-border py-2 text-sm font-semibold">
            <input
              checked={allSelected}
              className="size-4 accent-brand-strong"
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                setSelected(new Set(checked ? hospitals.map(({ id }) => id) : []));
              }}
              type="checkbox"
            />
            <span>เลือกทั้งหมดที่แสดง ({hospitals.length.toLocaleString("th-TH")})</span>
          </label>
          <ul aria-label="โรงพยาบาลรอขึ้นทะเบียน" className="divide-y divide-border">
            {hospitals.map((hospital) => (
              <li className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2" key={hospital.id}>
                <label className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-sm">
                  <input
                    checked={selected.has(hospital.id)}
                    className="size-4 shrink-0 accent-brand-strong"
                    name="hospitalId"
                    onChange={(event) => toggle(hospital.id, event.currentTarget.checked)}
                    type="checkbox"
                    value={hospital.id}
                  />
                  <span className="min-w-0 break-words">
                    <span className="font-semibold text-text">{hospital.name}</span>{" "}
                    <span className="text-text-muted">({hospital.hospitalCode}) · {hospital.roleLabel}</span>
                  </span>
                </label>
                <Link
                  className="text-sm font-semibold text-brand-strong underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
                  href={`/app/admin/hospitals/${hospital.id}#hospital-retirement-heading`}
                >
                  ถอนออกจากรายชื่อ
                </Link>
              </li>
            ))}
          </ul>
          {overLimit ? (
            <Alert className="mt-3" role="alert" variant="warning">
              ถอนได้ครั้งละไม่เกิน {HOSPITAL_BULK_RETIRE_LIMIT.toLocaleString("th-TH")} แห่ง กรุณาลดจำนวนที่เลือก
            </Alert>
          ) : null}
          <div className="mt-4 max-w-xl">
            <label className="text-sm font-semibold text-text" htmlFor="bulk-retire-reason">เหตุผล (ใช้ร่วมกันทุกแห่งที่เลือก)</label>
            <textarea className={`${inputClassName} mt-2 min-h-20 py-3`} id="bulk-retire-reason" maxLength={500} name="reason" required />
          </div>
        </NetworkMutationForm>
      )}
    </Panel>
  );
}
