"use client";

import { useActionState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  initialPatientAccessRequestReviewActionState,
} from "@/modules/patient-access-requests/transport/action-state";
import { reviewPatientAccessRequestAction } from "@/modules/patient-access-requests/transport/server-actions";
import {
  initialPatientAccessRequestWithdrawalActionState,
} from "@/modules/patient-access-requests/transport/action-state";
import { withdrawPatientAccessRequestByHospitalAction } from "@/modules/patient-access-requests/transport/server-actions";

export function PatientAccessRequestReviewControls({
  requestId,
}: {
  requestId: string;
}): React.JSX.Element {
  const [state, action, pending] = useActionState(
    reviewPatientAccessRequestAction,
    initialPatientAccessRequestReviewActionState,
  );
  if (state.status === "SUCCESS") {
    const message =
      state.requestStatus === "COMPLETED"
        ? "ยืนยันตัวตนแล้ว และพบว่าผู้ป่วยมีบัญชีที่เปิดใช้งานอยู่ ระบบไม่ได้ออก activation"
        : state.requestStatus === "REJECTED"
          ? "บันทึกผลไม่อนุมัติคำขอแล้ว"
          : "ยืนยันตัวตนและอนุมัติคำขอแล้ว ตรวจสอบขั้นตอนถัดไปด้านล่าง";

    return <Alert className="mt-4" variant="success">{message}</Alert>;
  }

  return (
    <div className="mt-5 space-y-5">
      <form action={action} className="space-y-4">
        <input name="requestId" type="hidden" value={requestId} />
        <input name="decision" type="hidden" value="APPROVE" />
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-text" htmlFor="verified-national-id">
            เลขบัตรประชาชนที่ตรวจยืนยันโดยตรง
          </label>
          <Input
            autoComplete="off"
            disabled={pending}
            id="verified-national-id"
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
            ระบบจะเปรียบเทียบกับคำขอที่บันทึกไว้ ค่าเลขบัตรที่กรอกจะใช้ชั่วคราวและไม่ถูกบันทึกในคำขอหรือ audit
          </p>
        </div>

        <label className="flex min-h-11 items-start gap-3 text-sm leading-6 text-text">
          <input
            className="mt-1 h-4 w-4 shrink-0 accent-action-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
            disabled={pending}
            name="identityVerified"
            required
            type="checkbox"
            value="true"
          />
          <span>ข้าพเจ้าได้ตรวจยืนยันตัวตนกับผู้ยื่นคำขอโดยตรงแล้ว</span>
        </label>

        <Button disabled={pending} loading={pending} type="submit">
          {pending ? "กำลังตรวจสอบและอนุมัติ..." : "ยืนยันตัวตนและอนุมัติคำขอ"}
        </Button>
      </form>

      <div className="border-t border-border pt-5">
        <p className="text-sm leading-6 text-text-muted">
          หากยืนยันตัวตนหรือความเหมาะสมไม่ได้ สามารถปฏิเสธคำขอได้โดยไม่ต้องกรอกเลขบัตร
        </p>
        <form action={action} className="mt-3">
          <input name="requestId" type="hidden" value={requestId} />
          <input name="decision" type="hidden" value="REJECT" />
          <Button disabled={pending} variant="danger" type="submit">
            ไม่อนุมัติคำขอ
          </Button>
        </form>
      </div>

      {state.status === "ERROR" ? (
        <Alert variant="danger">{state.message}</Alert>
      ) : null}
    </div>
  );
}

export function HospitalPatientAccessRequestWithdrawalControl({
  requestId,
  allowed,
}: {
  requestId: string;
  allowed: boolean;
}): React.JSX.Element {
  const [state, action, pending] = useActionState(
    withdrawPatientAccessRequestByHospitalAction,
    initialPatientAccessRequestWithdrawalActionState,
  );

  if (!allowed) {
    return <></>;
  }

  return (
    <div className="mt-5 border-t border-border pt-5">
      <p className="text-sm leading-6 text-text-muted">
        หากผู้ยื่นคำขอติดต่อโรงพยาบาลเพื่อยกเลิก สามารถบันทึกการถอนคำขอได้ก่อนออก activation
      </p>
      <form action={action} className="mt-3">
        <input name="requestId" type="hidden" value={requestId} />
        <Button disabled={pending} loading={pending} size="compact" variant="secondary" type="submit">
          {pending ? "กำลังบันทึก..." : "บันทึกว่าผู้ป่วยขอถอนคำขอ"}
        </Button>
      </form>
      {state.status === "SUCCESS" ? (
        <p className="mt-2 text-sm text-success" role="status">ถอนคำขอแล้ว</p>
      ) : null}
      {state.status === "ERROR" ? (
        <Alert className="mt-3" variant="danger">{state.message}</Alert>
      ) : null}
    </div>
  );
}
