"use client";

import QRCode from "qrcode";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

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
  patientAccessRequestId?: string;
  linkedOutcome?: "READY_FOR_ACTIVATION" | "ALREADY_ACTIVE";
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

function LinkedIssueForm({
  action,
  pending,
  requestId,
  label,
}: {
  action: (formData: FormData) => void;
  pending: boolean;
  requestId: string;
  label: string;
}): React.JSX.Element {
  return (
    <form action={action} className="mt-3">
      <input name="patientAccessRequestId" type="hidden" value={requestId} />
      <Button disabled={pending} loading={pending} size="compact" type="submit">
        {pending ? `กำลัง${label}...` : label}
      </Button>
    </form>
  );
}

function ActivationPresentation({
  result,
  action,
  pending,
  onHandled,
}: {
  onHandled: () => void;
  result: Extract<
    Awaited<ReturnType<typeof issuePatientActivationAction>>,
    { status: "SUCCESS" }
  >["result"];
  action: (formData: FormData) => void;
  pending: boolean;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrDataUrlFor, setQrDataUrlFor] = useState<string | null>(null);
  const activationUrl = result.activationUrl;

  useEffect(() => {
    if (!activationUrl) {
      return;
    }

    let active = true;

    void QRCode.toDataURL(activationUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 240,
    })
      .then((dataUrl) => {
        if (active) {
          setQrDataUrl(dataUrl);
          setQrDataUrlFor(activationUrl);
        }
      })
      .catch(() => {
        if (active) {
          setQrDataUrl(null);
          setQrDataUrlFor(null);
        }
      });

    return () => {
      active = false;
    };
  }, [activationUrl]);

  const visibleQrDataUrl = qrDataUrlFor === activationUrl ? qrDataUrl : null;

  // The token exists only in this component; reloading or closing the tab loses a link that
  // cannot be shown again, so ask before leaving while it is on screen.
  useEffect(() => {
    if (!activationUrl) {
      return;
    }

    function warnBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
    }

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [activationUrl]);

  async function copyActivationLink(): Promise<void> {
    if (!activationUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(activationUrl);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  }

  return (
    <Alert className="mt-4" variant="info">
      <p className="font-semibold">ลิงก์เปิดใช้งานพร้อมส่งต่อ</p>
      <p className="mt-1 text-muted">ส่งลิงก์หรือ QR นี้ให้ผู้ป่วยตั้งรหัสผ่านของตนเอง</p>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-52 w-52 shrink-0 items-center justify-center rounded-control bg-surface p-2">
          {visibleQrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt="คิวอาร์โค้ดสำหรับเปิดใช้งานบัญชีผู้ป่วย DEMI"
              className="h-full w-full"
              src={visibleQrDataUrl}
            />
          ) : (
            <span className="text-center text-xs text-muted">กำลังสร้างคิวอาร์โค้ด...</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-strong">
            ลิงก์เปิดใช้งาน
          </p>
          <p className="mt-2 break-all rounded-control border border-border bg-surface px-3 py-3 text-xs leading-5 text-text-muted">
            {activationUrl ?? "กำลังเตรียมลิงก์..."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              disabled={pending || !activationUrl}
              onClick={() => void copyActivationLink()}
              size="compact"
              type="button"
            >
              {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
            </Button>
            <Button disabled={pending} onClick={onHandled} size="compact" type="button" variant="secondary">
              ส่งต่อลิงก์เรียบร้อยแล้ว
            </Button>
            <IssueForm
              action={action}
              hospitalId={result.hospitalId}
              label="ออกลิงก์ใหม่"
              pending={pending}
              reissue
              userId={result.userId}
            />
          </div>
          <p className="mt-3 text-xs leading-5 text-muted">
            การออกลิงก์ใหม่จะยกเลิกลิงก์นี้ทันที
          </p>
          {copyError ? (
            <p className="mt-2 text-xs leading-5 text-danger" role="alert">
              คัดลอกลิงก์อัตโนมัติไม่สำเร็จ กรุณาเลือกและคัดลอกลิงก์ด้วยตนเอง
            </p>
          ) : null}
          <p className="mt-3 text-xs leading-5 text-muted">
            ลิงก์หมดอายุ: {formatDate(result.activationExpiresAt)}
          </p>
        </div>
      </div>
    </Alert>
  );
}

export function PatientActivationHandoff({
  onGuardChange,
  candidate,
  patientAccessRequestId,
  linkedOutcome,
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
  const [handledResult, setHandledResult] = useState<object | null>(null);
  const tokenAwaitingHandoff =
    result?.outcome === "ISSUED" && Boolean(result.activationToken && result.activationUrl) && handledResult !== result;
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
    if (handledResult === issued) {
      return (
        <Alert className="mt-4" variant="success">
          <p className="font-semibold">บันทึกว่าส่งต่อลิงก์แล้ว</p>
          <p className="mt-1 text-muted">ลิงก์เดิมแสดงซ้ำไม่ได้ หากต้องการลิงก์ใหม่ ให้ค้นหาผู้ป่วยอีกครั้งและเลือกออกลิงก์ใหม่</p>
        </Alert>
      );
    }
    return <ActivationPresentation action={action} onHandled={() => setHandledResult(issued)} pending={pending} result={issued} />;
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
          label: "โหลดสถานะล่าสุด",
          message:
            "ระบบอาจออกลิงก์แล้ว แต่ลิงก์เดิมแสดงซ้ำไม่ได้ โหลดสถานะล่าสุดก่อน หากต้องการลิงก์ทดแทน ให้ค้นหาผู้ป่วยอีกครั้งและเลือกออกลิงก์ใหม่ด้วยตนเอง การออกใหม่จะยกเลิกลิงก์เดิมที่ยังใช้ได้",
        }}
      />
    );
  }

  if (patientAccessRequestId) {
    if (reconciliationRequired) {
      return (
        <Alert className="mt-4" variant="danger">
          <p className="font-semibold">บัญชีนี้ต้องได้รับการตรวจสอบก่อนออกลิงก์</p>
          <p className="mt-1">คำขอยังคงรอการตรวจสอบ ระบบยังไม่ถือว่าเปิดใช้งานสำเร็จ</p>
        </Alert>
      );
    }

    if (result?.outcome === "ALREADY_ACTIVE") {
      return (
        <Alert className="mt-4" variant="success">
          <p className="font-semibold">บัญชีผู้ป่วยเปิดใช้งานอยู่แล้ว</p>
          <p className="mt-1">ไม่ได้ออกลิงก์เปิดใช้งานหรือเปลี่ยนรหัสผ่าน</p>
          <p className="mt-1">
            ผู้ป่วยเข้าสู่ระบบได้ตามปกติ หากลืมรหัสผ่าน ขณะนี้ยังไม่มีช่องทางกู้คืนบัญชีที่รองรับ โปรดติดต่อผู้ดูแลระบบเพื่อสอบถามแนวทาง
          </p>
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
          {state.status === "ERROR" ? <p className="mt-3 text-sm text-danger" role="alert">{state.message}</p> : null}
        </Alert>
      );
    }

    if (state.status === "ERROR") {
      return <Alert className="mt-4" variant="danger">{state.message}</Alert>;
    }

    return (
      <div className="mt-4">
        {linkedOutcome === "ALREADY_ACTIVE" ? (
          <Alert variant="info">
            <p className="font-semibold">พบว่าบัญชีผู้ป่วยเปิดใช้งานอยู่แล้ว</p>
            <p className="mt-1">ยืนยันผลนี้เพื่อปิดคำขอ ระบบจะไม่ออกลิงก์เปิดใช้งานหรือเปลี่ยนรหัสผ่าน</p>
          </Alert>
        ) : (
          <p className="text-sm leading-6 text-text-muted">
            เปิดใช้งานบัญชีผู้ป่วยจากคำขอนี้ ผู้ป่วยจะตั้งรหัสผ่านด้วยตนเอง
          </p>
        )}
        <LinkedIssueForm
          action={action}
          label={linkedOutcome === "ALREADY_ACTIVE" ? "ยืนยันบัญชีที่เปิดใช้งานแล้ว" : "ออกลิงก์เปิดใช้งาน"}
          pending={pending}
          requestId={patientAccessRequestId}
        />
      </div>
    );
  }

  if (!candidate) {
    return <></>;
  }

  if (reconciliationRequired) {
    return (
      <Alert className="mt-4" variant="danger">
        <p className="font-semibold">บัญชีนี้ต้องได้รับการตรวจสอบก่อนออกลิงก์ใหม่</p>
        <p className="mt-1">กรุณาติดต่อผู้ดูแลระบบเพื่อตรวจสอบข้อมูลก่อนดำเนินการต่อ</p>
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
          : "ออกลิงก์ครั้งเดียวให้ผู้ป่วยตั้งรหัสผ่านด้วยตนเอง โรงพยาบาลจะไม่เห็นรหัสผ่าน"}
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
