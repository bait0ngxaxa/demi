"use client";

import QRCode from "qrcode";
import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { PatientActivationCandidateState } from "@/modules/patient-activation/transport/action-state";
import {
  initialPatientActivationIssueActionState,
} from "@/modules/patient-activation/transport/action-state";
import { issuePatientActivationAction } from "@/modules/patient-activation/transport/server-actions";

type PatientActivationHandoffProps = {
  candidate: PatientActivationCandidateState;
};

function buildActivationUrl(origin: string, token: string): string {
  return `${origin}/activate/patient#${encodeURIComponent(token)}`;
}

function subscribeToBrowserOrigin(): () => void {
  return () => undefined;
}

function getBrowserOrigin(): string {
  return window.location.origin;
}

function getServerOrigin(): string {
  return "";
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
}: {
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
  const browserOrigin = useSyncExternalStore(
    subscribeToBrowserOrigin,
    getBrowserOrigin,
    getServerOrigin,
  );
  const activationUrl = useMemo(
    () =>
      result.activationToken && browserOrigin
        ? buildActivationUrl(browserOrigin, result.activationToken)
        : null,
    [browserOrigin, result.activationToken],
  );

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
            <IssueForm
              action={action}
              hospitalId={result.hospitalId}
              label="ออกลิงก์ใหม่"
              pending={pending}
              reissue
              userId={result.userId}
            />
          </div>
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
  candidate,
}: PatientActivationHandoffProps): React.JSX.Element {
  const [state, action, pending] = useActionState(
    issuePatientActivationAction,
    initialPatientActivationIssueActionState,
  );
  const result = state.status === "SUCCESS" ? state.result : null;
  const errorMessage = state.status === "ERROR" ? state.message : null;
  const reconciliationRequired =
    candidate.activationStatus === "RECONCILIATION_REQUIRED" ||
    result?.outcome === "RECONCILIATION_REQUIRED" ||
    (state.status === "ERROR" && state.code === "RECONCILIATION_REQUIRED");

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

  if (result?.outcome === "ISSUED" && result.activationToken) {
    return <ActivationPresentation action={action} pending={pending} result={result} />;
  }

  if (result?.outcome === "ALREADY_ISSUED") {
    return (
      <Alert className="mt-4" variant="warning">
        <p className="font-semibold">มีลิงก์เปิดใช้งานที่ยังใช้ได้แล้ว</p>
        <p className="mt-1">ลิงก์เดิมไม่สามารถแสดงซ้ำได้ หากต้องการลิงก์ใหม่ให้ยกเลิกลิงก์เดิม</p>
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
          ? "ลิงก์เดิมไม่สามารถเปิดดูซ้ำได้ หากต้องการส่งลิงก์อีกครั้งให้เลือกออกลิงก์ใหม่"
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
