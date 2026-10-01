"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import type { PublicActiveHospital } from "@/modules/patient-access-requests/services/patient-access-request-service";
import { initialPatientAccessRequestLookupActionState } from "@/modules/patient-access-requests/transport/action-state";
import { locateHospitalPatientAccessRequestAction } from "@/modules/patient-access-requests/transport/server-actions";

export function PatientAccessRequestLookup({ hospitals }: {
  hospitals: readonly PublicActiveHospital[];
}): React.JSX.Element {
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (previous: typeof initialPatientAccessRequestLookupActionState, data: FormData) => {
    // Keep the transient reference only in the POST payload, never in action state.
    const input = form.current?.elements.namedItem("nationalId");
    if (input instanceof HTMLInputElement) input.value = "";
    return locateHospitalPatientAccessRequestAction(previous, data);
  }, initialPatientAccessRequestLookupActionState);

  return (
    <Panel className="mt-6" aria-labelledby="access-request-lookup-title">
      <h2 className="text-xl font-semibold text-text" id="access-request-lookup-title">ค้นหาคำขอด้วยเลขบัตรประชาชน</h2>
      <p className="mt-2 max-w-prose text-sm leading-6 text-text-muted" id="access-request-lookup-help">
        ใช้เพื่อค้นหาคำขอในโรงพยาบาลนี้เท่านั้น การพบคำขอไม่ถือเป็นการยืนยันตัวตน ผู้ตรวจสอบยังต้องตรวจยืนยันตัวตนโดยตรงก่อนอนุมัติ
      </p>
      <form ref={form} action={action} className="mt-5 space-y-4" aria-describedby="access-request-lookup-help">
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-text" htmlFor="lookup-hospital">โรงพยาบาลที่ค้นหา</label>
          <Select id="lookup-hospital" name="hospitalId" required disabled={pending} defaultValue={hospitals.length === 1 ? hospitals[0].id : ""}>
            <option value="" disabled>เลือกโรงพยาบาล</option>
            {hospitals.map((hospital) => <option key={hospital.id} value={hospital.id}>{hospital.name} ({hospital.hospitalCode})</option>)}
          </Select>
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-text" htmlFor="lookup-national-id">เลขบัตรประชาชน</label>
          <Input id="lookup-national-id" name="nationalId" type="text" inputMode="numeric" maxLength={13} pattern="[0-9]{13}" autoComplete="off" autoCorrect="off" spellCheck={false} aria-describedby="access-request-lookup-help" required disabled={pending} />
        </div>
        <Button type="submit" loading={pending} disabled={pending || hospitals.length === 0}>{pending ? "กำลังค้นหาคำขอ..." : "ค้นหาคำขอ"}</Button>
      </form>
      <div aria-live="polite">
        {state.status === "ERROR" ? <Alert className="mt-4" variant="danger">{state.message}</Alert> : null}
        {state.status === "SUCCESS" ? <Alert className="mt-4" variant="info">
          พบคำขอที่กำลังดำเนินการ กรุณาเปิดรายละเอียดเพื่อตรวจสอบตัวตนและดำเนินการต่อ
          <Link className="mt-2 flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href={`/app/patients/access-requests/${encodeURIComponent(state.requestId)}`}>เปิดคำขอที่พบ</Link>
        </Alert> : null}
      </div>
    </Panel>
  );
}
