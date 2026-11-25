"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { CredentialHandoffDialog } from "@/components/credential-handoff/credential-handoff-dialog";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useMutationActionState } from "@/components/ui/mutation-action-state";
import { notify } from "@/components/ui/notify";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import type { PatientActivationCandidateState } from "@/modules/patient-activation/transport/action-state";
import {
  initialPatientActivationIssueActionState,
  type PatientActivationIssueActionState,
} from "@/modules/patient-activation/transport/action-state";
import { issuePatientActivationAction } from "@/modules/patient-activation/transport/server-actions";

type PatientActivationHandoffProps = {
  /** Reports whether this handoff holds an unhandled one-time link or an unresolved request. */
  onGuardChange?: (active: boolean) => void;
  candidate?: PatientActivationCandidateState;
};

/** Thrown inside the awaited wrapper so the shared hook reports an unconfirmed outcome. */
class UnconfirmedIssueOutcome extends Error {}

function formString(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function formatDate(date: string | null): string {
  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

function IssueForm({
  action,
  pending,
  userId,
  hospitalId,
  reissue,
  label,
}: {
  action: (formData: FormData) => void;
  pending: boolean;
  userId: string;
  hospitalId: string;
  reissue: boolean;
  label: string;
}): React.JSX.Element {
  return (
    <form action={action} className="mt-3">
      <input name="userId" type="hidden" value={userId} />
      <input name="targetHospitalId" type="hidden" value={hospitalId} />
      <input name="reissue" type="hidden" value={String(reissue)} />
      <Button
        disabled={pending}
        loading={pending}
        size="compact"
        type="submit"
      >
        {pending ? `กำลัง${label}...` : label}
      </Button>
    </form>
  );
}

function ActivationPresentation({
  result,
  action,
  pending,
  onClosed,
}: {
  onClosed: (outcome: "HANDED_OVER" | "DISCARDED") => void;
  result: Extract<
    Awaited<ReturnType<typeof issuePatientActivationAction>>,
    { status: "SUCCESS" }
  >["result"];
  action: (formData: FormData) => void;
  pending: boolean;
}): React.JSX.Element | null {
  const activationUrl = result.activationUrl;
  if (!activationUrl) {
    return null;
  }

  // A reissue keeps this dialog open: the new link and QR replace the old one in place, keyed by URL.
  return (
    <CredentialHandoffDialog
      busy={pending}
      expiresAt={result.activationExpiresAt}
      extraActions={
        <div>
          <IssueForm
            action={action}
            hospitalId={result.hospitalId}
            label="ออกลิงก์ใหม่"
            pending={pending}
            reissue
            userId={result.userId}
          />
          <p className="mt-2 text-sm leading-6 text-text-muted">การออกลิงก์ใหม่จะยกเลิกลิงก์นี้ทันที</p>
        </div>
      }
      link={{ label: "ลิงก์เปิดใช้งาน", shareTitle: "ลิงก์เปิดใช้งานบัญชีผู้ป่วย DEMI" }}
      onDiscard={() => onClosed("DISCARDED")}
      onHandedOver={() => onClosed("HANDED_OVER")}
      oneTimeNotice="ใช้ได้ครั้งเดียว · ส่งให้ผู้ป่วยตั้งรหัสผ่านของตนเอง"
      open
      qr={{
        alt: "QR Code สำหรับเปิดใช้งานบัญชีผู้ป่วย DEMI",
        fileName: "demi-patient-activation-qr.png",
        shareTitle: "QR Code สำหรับเปิดใช้งานบัญชีผู้ป่วย DEMI",
      }}
      title="ลิงก์เปิดใช้งานพร้อมส่งต่อ"
      url={activationUrl}
    />
  );
}

export function PatientActivationHandoff({
  onGuardChange,
  candidate,
}: PatientActivationHandoffProps): React.JSX.Element {
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const issueAndNotify = useCallback(
    async (
      previous: PatientActivationIssueActionState,
      formData: FormData,
    ): Promise<PatientActivationIssueActionState> => {
      try {
        const result = await issuePatientActivationAction(previous, formData);
        const feedback = mounted.current;

        if (result.status === "IDLE") {
          throw new UnconfirmedIssueOutcome();
        }

        if (result.status === "ERROR") {
          if (result.code === "UNAVAILABLE") {
            throw new UnconfirmedIssueOutcome();
          }
          if (feedback && result.code === "CONFLICT") {
            notify.warning("ไม่สามารถออกลิงก์ได้ กรุณาตรวจสอบสถานะผู้ป่วย");
          } else if (feedback && result.code === "FORBIDDEN") {
            notify.error("ไม่มีสิทธิ์ออกลิงก์เปิดใช้งานในโรงพยาบาลนี้");
          }
          return result;
        }

        const submittedUserId = formString(formData, "userId");
        const submittedHospitalId = formString(formData, "targetHospitalId");
        if (
          submittedUserId &&
          (result.result.userId !== submittedUserId ||
            result.result.hospitalId !== submittedHospitalId)
        ) {
          throw new UnconfirmedIssueOutcome();
        }

        if (result.result.outcome === "ISSUED") {
          // The one-time token is only shown inline; without it nothing can be handed over.
          if (!result.result.activationToken || !result.result.activationUrl) {
            throw new UnconfirmedIssueOutcome();
          }
          if (feedback) {
            notify.success("ออกลิงก์เปิดใช้งานแล้ว");
          }
        }

        return result;
      } finally {
        inFlight.current = false;
      }
    },
    [],
  );
  const [state, dispatchIssue, pending, unknownOutcome] = useMutationActionState(
    issueAndNotify,
    initialPatientActivationIssueActionState,
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // Reissue invalidates the previous link, so a second submit must never reach the server
  // while one request is unresolved, even before React re-renders the pending state.
  const action = useCallback(
    (formData: FormData): void => {
      if (inFlight.current) {
        return;
      }
      inFlight.current = true;
      dispatchIssue(formData);
    },
    [dispatchIssue],
  );
  const result = state.status === "SUCCESS" ? state.result : null;
  const [closedResult, setClosedResult] = useState<{ result: object; outcome: "HANDED_OVER" | "DISCARDED" } | null>(null);
  const tokenAwaitingHandoff =
    result?.outcome === "ISSUED" && Boolean(result.activationToken && result.activationUrl) && closedResult?.result !== result;
  const guardActive = pending || unknownOutcome || tokenAwaitingHandoff;
  const guardCallback = useRef(onGuardChange);
  useEffect(() => {
    guardCallback.current = onGuardChange;
  });
  useEffect(() => {
    guardCallback.current?.(guardActive);
    return () => guardCallback.current?.(false);
  }, [guardActive]);

  // Once the operator confirms the link was passed on, the token is dropped from the screen.
  function issuedLink(issued: NonNullable<typeof result>): React.JSX.Element {
    if (closedResult?.result === issued) {
      return (
        <Alert className="mt-4" variant={closedResult.outcome === "HANDED_OVER" ? "success" : "warning"}>
          <p className="font-semibold">
            {closedResult.outcome === "HANDED_OVER" ? "ส่งต่อลิงก์แล้ว" : "ปิดลิงก์โดยยังไม่ได้ส่งมอบ"}
          </p>
          <p className="mt-1">ลิงก์เดิมแสดงซ้ำไม่ได้ หากต้องการลิงก์ใหม่ ให้ค้นหาผู้ป่วยอีกครั้งและเลือกออกลิงก์ใหม่</p>
        </Alert>
      );
    }
    return (
      <ActivationPresentation
        action={action}
        onClosed={(outcome) => setClosedResult({ result: issued, outcome })}
        pending={pending}
        result={issued}
      />
    );
  }
  const errorMessage = state.status === "ERROR" ? state.message : null;
  const reconciliationRequired =
    candidate?.activationStatus === "RECONCILIATION_REQUIRED" ||
    result?.outcome === "RECONCILIATION_REQUIRED" ||
    (state.status === "ERROR" && state.code === "RECONCILIATION_REQUIRED");

  if (unknownOutcome) {
    return (
      <UnknownOutcomeAlert
        active={unknownOutcome}
        className="mt-4"
        recovery={{
          kind: "reload",
          label: "ดูข้อมูลล่าสุด",
          message:
            "ลิงก์อาจออกแล้ว แต่แสดงลิงก์เดิมซ้ำไม่ได้ กรุณาดูข้อมูลล่าสุดก่อน หากต้องการลิงก์ใหม่ ให้ค้นหาผู้ป่วยและเลือกออกใหม่ ซึ่งจะยกเลิกลิงก์เดิมทันที",
        }}
      />
    );
  }

  if (!candidate) {
    return <></>;
  }

  if (reconciliationRequired) {
    return (
      <Alert className="mt-4" variant="danger">
        <p className="font-semibold">บัญชีนี้ต้องได้รับการตรวจสอบก่อนออกลิงก์ใหม่</p>
        <p className="mt-1">กรุณาติดต่อผู้ดูแลระบบ DEMI เพื่อตรวจสอบข้อมูลก่อนดำเนินการต่อ</p>
      </Alert>
    );
  }

  if (
    candidate.activationStatus === "ACTIVE" ||
    result?.outcome === "ALREADY_ACTIVE"
  ) {
    return (
      <Alert className="mt-4" variant="success">
        <p className="font-semibold">บัญชีผู้ป่วยเปิดใช้งานอยู่แล้ว</p>
        <p className="mt-1 text-muted">ไม่ต้องออกลิงก์ใหม่ และระบบจะคงบัญชีและรหัสผ่านเดิมไว้</p>
      </Alert>
    );
  }

  if (candidate.activationStatus === "IN_PROGRESS") {
    return (
      <Alert className="mt-4" variant="warning">
        <p className="font-semibold">ผู้ป่วยกำลังเปิดใช้งานบัญชีอยู่</p>
        <p className="mt-1">รอให้ผู้ป่วยดำเนินการเสร็จสิ้น หรือลองตรวจสอบใหม่ภายหลัง</p>
      </Alert>
    );
  }

  if (result?.outcome === "ISSUED" && result.activationToken && result.activationUrl) {
    return issuedLink(result);
  }

  if (result?.outcome === "ALREADY_ISSUED") {
    return (
      <Alert className="mt-4" variant="warning">
        <p className="font-semibold">มีลิงก์เปิดใช้งานที่ยังใช้ได้แล้ว</p>
        <p className="mt-1">ลิงก์เดิมแสดงซ้ำไม่ได้ การออกลิงก์ทดแทนจะยกเลิกลิงก์เดิมทันที</p>
        <p className="mt-1 text-xs leading-5">ลิงก์เดิมหมดอายุ: {formatDate(result.activationExpiresAt)}</p>
        <IssueForm
          action={action}
          hospitalId={result.hospitalId}
          label="ยกเลิกลิงก์เดิมและออกใหม่"
          pending={pending}
          reissue
          userId={result.userId}
        />
      </Alert>
    );
  }

  const reissue = candidate.activationStatus === "EXPIRED";
  const label = reissue ? "ออกลิงก์ใหม่" : "ออกลิงก์เปิดใช้งาน";

  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="text-sm font-semibold text-ink">
        {candidate.activationStatus === "ISSUED"
          ? "มีลิงก์เปิดใช้งานอยู่แล้ว"
          : "ยังไม่ได้ออกลิงก์เปิดใช้งาน"}
      </p>
      <p className="mt-1 text-sm leading-6 text-muted">
        {candidate.activationStatus === "ISSUED"
          ? "ลิงก์เดิมแสดงซ้ำไม่ได้ หากต้องการส่งลิงก์ใหม่ ให้เลือกออกลิงก์ใหม่ ระบบจะยกเลิกลิงก์เดิมทันที"
          : "ออกลิงก์ครั้งเดียวให้ผู้ป่วยตั้งรหัสผ่านเอง"}
      </p>
      {candidate.activationExpiresAt ? (
        <p className="mt-2 text-xs leading-5 text-muted">
          ลิงก์ล่าสุดหมดอายุ: {formatDate(candidate.activationExpiresAt)}
        </p>
      ) : null}
      <IssueForm
        action={action}
        hospitalId={candidate.hospitalId}
        label={label}
        pending={pending}
        reissue={reissue || candidate.activationStatus === "ISSUED"}
        userId={candidate.userId}
      />
      {errorMessage ? (
        <p className="mt-3 text-sm leading-6 text-danger" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
