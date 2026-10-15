"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import {
  initialHospitalOnboardingReviewActionState,
  type HospitalOnboardingReviewActionState,
} from "@/modules/hospital-onboarding/transport/action-state";
import {
  approveHospitalOnboardingAction,
  rejectHospitalOnboardingAction,
} from "@/modules/hospital-onboarding/transport/server-actions";

type ReviewActionsProps = {
  applicationId: string;
};

export function ReviewActions({ applicationId }: ReviewActionsProps): React.JSX.Element {
  const approveAction = approveHospitalOnboardingAction.bind(null, applicationId);
  const rejectAction = rejectHospitalOnboardingAction.bind(null, applicationId);
  const [approveState, approveFormAction, approving, approvingUnknown] = useMutationActionState<
    HospitalOnboardingReviewActionState,
    FormData
  >(approveAction, initialHospitalOnboardingReviewActionState);
  const [rejectState, rejectFormAction, rejecting, rejectingUnknown] = useMutationActionState<
    HospitalOnboardingReviewActionState,
    FormData
  >(rejectAction, initialHospitalOnboardingReviewActionState);
  const errorMessage = approveState.status === "ERROR" ? approveState.message : rejectState.status === "ERROR" ? rejectState.message : undefined;
  const pending = approving || rejecting;
  const unknownOutcome = approvingUnknown || rejectingUnknown;

  return (
    <Panel className="mt-8 sm:p-8" aria-labelledby="decision-heading">
      <h2 className="text-xl font-semibold tracking-[-0.02em]" id="decision-heading">
        ตัดสินใจคำขอ
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        การอนุมัติจะเปิดใช้งานโรงพยาบาล บัญชีผู้สมัคร และสิทธิ์เจ้าของโรงพยาบาลพร้อมกัน
      </p>

      <UnknownOutcomeAlert active={unknownOutcome} className="mt-5" recovery={{ kind: "reload" }} />

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <form action={approveFormAction} className="sm:flex-1">
          <Button
            className="w-full"
            disabled={pending || unknownOutcome}
            loading={approving}
            type="submit"
          >
            {approving ? "กำลังอนุมัติ..." : "อนุมัติคำขอ"}
          </Button>
        </form>

        <form action={rejectFormAction} className="space-y-3 sm:flex-1">
          <label className="sr-only" htmlFor="rejectionReason">
            เหตุผลที่ปฏิเสธ (ถ้ามี)
          </label>
          <textarea
            className="min-h-12 w-full resize-y rounded-control border border-border bg-surface px-4 py-3 text-base text-text outline-none transition-[border-color,box-shadow] placeholder:text-text-subtle focus:border-action-primary focus:ring-4 focus:ring-focus-ring disabled:cursor-not-allowed disabled:bg-surface-muted"
            disabled={pending || unknownOutcome}
            id="rejectionReason"
            maxLength={500}
            name="rejectionReason"
            placeholder="เหตุผลที่ปฏิเสธ (ถ้ามี)"
            rows={2}
          />
          <Button
            className="w-full"
            disabled={pending || unknownOutcome}
            loading={rejecting}
            type="submit"
            variant="danger"
          >
            {rejecting ? "กำลังบันทึก..." : "ปฏิเสธคำขอ"}
          </Button>
        </form>
      </div>

      <div aria-live="polite" className="min-h-6">
        {errorMessage ? (
          <Alert className="mt-5" variant="danger">
            {errorMessage}
          </Alert>
        ) : null}
      </div>
    </Panel>
  );
}
