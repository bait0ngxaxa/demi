"use client";

import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";

import {
  initialWorkforceActivationActionState,
  initialWorkforceProvisionActionState,
  type WorkforceActivationActionState,
  type WorkforceActivationResultState,
  type WorkforceProvisionActionState,
  type WorkforceProvisionResultState,
} from "@/modules/workforce/transport/action-state";
import {
  provisionHospitalMemberAction,
  provisionOsmAction,
  regenerateWorkforceActivationAction,
  startAssistedWorkforceActivationAction,
} from "@/modules/workforce/transport/server-actions";
import type {
  WorkforceListResult,
  WorkforceListRow,
  WorkforceOwnerHospital,
} from "@/modules/workforce/services/workforce-service";

const professionLabels = {
  DOCTOR: "แพทย์",
  NURSE: "พยาบาล",
  COORDINATOR: "ผู้ประสานงาน",
  OTHER: "อื่น ๆ",
} as const;

type WorkforceWorkspaceProps = {
  hospitals: WorkforceOwnerHospital[];
  selectedHospitalId: string;
  workforce: WorkforceListResult;
};

function buildActivationUrl(token: string): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/activate/workforce#${encodeURIComponent(token)}`;
}

function formatDate(date: string | Date | null): string {
  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

function ProvisionResult({ result }: { result: WorkforceProvisionResultState }): React.JSX.Element {
  const activationToken = result.activationToken;

  if (!activationToken) {
    return (
      <div className="rounded-[14px] border border-success/20 bg-success-soft px-4 py-4 text-sm leading-6 text-ink">
        <p className="font-semibold">เพิ่มสิทธิ์เรียบร้อยแล้ว</p>
        <p className="mt-1 text-muted">
          {result.accountStatus === "ACTIVE"
            ? "ผู้ใช้นี้มีบัญชี DEMI ที่เปิดใช้งานอยู่แล้ว ไม่ต้องเปิดใช้งานบัญชีอีกครั้ง"
            : "ระบบบันทึกข้อมูลแล้ว กรุณาออกลิงก์เปิดใช้งานใหม่จากรายการเมื่อจำเป็น"}
        </p>
      </div>
    );
  }

  return <ActivationPresentation token={activationToken} expiresAt={result.activationExpiresAt} />;
}

function ActivationResult({ result }: { result: WorkforceActivationResultState }): React.JSX.Element {
  return <ActivationPresentation token={result.activationToken} expiresAt={result.activationExpiresAt} />;
}

function ActivationPresentation({
  token,
  expiresAt,
}: {
  token: string;
  expiresAt: string | null;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const activationUrl = useMemo(() => buildActivationUrl(token), [token]);

  useEffect(() => {
    let active = true;

    void QRCode.toDataURL(activationUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 240,
    })
      .then((dataUrl) => {
        if (active) {
          setQrDataUrl(dataUrl);
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

  async function copyActivationLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(activationUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-[14px] border border-brand/20 bg-brand-soft/60 px-4 py-4 text-sm leading-6 text-ink">
      <p className="font-semibold">สร้างบุคลากรแล้ว · รอเปิดใช้งาน</p>
      <p className="mt-1 text-muted">ส่งลิงก์นี้ให้ผู้ใช้งานตั้งรหัสผ่านของตนเอง</p>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-52 w-52 items-center justify-center rounded-[12px] bg-white p-2">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="QR Code ลิงก์เปิดใช้งาน DEMI" className="h-full w-full" src={qrDataUrl} />
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
          <button
            className="mt-3 inline-flex h-10 items-center justify-center rounded-[10px] bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
            onClick={() => void copyActivationLink()}
            type="button"
          >
            {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์เปิดใช้งาน"}
          </button>
          <p className="mt-3 text-xs leading-5 text-muted">ลิงก์หมดอายุ: {formatDate(expiresAt)}</p>
        </div>
      </div>
    </div>
  );
}

function WorkforceRow({
  row,
  hospitalId,
  remoteAction,
  assistedAction,
}: {
  row: WorkforceListRow;
  hospitalId: string;
  remoteAction: (formData: FormData) => void;
  assistedAction: (formData: FormData) => void;
}): React.JSX.Element {
  const isActive = row.accountStatus === "ACTIVE" && row.relationshipStatus === "ACTIVE";
  const isSuspended =
    row.accountStatus === "SUSPENDED" || row.relationshipStatus === "SUSPENDED";
  const isInvited = row.accountStatus === "INVITED" || row.relationshipStatus === "INVITED";
  const statusLabel = isActive
    ? "พร้อมใช้งาน"
    : isSuspended
      ? "ถูกระงับ"
      : isInvited
        ? "อยู่ระหว่างเชิญ"
        : "รอเปิดใช้งาน";
  const statusClass = isActive
    ? "bg-success-soft text-success"
    : isSuspended
      ? "bg-danger text-white"
      : isInvited
        ? "bg-canvas text-muted"
        : "bg-amber-50 text-amber-950";

  return (
    <li className="border-t border-line px-4 py-5 first:border-t-0 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-ink">{row.displayName}</p>
          <p className="mt-1 text-sm text-muted">
            {row.kind === "OSM" ? "อสม." : `บุคลากรโรงพยาบาล · ${row.profession ? professionLabels[row.profession] : "ยังไม่ระบุวิชาชีพ"}`}
          </p>
        </div>
        <span
          className={`inline-flex w-fit items-center rounded-full px-3 py-1.5 text-xs font-semibold ${statusClass}`}
        >
          {statusLabel}
        </span>
      </div>

      {row.activationRequired ? (
        <div className="mt-4 flex flex-col gap-3 rounded-[12px] bg-canvas px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs leading-5 text-muted">
            <p>บัญชีและความสัมพันธ์ยังไม่เปิดใช้งาน</p>
            <p>
              {row.activationExpiresAt
                ? `ลิงก์ล่าสุดหมดอายุ ${formatDate(row.activationExpiresAt)}`
                : "ยังไม่มีลิงก์ที่พร้อมใช้งาน"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={remoteAction}>
              <input name="userId" type="hidden" value={row.userId} />
              <input name="targetHospitalId" type="hidden" value={hospitalId} />
              <input name="kind" type="hidden" value={row.kind} />
              <button
                className="inline-flex h-9 items-center justify-center rounded-[9px] border border-brand px-3 text-xs font-semibold text-brand-strong transition hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
                type="submit"
              >
                ออกลิงก์ใหม่
              </button>
            </form>
            <form action={assistedAction}>
              <input name="userId" type="hidden" value={row.userId} />
              <input name="targetHospitalId" type="hidden" value={hospitalId} />
              <input name="kind" type="hidden" value={row.kind} />
              <button
                className="inline-flex h-9 items-center justify-center rounded-[9px] bg-brand px-3 text-xs font-semibold text-white transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
                type="submit"
              >
                เริ่มแบบช่วยเหลือ
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function WorkforceWorkspace({
  hospitals,
  selectedHospitalId,
  workforce,
}: WorkforceWorkspaceProps): React.JSX.Element {
  const router = useRouter();
  const [staffState, staffAction, staffPending] = useActionState<
    WorkforceProvisionActionState,
    FormData
  >(provisionHospitalMemberAction, initialWorkforceProvisionActionState);
  const [osmState, osmAction, osmPending] = useActionState<
    WorkforceProvisionActionState,
    FormData
  >(provisionOsmAction, initialWorkforceProvisionActionState);
  const [remoteState, remoteAction, remotePending] = useActionState<
    WorkforceActivationActionState,
    FormData
  >(regenerateWorkforceActivationAction, initialWorkforceActivationActionState);
  const [assistedState, assistedAction, assistedPending] = useActionState<
    WorkforceActivationActionState,
    FormData
  >(startAssistedWorkforceActivationAction, initialWorkforceActivationActionState);

  useEffect(() => {
    if (assistedState.status !== "SUCCESS") {
      return;
    }

    window.location.replace(buildActivationUrl(assistedState.result.activationToken));
  }, [assistedState]);

  const staffRows = workforce.rows.filter((row) => row.kind === "HOSPITAL_MEMBER");
  const osmRows = workforce.rows.filter((row) => row.kind === "OSM");
  const staffResult = staffState.status === "SUCCESS" ? staffState.result : null;
  const osmResult = osmState.status === "SUCCESS" ? osmState.result : null;
  const remoteResult = remoteState.status === "SUCCESS" ? remoteState.result : null;
  const anyPending = staffPending || osmPending || remotePending || assistedPending;

  return (
    <main className="min-h-svh bg-canvas text-ink">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-start justify-between gap-6 px-5 py-5 sm:items-center sm:px-8 lg:px-10">
          <div>
            <a
              className="text-sm font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
              href="/app"
            >
              ← กลับไปพื้นที่ทำงาน
            </a>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
              จัดการบุคลากรโรงพยาบาล
            </h1>
            <p className="mt-2 max-w-2xl text-base leading-7 text-muted">
              เพิ่มบุคลากรและ อสม. ให้กับโรงพยาบาลที่คุณเป็นเจ้าของโดยตรง
            </p>
          </div>
          <span className="hidden rounded-full bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand-strong sm:inline-flex">
            Hospital Owner
          </span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8 sm:py-12 lg:px-10">
        <section className="rounded-[16px] border border-line bg-white p-5 sm:p-7">
          <label className="block text-sm font-semibold text-ink" htmlFor="targetHospitalId">
            โรงพยาบาลที่จัดการ
          </label>
          <select
            className="mt-2 h-12 w-full max-w-xl rounded-[12px] border border-line bg-white px-4 text-base text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft"
            id="targetHospitalId"
            onChange={(event) => {
              router.push(`/app/workforce?hospitalId=${encodeURIComponent(event.target.value)}`);
            }}
            value={selectedHospitalId}
          >
            {hospitals.map((hospital) => (
              <option key={hospital.id} value={hospital.id}>
                {hospital.name} · {hospital.hospitalCode}
              </option>
            ))}
          </select>
          <p className="mt-2 text-sm leading-6 text-muted">
            รายการและการดำเนินการทุกครั้งจะตรวจสอบสิทธิ์ Owner กับโรงพยาบาลนี้จากฝั่งเซิร์ฟเวอร์
          </p>
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <section className="rounded-[16px] border border-line bg-white p-5 sm:p-7">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">เพิ่มบุคลากรโรงพยาบาล</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                กำหนดวิชาชีพจากฝั่งโรงพยาบาล ระบบจะสร้างความสัมพันธ์แบบ MEMBER ให้เอง
              </p>
            </div>
            <form action={staffAction} className="mt-6 space-y-4">
              <input name="targetHospitalId" type="hidden" value={selectedHospitalId} />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-semibold">
                  <span>ชื่อ</span>
                  <input className="h-11 w-full rounded-[10px] border border-line px-3 font-normal outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft" name="givenName" required type="text" />
                </label>
                <label className="space-y-2 text-sm font-semibold">
                  <span>นามสกุล</span>
                  <input className="h-11 w-full rounded-[10px] border border-line px-3 font-normal outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft" name="familyName" required type="text" />
                </label>
              </div>
              <label className="block space-y-2 text-sm font-semibold">
                <span>เลขบัตรประชาชน</span>
                <input className="h-11 w-full rounded-[10px] border border-line px-3 font-normal outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft" inputMode="numeric" maxLength={13} name="nationalId" pattern="[0-9]{13}" required type="text" />
              </label>
              <label className="block space-y-2 text-sm font-semibold">
                <span>วิชาชีพ</span>
                <select className="h-11 w-full rounded-[10px] border border-line bg-white px-3 font-normal outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft" defaultValue="" name="profession" required>
                  <option disabled value="">เลือกวิชาชีพ</option>
                  {Object.entries(professionLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              {staffState.status === "ERROR" ? <p className="text-sm leading-6 text-danger" role="alert">{staffState.message}</p> : null}
              {staffState.status === "SUCCESS" ? <ProvisionResult result={staffResult!} /> : null}
              <button className="flex h-11 w-full items-center justify-center rounded-[10px] bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft disabled:cursor-not-allowed disabled:bg-brand-muted" disabled={anyPending} type="submit">
                {staffPending ? "กำลังบันทึก..." : "เพิ่มบุคลากร"}
              </button>
            </form>
          </section>

          <section className="rounded-[16px] border border-line bg-white p-5 sm:p-7">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">เพิ่ม อสม.</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                สร้างเฉพาะความสัมพันธ์ อสม. กับโรงพยาบาลนี้ ยังไม่มีการกำหนดพื้นที่หรือผู้ป่วย
              </p>
            </div>
            <form action={osmAction} className="mt-6 space-y-4">
              <input name="targetHospitalId" type="hidden" value={selectedHospitalId} />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-semibold">
                  <span>ชื่อ</span>
                  <input className="h-11 w-full rounded-[10px] border border-line px-3 font-normal outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft" name="givenName" required type="text" />
                </label>
                <label className="space-y-2 text-sm font-semibold">
                  <span>นามสกุล</span>
                  <input className="h-11 w-full rounded-[10px] border border-line px-3 font-normal outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft" name="familyName" required type="text" />
                </label>
              </div>
              <label className="block space-y-2 text-sm font-semibold">
                <span>เลขบัตรประชาชน</span>
                <input className="h-11 w-full rounded-[10px] border border-line px-3 font-normal outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft" inputMode="numeric" maxLength={13} name="nationalId" pattern="[0-9]{13}" required type="text" />
              </label>
              <div className="min-h-11 rounded-[10px] border border-dashed border-line bg-canvas px-3 py-2 text-sm leading-6 text-muted">
                บทบาท OSM และสถานะความสัมพันธ์กำหนดโดยบริการฝั่งเซิร์ฟเวอร์
              </div>
              {osmState.status === "ERROR" ? <p className="text-sm leading-6 text-danger" role="alert">{osmState.message}</p> : null}
              {osmState.status === "SUCCESS" ? <ProvisionResult result={osmResult!} /> : null}
              <button className="flex h-11 w-full items-center justify-center rounded-[10px] bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft disabled:cursor-not-allowed disabled:bg-brand-muted" disabled={anyPending} type="submit">
                {osmPending ? "กำลังบันทึก..." : "เพิ่ม อสม."}
              </button>
            </form>
          </section>
        </div>

        {remoteState.status === "ERROR" ? <p className="mt-6 text-sm leading-6 text-danger" role="alert">{remoteState.message}</p> : null}
        {remoteResult ? <section className="mt-6"><ActivationResult result={remoteResult} /></section> : null}

        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          {([
            ["บุคลากรโรงพยาบาล", staffRows, "MEMBER"],
            ["อสม.", osmRows, "OSM"],
          ] as const).map(([title, rows]) => (
            <section className="overflow-hidden rounded-[16px] border border-line bg-white" key={title}>
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-6">
                <h2 className="text-xl font-semibold tracking-[-0.02em]">{title}</h2>
                <span className="rounded-full bg-canvas px-3 py-1.5 text-xs font-semibold text-muted">{rows.length} รายการ</span>
              </div>
              {rows.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm leading-6 text-muted sm:px-6">ยังไม่มีรายการในโรงพยาบาลนี้</p>
              ) : (
                <ul>
                  {rows.map((row) => (
                    <WorkforceRow
                      assistedAction={assistedAction}
                      hospitalId={selectedHospitalId}
                      key={`${row.kind}-${row.id}`}
                      remoteAction={remoteAction}
                      row={row}
                    />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
