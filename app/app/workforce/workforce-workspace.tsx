"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, buttonClassName } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  initialWorkforceActivationActionState,
  initialWorkforceBulkActionState,
  initialWorkforceProvisionActionState,
  type WorkforceActivationActionState,
  type WorkforceActivationResultState,
  type WorkforceBulkActionState,
  type WorkforceProvisionActionState,
  type WorkforceProvisionResultState,
} from "@/modules/workforce/transport/action-state";
import {
  provisionHospitalMemberAction,
  provisionOsmAction,
  provisionWorkforceBulkAction,
  regenerateWorkforceActivationAction,
  startAssistedWorkforceActivationAction,
} from "@/modules/workforce/transport/server-actions";
import type { WorkforceKind } from "@/modules/workforce/schemas/workforce-schemas";
import type {
  WorkforceHospital,
  WorkforceListResult,
  WorkforceListRow,
} from "@/modules/workforce/services/workforce-service";

const professionLabels = {
  DOCTOR: "แพทย์",
  NURSE: "พยาบาล",
  COORDINATOR: "ผู้ประสานงาน",
  OTHER: "อื่น ๆ",
} as const;

type WorkforceWorkspaceProps = {
  hospitals: WorkforceHospital[];
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

function ProvisionContinuation({
  result,
}: {
  result: WorkforceProvisionResultState;
}): React.JSX.Element {
  const workforceKind = result.kind === "OSM" ? "osm" : "staff";
  const linkClassName =
    "inline-flex min-h-10 items-center justify-center rounded-control border border-border-strong bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="text-sm font-semibold text-text">ดำเนินการต่อในโรงพยาบาลนี้</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          className={linkClassName}
          href={`/app/workforce/${workforceKind}/${encodeURIComponent(result.relationshipId)}`}
        >
          ดูรายละเอียดความสัมพันธ์
        </Link>
        <Link
          className={linkClassName}
          href={`/app/patients?hospitalId=${encodeURIComponent(result.hospitalId)}`}
        >
          เปิดพื้นที่ผู้ป่วย
        </Link>
        <Link
          className={linkClassName}
          href={`/app/workforce?hospitalId=${encodeURIComponent(result.hospitalId)}`}
        >
          จัดการบุคลากรต่อ
        </Link>
      </div>
    </div>
  );
}

