"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  initialPublicPatientAccessRequestActionState,
} from "@/modules/patient-access-requests/transport/action-state";
import { submitPublicPatientAccessRequestAction } from "@/modules/patient-access-requests/transport/server-actions";
import type { PublicActiveHospital } from "@/modules/patient-access-requests/services/patient-access-request-service";

export function PatientAccessRequestForm({
  hospitals,
}: {
  hospitals: readonly PublicActiveHospital[];
}): React.JSX.Element {
  const [state, action, pending] = useActionState(
    submitPublicPatientAccessRequestAction,
    initialPublicPatientAccessRequestActionState,
  );
  return (
    <div className="mx-auto w-full max-w-xl">
      <Panel>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">
          ส่งคำขอให้โรงพยาบาลตรวจสอบ
        </h2>
        <p className="mt-2 text-sm leading-6 text-text-muted">
          การส่งคำขอไม่ได้สร้างบัญชีทันที โรงพยาบาลจะตรวจสอบตัวตนและข้อมูลผู้ป่วยก่อนดำเนินการ
        </p>

        {state.status === "SUCCESS" ? (
          <Alert className="mt-5" variant="success">
            ระบบได้รับคำขอแล้ว โรงพยาบาลจะตรวจสอบข้อมูลก่อนดำเนินการเปิดใช้งาน
          </Alert>
        ) : null}

        {state.status === "ERROR" ? (
          <Alert className="mt-5" variant="danger">{state.message}</Alert>
        ) : null}

        {state.status === "SUCCESS" ? null : hospitals.length > 0 ? (
          <form action={action} className="mt-6 space-y-5">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-text" htmlFor="patient-access-national-id">
                เลขบัตรประชาชน
              </label>
              <Input
                autoComplete="off"
                autoCorrect="off"
                disabled={pending}
                id="patient-access-national-id"
                inputMode="numeric"
                maxLength={13}
                name="nationalId"
                pattern="[0-9]{13}"
                required
                spellCheck={false}
                type="text"
                defaultValue=""
              />
              <p className="text-sm leading-6 text-text-muted">
                ใช้เป็นข้อมูลอ้างอิงให้โรงพยาบาลตรวจสอบเท่านั้น การทราบเลขบัตรไม่ใช่หลักฐานยืนยันตัวตน
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-text" htmlFor="patient-access-hospital">
                โรงพยาบาลที่ต้องการติดต่อ
              </label>
              <Select disabled={pending} defaultValue="" id="patient-access-hospital" name="hospitalId" required>
                <option disabled value="">เลือกโรงพยาบาล</option>
                {hospitals.map((hospital) => (
                  <option key={hospital.id} value={hospital.id}>
                    {hospital.name} ({hospital.hospitalCode})
                  </option>
                ))}
              </Select>
            </div>

            <Button disabled={pending} loading={pending} type="submit">
              {pending ? "กำลังส่งคำขอ..." : "ส่งคำขอให้โรงพยาบาลตรวจสอบ"}
            </Button>
          </form>
        ) : (
          <Alert className="mt-5" variant="warning">
            ขณะนี้ยังไม่มีโรงพยาบาลที่เปิดรับคำขอผ่านระบบ กรุณาติดต่อโรงพยาบาลโดยตรง
          </Alert>
        )}
      </Panel>

      <p className="mt-5 text-center text-sm leading-6 text-text-muted">
        มีบัญชีที่เปิดใช้งานแล้ว?{" "}
        <Link className="font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4" href="/login">
          เข้าสู่ระบบ
        </Link>
        <span className="mx-2" aria-hidden="true">·</span>
        ลืมรหัสผ่าน? ใช้ช่องทางช่วยเหลือจากโรงพยาบาล
      </p>
    </div>
  );
}
