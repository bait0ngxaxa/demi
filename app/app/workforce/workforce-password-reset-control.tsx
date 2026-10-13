"use client";

import { useActionState, useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import {
  initialWorkforcePasswordResetActionState,
  type WorkforcePasswordResetActionState,
} from "@/modules/workforce/transport/action-state";
import { issueWorkforcePasswordResetAction } from "@/modules/workforce/transport/server-actions";

type WorkforcePasswordResetControlProps = {
  userId: string;
  targetHospitalId: string;
  subjectLabel: string;
};

export function WorkforcePasswordResetControl({
  userId,
  targetHospitalId,
  subjectLabel,
}: WorkforcePasswordResetControlProps): React.JSX.Element {
  const [confirmed, setConfirmed] = useState(false);
  const [state, formAction, pending] = useActionState<WorkforcePasswordResetActionState, FormData>(
    issueWorkforcePasswordResetAction,
    initialWorkforcePasswordResetActionState,
  );

  // Assisted handoff: the issuer session is already closed, so the user continues on this device.
  useEffect(() => {
    if (state.status !== "SUCCESS") {
      return;
    }

    window.location.replace(
      `${window.location.origin}/activate/workforce#${encodeURIComponent(state.result.activationToken)}`,
    );
  }, [state]);

  return (
    <Panel>
      <h2 className="text-xl font-semibold tracking-[-0.02em]">รีเซ็ตรหัสผ่าน (ต่อหน้า)</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        ใช้เมื่อ {subjectLabel} ลืมรหัสผ่าน ต้องทำต่อหน้าเท่านั้น เมื่อกดยืนยัน ระบบจะออกจากระบบของคุณ
        แล้วส่งอุปกรณ์ให้เจ้าของบัญชีกรอกเลขบัตรประชาชนและตั้งรหัสผ่านใหม่ด้วยตนเอง ลิงก์ใช้ได้ 15 นาที
        และเซสชันเดิมของเจ้าของบัญชีจะถูกยกเลิกทั้งหมดเมื่อเสร็จสิ้น ห้ามกรอกรหัสผ่านแทนผู้ใช้
      </p>
      <form action={formAction} className="mt-5 space-y-4">
        <input name="userId" type="hidden" value={userId} />
        <input name="targetHospitalId" type="hidden" value={targetHospitalId} />
        <label className="flex items-start gap-3 text-sm leading-6">
          <input
            checked={confirmed}
            className="mt-1 h-5 w-5 shrink-0"
            disabled={pending}
            onChange={(event) => setConfirmed(event.target.checked)}
            type="checkbox"
          />
          <span>ฉันยืนยันตัวตนของเจ้าของบัญชีต่อหน้าแล้ว และพร้อมส่งอุปกรณ์ให้เจ้าของบัญชีตั้งรหัสผ่านเอง</span>
        </label>
        {state.status === "ERROR" ? (
          <Alert role="alert" variant="danger">
            {state.message}
          </Alert>
        ) : null}
        <Button disabled={!confirmed || pending} loading={pending} type="submit">
          {pending ? "กำลังเตรียมการรีเซ็ต..." : "เริ่มรีเซ็ตรหัสผ่านต่อหน้า"}
        </Button>
      </form>
    </Panel>
  );
}
