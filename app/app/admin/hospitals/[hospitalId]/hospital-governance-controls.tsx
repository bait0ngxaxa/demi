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

type HospitalGovernanceControlsProps = {
  expectedUpdatedAt: string;
  hospitalId: string;
  status: "ACTIVE" | "SUSPENDED";
};

function Feedback({
  states,
  hospitalId,
}: {
  states: readonly HospitalGovernanceMutationActionState[];
  hospitalId: string;
}): React.JSX.Element | null {
  const errorState = states.find((state) => state.status === "ERROR" && state.code !== "UNAVAILABLE");

  if (errorState && errorState.status === "ERROR") {
    return (
      <Alert className="mt-4" role="alert" variant={errorState.code === "CONFLICT" ? "warning" : "danger"}>
        {errorState.message}
      </Alert>
    );
  }

  const successState = states.find(
    (state) => state.status === "SUCCESS" && state.result.hospitalId === hospitalId,
  );

  return successState ? (
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
  const currentContextRef = useRef<MutationContext>({ hospitalId, expectedUpdatedAt, status });
  const [returnedIdleKind, setReturnedIdleKind] = useState<GovernanceMutationKind | null>(null);
  const [awaitingRefresh, setAwaitingRefresh] = useState<PendingRefreshContext | null>(null);

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
  }, [awaitingRefresh, expectedUpdatedAt, hospitalId, status]);

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
      inFlightRef.current = true;

      const result = await action(previousState, formData);

      if (!mountedRef.current) {
        return result;
      }

      if (result.status === "IDLE") {
        setReturnedIdleKind(kind);
        return result;
      }

      setReturnedIdleKind(null);

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
      const contextReflectsResult =
        currentContext.hospitalId === result.result.hospitalId &&
        currentContext.expectedUpdatedAt === result.result.updatedAt &&
        currentContext.status === result.result.status;

      if (
        result.result.hospitalId !== submittedContext.hospitalId ||
        result.result.status !== nextStatus ||
        (!isStillOnSubmittedContext && !contextReflectsResult)
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

  const [suspendState, suspendAction, suspendPending, suspendUnknown] = useMutationActionState<
    HospitalGovernanceMutationActionState,
    FormData
  >(runSuspendMutation, initialHospitalGovernanceMutationActionState);
  const [restoreState, restoreAction, restorePending, restoreUnknown] = useMutationActionState<
    HospitalGovernanceMutationActionState,
    FormData
  >(runRestoreMutation, initialHospitalGovernanceMutationActionState);
  const pending = suspendPending || restorePending;
  const suspendUnconfirmed = suspendUnknown || returnedIdleKind === "suspend" ||
    (suspendState.status === "ERROR" && suspendState.code === "UNAVAILABLE");
  const restoreUnconfirmed = restoreUnknown || returnedIdleKind === "restore" ||
    (restoreState.status === "ERROR" && restoreState.code === "UNAVAILABLE");
  const unknownOutcome = suspendUnconfirmed || restoreUnconfirmed;
  const controlsLocked = pending || unknownOutcome || awaitingRefresh !== null;

  useEffect(() => {
    if (suspendState.status === "SUCCESS" || restoreState.status === "SUCCESS") {
      router.refresh();
    }
  }, [restoreState, router, suspendState]);

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
          message: suspendUnconfirmed
            ? "ระบบยังยืนยันผลการระงับโรงพยาบาลไม่ได้ กรุณาโหลดข้อมูลล่าสุดเพื่อตรวจสอบสถานะก่อนดำเนินการต่อ"
            : "ระบบยังยืนยันผลการคืนสถานะโรงพยาบาลไม่ได้ กรุณาโหลดข้อมูลล่าสุดเพื่อตรวจสอบสถานะก่อนดำเนินการต่อ",
        }}
      />
      {status === "ACTIVE" ? (
        <ConfirmableActionForm
          action={suspendAction}
          className="mt-6 border-t border-border pt-5"
          confirmation={{
            title: "ระงับโรงพยาบาลนี้หรือไม่",
            description: "เมื่อบันทึกสำเร็จ ผู้ใช้งานจะไม่สามารถดำเนินงานภายใต้โรงพยาบาลนี้ได้",
            details: <p>ข้อมูลเดิมจะไม่ถูกลบหรือแก้ไข</p>,
            confirmLabel: "ระงับโรงพยาบาล",
            confirmVariant: "destructive",
          }}
          outcome={suspendUnconfirmed ? "unknown" : suspendState.status === "SUCCESS" ? "success" : suspendState.status === "ERROR" ? "error" : "idle"}
          pending={pending}
          resultKey={suspendState}
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

      <Feedback hospitalId={hospitalId} states={[suspendState, restoreState]} />
    </Panel>
  );
}
