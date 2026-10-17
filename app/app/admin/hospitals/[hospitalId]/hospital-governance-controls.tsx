"use client";

import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmableActionForm } from "@/components/ui/confirmable-action-form";
import { notify } from "@/components/ui/notify";
import { Panel } from "@/components/ui/panel";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import {
  initialHospitalGovernanceMutationActionState,
  type HospitalGovernanceMutationActionState,
} from "@/modules/hospital-governance/transport/action-state";
import {
  restoreHospitalAction,
  suspendHospitalAction,
} from "@/modules/hospital-governance/transport/server-actions";

const useCommittedLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type GovernanceMutationKind = "suspend" | "restore";
type HospitalGovernanceAction = typeof suspendHospitalAction | typeof restoreHospitalAction;

type MutationContext = {
  hospitalId: string;
  expectedUpdatedAt: string;
  status: "ACTIVE" | "SUSPENDED";
};

type PendingRefreshContext = {
  hospitalId: string;
  expectedUpdatedAt: string;
  sourceStatus: "ACTIVE" | "SUSPENDED";
};

type GovernanceSubmission = {
  id: number;
  kind: GovernanceMutationKind;
  context: Pick<MutationContext, "hospitalId" | "expectedUpdatedAt">;
  result: HospitalGovernanceMutationActionState | null;
};

