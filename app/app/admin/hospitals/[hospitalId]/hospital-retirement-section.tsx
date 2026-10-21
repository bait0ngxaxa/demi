import { NetworkMutationForm } from "@/components/hospital-network/network-mutation-form";
import { inputClassName } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import type { HospitalGovernanceProjection } from "@/modules/hospital-governance/services/hospital-governance-service";
import {
  restoreRetiredHospitalAction,
  retireHospitalAction,
} from "@/modules/hospital-service-areas/transport/server-actions";

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(value);
}

function ReasonField({ id }: { id: string }): React.JSX.Element {
  return (
    <div className="max-w-xl">
      <label className="text-sm font-semibold text-text" htmlFor={id}>เหตุผล</label>
      <textarea className={`${inputClassName} mt-2 min-h-20 py-3`} id={id} maxLength={500} name="reason" required />
    </div>
  );
}

/**
 * Phase N1: an unclaimed (PENDING_VERIFICATION) Hospital can be withdrawn from the public onboarding list and put
 * back later. ACTIVE and SUSPENDED Hospitals use suspend/restore instead, so this section shows nothing for them.
 */
export function HospitalRetirementSection({
  hospital,
}: {
  hospital: HospitalGovernanceProjection;
}): React.JSX.Element | null {
  if (hospital.status !== "PENDING_VERIFICATION" && hospital.status !== "RETIRED") {
    return null;
  }

  const hidden = { hospitalId: hospital.id, expectedUpdatedAt: hospital.updatedAt.toISOString() };

  return (
    <Panel aria-labelledby="hospital-retirement-heading">
      <h2 className="text-xl font-semibold tracking-[-0.02em]" id="hospital-retirement-heading">
        รายชื่อรอสมัครในหน้าขึ้นทะเบียน
      </h2>
      {hospital.status === "PENDING_VERIFICATION" ? (
        <>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            โรงพยาบาลนี้แสดงในหน้าขึ้นทะเบียนสาธารณะ หากจะไม่ใช้งาน ให้ถอนออกจากรายชื่อเพื่อไม่ให้มีผู้สมัครเป็นเจ้าของ
            หากมีคำขอขึ้นทะเบียนรอพิจารณา ต้องปฏิเสธคำขอนั้นก่อน
          </p>
          <NetworkMutationForm
            action={retireHospitalAction}
            className="mt-4"
            confirmation={{
              title: "ถอนโรงพยาบาลนี้ออกจากรายชื่อหรือไม่",
              description: "โรงพยาบาลจะหายไปจากรายชื่อในหน้าขึ้นทะเบียนสาธารณะ ข้อมูลไม่ถูกลบ และคืนสู่รายชื่อรอสมัครได้ภายหลัง",
              confirmLabel: "ถอนออกจากรายชื่อ",
              destructive: true,
            }}
            hidden={hidden}
            submitLabel="ถอนออกจากรายชื่อ"
            submitVariant="danger"
          >
            <ReasonField id="retire-hospital-reason" />
          </NetworkMutationForm>
        </>
      ) : (
        <>
          <dl className="mt-4 grid gap-x-8 gap-y-4 border-y border-border py-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-text-muted">ถอนเมื่อ</dt>
              <dd className="mt-1 text-text">
                {hospital.retiredAt ? (
                  <time dateTime={hospital.retiredAt.toISOString()}>{formatDateTime(hospital.retiredAt)}</time>
                ) : "-"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-sm text-text-muted">เหตุผล</dt>
              <dd className="mt-1 whitespace-pre-line break-words text-text">{hospital.retiredReason ?? "-"}</dd>
            </div>
          </dl>
          <p className="mt-4 text-sm leading-6 text-text-muted">
            คืนสู่รายชื่อรอสมัครเพื่อให้กลับมาแสดงในหน้าขึ้นทะเบียนสาธารณะ ประวัติการถอนและเหตุผลยังถูกเก็บไว้
          </p>
          <NetworkMutationForm
            action={restoreRetiredHospitalAction}
            className="mt-4"
            confirmation={{
              title: "คืนโรงพยาบาลนี้สู่รายชื่อรอสมัครหรือไม่",
              description: "โรงพยาบาลจะกลับมาแสดงในหน้าขึ้นทะเบียนสาธารณะ และผู้รับผิดชอบส่งคำขอเป็นเจ้าของได้อีกครั้ง",
              confirmLabel: "คืนสู่รายชื่อรอสมัคร",
            }}
            hidden={hidden}
            submitLabel="คืนสู่รายชื่อรอสมัคร"
            submitVariant="primary"
          >
            <ReasonField id="restore-hospital-reason" />
          </NetworkMutationForm>
        </>
      )}
    </Panel>
  );
}
