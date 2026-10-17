"use client";

import { useRouter } from "next/navigation";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/notify";
import { Panel } from "@/components/ui/panel";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import {
  HOSPITAL_ONBOARDING_REVIEW_RESPONSE_MODE_CLIENT,
  HOSPITAL_ONBOARDING_REVIEW_RESPONSE_MODE_FIELD,
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

type ReviewDecision = "APPROVED" | "REJECTED";
type ReviewAction = (
  previousState: HospitalOnboardingReviewActionState,
  formData: FormData,
) => Promise<HospitalOnboardingReviewActionState>;
type ReviewSubmission = {
  id: number;
  applicationId: string;
  decision: ReviewDecision;
  status: "PENDING" | "SUCCESS" | "ERROR" | "UNKNOWN";
  result?: HospitalOnboardingReviewActionState;
};

const unknownReviewOutcomeMessage =
  "ระบบยังยืนยันผลการตรวจสอบคำขอไม่ได้ กรุณาโหลดสถานะล่าสุดก่อนดำเนินการต่อ";
const conflictToastMessage = "คำขอนี้ถูกดำเนินการแล้ว โปรดตรวจสอบสถานะล่าสุด";
const notFoundToastMessage = "ไม่พบคำขอที่ต้องการตรวจสอบ";

function isUnavailable(
  state: HospitalOnboardingReviewActionState,
): boolean {
  return state.status === "ERROR" && state.code === "UNAVAILABLE";
}

function getNativeFeedbackState(
  approveState: HospitalOnboardingReviewActionState,
  rejectState: HospitalOnboardingReviewActionState,
): HospitalOnboardingReviewActionState {
  return approveState.status !== "IDLE" ? approveState : rejectState;
}

function ReviewActionsForApplication({
  applicationId,
}: ReviewActionsProps): React.JSX.Element {
  const router = useRouter();
  const [submission, setSubmission] = useState<ReviewSubmission | null>(null);
  const submissionRef = useRef<ReviewSubmission | null>(null);
  const submissionSequenceRef = useRef(0);
  const inFlightRef = useRef(false);
  const handledSubmissionRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const approveAction = approveHospitalOnboardingAction.bind(null, applicationId);
  const rejectAction = rejectHospitalOnboardingAction.bind(null, applicationId);

  // These raw Server Action references stay on the forms so submissions before hydration
  // retain useActionState progressive enhancement and the Server Action redirect fallback.
  const [nativeApproveState, nativeApproveFormAction, nativeApproving] = useActionState<
    HospitalOnboardingReviewActionState,
    FormData
  >(approveAction, initialHospitalOnboardingReviewActionState);
  const [nativeRejectState, nativeRejectFormAction, nativeRejecting] = useActionState<
    HospitalOnboardingReviewActionState,
    FormData
  >(rejectAction, initialHospitalOnboardingReviewActionState);

  function isCurrentSubmission(candidate: ReviewSubmission): boolean {
    return (
      mountedRef.current &&
      candidate.applicationId === applicationId &&
      submissionRef.current?.id === candidate.id &&
      submissionRef.current.applicationId === candidate.applicationId
    );
  }

  function updateSubmission(
    candidate: ReviewSubmission,
    next: ReviewSubmission,
  ): boolean {
    if (!isCurrentSubmission(candidate)) {
      return false;
    }

    submissionRef.current = next;
    setSubmission(next);
    return true;
  }

  function notifyConfirmedResult(
    decision: ReviewDecision,
    state: HospitalOnboardingReviewActionState,
  ): void {
    if (state.status === "SUCCESS") {
      notify.success(
        decision === "APPROVED"
          ? "อนุมัติคำขอโรงพยาบาลแล้ว"
          : "ปฏิเสธคำขอโรงพยาบาลแล้ว",
      );
      return;
    }

    if (state.status !== "ERROR") {
      return;
    }

    if (state.code === "CONFLICT") {
      notify.warning(conflictToastMessage);
    } else if (state.code === "FORBIDDEN") {
      notify.error(
        decision === "APPROVED"
          ? "ไม่มีสิทธิ์อนุมัติคำขอโรงพยาบาล"
          : "ไม่มีสิทธิ์ปฏิเสธคำขอโรงพยาบาล",
      );
    } else if (state.code === "NOT_FOUND") {
      notify.warning(notFoundToastMessage);
    }
  }

  function handleActionResult(
    candidate: ReviewSubmission,
    state: HospitalOnboardingReviewActionState,
  ): void {
    if (
      !isCurrentSubmission(candidate) ||
      handledSubmissionRef.current === candidate.id
    ) {
      return;
    }
    handledSubmissionRef.current = candidate.id;

    if (
      state.status === "SUCCESS" &&
      state.decision === candidate.decision
    ) {
      if (!updateSubmission(candidate, { ...candidate, status: "SUCCESS", result: state })) {
        return;
      }

      notifyConfirmedResult(candidate.decision, state);
      router.refresh();
      return;
    }

    if (state.status === "ERROR" && state.code !== "UNAVAILABLE") {
      if (!updateSubmission(candidate, { ...candidate, status: "ERROR", result: state })) {
        return;
      }

      inFlightRef.current = false;
      notifyConfirmedResult(candidate.decision, state);
      return;
    }

    updateSubmission(candidate, { ...candidate, status: "UNKNOWN" });
  }

  async function runClientMutation(
    decision: ReviewDecision,
    action: ReviewAction,
    previousState: HospitalOnboardingReviewActionState,
    formData: FormData,
  ): Promise<HospitalOnboardingReviewActionState> {
    const candidate = submissionRef.current;
    if (
      !candidate ||
      candidate.applicationId !== applicationId ||
      candidate.decision !== decision ||
      candidate.status !== "PENDING"
    ) {
      return previousState;
    }

    const result = await action(previousState, formData);
    handleActionResult(candidate, result);
    return result;
  }

  const [, approveClientDispatch, approveClientPending, approveUnknown] =
    useMutationActionState<HospitalOnboardingReviewActionState, FormData>(
      (previousState, formData) =>
        runClientMutation("APPROVED", approveAction, previousState, formData),
      initialHospitalOnboardingReviewActionState,
    );
  const [, rejectClientDispatch, rejectClientPending, rejectUnknown] =
    useMutationActionState<HospitalOnboardingReviewActionState, FormData>(
      (previousState, formData) =>
        runClientMutation("REJECTED", rejectAction, previousState, formData),
      initialHospitalOnboardingReviewActionState,
    );

  function dispatchClientSubmission(
    decision: ReviewDecision,
    dispatch: (formData: FormData) => void,
    formData: FormData,
  ): void {
    const activeSubmission = submissionRef.current;
    if (
      inFlightRef.current ||
      nativeApproving ||
      nativeRejecting ||
      approveClientPending ||
      rejectClientPending ||
      (activeSubmission &&
        activeSubmission.applicationId === applicationId &&
        (activeSubmission.status === "PENDING" ||
          activeSubmission.status === "UNKNOWN" ||
          activeSubmission.status === "SUCCESS")) ||
      isUnavailable(nativeApproveState) ||
      isUnavailable(nativeRejectState)
    ) {
      return;
    }

    const nextSubmission: ReviewSubmission = {
      id: submissionSequenceRef.current + 1,
      applicationId,
      decision,
      status: "PENDING",
    };
    submissionSequenceRef.current = nextSubmission.id;
    submissionRef.current = nextSubmission;
    inFlightRef.current = true;
    setSubmission(nextSubmission);
    formData.set(
      HOSPITAL_ONBOARDING_REVIEW_RESPONSE_MODE_FIELD,
      HOSPITAL_ONBOARDING_REVIEW_RESPONSE_MODE_CLIENT,
    );
    dispatch(formData);
  }

  function handleClientSubmit(
    event: FormEvent<HTMLFormElement>,
    decision: ReviewDecision,
    dispatch: (formData: FormData) => void,
  ): void {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(
      event.currentTarget,
      (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) &&
        submitter.form === event.currentTarget
        ? submitter
        : undefined,
    );
    startTransition(() => dispatchClientSubmission(decision, dispatch, formData));
  }

  const clientSubmission =
    submission?.applicationId === applicationId ? submission : null;
  const currentActionUnknown =
    clientSubmission?.status === "PENDING" &&
    (clientSubmission.decision === "APPROVED" ? approveUnknown : rejectUnknown);
  const nativeUnavailable =
    isUnavailable(nativeApproveState) || isUnavailable(nativeRejectState);
  const nativeSuccess =
    nativeApproveState.status === "SUCCESS" ||
    nativeRejectState.status === "SUCCESS";
  const unknownOutcome =
    nativeUnavailable ||
    clientSubmission?.status === "UNKNOWN" ||
    currentActionUnknown;
  const pending =
    nativeApproving ||
    nativeRejecting ||
    approveClientPending ||
    rejectClientPending ||
    (clientSubmission?.status === "PENDING" && !currentActionUnknown);
  const locked =
    pending ||
    unknownOutcome ||
    nativeSuccess ||
    clientSubmission?.status === "SUCCESS";
  const approvingCurrent =
    !unknownOutcome &&
    ((pending && clientSubmission?.decision === "APPROVED") ||
      nativeApproving ||
      approveClientPending);
  const rejectingCurrent =
    !unknownOutcome &&
    ((pending && clientSubmission?.decision === "REJECTED") ||
      nativeRejecting ||
      rejectClientPending);

  const latestFeedbackState = clientSubmission
    ? clientSubmission.status === "ERROR"
      ? clientSubmission.result
      : undefined
    : getNativeFeedbackState(nativeApproveState, nativeRejectState);
  const inlineError =
    !unknownOutcome &&
    latestFeedbackState?.status === "ERROR" &&
    latestFeedbackState.code !== "UNAVAILABLE"
      ? latestFeedbackState.message
      : undefined;

  return (
    <Panel className="mt-8 sm:p-8" aria-labelledby="decision-heading">
      <h2 className="text-xl font-semibold tracking-[-0.02em]" id="decision-heading">
        ตัดสินใจคำขอ
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        การอนุมัติจะเปิดใช้งานโรงพยาบาล บัญชีผู้สมัคร และสิทธิ์เจ้าของโรงพยาบาลพร้อมกัน
      </p>

      <UnknownOutcomeAlert
        active={Boolean(unknownOutcome)}
        className="mt-5"
        recovery={{ kind: "reload", message: unknownReviewOutcomeMessage }}
      />

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <form
          action={nativeApproveFormAction}
          className="sm:flex-1"
          onSubmit={(event) =>
            handleClientSubmit(event, "APPROVED", approveClientDispatch)
          }
        >
          <Button
            className="w-full"
            disabled={locked}
            loading={approvingCurrent}
            type="submit"
          >
            {approvingCurrent
              ? "กำลังอนุมัติ..."
              : "อนุมัติคำขอ"}
          </Button>
        </form>

        <form
          action={nativeRejectFormAction}
          className="space-y-3 sm:flex-1"
          onSubmit={(event) =>
            handleClientSubmit(event, "REJECTED", rejectClientDispatch)
          }
        >
          <label className="sr-only" htmlFor="rejectionReason">
            เหตุผลที่ปฏิเสธ (ถ้ามี)
          </label>
          <textarea
            className="min-h-12 w-full resize-y rounded-control border border-border bg-surface px-4 py-3 text-base text-text outline-none transition-[border-color,box-shadow] placeholder:text-text-subtle focus:border-action-primary focus:ring-4 focus:ring-focus-ring disabled:cursor-not-allowed disabled:bg-surface-muted"
            disabled={locked}
            id="rejectionReason"
            maxLength={500}
            name="rejectionReason"
            placeholder="เหตุผลที่ปฏิเสธ (ถ้ามี)"
            rows={2}
          />
          <Button
            className="w-full"
            disabled={locked}
            loading={rejectingCurrent}
            type="submit"
            variant="danger"
          >
            {rejectingCurrent
              ? "กำลังบันทึก..."
              : "ปฏิเสธคำขอ"}
          </Button>
        </form>
      </div>

      <div className="min-h-6">
        {inlineError ? (
          <Alert className="mt-5" variant="danger">
            {inlineError}
          </Alert>
        ) : null}
      </div>
    </Panel>
  );
}

export function ReviewActions({ applicationId }: ReviewActionsProps): React.JSX.Element {
  return <ReviewActionsForApplication key={applicationId} applicationId={applicationId} />;
}
