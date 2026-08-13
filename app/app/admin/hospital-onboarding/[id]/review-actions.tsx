"use client";

import { useActionState } from "react";

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

export function ReviewActions({ applicationId }: ReviewActionsProps) {
  const approveAction = approveHospitalOnboardingAction.bind(null, applicationId);
  const rejectAction = rejectHospitalOnboardingAction.bind(null, applicationId);
  const [approveState, approveFormAction, approving] = useActionState<
    HospitalOnboardingReviewActionState,
    FormData
  >(approveAction, initialHospitalOnboardingReviewActionState);
  const [rejectState, rejectFormAction, rejecting] = useActionState<
    HospitalOnboardingReviewActionState,
    FormData
  >(rejectAction, initialHospitalOnboardingReviewActionState);
  const errorMessage = approveState.status === "ERROR" ? approveState.message : rejectState.status === "ERROR" ? rejectState.message : undefined;
  const pending = approving || rejecting;

  return (
    <section className="mt-8 rounded-[16px] border border-line bg-white p-5 sm:p-8" aria-labelledby="decision-heading">
      <h2 className="text-xl font-semibold tracking-[-0.02em]" id="decision-heading">
        ตัดสินใจคำขอ
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        การอนุมัติจะเปิดใช้งานโรงพยาบาล บัญชีผู้สมัคร และสิทธิ์ HOSPITAL + OWNER พร้อมกัน
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <form action={approveFormAction} className="sm:flex-1">
          <button
            className="flex h-12 w-full items-center justify-center rounded-[12px] bg-brand px-5 text-base font-semibold text-white shadow-[0_8px_22px_rgba(18,103,89,0.22)] transition-[background-color,box-shadow,transform] hover:bg-brand-strong hover:shadow-[0_10px_26px_rgba(18,103,89,0.28)] active:translate-y-px disabled:cursor-not-allowed disabled:bg-brand-muted disabled:shadow-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft focus-visible:ring-offset-2"
            disabled={pending}
            type="submit"
          >
            {approving ? "กำลังอนุมัติ..." : "อนุมัติคำขอ"}
          </button>
        </form>

        <form action={rejectFormAction} className="space-y-3 sm:flex-1">
          <label className="sr-only" htmlFor="rejectionReason">
            เหตุผลที่ปฏิเสธ (ถ้ามี)
          </label>
          <textarea
            className="min-h-12 w-full resize-y rounded-[12px] border border-line bg-white px-4 py-3 text-base text-ink outline-none transition-[border-color,box-shadow] placeholder:text-muted focus:border-brand focus:ring-4 focus:ring-brand-soft"
            disabled={pending}
            id="rejectionReason"
            maxLength={500}
            name="rejectionReason"
            placeholder="เหตุผลที่ปฏิเสธ (ถ้ามี)"
            rows={2}
          />
          <button
            className="flex h-12 w-full items-center justify-center rounded-[12px] border border-line bg-white px-5 text-base font-semibold text-ink transition-[border-color,background-color,color] hover:border-danger hover:bg-red-50 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft focus-visible:ring-offset-2"
            disabled={pending}
            type="submit"
          >
            {rejecting ? "กำลังบันทึก..." : "ปฏิเสธคำขอ"}
          </button>
        </form>
      </div>

      <div aria-live="polite" className="min-h-6">
        {errorMessage ? (
          <p className="mt-5 text-sm leading-6 text-danger" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </section>
  );
}