function ProvisionResult({ result }: { result: WorkforceProvisionResultState }): React.JSX.Element {
  const activationToken = result.activationToken;

  if (!activationToken) {
    return (
      <div>
        <Alert variant="success">
          <p className="font-semibold">เพิ่มสิทธิ์เรียบร้อยแล้ว</p>
          <p className="mt-1 text-muted">
            {result.accountStatus === "ACTIVE"
              ? "ผู้ใช้นี้มีบัญชี DEMI ที่เปิดใช้งานอยู่แล้ว ไม่ต้องเปิดใช้งานบัญชีอีกครั้ง"
              : "ระบบบันทึกข้อมูลแล้ว กรุณาออกลิงก์เปิดใช้งานใหม่จากรายการเมื่อจำเป็น"}
          </p>
        </Alert>
        <ProvisionContinuation result={result} />
      </div>
    );
  }

  return (
    <div>
      <ActivationPresentation token={activationToken} expiresAt={result.activationExpiresAt} />
      <ProvisionContinuation result={result} />
    </div>
  );
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
        <div className="flex h-52 w-52 max-w-full shrink-0 items-center justify-center rounded-control bg-surface p-2">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="คิวอาร์โค้ดสำหรับเปิดใช้งาน DEMI" className="h-full w-full" src={qrDataUrl} />
          ) : (
            <span className="text-center text-xs text-muted">กำลังสร้างคิวอาร์โค้ด...</span>
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

const MAX_SLIP_SELECTION = 50;
const MAX_BULK_ROWS = 50;
const INITIAL_BULK_ROWS = 5;

const bulkReasonLabels = {
  INVALID_ROW: "ข้อมูลในแถวไม่ถูกต้อง",
  CONFLICT: "ขัดแย้งกับข้อมูลเดิม",
  UNAVAILABLE: "ระบบไม่พร้อม ลองใหม่ได้",
} as const;

function PendingActivationGroup({
  title,
  kind,
  rows,
  hospitalId,
  remoteAction,
  remotePending,
  anyPending,
}: {
  title: string;
  kind: WorkforceKind;
  rows: WorkforceListRow[];
  hospitalId: string;
  remoteAction: (formData: FormData) => void;
  remotePending: boolean;
  anyPending: boolean;
}): React.JSX.Element {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const slipFormId = `slip-form-${kind}`;
  const allSelected = rows.length > 0 && selected.size >= Math.min(rows.length, MAX_SLIP_SELECTION);

  function toggle(userId: string): void {
    setSelected((current) => {
      const next = new Set(current);

      if (next.has(userId)) {
        next.delete(userId);
      } else if (next.size < MAX_SLIP_SELECTION) {
        next.add(userId);
      }

      return next;
    });
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-panel border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-6">
        <h3 className="text-lg font-semibold tracking-[-0.02em]">{title}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() =>
              setSelected(
                allSelected
                  ? new Set()
                  : new Set(rows.slice(0, MAX_SLIP_SELECTION).map(({ userId }) => userId)),
              )
            }
            size="compact"
            type="button"
            variant="secondary"
          >
            {allSelected ? "ยกเลิกการเลือก" : "เลือกทั้งหมด"}
          </Button>
          {/* Opens the print page in a new tab; credentials are only in that one response. */}
          <form action="/app/workforce/slips" id={slipFormId} method="post" target="_blank">
            <input name="targetHospitalId" type="hidden" value={hospitalId} />
            <input name="kind" type="hidden" value={kind} />
            <Button
              disabled={anyPending || selected.size === 0}
              size="compact"
              type="submit"
            >
              พิมพ์ใบเปิดใช้งาน ({selected.size})
            </Button>
          </form>
        </div>
      </div>
      {rows.length > MAX_SLIP_SELECTION ? (
        <p className="border-b border-line px-4 py-3 text-xs leading-5 text-muted sm:px-6">
          พิมพ์ได้ครั้งละไม่เกิน {MAX_SLIP_SELECTION} คน
        </p>
      ) : null}
      <ul>
        {rows.map((row) => (
          <li
            className="flex flex-col gap-3 border-t border-line px-4 py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:px-6"
            key={row.userId}
          >
            <label className="flex min-w-0 items-start gap-3">
              <input
                checked={selected.has(row.userId)}
                className="mt-1 h-5 w-5 shrink-0"
                disabled={anyPending}
                form={slipFormId}
                name="userId"
                onChange={() => toggle(row.userId)}
                type="checkbox"
                value={row.userId}
              />
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{row.displayName}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <StatusBadge variant={row.activationStatus === "PENDING" ? "warning" : "danger"}>
                    {row.activationStatus === "PENDING" ? "รอเปิดใช้งาน" : "ลิงก์หมดอายุ"}
                  </StatusBadge>
                  <span>
                    {row.activationExpiresAt
                      ? `ลิงก์ล่าสุดหมดอายุ ${formatDate(row.activationExpiresAt)}`
                      : "ยังไม่มีลิงก์ที่ใช้งานได้"}
                  </span>
                </span>
              </span>
            </label>
            <form action={remoteAction}>
              <input name="userId" type="hidden" value={row.userId} />
              <input name="targetHospitalId" type="hidden" value={hospitalId} />
              <input name="kind" type="hidden" value={row.kind} />
              <Button
                disabled={anyPending}
                loading={remotePending}
                size="compact"
                type="submit"
                variant="secondary"
              >
                ออกลิงก์ใหม่
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PendingActivationSection({
  rows,
  hospitalId,
  remoteAction,
  remotePending,
  anyPending,
}: {
  rows: WorkforceListRow[];
  hospitalId: string;
  remoteAction: (formData: FormData) => void;
  remotePending: boolean;
  anyPending: boolean;
}): React.JSX.Element | null {
  const pending = rows.filter(
    (row) => row.activationStatus !== null && row.membershipType !== "OWNER",
  );

  if (pending.length === 0) {
    return null;
  }

  const groups = [
    ["บุคลากรโรงพยาบาลที่รอเปิดใช้งาน", "HOSPITAL_MEMBER"],
    ["อสม. ที่รอเปิดใช้งาน", "OSM"],
  ] as const;

  return (
    <section className="mt-8 scroll-mt-24" id="workforce-pending" tabIndex={-1}>
      <h2 className="text-xl font-semibold tracking-[-0.02em]">รอเปิดใช้งาน</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        เลือกรายชื่อเพื่อพิมพ์ใบเปิดใช้งาน ระบบจะออกลิงก์ใหม่ให้ทุกคนที่เลือกและยกเลิกลิงก์เดิม
        ลิงก์ใช้ได้ 72 ชั่วโมงและใช้ได้ครั้งเดียว ผู้ใช้ต้องกรอกเลขบัตรประชาชนของตนเอง
      </p>
      <div className="mt-4 grid gap-6 @5xl/workspace:grid-cols-2">
        {groups.map(([title, kind]) => {
          const groupRows = pending.filter((row) => row.kind === kind);

          return groupRows.length > 0 ? (
            <PendingActivationGroup
              anyPending={anyPending}
              hospitalId={hospitalId}
              key={kind}
              kind={kind}
              remoteAction={remoteAction}
              remotePending={remotePending}
              rows={groupRows}
              title={title}
            />
          ) : null;
        })}
      </div>
    </section>
  );
}

function BulkAddPanel({
  hospitalId,
  canAddStaff,
  state,
  action,
  pending,
  anyPending,
}: {
  hospitalId: string;
  canAddStaff: boolean;
  state: WorkforceBulkActionState;
  action: (formData: FormData) => void;
  pending: boolean;
  anyPending: boolean;
}): React.JSX.Element {
  const [kind, setKind] = useState<WorkforceKind>(canAddStaff ? "HOSPITAL_MEMBER" : "OSM");
  const [rowCount, setRowCount] = useState(INITIAL_BULK_ROWS);
  const duplicateRows = new Set(state.status === "ERROR" ? (state.duplicateRowNumbers ?? []) : []);
  const result = state.status === "SUCCESS" ? state.result : null;
  const counts = {
    created: result?.rows.filter(({ status }) => status === "created").length ?? 0,
    existing: result?.rows.filter(({ status }) => status === "existing").length ?? 0,
    invalid: result?.rows.filter(({ status }) => status === "invalid").length ?? 0,
  };

  return (
    <Panel className="mt-6">
      <details>
        <summary className="cursor-pointer text-xl font-semibold tracking-[-0.02em]">
          เพิ่มหลายคน
        </summary>
        <p className="mt-2 text-sm leading-6 text-muted">
          เพิ่มได้ครั้งละไม่เกิน {MAX_BULK_ROWS} คน ครั้งละหนึ่งประเภท ระบบบันทึกทีละแถว แถวที่มีอยู่แล้วจะไม่ถูกสร้างซ้ำ
          เลขบัตรประชาชนต้องไม่ซ้ำกันในรายการที่ส่ง หลังบันทึกให้พิมพ์ใบเปิดใช้งานจากส่วน &quot;รอเปิดใช้งาน&quot;
        </p>
        <form action={action} className="mt-6 space-y-4">
          <input name="targetHospitalId" type="hidden" value={hospitalId} />
          <label className="block max-w-xs space-y-2 text-sm font-semibold">
            <span>ประเภท</span>
            <Select
              name="kind"
              onChange={(event) => setKind(event.target.value === "OSM" ? "OSM" : "HOSPITAL_MEMBER")}
              value={kind}
            >
              {canAddStaff ? <option value="HOSPITAL_MEMBER">บุคลากรโรงพยาบาล</option> : null}
              <option value="OSM">อสม.</option>
            </Select>
          </label>
          <div className="space-y-3">
            {Array.from({ length: rowCount }, (_, index) => (
              <div
                className={`grid gap-3 rounded-control border p-3 sm:grid-cols-2 ${
                  duplicateRows.has(index + 1) ? "border-danger" : "border-border"
                } ${kind === "HOSPITAL_MEMBER" ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
                key={index}
              >
                <label className="space-y-1 text-xs font-semibold">
                  <span>แถว {index + 1} · เลขบัตรประชาชน</span>
                  <Input inputMode="numeric" maxLength={13} name="nationalId" pattern="[0-9]{13}" type="text" />
                </label>
                <label className="space-y-1 text-xs font-semibold">
                  <span>ชื่อ</span>
                  <Input name="givenName" type="text" />
                </label>
                <label className="space-y-1 text-xs font-semibold">
                  <span>นามสกุล</span>
                  <Input name="familyName" type="text" />
                </label>
                {kind === "HOSPITAL_MEMBER" ? (
                  <label className="space-y-1 text-xs font-semibold">
                    <span>วิชาชีพ</span>
                    <Select defaultValue="" name="profession">
                      <option value="">เลือกวิชาชีพ</option>
                      {Object.entries(professionLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </Select>
                  </label>
                ) : null}
              </div>
            ))}
          </div>
          {rowCount < MAX_BULK_ROWS ? (
            <Button
              disabled={anyPending}
              onClick={() => setRowCount((count) => Math.min(MAX_BULK_ROWS, count + 5))}
              size="compact"
              type="button"
              variant="secondary"
            >
              เพิ่มแถว
            </Button>
          ) : null}
          {state.status === "ERROR" ? <Alert variant="danger">{state.message}</Alert> : null}
          {result ? (
            <Alert variant={counts.invalid > 0 ? "warning" : "success"}>
              <p className="font-semibold">
                สร้างใหม่ {counts.created} · มีอยู่แล้ว {counts.existing} · ไม่สำเร็จ {counts.invalid}
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {result.rows.map((row) => (
                  <li key={row.rowNumber}>
                    แถว {row.rowNumber}:{" "}
                    {row.status === "invalid"
                      ? `ไม่สำเร็จ · ${bulkReasonLabels[row.reason]}`
                      : row.status === "created"
                        ? "สร้างแล้ว"
                        : "มีอยู่ในโรงพยาบาลนี้แล้ว"}
                  </li>
                ))}
              </ul>
            </Alert>
          ) : null}
          <Button className="w-full" disabled={anyPending} loading={pending} type="submit">
            {pending ? "กำลังบันทึก..." : "บันทึกทั้งหมด"}
          </Button>
        </form>
      </details>
    </Panel>
  );
}

function WorkforceRow({
  row,
  hospitalId,
  remoteAction,
  remotePending,
  assistedAction,
  assistedPending,
  anyPending,
}: {
  row: WorkforceListRow;
  hospitalId: string;
  remoteAction: (formData: FormData) => void;
  remotePending: boolean;
  assistedAction: (formData: FormData) => void;
  assistedPending: boolean;
  anyPending: boolean;
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
            {row.kind === "OSM"
              ? "อสม."
              : row.membershipType === "OWNER"
                ? "เจ้าของโรงพยาบาล"
                : `บุคลากรโรงพยาบาล · ${row.profession ? professionLabels[row.profession] : "ยังไม่ระบุวิชาชีพ"}`}
          </p>
        </div>
        <StatusBadge variant={statusVariant}>
          {statusLabel}
        </StatusBadge>
      </div>

      <Link
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        href={`/app/workforce/${row.kind === "OSM" ? "osm" : "staff"}/${encodeURIComponent(row.id)}`}
      >
        ดูรายละเอียดความสัมพันธ์
      </Link>

      {row.activationRequired && row.membershipType !== "OWNER" ? (
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
                disabled={anyPending}
                loading={remotePending}
                size="compact"
                type="submit"
                variant="secondary"
              >
                {remotePending ? "กำลังออกลิงก์..." : "ออกลิงก์ใหม่"}
              </Button>
            </form>
            <form action={assistedAction}>
              <input name="userId" type="hidden" value={row.userId} />
              <input name="targetHospitalId" type="hidden" value={hospitalId} />
              <input name="kind" type="hidden" value={row.kind} />
              <Button
                disabled={anyPending}
                loading={assistedPending}
                size="compact"
                type="submit"
              >
                {assistedPending ? "กำลังเตรียมการช่วยเหลือ..." : "เริ่มแบบช่วยเหลือ"}
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
  const [bulkState, bulkAction, bulkPending] = useActionState<WorkforceBulkActionState, FormData>(
    provisionWorkforceBulkAction,
    initialWorkforceBulkActionState,
  );
  const isOwner = workforce.viewerScope === "OWNER";

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
  const anyPending =
    staffPending || osmPending || remotePending || assistedPending || bulkPending;

  return (
    <div className="content-workspace break-words">
      <PageHeader
        actions={
          <StatusBadge variant="info">{isOwner ? "เจ้าของโรงพยาบาล" : "สมาชิกโรงพยาบาล"}</StatusBadge>
        }
        breadcrumbs={[{ label: "งานโรงพยาบาล", href: `/app#hospital-workspace-${encodeURIComponent(selectedHospitalId)}` }, { label: "จัดการบุคลากร" }]}
        description={
          isOwner
            ? "เพิ่มบุคลากรและ อสม. รวมถึงจัดการบทบาทเจ้าของโรงพยาบาลและสมาชิกในโรงพยาบาลที่คุณดูแล"
            : "เพิ่ม อสม. และดูแลการเปิดใช้งานบัญชี อสม. ของโรงพยาบาลที่คุณเป็นสมาชิก"
        }
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
            รายชื่อและการดำเนินการเป็นของ {workforce.hospital.name} · {workforce.hospital.hospitalCode} เท่านั้น ใช้สิทธิ์{isOwner ? "เจ้าของ" : "สมาชิก"}โรงพยาบาลโดยตรง ไม่ใช่รายชื่อผู้ใช้ทั้งระบบ
          </p>
        </Panel>

        <nav aria-label="ส่วนงานบุคลากรโรงพยาบาล" className="mt-5 flex flex-wrap gap-2">
          <Link className={buttonClassName({ variant: "secondary", className: "whitespace-normal" })} href="#workforce-roster" prefetch={false}>รายชื่อในโรงพยาบาล</Link>
          <Link className={buttonClassName({ variant: "secondary", className: "whitespace-normal" })} href="#workforce-provision" prefetch={false}>{isOwner ? "แบบฟอร์มเพิ่มบุคลากรและ อสม." : "แบบฟอร์มเพิ่ม อสม."}</Link>
        </nav>

        {assistedState.status === "ERROR" ? <Alert className="mt-6" variant="danger">{assistedState.message}</Alert> : null}
        {remoteState.status === "ERROR" ? <Alert className="mt-6" variant="danger">{remoteState.message}</Alert> : null}
        {remoteResult ? <section className="mt-6"><ActivationResult result={remoteResult} /></section> : null}

        <PendingActivationSection
          anyPending={anyPending}
          hospitalId={selectedHospitalId}
          remoteAction={remoteAction}
          remotePending={remotePending}
          rows={workforce.rows}
        />

        <div className={`mt-8 grid scroll-mt-24 gap-6 ${isOwner ? "@5xl/workspace:grid-cols-2" : ""}`} id="workforce-roster" tabIndex={-1}>
          {(isOwner
            ? ([
                ["บุคลากรโรงพยาบาล", staffRows],
                ["อสม.", osmRows],
              ] as const)
            : ([["อสม.", osmRows]] as const)
          ).map(([title, rows]) => (
            <section className="min-w-0 overflow-hidden rounded-panel border border-border bg-surface" key={title}>
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
                      assistedPending={assistedPending}
                      anyPending={anyPending}
                      hospitalId={selectedHospitalId}
                      key={`${row.kind}-${row.id}`}
                      remoteAction={remoteAction}
                      remotePending={remotePending}
                      row={row}
                    />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <div className={`mt-6 grid scroll-mt-24 gap-6 ${isOwner ? "@5xl/workspace:grid-cols-2" : ""}`} id="workforce-provision" tabIndex={-1}>
          {isOwner ? (
          <Panel>
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em]">เพิ่มบุคลากรโรงพยาบาล</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                เพิ่มสมาชิกและเลือกวิชาชีพ วิชาชีพไม่ให้สิทธิ์เจ้าของโรงพยาบาล การเปลี่ยนบทบาทเจ้าของทำในรายละเอียดความสัมพันธ์ตามสิทธิ์
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
              {staffState.status === "ERROR" ? <Alert className="mt-2" variant="danger">{staffState.message}</Alert> : null}
              {staffState.status === "SUCCESS" ? <ProvisionResult result={staffResult!} /> : null}
              <Button className="w-full" disabled={anyPending} loading={staffPending} type="submit">
                {staffPending ? "กำลังบันทึก..." : "เพิ่มบุคลากร"}
              </Button>
            </form>
          </Panel>
          ) : null}

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
                ระบบจะกำหนดบทบาท อสม. และสถานะความสัมพันธ์ให้ตามขั้นตอนนี้
              </div>
              {osmState.status === "ERROR" ? <Alert className="mt-2" variant="danger">{osmState.message}</Alert> : null}
              {osmState.status === "SUCCESS" ? <ProvisionResult result={osmResult!} /> : null}
              <Button className="w-full" disabled={anyPending} loading={osmPending} type="submit">
                {osmPending ? "กำลังบันทึก..." : "เพิ่ม อสม."}
              </Button>
            </form>
          </Panel>
        </div>

        <BulkAddPanel
          action={bulkAction}
          anyPending={anyPending}
          canAddStaff={isOwner}
          hospitalId={selectedHospitalId}
          pending={bulkPending}
          state={bulkState}
        />
      </div>
    </div>
  );
}
