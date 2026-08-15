"use client";

import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
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
      <Alert variant="success">
        <p className="font-semibold">เพิ่มสิทธิ์เรียบร้อยแล้ว</p>
        <p className="mt-1 text-muted">
          {result.accountStatus === "ACTIVE"
            ? "ผู้ใช้นี้มีบัญชี DEMI ที่เปิดใช้งานอยู่แล้ว ไม่ต้องเปิดใช้งานบัญชีอีกครั้ง"
            : "ระบบบันทึกข้อมูลแล้ว กรุณาออกลิงก์เปิดใช้งานใหม่จากรายการเมื่อจำเป็น"}
        </p>
      </Alert>
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
    <Alert variant="info">
      <p className="font-semibold">สร้างบุคลากรแล้ว · รอเปิดใช้งาน</p>
      <p className="mt-1 text-muted">ส่งลิงก์นี้ให้ผู้ใช้งานตั้งรหัสผ่านของตนเอง</p>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-52 w-52 items-center justify-center rounded-control bg-surface p-2">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="QR Code ลิงก์เปิดใช้งาน DEMI" className="h-full w-full" src={qrDataUrl} />
          ) : (
            <span className="text-center text-xs text-muted">กำลังสร้าง QR Code...</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-strong">
            ลิงก์เปิดใช้งาน
          </p>
          <p className="mt-2 break-all rounded-control border border-border bg-surface px-3 py-3 text-xs leading-5 text-text-muted">
            {activationUrl}
          </p>
          <Button
            className="mt-3"
            onClick={() => void copyActivationLink()}
            size="compact"
            type="button"
          >
            {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์เปิดใช้งาน"}
          </Button>
          <p className="mt-3 text-xs leading-5 text-muted">ลิงก์หมดอายุ: {formatDate(expiresAt)}</p>
        </div>
      </div>
    </Alert>
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
  const statusVariant = isActive
    ? "success"
    : isSuspended
      ? "danger"
      : isInvited
        ? "neutral"
        : "warning";

  return (
    <li className="border-t border-line px-4 py-5 first:border-t-0 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-ink">{row.displayName}</p>
          <p className="mt-1 text-sm text-muted">
            {row.kind === "OSM" ? "อสม." : `บุคลากรโรงพยาบาล · ${row.profession ? professionLabels[row.profession] : "ยังไม่ระบุวิชาชีพ"}`}
          </p>
        </div>
        <StatusBadge variant={statusVariant}>
          {statusLabel}
        </StatusBadge>
      </div>

      {row.activationRequired ? (
        <div className="mt-4 flex flex-col gap-3 rounded-control bg-surface-muted px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
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
              <Button
                size="compact"
                type="submit"
                variant="secondary"
              >
                ออกลิงก์ใหม่
              </Button>
            </form>
            <form action={assistedAction}>
              <input name="userId" type="hidden" value={row.userId} />
              <input name="targetHospitalId" type="hidden" value={hospitalId} />
              <input name="kind" type="hidden" value={row.kind} />
              <Button
                size="compact"
                type="submit"
              >
                เริ่มแบบช่วยเหลือ
              </Button>
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
    <div>
      <PageHeader
        actions={<StatusBadge variant="info">เจ้าของโรงพยาบาล</StatusBadge>}
        breadcrumbs={[{ label: "บุคลากร" }, { label: "จัดการบุคลากร" }]}
        description="เพิ่มบุคลากรและ อสม. ให้กับโรงพยาบาลที่คุณเป็นเจ้าของโดยตรง"
        title="จัดการบุคลากรโรงพยาบาล"
      />

      <div className="pt-8">
        <Panel>
          <label className="block text-sm font-semibold text-ink" htmlFor="targetHospitalId">
            โรงพยาบาลที่จัดการ
          </label>
          <Select
            className="mt-2 max-w-xl"
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
          </Select>
          <p className="mt-2 text-sm leading-6 text-muted">
            รายการและการดำเนินการทุกครั้งจะตรวจสอบสิทธิ์เจ้าของโรงพยาบาลจากฝั่งเซิร์ฟเวอร์
          </p>
        </Panel>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <Panel>
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">เพิ่มบุคลากรโรงพยาบาล</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                กำหนดวิชาชีพจากฝั่งโรงพยาบาล ระบบจะสร้างสิทธิ์บุคลากรโรงพยาบาลให้เอง
              </p>
            </div>
            <form action={staffAction} className="mt-6 space-y-4">
              <input name="targetHospitalId" type="hidden" value={selectedHospitalId} />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-semibold">
                  <span>ชื่อ</span>
                  <Input name="givenName" required type="text" />
                </label>
                <label className="space-y-2 text-sm font-semibold">
                  <span>นามสกุล</span>
                  <Input name="familyName" required type="text" />
                </label>
              </div>
              <label className="block space-y-2 text-sm font-semibold">
                <span>เลขบัตรประชาชน</span>
                <Input inputMode="numeric" maxLength={13} name="nationalId" pattern="[0-9]{13}" required type="text" />
              </label>
              <label className="block space-y-2 text-sm font-semibold">
                <span>วิชาชีพ</span>
                <Select defaultValue="" name="profession" required>
                  <option disabled value="">เลือกวิชาชีพ</option>
                  {Object.entries(professionLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </label>
              {staffState.status === "ERROR" ? <p className="text-sm leading-6 text-danger" role="alert">{staffState.message}</p> : null}
              {staffState.status === "SUCCESS" ? <ProvisionResult result={staffResult!} /> : null}
              <Button className="w-full" disabled={anyPending} type="submit">
                {staffPending ? "กำลังบันทึก..." : "เพิ่มบุคลากร"}
              </Button>
            </form>
          </Panel>

          <Panel>
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
                  <Input name="givenName" required type="text" />
                </label>
                <label className="space-y-2 text-sm font-semibold">
                  <span>นามสกุล</span>
                  <Input name="familyName" required type="text" />
                </label>
              </div>
              <label className="block space-y-2 text-sm font-semibold">
                <span>เลขบัตรประชาชน</span>
                <Input inputMode="numeric" maxLength={13} name="nationalId" pattern="[0-9]{13}" required type="text" />
              </label>
              <div className="min-h-12 rounded-control border border-dashed border-border bg-surface-muted px-4 py-3 text-sm leading-6 text-text-muted">
                บทบาท อสม. และสถานะความสัมพันธ์กำหนดโดยบริการฝั่งเซิร์ฟเวอร์
              </div>
              {osmState.status === "ERROR" ? <p className="text-sm leading-6 text-danger" role="alert">{osmState.message}</p> : null}
              {osmState.status === "SUCCESS" ? <ProvisionResult result={osmResult!} /> : null}
              <Button className="w-full" disabled={anyPending} type="submit">
                {osmPending ? "กำลังบันทึก..." : "เพิ่ม อสม."}
              </Button>
            </form>
          </Panel>
        </div>

        {remoteState.status === "ERROR" ? <p className="mt-6 text-sm leading-6 text-danger" role="alert">{remoteState.message}</p> : null}
        {remoteResult ? <section className="mt-6"><ActivationResult result={remoteResult} /></section> : null}

        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          {([
            ["บุคลากรโรงพยาบาล", staffRows],
            ["อสม.", osmRows],
          ] as const).map(([title, rows]) => (
            <section className="overflow-hidden rounded-panel border border-border bg-surface" key={title}>
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-6">
                <h2 className="text-xl font-semibold tracking-[-0.02em]">{title}</h2>
                <StatusBadge>{rows.length} รายการ</StatusBadge>
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
    </div>
  );
}
