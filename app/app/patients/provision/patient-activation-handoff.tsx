"use client";

import QRCode from "qrcode";
import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import {
  initialPatientActivationIssueActionState,
  type PatientActivationIssueResultState,
} from "@/modules/patient-activation/transport/action-state";
import { issuePatientActivationAction } from "@/modules/patient-activation/transport/server-actions";

type PatientActivationHandoffProps = {
  userId: string;
  hospitalId: string;
  accountStatus: "PROVISIONED" | "INVITED" | "ACTIVE" | "SUSPENDED";
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

function ActivationPresentation({
  result,
  action,
  pending,
}: {
  result: PatientActivationIssueResultState;
  action: (formData: FormData) => void;
  pending: boolean;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrDataUrlFor, setQrDataUrlFor] = useState<string | null>(null);
  const activationToken = result.activationToken;
  const browserOrigin = useSyncExternalStore(
    subscribeToBrowserOrigin,
    getBrowserOrigin,
    getServerOrigin,
  );
  const activationUrl = useMemo(
    () =>
      activationToken && browserOrigin
        ? buildActivationUrl(browserOrigin, activationToken)
        : null,
    [activationToken, browserOrigin],
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
    <div className="mt-4 rounded-[12px] border border-brand/20 bg-brand-soft/60 px-4 py-4 text-sm leading-6 text-ink">
      <p className="font-semibold">ลิงก์เปิดใช้งานพร้อมส่งต่อ</p>
      <p className="mt-1 text-muted">ส่งลิงก์หรือ QR นี้ให้ผู้ป่วยตั้งรหัสผ่านของตนเอง</p>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-52 w-52 shrink-0 items-center justify-center rounded-[12px] bg-white p-2">
          {visibleQrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="QR Code ลิงก์เปิดใช้งานบัญชีผู้ป่วย DEMI" className="h-full w-full" src={visibleQrDataUrl} />
          ) : (
            <span className="text-center text-xs text-muted">กำลังสร้าง QR Code...</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-strong">
            Activation link
          </p>
          <p className="mt-2 break-all rounded-[10px] border border-line bg-white px-3 py-3 text-xs leading-5 text-muted">
            {activationUrl}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="inline-flex h-10 items-center justify-center rounded-[10px] bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft disabled:cursor-not-allowed disabled:bg-brand-muted"
              disabled={pending}
              onClick={() => void copyActivationLink()}
              type="button"
            >
              {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
            </button>
            <form action={action}>
              <input name="userId" type="hidden" value={result.userId} />
              <input name="targetHospitalId" type="hidden" value={result.hospitalId} />
              <input name="reissue" type="hidden" value="true" />
              <button
                className="inline-flex h-10 items-center justify-center rounded-[10px] border border-brand px-4 text-sm font-semibold text-brand-strong transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft disabled:cursor-not-allowed disabled:opacity-60"
                disabled={pending}
                type="submit"
              >
                {pending ? "กำลังออกลิงก์ใหม่..." : "ออกลิงก์ใหม่"}
              </button>
            </form>
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
    </div>
  );
}

export function PatientActivationHandoff({
  userId,
  hospitalId,
  accountStatus,
}: PatientActivationHandoffProps): React.JSX.Element {
  const [state, action, pending] = useActionState(
    issuePatientActivationAction,
    initialPatientActivationIssueActionState,
  );
  const result = state.status === "SUCCESS" ? state.result : null;
  const active = accountStatus === "ACTIVE" || result?.outcome === "ALREADY_ACTIVE";

  if (active) {
    return (
      <div className="mt-4 rounded-[12px] border border-success/20 bg-success-soft px-4 py-4 text-sm leading-6 text-ink" role="status">
        <p className="font-semibold">บัญชีผู้ป่วยเปิดใช้งานอยู่แล้ว</p>
        <p className="mt-1 text-muted">ไม่ต้องออกลิงก์ใหม่ และระบบคงตัวตน/รหัสผ่านเดิมไว้</p>
      </div>
    );
  }

  const errorMessage = state.status === "ERROR" ? state.message : null;
  const issued = result?.outcome === "ISSUED" && result.activationToken;

  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="text-sm font-semibold text-ink">เปิดใช้งานบัญชีผู้ป่วย</p>
      <p className="mt-1 text-sm leading-6 text-muted">
        ออกลิงก์ครั้งเดียวให้ผู้ป่วยตั้งรหัสผ่านด้วยตนเอง โรงพยาบาลจะไม่เห็นรหัสผ่าน
      </p>
      {issued ? (
        <ActivationPresentation action={action} pending={pending} result={result} />
      ) : result?.outcome === "ALREADY_ISSUED" ? (
        <div className="mt-4 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950" role="status">
          <p className="font-semibold">มีลิงก์เปิดใช้งานที่ยังใช้ได้แล้ว</p>
          <p className="mt-1">หากต้องการสร้างลิงก์ใหม่ ลิงก์เดิมจะถูกยกเลิกทันที</p>
          <p className="mt-1 text-xs leading-5">ลิงก์เดิมหมดอายุ: {formatDate(result.activationExpiresAt)}</p>
          <form action={action} className="mt-3">
            <input name="userId" type="hidden" value={userId} />
            <input name="targetHospitalId" type="hidden" value={hospitalId} />
            <input name="reissue" type="hidden" value="true" />
            <button
              className="inline-flex h-10 items-center justify-center rounded-[10px] bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft disabled:cursor-not-allowed disabled:bg-brand-muted"
              disabled={pending}
              type="submit"
            >
              {pending ? "กำลังออกลิงก์ใหม่..." : "ยกเลิกลิงก์เดิมและออกใหม่"}
            </button>
          </form>
        </div>
      ) : (
        <form action={action} className="mt-3">
          <input name="userId" type="hidden" value={userId} />
          <input name="targetHospitalId" type="hidden" value={hospitalId} />
          <input name="reissue" type="hidden" value="false" />
          <button
            className="inline-flex h-11 items-center justify-center rounded-[10px] bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft disabled:cursor-not-allowed disabled:bg-brand-muted"
            disabled={pending}
            type="submit"
          >
            {pending ? "กำลังออกลิงก์..." : "ออกลิงก์เปิดใช้งาน"}
          </button>
        </form>
      )}
      {errorMessage ? (
        <p className="mt-3 text-sm leading-6 text-danger" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
