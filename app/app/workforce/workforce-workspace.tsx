"use client";

import Form from "next/form";
import Link from "next/link";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, buttonClassName } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { submitPreservingInput, useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
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
    (row) => row.activationStatus !== null && row.activationStatus !== "IN_PROGRESS" && row.membershipType !== "OWNER",
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
              key={`${kind}:${groupRows.map((row) => row.id).join(",")}`}
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
  serverTime,
  canAddStaff,
  state,
  action,
  pending,
  anyPending,
  unknownOutcome,
}: {
  hospitalId: string;
  serverTime: number;
  canAddStaff: boolean;
  state: WorkforceBulkActionState;
  action: (formData: FormData) => void;
  pending: boolean;
  anyPending: boolean;
  unknownOutcome: boolean;
}): React.JSX.Element {
  const [kind, setKind] = useState<WorkforceKind>(canAddStaff ? "HOSPITAL_MEMBER" : "OSM");
  const [rowCount, setRowCount] = useState(INITIAL_BULK_ROWS);
  const [formRows, setFormRows] = useState(() => Array.from({ length: MAX_BULK_ROWS }, () => ({ nationalId: "", givenName: "", familyName: "", profession: "" })));
  function updateRow(index: number, field: keyof (typeof formRows)[number], value: string): void {
    setFormRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
  }
  const [submissionId, setSubmissionId] = useState("");
  const [showOutcome, setShowOutcome] = useState(true);
  const clock = useRef({ serverTime, receivedAt: 0 });
  const storageKey = `demi:workforce-bulk:${hospitalId}:${kind}`;
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      clock.current = { serverTime, receivedAt: performance.now() };
      let stored: string | null = null;
      try { stored = sessionStorage.getItem(storageKey); } catch { /* Storage may be unavailable. */ }
      const issuedAt = Number(stored?.split(".")[0]);
      const key = stored && issuedAt <= serverTime + 60_000 && issuedAt > serverTime - 30 * 24 * 60 * 60 * 1000
        ? stored : `${serverTime}.${crypto.randomUUID()}`;
      try { sessionStorage.setItem(storageKey, key); } catch { /* In-page retries still use this key. */ }
      setSubmissionId(key);
    });
    return () => { active = false; };
  }, [storageKey, serverTime]);
  function startNewSubmission(): void {
    const key = `${Math.floor(clock.current.serverTime + performance.now() - clock.current.receivedAt)}.${crypto.randomUUID()}`;
    try { sessionStorage.setItem(storageKey, key); } catch { /* Keep the key in component state. */ }
    setSubmissionId(key);
    setShowOutcome(false);
  }
  const duplicateRows = new Set(showOutcome && state.status === "ERROR" ? (state.duplicateRowNumbers ?? []) : []);
  const result = showOutcome && state.status === "SUCCESS" ? state.result : null;
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
        <form action={action} className="mt-6 space-y-4" onSubmit={() => setShowOutcome(true)}>
          <input name="submissionId" type="hidden" value={submissionId} />
          <input name="targetHospitalId" type="hidden" value={hospitalId} />
          <label className="block max-w-xs space-y-2 text-sm font-semibold">
            <span>ประเภท</span>
            <Select
              name="kind"
              onChange={(event) => { setKind(event.target.value === "OSM" ? "OSM" : "HOSPITAL_MEMBER"); setSubmissionId(""); setShowOutcome(false); }}
              disabled={anyPending}
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
                  <Input disabled={anyPending} value={formRows[index].nationalId} onChange={(event) => updateRow(index, "nationalId", event.target.value)} inputMode="numeric" maxLength={13} name="nationalId" pattern="[0-9]{13}" type="text" />
                </label>
                <label className="space-y-1 text-xs font-semibold">
                  <span>ชื่อ</span>
                  <Input disabled={anyPending} value={formRows[index].givenName} onChange={(event) => updateRow(index, "givenName", event.target.value)} maxLength={120} name="givenName" type="text" />
                </label>
                <label className="space-y-1 text-xs font-semibold">
                  <span>นามสกุล</span>
                  <Input disabled={anyPending} value={formRows[index].familyName} onChange={(event) => updateRow(index, "familyName", event.target.value)} maxLength={120} name="familyName" type="text" />
                </label>
                {kind === "HOSPITAL_MEMBER" ? (
                  <label className="space-y-1 text-xs font-semibold">
                    <span>วิชาชีพ</span>
                    <Select disabled={anyPending} value={formRows[index].profession} onChange={(event) => updateRow(index, "profession", event.target.value)} name="profession">
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
          {showOutcome && state.status === "ERROR" ? <Alert variant="danger">{state.message}</Alert> : null}
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
          <p className="text-sm leading-6 text-muted">
            หากคำขอขาดการเชื่อมต่อ ให้ส่งข้อมูลเดิมอีกครั้งเพื่อรับผลของรายการเดิม ผลที่บันทึกแล้วจะไม่ถูกสร้างซ้ำ
            หากแก้ข้อมูล ให้เริ่มรายการใหม่ ผลสำเร็จของรายการเดิมยังคงอยู่ รหัสรายการใช้ได้ 30 วัน
            หากโหลดหน้าใหม่ ให้กรอกข้อมูลเดิมอีกครั้ง รหัสรายการเดิมจะยังอยู่ในแท็บนี้เมื่อเบราว์เซอร์รองรับ
          </p>
          {unknownOutcome && !pending ? (
            <Alert role="alert" variant="warning">
              ระบบยังยืนยันผลการบันทึกไม่ได้ กรุณากด “บันทึกทั้งหมด” อีกครั้งโดยไม่แก้ข้อมูล เพื่อรับผลของรายการเดิม
            </Alert>
          ) : null}
          <Button disabled={anyPending} onClick={startNewSubmission} type="button" variant="secondary">เริ่มรายการใหม่หลังแก้ข้อมูล</Button>
          <Button className="w-full" disabled={anyPending || !submissionId} loading={pending} type="submit">
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
  const isEnded = row.relationshipStatus === "ENDED";
  const statusLabel = isEnded ? "นำออกจากระบบถาวรแล้ว" : isActive
    ? "พร้อมใช้งาน"
    : isSuspended
      ? "ถูกระงับ"
      : isInvited
        ? "อยู่ระหว่างเชิญ"
        : "รอเปิดใช้งาน";
  const statusVariant = isEnded ? "neutral" : isActive
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

      {!isEnded && row.activationRequired && row.membershipType !== "OWNER" ? (
        <div className="mt-4 flex flex-col gap-3 rounded-control bg-surface-muted px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs leading-5 text-muted">
            <p>{row.activationStatus === "IN_PROGRESS" ? "กำลังเปิดใช้งานหรือรอตรวจสอบผล กรุณาติดต่อผู้ดูแลหากค้างนาน" : "บัญชีและความสัมพันธ์ยังไม่เปิดใช้งาน"}</p>
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
                disabled={anyPending || row.activationStatus === "IN_PROGRESS"}
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
                disabled={anyPending || row.activationStatus === "IN_PROGRESS"}
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
  const [hospitalSwitching, startHospitalSwitch] = useTransition();
  const [staffState, staffAction, staffPending, staffUnknown, resendStaff] = useMutationActionState<
    WorkforceProvisionActionState,
    FormData
  >(provisionHospitalMemberAction, initialWorkforceProvisionActionState);
  const [osmState, osmAction, osmPending, osmUnknown, resendOsm] = useMutationActionState<
    WorkforceProvisionActionState,
    FormData
  >(provisionOsmAction, initialWorkforceProvisionActionState);
  const [remoteState, remoteAction, remotePending, remoteUnknown, resendRemote] = useMutationActionState<
    WorkforceActivationActionState,
    FormData
  >(regenerateWorkforceActivationAction, initialWorkforceActivationActionState);
  const [assistedState, assistedAction, assistedPending, assistedUnknown, resendAssisted] = useMutationActionState<
    WorkforceActivationActionState,
    FormData
  >(startAssistedWorkforceActivationAction, initialWorkforceActivationActionState);
  const [bulkState, bulkAction, bulkPending, bulkUnknown] = useMutationActionState<WorkforceBulkActionState, FormData>(
    provisionWorkforceBulkAction,
    initialWorkforceBulkActionState,
  );
  const isOwner = workforce.viewerScope === "OWNER";
  const pageInfo = workforce.pageInfo;
  function directoryHref(kind: "HOSPITAL_MEMBER" | "OSM"): string {
    const params = new URLSearchParams({ hospitalId: selectedHospitalId });
    if (pageInfo.search) params.set("search", pageInfo.search);
    if (pageInfo.status) params.set("status", pageInfo.status);
    const staff = kind === "HOSPITAL_MEMBER" ? pageInfo.staffNextCursor : pageInfo.staffCursor;
    const osm = kind === "OSM" ? pageInfo.osmNextCursor : pageInfo.osmCursor;
    if (staff && isOwner) params.set("staffCursor", staff);
    if (osm) params.set("osmCursor", osm);
    return `/app/workforce?${params.toString()}`;
  }

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
  // Bulk submissions are keyed and safe to resend, so only the other actions block on an unconfirmed outcome.
  const actionsBlocked = anyPending || staffUnknown || osmUnknown || remoteUnknown || assistedUnknown;
  const staffFormRef = useRef<HTMLFormElement>(null);
  const osmFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (staffState.status === "SUCCESS") staffFormRef.current?.reset();
  }, [staffState]);

  useEffect(() => {
    if (osmState.status === "SUCCESS") osmFormRef.current?.reset();
  }, [osmState]);

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
            disabled={hospitalSwitching}
            onChange={(event) => {
              const hospitalId = event.target.value;
              startHospitalSwitch(() => {
                router.push(`/app/workforce?hospitalId=${encodeURIComponent(hospitalId)}`);
              });
            }}
            value={selectedHospitalId}
          >
            {hospitals.map((hospital) => (
              <option key={hospital.id} value={hospital.id}>
                {hospital.name} · {hospital.hospitalCode}
              </option>
            ))}
          </Select>
          {hospitalSwitching ? <p className="mt-2 text-sm text-text-muted" role="status">กำลังเปลี่ยนโรงพยาบาล...</p> : null}
          <p className="mt-2 text-sm leading-6 text-muted">
            รายชื่อและการดำเนินการเป็นของ {workforce.hospital.name} · {workforce.hospital.hospitalCode} เท่านั้น ใช้สิทธิ์{isOwner ? "เจ้าของ" : "สมาชิก"}โรงพยาบาลโดยตรง ไม่ใช่รายชื่อผู้ใช้ทั้งระบบ
          </p>
        </Panel>

        <nav aria-label="ส่วนงานบุคลากรโรงพยาบาล" className="mt-5 flex flex-wrap gap-2">
          <Link className={buttonClassName({ variant: "secondary", className: "whitespace-normal" })} href="#workforce-roster" prefetch={false}>รายชื่อในโรงพยาบาล</Link>
          <Link className={buttonClassName({ variant: "secondary", className: "whitespace-normal" })} href="#workforce-provision" prefetch={false}>{isOwner ? "แบบฟอร์มเพิ่มบุคลากรและ อสม." : "แบบฟอร์มเพิ่ม อสม."}</Link>
        </nav>

        <UnknownOutcomeAlert active={remoteUnknown} className="mt-6" recovery={{ kind: "resend", onResend: resendRemote, resending: remotePending }} />
        <UnknownOutcomeAlert active={assistedUnknown} className="mt-6" recovery={{ kind: "resend", onResend: resendAssisted, resending: assistedPending }} />
        {assistedState.status === "ERROR" ? <Alert className="mt-6" variant="danger">{assistedState.message}</Alert> : null}
        {remoteState.status === "ERROR" ? <Alert className="mt-6" variant="danger">{remoteState.message}</Alert> : null}
        {remoteResult ? <section className="mt-6"><ActivationResult result={remoteResult} /></section> : null}

        <Panel className="mt-6">
          <Form action="/app/workforce" className="flex flex-wrap items-end gap-3">
            <input name="hospitalId" type="hidden" value={selectedHospitalId} />
            <label className="min-w-0 flex-1 space-y-2 text-sm font-semibold">
              <span>ค้นหาชื่อหรือนามสกุล</span>
              <Input defaultValue={pageInfo.search} key={pageInfo.search} maxLength={120} name="search" type="search" />
            </label>
            <label className="space-y-2 text-sm font-semibold">
              <span>สถานะความสัมพันธ์</span>
              <Select name="status" defaultValue={pageInfo.status ?? ""} key={pageInfo.status ?? "all"}>
                <option value="">ทุกสถานะ</option>
                <option value="PROVISIONED">รอเปิดใช้งาน</option>
                <option value="INVITED">รอตอบรับ</option>
                <option value="ACTIVE">ใช้งานอยู่</option>
                <option value="SUSPENDED">ระงับ</option>
                <option value="ENDED">นำออกจากระบบถาวร</option>
              </Select>
            </label>
            <PendingSubmitButton pendingLabel="กำลังค้นหา...">ค้นหา</PendingSubmitButton>
          </Form>
          <p className="mt-3 text-sm text-muted">แสดงครั้งละไม่เกิน {pageInfo.pageSize} รายการต่อประเภท รวมรายการรอเปิดใช้งานเฉพาะหน้านี้</p>
        </Panel>

        <PendingActivationSection
          anyPending={actionsBlocked}
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
                <p className="px-4 py-10 text-center text-sm leading-6 text-muted sm:px-6">ไม่พบรายการในหน้านี้หรือไม่ตรงกับการค้นหา</p>
              ) : (
                <ul>
                  {rows.map((row) => (
                    <WorkforceRow
                      assistedAction={assistedAction}
                      assistedPending={assistedPending}
                      anyPending={actionsBlocked}
                      hospitalId={selectedHospitalId}
                      key={`${row.kind}-${row.id}`}
                      remoteAction={remoteAction}
                      remotePending={remotePending}
                      row={row}
                    />
                  ))}
                </ul>
              )}
              <nav aria-label={`หน้ารายชื่อ${title}`} className="flex flex-wrap items-center gap-4 border-t border-line px-4 py-4 sm:px-6">
                {(title === "อสม." ? pageInfo.osmNextCursor : pageInfo.staffNextCursor) ? (
                  <Link className={buttonClassName({ variant: "secondary", size: "compact" })} href={directoryHref(title === "อสม." ? "OSM" : "HOSPITAL_MEMBER")}>หน้าถัดไป</Link>
                ) : <span className="text-sm text-muted">สิ้นสุดรายการ</span>}
                <Link className="text-sm font-semibold underline" href={`/app/workforce?${new URLSearchParams({ hospitalId: selectedHospitalId, search: pageInfo.search, ...(pageInfo.status ? { status: pageInfo.status } : {}) }).toString()}`}>กลับหน้าแรก</Link>
              </nav>
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
            <form action={staffAction} className="mt-6 space-y-4" onSubmit={submitPreservingInput(staffAction)} ref={staffFormRef}>
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
              <UnknownOutcomeAlert active={staffUnknown} recovery={{ kind: "resend", onResend: resendStaff, resending: staffPending }} />
              <Button className="w-full" disabled={actionsBlocked} loading={staffPending} type="submit">
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
            <form action={osmAction} className="mt-6 space-y-4" onSubmit={submitPreservingInput(osmAction)} ref={osmFormRef}>
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
              <UnknownOutcomeAlert active={osmUnknown} recovery={{ kind: "resend", onResend: resendOsm, resending: osmPending }} />
              <Button className="w-full" disabled={actionsBlocked} loading={osmPending} type="submit">
                {osmPending ? "กำลังบันทึก..." : "เพิ่ม อสม."}
              </Button>
            </form>
          </Panel>
        </div>

        <BulkAddPanel
          action={bulkAction}
          serverTime={pageInfo.serverTime}
          anyPending={actionsBlocked}
          canAddStaff={isOwner}
          hospitalId={selectedHospitalId}
          pending={bulkPending}
          state={bulkState}
          unknownOutcome={bulkUnknown}
        />
      </div>
    </div>
  );
}
