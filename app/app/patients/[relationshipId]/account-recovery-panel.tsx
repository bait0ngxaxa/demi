import Link from "next/link";

import { Panel } from "@/components/ui/panel";

export function PatientAccountRecoveryPanel({ relationshipId }: { relationshipId: string }): React.JSX.Element {
  return (
    <section aria-labelledby="patient-account-recovery-heading" className="mt-6">
      <Panel>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="patient-account-recovery-heading">คืนบัญชีผู้ป่วย</h2>
        <p className="mt-2 break-words text-sm leading-6 text-text-muted">ต้องยืนยันตัวตนและเลือกวิธีส่งมอบลิงก์ก่อน ผู้ใช้จะกรอกเลขบัตรประชาชนของตนเองและตั้งรหัสผ่านใหม่</p>
        <Link className="mt-3 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4" href={`/app/users/patient/${relationshipId}`}>เปิดหน้ารายละเอียดผู้ใช้</Link>
      </Panel>
    </section>
  );
}