function getFormString(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function getExpectedStatus(kind: GovernanceMutationKind): MutationContext["status"] {
  return kind === "suspend" ? "ACTIVE" : "SUSPENDED";
}

function getNextStatus(kind: GovernanceMutationKind): MutationContext["status"] {
  return kind === "suspend" ? "SUSPENDED" : "ACTIVE";
}

function matchesSubmittedContext(
  current: MutationContext,
  submitted: Pick<MutationContext, "hospitalId" | "expectedUpdatedAt">,
  kind: GovernanceMutationKind,
): boolean {
  return current.hospitalId === submitted.hospitalId &&
    current.expectedUpdatedAt === submitted.expectedUpdatedAt &&
    current.status === getExpectedStatus(kind);
}

function contextReflectsResult(
  current: MutationContext,
  result: Extract<HospitalGovernanceMutationActionState, { status: "SUCCESS" }>["result"],
): boolean {
  return current.hospitalId === result.hospitalId &&
    current.expectedUpdatedAt === result.updatedAt &&
    current.status === result.status;
}

function isUnconfirmedSubmission(
  submission: GovernanceSubmission,
  suspendUnknown: boolean,
  suspendPending: boolean,
  restoreUnknown: boolean,
  restorePending: boolean,
): boolean {
  if (submission.result === null) {
    return submission.kind === "suspend"
      ? suspendUnknown && !suspendPending
      : restoreUnknown && !restorePending;
  }

  return submission.result.status === "IDLE" ||
    (submission.result.status === "ERROR" && submission.result.code === "UNAVAILABLE");
}

type HospitalGovernanceControlsProps = {
  expectedUpdatedAt: string;
  hospitalId: string;
  status: "ACTIVE" | "SUSPENDED";
};

function Feedback({
  submission,
  currentContext,
}: {
  submission: GovernanceSubmission | null;
  currentContext: MutationContext;
}): React.JSX.Element | null {
  if (
    !submission?.result ||
    !matchesSubmittedContext(currentContext, submission.context, submission.kind)
  ) {
    return null;
  }

  const result = submission.result;

  const errorState = result.status === "ERROR" && result.code !== "UNAVAILABLE" ? result : null;
  if (errorState && errorState.status === "ERROR") {
    return (
      <Alert className="mt-4" role="alert" variant={errorState.code === "CONFLICT" ? "warning" : "danger"}>
        {errorState.message}
      </Alert>
    );
  }

  return result.status === "SUCCESS" &&
    result.result.hospitalId === submission.context.hospitalId &&
    result.result.status === getNextStatus(submission.kind) ? (
    <Alert className="mt-4" variant="success">
      บันทึกสถานะโรงพยาบาลเรียบร้อยแล้ว
    </Alert>
  ) : null;
}

export function HospitalGovernanceControls({
  expectedUpdatedAt,
  hospitalId,
  status,
}: HospitalGovernanceControlsProps): React.JSX.Element {
  const router = useRouter();
  const mountedRef = useRef(false);
  const inFlightRef = useRef(false);
  const submissionSequenceRef = useRef(0);
  const lastRefreshedSubmissionRef = useRef<number | null>(null);
  const currentContextRef = useRef<MutationContext>({ hospitalId, expectedUpdatedAt, status });
  const latestSubmissionRef = useRef<GovernanceSubmission | null>(null);
  const [latestSubmission, setLatestSubmission] = useState<GovernanceSubmission | null>(null);
  const [awaitingRefresh, setAwaitingRefresh] = useState<PendingRefreshContext | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const runMutation = useCallback(
    async (
      action: HospitalGovernanceAction,
      kind: GovernanceMutationKind,
      previousState: HospitalGovernanceMutationActionState,
      formData: FormData,
    ): Promise<HospitalGovernanceMutationActionState> => {
      const submittedContext = {
        hospitalId: getFormString(formData, "hospitalId"),
        expectedUpdatedAt: getFormString(formData, "expectedUpdatedAt"),
      };
      const submission: GovernanceSubmission = {
        id: submissionSequenceRef.current + 1,
        kind,
        context: submittedContext,
        result: null,
      };
      submissionSequenceRef.current = submission.id;
      latestSubmissionRef.current = submission;
      setLatestSubmission(submission);
      inFlightRef.current = true;

      const result = await action(previousState, formData);

      if (!mountedRef.current || latestSubmissionRef.current?.id !== submission.id) {
        return result;
      }

      const completedSubmission = { ...submission, result };
      latestSubmissionRef.current = completedSubmission;
      setLatestSubmission(completedSubmission);

      if (result.status === "IDLE") {
        return result;
      }

      if (result.status === "ERROR") {
        if (result.code === "UNAVAILABLE") {
          return result;
        }

        inFlightRef.current = false;

        if (!matchesSubmittedContext(currentContextRef.current, submittedContext, kind)) {
          return result;
        }

        if (result.code === "CONFLICT") {
          notify.warning("สถานะโรงพยาบาลเปลี่ยนแปลงแล้ว โปรดโหลดข้อมูลล่าสุด");
        } else if (result.code === "FORBIDDEN") {
          notify.error("ไม่มีสิทธิ์จัดการสถานะโรงพยาบาล");
        }

        return result;
      }

      const currentContext = currentContextRef.current;
      const expectedStatus = getExpectedStatus(kind);
      const nextStatus = getNextStatus(kind);
      const isStillOnSubmittedContext = matchesSubmittedContext(currentContext, submittedContext, kind);
      const currentContextReflectsResult = contextReflectsResult(currentContext, result.result);

      if (
        result.result.hospitalId !== submittedContext.hospitalId ||
        result.result.status !== nextStatus ||
        (!isStillOnSubmittedContext && !currentContextReflectsResult)
      ) {
        inFlightRef.current = false;
        return result;
      }

      setAwaitingRefresh({
        hospitalId: submittedContext.hospitalId,
        expectedUpdatedAt: submittedContext.expectedUpdatedAt,
        sourceStatus: expectedStatus,
      });
      notify.success(kind === "suspend" ? "ระงับโรงพยาบาลแล้ว" : "คืนสถานะโรงพยาบาลแล้ว");
      return result;
    },
    [],
  );

  const runSuspendMutation = useCallback(
    (previousState: HospitalGovernanceMutationActionState, formData: FormData) =>
      runMutation(suspendHospitalAction, "suspend", previousState, formData),
    [runMutation],
  );
  const runRestoreMutation = useCallback(
    (previousState: HospitalGovernanceMutationActionState, formData: FormData) =>
      runMutation(restoreHospitalAction, "restore", previousState, formData),
    [runMutation],
  );

  const [, suspendAction, suspendPending, suspendUnknown] = useMutationActionState<
    HospitalGovernanceMutationActionState,
    FormData
  >(runSuspendMutation, initialHospitalGovernanceMutationActionState);
  const [, restoreAction, restorePending, restoreUnknown] = useMutationActionState<
    HospitalGovernanceMutationActionState,
    FormData
  >(runRestoreMutation, initialHospitalGovernanceMutationActionState);
  const pending = suspendPending || restorePending;
  const latestSubmissionUnconfirmed = latestSubmission !== null && isUnconfirmedSubmission(
    latestSubmission,
    suspendUnknown,
    suspendPending,
    restoreUnknown,
    restorePending,
  );
  const unknownOutcome = latestSubmissionUnconfirmed && latestSubmission?.context.hospitalId === hospitalId;
  const suspendUnconfirmed = latestSubmission?.kind === "suspend" &&
    latestSubmissionUnconfirmed &&
    latestSubmission.context.hospitalId === hospitalId;
  const currentContext = { hospitalId, expectedUpdatedAt, status };
  const latestSuspendResult = latestSubmission?.kind === "suspend" ? latestSubmission.result : null;
  const latestSuspendOutcome = suspendUnconfirmed
    ? "unknown"
    : latestSuspendResult?.status === "SUCCESS"
      ? "success"
      : latestSuspendResult?.status === "ERROR"
        ? "error"
        : "idle";
  const controlsLocked = pending || unknownOutcome || awaitingRefresh !== null;

  useCommittedLayoutEffect(() => {
    currentContextRef.current = { hospitalId, expectedUpdatedAt, status };

    if (
      awaitingRefresh &&
      (hospitalId !== awaitingRefresh.hospitalId ||
        expectedUpdatedAt !== awaitingRefresh.expectedUpdatedAt ||
        status !== awaitingRefresh.sourceStatus)
    ) {
      inFlightRef.current = false;
      setAwaitingRefresh(null);
    }

    if (latestSubmission && latestSubmission.context.hospitalId !== hospitalId && !pending) {
      inFlightRef.current = false;
    }
  }, [awaitingRefresh, expectedUpdatedAt, hospitalId, latestSubmission, pending, status]);

  useEffect(() => {
    if (
      !latestSubmission ||
      latestSubmission.result?.status !== "SUCCESS" ||
      lastRefreshedSubmissionRef.current === latestSubmission.id
    ) {
      return;
    }

    const context = currentContextRef.current;
    if (
      !matchesSubmittedContext(context, latestSubmission.context, latestSubmission.kind) &&
      !contextReflectsResult(context, latestSubmission.result.result)
    ) {
      return;
    }

    lastRefreshedSubmissionRef.current = latestSubmission.id;
    router.refresh();
  }, [expectedUpdatedAt, hospitalId, latestSubmission, router, status]);

  return (
    <Panel aria-labelledby="hospital-governance-controls-heading">
      <h2 className="text-xl font-semibold tracking-[-0.02em]" id="hospital-governance-controls-heading">
        การจัดการสถานะโรงพยาบาล
      </h2>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        การเปลี่ยนสถานะมีผลทันทีเมื่อบันทึกสำเร็จ และมีผลเฉพาะโรงพยาบาลนี้
      </p>

      <UnknownOutcomeAlert
        active={unknownOutcome}
        className="mt-4"
        recovery={{
          kind: "reload",
          label: "โหลดและตรวจสอบสถานะล่าสุด",
          message: latestSubmission?.kind === "suspend"
            ? "ระบบยังยืนยันผลการระงับโรงพยาบาลไม่ได้ กรุณาโหลดข้อมูลล่าสุดเพื่อตรวจสอบสถานะก่อนดำเนินการต่อ"
            : "ระบบยังยืนยันผลการคืนสถานะโรงพยาบาลไม่ได้ กรุณาโหลดข้อมูลล่าสุดเพื่อตรวจสอบสถานะก่อนดำเนินการต่อ",
        }}
      />
      {status === "ACTIVE" ? (
        <ConfirmableActionForm
          action={suspendAction}
          className="mt-6 border-t border-border pt-5"
          key={hospitalId}
          confirmation={{
            title: "ระงับโรงพยาบาลนี้หรือไม่",
            description: "เมื่อบันทึกสำเร็จ ผู้ใช้งานจะไม่สามารถดำเนินงานภายใต้โรงพยาบาลนี้ได้",
            details: <p>ข้อมูลเดิมจะไม่ถูกลบหรือแก้ไข</p>,
            confirmLabel: "ระงับโรงพยาบาล",
            confirmVariant: "destructive",
          }}
          outcome={latestSuspendOutcome}
          pending={pending}
          resultKey={latestSubmission?.kind === "suspend" ? latestSubmission : null}
        >
          <input name="hospitalId" type="hidden" value={hospitalId} />
          <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
          <p className="text-sm leading-6 text-text-muted">
            เมื่อระงับโรงพยาบาล ผู้ใช้งานจะไม่สามารถดำเนินงานภายใต้โรงพยาบาลนี้ได้ ข้อมูลเดิมจะไม่ถูกลบหรือปรับแก้
          </p>
          <Button className="mt-3" disabled={controlsLocked} loading={suspendPending} size="compact" type="submit" variant="danger">
            {suspendPending ? "กำลังระงับ..." : "ระงับโรงพยาบาล"}
          </Button>
        </ConfirmableActionForm>
      ) : (
        <form
          action={restoreAction}
          className="mt-6 border-t border-border pt-5"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (controlsLocked || inFlightRef.current) {
              return;
            }

            inFlightRef.current = true;
            const formData = new FormData(event.currentTarget);
            startTransition(() => restoreAction(formData));
          }}
        >
          <input name="hospitalId" type="hidden" value={hospitalId} />
          <input name="expectedUpdatedAt" type="hidden" value={expectedUpdatedAt} />
          <p className="text-sm leading-6 text-text-muted">
            คืนสถานะโรงพยาบาลเพื่อให้กลับมาดำเนินงานได้ หากส่วนงานใดยังไม่พร้อม ส่วนนั้นจะยังใช้งานไม่ได้
          </p>
          <Button className="mt-3" disabled={controlsLocked} loading={restorePending} size="compact" type="submit">
            {restorePending ? "กำลังคืนสถานะ..." : "คืนสถานะโรงพยาบาล"}
          </Button>
        </form>
      )}

      <Feedback currentContext={currentContext} submission={latestSubmission} />
    </Panel>
  );
}
