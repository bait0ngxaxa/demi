"use client";

import Form from "next/form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, buttonClassName } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { initialWorkforceBulkActionState, type WorkforceBulkActionState } from "@/modules/workforce/transport/action-state";
import { provisionWorkforceBulkAction } from "@/modules/workforce/transport/server-actions";
import type { WorkforceHospital, WorkforceListResult, WorkforceListRow } from "@/modules/workforce/services/workforce-service";
import {
  classifyWorkforceState,
  formString,
  useScopedMutation,
  useScopedMutationSession,
  type MutationNotice,
  type MutationVerdict,
} from "./scoped-mutation";

const MAX_BULK_ROWS = 50;
const INITIAL_BULK_ROWS = 5;
const MAX_SLIP_SELECTION = 50;

const professionLabels = {
  DOCTOR: "แพทย์",
  NURSE: "พยาบาล",
  COORDINATOR: "ผู้ประสานงาน",
  OTHER: "อื่น ๆ",
} as const;

const bulkReasonLabels = {
  INVALID_ROW: "ข้อมูลในแถวไม่ถูกต้อง",
  CONFLICT: "ข้อมูลขัดแย้งกับรายการเดิม กรุณาตรวจสอบและลองใหม่",
  ROLE_INCOMPATIBLE: "ไม่สามารถเพิ่มเป็นบุคลากรโรงพยาบาลและ อสม. พร้อมกันได้",
  UNAVAILABLE: "ระบบไม่พร้อม ลองใหม่ได้",
} as const;

type WorkforceImportWorkspaceProps = {
  hospitals: WorkforceHospital[];
  selectedHospitalId: string;
  hospitalName: string;
  serverTime: number;
  rows: WorkforceListRow[];
  pageInfo: WorkforceListResult["pageInfo"];
};

function bulkRequestMatches(state: WorkforceBulkActionState, formData: FormData): boolean {
  return state.status === "SUCCESS" && state.result.rows.length > 0 &&
    state.result.hospitalId === formString(formData, "targetHospitalId") &&
    state.result.kind === formString(formData, "kind");
}

function bulkNotice(
  verdict: MutationVerdict,
  state: WorkforceBulkActionState,
  formData: FormData,
): MutationNotice | null {
  const isStaff = formString(formData, "kind") !== "OSM";
  if (verdict === "SUCCESS" && state.status === "SUCCESS") {
    const invalid = state.result.rows.filter(({ status }) => status === "invalid").length;
    if (invalid === 0) return { level: "success", message: isStaff ? "บันทึกรายการบุคลากรแล้ว" : "บันทึกรายการ อสม. แล้ว" };
    return {
      level: "warning",
      message: invalid === state.result.rows.length
        ? "ไม่มีรายการที่บันทึกสำเร็จ กรุณาตรวจสอบข้อมูลรายแถว"
        : "บันทึกได้บางรายการ กรุณาตรวจสอบผลรายแถว",
    };
  }
  if (verdict === "CONFLICT") return { level: "warning", message: "ไม่สามารถบันทึกรายการได้ กรุณาตรวจสอบรายการล่าสุด" };
  if (verdict === "FORBIDDEN") return { level: "error", message: isStaff ? "ไม่มีสิทธิ์เพิ่มบุคลากรของโรงพยาบาลนี้" : "ไม่มีสิทธิ์เพิ่ม อสม. ของโรงพยาบาลนี้" };
  return null;
}

function BulkAddPanel({
  hospitalId,
  serverTime,
  state,
  action,
  pending,
  unknownOutcome,
}: {
  hospitalId: string;
  serverTime: number;
  state: WorkforceBulkActionState;
  action: (formData: FormData) => void;
  pending: boolean;
  unknownOutcome: boolean;
}): React.JSX.Element {
  const [kind, setKind] = useState<"HOSPITAL_MEMBER" | "OSM">("HOSPITAL_MEMBER");
  const [rowCount, setRowCount] = useState(INITIAL_BULK_ROWS);
  const [formRows, setFormRows] = useState(() => Array.from({ length: MAX_BULK_ROWS }, () => ({ nationalId: "", givenName: "", familyName: "", profession: "", contactPhone: "" })));
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
  }, [serverTime, storageKey]);

  function updateRow(index: number, field: keyof (typeof formRows)[number], value: string): void {
    setFormRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
  }

  function startNewSubmission(): void {
    const key = `${Math.floor(clock.current.serverTime + performance.now() - clock.current.receivedAt)}.${crypto.randomUUID()}`;
    try { sessionStorage.setItem(storageKey, key); } catch { /* Keep the key in component state. */ }
    setSubmissionId(key);
    setShowOutcome(false);
  }

  const outcomeVisible = showOutcome && state.status !== "IDLE";
  const duplicateRows = new Set(outcomeVisible && state.status === "ERROR" ? (state.duplicateRowNumbers ?? []) : []);
  const result = outcomeVisible && state.status === "SUCCESS" && state.result.hospitalId === hospitalId && state.result.kind === kind
    ? state.result : null;
  const counts = {
    created: result?.rows.filter(({ status }) => status === "created").length ?? 0,
    existing: result?.rows.filter(({ status }) => status === "existing").length ?? 0,
    invalid: result?.rows.filter(({ status }) => status === "invalid").length ?? 0,
  };

  return (
    <Panel>
      <details>
        <summary className="cursor-pointer text-xl font-semibold tracking-[-0.02em]">เพิ่มหลายคน</summary>
        <p className="mt-2 text-sm leading-6 text-muted">
          เพิ่มได้ครั้งละไม่เกิน {MAX_BULK_ROWS} คน ครั้งละหนึ่งประเภท ระบบบันทึกทีละแถว แถวที่มีอยู่แล้วจะไม่ถูกสร้างซ้ำ
          เลขบัตรประชาชนต้องไม่ซ้ำกันในรายการที่ส่ง หลังบันทึกให้พิมพ์ใบเปิดใช้งานจากส่วน &quot;รอเปิดใช้งาน&quot;
        </p>
        <form action={action} className="mt-6 space-y-4" onSubmit={() => setShowOutcome(true)}>
          {kind === "OSM" ? <p className="text-sm text-muted" id="bulk-osm-phone-help">เบอร์นี้จะแสดงให้ผู้ป่วยที่ อสม. ดูแลเห็น</p> : null}
          <input name="submissionId" type="hidden" value={submissionId} />
          <input name="targetHospitalId" type="hidden" value={hospitalId} />
          <label className="block max-w-xs space-y-2 text-sm font-semibold">
            <span>ประเภท</span>
            <Select
              disabled={pending}
              name="kind"
              onChange={(event) => { setKind(event.target.value === "OSM" ? "OSM" : "HOSPITAL_MEMBER"); setSubmissionId(""); setShowOutcome(false); }}
              value={kind}
            >
              <option value="HOSPITAL_MEMBER">บุคลากรโรงพยาบาล</option>
              <option value="OSM">อสม.</option>
            </Select>
          </label>
          <div className="space-y-3">
            {Array.from({ length: rowCount }, (_, index) => (
              <div className={`grid gap-3 rounded-control border p-3 sm:grid-cols-2 ${duplicateRows.has(index + 1) ? "border-danger" : "border-border"} ${kind === "HOSPITAL_MEMBER" ? "lg:grid-cols-5" : "lg:grid-cols-4"}`} key={index}>
                <label className="space-y-1 text-xs font-semibold">
                  <span>แถว {index + 1} · เลขบัตรประชาชน</span>
                  <Input disabled={pending} value={formRows[index].nationalId} onChange={(event) => updateRow(index, "nationalId", event.target.value)} inputMode="numeric" maxLength={13} name="nationalId" pattern="[0-9]{13}" type="text" />
                </label>
                <label className="space-y-1 text-xs font-semibold">
                  <span>ชื่อ</span>
                  <Input disabled={pending} value={formRows[index].givenName} onChange={(event) => updateRow(index, "givenName", event.target.value)} maxLength={120} name="givenName" type="text" />
                </label>
                <label className="space-y-1 text-xs font-semibold">
                  <span>นามสกุล</span>
                  <Input disabled={pending} value={formRows[index].familyName} onChange={(event) => updateRow(index, "familyName", event.target.value)} maxLength={120} name="familyName" type="text" />
                </label>
                <label className="space-y-1 text-xs font-semibold">
                  <span>เบอร์ติดต่อ</span>
                  <Input disabled={pending} value={formRows[index].contactPhone} onChange={(event) => updateRow(index, "contactPhone", event.target.value)} inputMode="tel" autoComplete="tel" maxLength={32} name="contactPhone" required={Boolean(formRows[index].nationalId || formRows[index].givenName || formRows[index].familyName || formRows[index].profession)} aria-describedby={kind === "OSM" ? "bulk-osm-phone-help" : undefined} />
                </label>
                {kind === "HOSPITAL_MEMBER" ? (
                  <label className="space-y-1 text-xs font-semibold">
                    <span>วิชาชีพ</span>
                    <Select disabled={pending} value={formRows[index].profession} onChange={(event) => updateRow(index, "profession", event.target.value)} name="profession">
                      <option value="">เลือกวิชาชีพ</option>
                      {Object.entries(professionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </Select>
                  </label>
                ) : null}
              </div>
            ))}
          </div>
          {rowCount < MAX_BULK_ROWS ? <Button disabled={pending} onClick={() => setRowCount((count) => Math.min(MAX_BULK_ROWS, count + 5))} size="compact" type="button" variant="secondary">เพิ่มแถว</Button> : null}
          {outcomeVisible && state.status === "ERROR" && state.code !== "UNAVAILABLE" ? <Alert variant="danger">{state.message}</Alert> : null}
          {result ? (
            <Alert variant={counts.invalid > 0 ? "warning" : "success"}>
              <p className="font-semibold">สร้างใหม่ {counts.created} · มีอยู่แล้ว {counts.existing} · ไม่สำเร็จ {counts.invalid}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {result.rows.map((row) => <li key={row.rowNumber}>แถว {row.rowNumber}: {row.status === "invalid" ? `ไม่สำเร็จ · ${bulkReasonLabels[row.reason]}` : row.status === "created" ? "สร้างแล้ว" : "มีอยู่ในโรงพยาบาลนี้แล้ว"}</li>)}
              </ul>
            </Alert>
          ) : null}
          <p className="text-sm leading-6 text-muted">
            หากคำขอขาดการเชื่อมต่อ ให้ส่งข้อมูลเดิมอีกครั้งเพื่อรับผลของรายการเดิม ผลที่บันทึกแล้วจะไม่ถูกสร้างซ้ำ
            หากแก้ข้อมูล ให้เริ่มรายการใหม่ ผลสำเร็จของรายการเดิมยังคงอยู่ รหัสรายการใช้ได้ 30 วัน
            หากโหลดหน้าใหม่ ให้กรอกข้อมูลเดิมอีกครั้ง รหัสรายการเดิมจะยังอยู่ในแท็บนี้เมื่อเบราว์เซอร์รองรับ
          </p>
          {unknownOutcome && !pending ? <Alert role="alert" variant="warning">ระบบยังยืนยันผลการบันทึกไม่ได้ กรุณากด “บันทึกทั้งหมด” อีกครั้งโดยไม่แก้ข้อมูล เพื่อรับผลของรายการเดิม</Alert> : null}
          <Button disabled={pending} onClick={startNewSubmission} type="button" variant="secondary">เริ่มรายการใหม่หลังแก้ข้อมูล</Button>
          <Button className="w-full" disabled={pending || !submissionId} loading={pending} type="submit">{pending ? "กำลังบันทึก..." : "บันทึกทั้งหมด"}</Button>
        </form>
      </details>
    </Panel>
  );
}

function PendingActivationGroup({
  title,
  kind,
  rows,
  hospitalId,
  pending,
}: {
  title: string;
  kind: "HOSPITAL_MEMBER" | "OSM";
  rows: WorkforceListRow[];
  hospitalId: string;
  pending: boolean;
}): React.JSX.Element {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const slipFormId = `slip-form-${kind}`;
  const selectedRows = rows.filter(({ userId }) => selected.has(userId));
  const cancellableCount = selectedRows.filter(({ activationStatus }) => activationStatus === "PENDING").length;
  const allSelected = rows.length > 0 && selected.size >= Math.min(rows.length, MAX_SLIP_SELECTION);

  function toggle(userId: string): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else if (next.size < MAX_SLIP_SELECTION) next.add(userId);
      return next;
    });
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-panel border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-6">
        <h3 className="text-lg font-semibold tracking-[-0.02em]">{title}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={pending} onClick={() => setSelected(allSelected ? new Set() : new Set(rows.slice(0, MAX_SLIP_SELECTION).map(({ userId }) => userId)))} size="compact" type="button" variant="secondary">
            {allSelected ? "ยกเลิกการเลือก" : "เลือกทั้งหมด"}
          </Button>
          <form action="/app/workforce/slips" id={slipFormId} method="post" onSubmit={(event) => {
            if (cancellableCount > 0 && !window.confirm(`มี ${cancellableCount} คนที่ยังมีลิงก์ใช้ได้ การออกลิงก์ใหม่จะยกเลิกลิงก์เหล่านี้ ต้องการดำเนินการและพิมพ์ใบหรือไม่`)) event.preventDefault();
          }} target="_blank">
            <input name="targetHospitalId" type="hidden" value={hospitalId} />
            <input name="kind" type="hidden" value={kind} />
            <Button disabled={pending || selected.size === 0} size="compact" type="submit">ออกลิงก์ใหม่และพิมพ์ใบ ({selected.size})</Button>
          </form>
        </div>
      </div>
      {cancellableCount > 0 ? <p className="border-b border-line bg-warning-soft px-4 py-3 text-sm text-text sm:px-6">มีลิงก์ที่ยังใช้ได้ {cancellableCount} คน ซึ่งจะถูกยกเลิกก่อนออกลิงก์ใหม่</p> : null}
      {rows.length > MAX_SLIP_SELECTION ? <p className="border-b border-line px-4 py-3 text-xs leading-5 text-muted sm:px-6">พิมพ์ได้ครั้งละไม่เกิน {MAX_SLIP_SELECTION} คน</p> : null}
      <ul>
        {rows.map((row) => (
          <li className="flex flex-col gap-3 border-t border-line px-4 py-4 first:border-t-0 sm:flex-row sm:items-center sm:justify-between sm:px-6" key={row.userId}>
            <label className="flex min-w-0 items-start gap-3">
              <input checked={selected.has(row.userId)} className="mt-1 h-5 w-5 shrink-0" disabled={pending} form={slipFormId} name="userId" onChange={() => toggle(row.userId)} type="checkbox" value={row.userId} />
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{row.displayName}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <StatusBadge variant={row.activationStatus === "PENDING" ? "warning" : "danger"}>{row.activationStatus === "PENDING" ? "รอเปิดใช้งาน" : "ลิงก์หมดอายุ"}</StatusBadge>
                  <span>{row.activationExpiresAt ? `ลิงก์ล่าสุดหมดอายุ ${new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(row.activationExpiresAt)}` : "ยังไม่มีลิงก์ที่ใช้งานได้"}</span>
                </span>
              </span>
            </label>
            <Link className={buttonClassName({ variant: "secondary", size: "compact" })} href={`/app/workforce/${row.kind === "OSM" ? "osm" : "staff"}/${encodeURIComponent(row.id)}`}>ดูรายละเอียด</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function WorkforceImportWorkspace({
  hospitals,
  selectedHospitalId,
  hospitalName,
  serverTime,
  rows,
  pageInfo,
}: WorkforceImportWorkspaceProps): React.JSX.Element {
  const router = useRouter();
  const session = useScopedMutationSession<WorkforceBulkActionState>({ scope: selectedHospitalId, lockOnUnconfirmed: false });
  const { state, action, pending, unknownOutcome: actionThrown } = useScopedMutation(session, {
    kind: "bulk",
    action: provisionWorkforceBulkAction,
    initialState: initialWorkforceBulkActionState,
    classify: (next, formData) => classifyWorkforceState(next, bulkRequestMatches(next, formData)),
    notice: bulkNotice,
  });
  const pendingRows = rows.filter((row) => row.activationStatus !== null && row.activationStatus !== "IN_PROGRESS" && row.activationRequired);
  const unknownOutcome = actionThrown || session.latest?.status === "UNCONFIRMED";
  function importHref(cursors: { staffCursor?: string | null; osmCursor?: string | null }): string {
    const params = new URLSearchParams({ hospitalId: selectedHospitalId });
    if (pageInfo.search) params.set("search", pageInfo.search);
    if (pageInfo.status) params.set("status", pageInfo.status);
    const staffCursor = cursors.staffCursor === undefined ? pageInfo.staffCursor : cursors.staffCursor;
    const osmCursor = cursors.osmCursor === undefined ? pageInfo.osmCursor : cursors.osmCursor;
    if (staffCursor) params.set("staffCursor", staffCursor);
    if (osmCursor) params.set("osmCursor", osmCursor);
    return `/app/workforce/import?${params.toString()}`;
  }

  return (
    <div className="content-workspace break-words">
      <PageHeader
        actions={<Link className={buttonClassName({ variant: "secondary" })} href={`/app/workforce?hospitalId=${encodeURIComponent(selectedHospitalId)}&tab=pending`}>กลับรายชื่อที่รอเปิดใช้งาน</Link>}
        breadcrumbs={[{ label: "จัดการบุคลากร", href: `/app/workforce?hospitalId=${encodeURIComponent(selectedHospitalId)}` }, { label: "นำเข้าและพิมพ์ใบ" }]}
        description={`จัดการข้อมูลหลายรายการและพิมพ์ใบเปิดใช้งานสำหรับ ${hospitalName}`}
        title="นำเข้าบุคลากรและพิมพ์ใบเปิดใช้งาน"
      />
      <div className="mt-6">
        <Panel>
          <label className="block text-sm font-semibold text-ink" htmlFor="workforce-import-hospital">โรงพยาบาลที่จัดการ</label>
          <Select className="mt-2 max-w-xl" id="workforce-import-hospital" onChange={(event) => {
            const params = new URLSearchParams({ hospitalId: event.target.value });
            if (pageInfo.search) params.set("search", pageInfo.search);
            if (pageInfo.status) params.set("status", pageInfo.status);
            router.push(`/app/workforce/import?${params.toString()}`);
          }} value={selectedHospitalId}>
            {hospitals.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </Select>
        </Panel>
        <Panel className="mt-4">
          <Form action="/app/workforce/import" className="grid gap-4 sm:grid-cols-[1fr_16rem_auto] sm:items-end">
            <input name="hospitalId" type="hidden" value={selectedHospitalId} />
            <label className="block space-y-2 text-sm font-semibold" htmlFor="import-search">
              <span>ค้นหาชื่อ</span>
              <Input defaultValue={pageInfo.search} id="import-search" maxLength={120} name="search" type="search" />
            </label>
            <label className="block space-y-2 text-sm font-semibold" htmlFor="import-status">
              <span>สถานะความสัมพันธ์</span>
              <Select defaultValue={pageInfo.status ?? ""} id="import-status" name="status">
                <option value="">ทุกสถานะ</option>
                <option value="PROVISIONED">รอเปิดใช้งาน</option>
                <option value="INVITED">รอตอบรับ</option>
                <option value="ACTIVE">ใช้งานอยู่</option>
                <option value="SUSPENDED">ถูกระงับ</option>
                <option value="ENDED">นำออกแล้ว</option>
              </Select>
            </label>
            <Button type="submit">ค้นหา</Button>
          </Form>
        </Panel>
        <div className="mt-6">
          <BulkAddPanel action={action} hospitalId={selectedHospitalId} pending={pending} serverTime={serverTime} state={state} unknownOutcome={unknownOutcome} />
        </div>
        <section className="mt-8" id="workforce-pending">
          <h2 className="text-xl font-semibold tracking-[-0.02em]">พิมพ์ใบเปิดใช้งาน</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            เลือกรายชื่อเพื่อออกลิงก์ใหม่และพิมพ์ใบ ระบบจะยกเลิกลิงก์เดิมที่ยังใช้ได้ก่อนออกลิงก์ใหม่ ลิงก์ใช้ได้ 72 ชั่วโมงและใช้ได้ครั้งเดียว ผู้ใช้ต้องกรอกเลขบัตรประชาชนของตนเอง
          </p>
          {pendingRows.length === 0 ? <p className="mt-4 rounded-panel border border-border bg-surface px-4 py-8 text-center text-sm text-muted">ไม่มีรายชื่อที่ต้องเปิดใช้งานในรายการนี้</p> : (
            <div className="mt-4 grid gap-6 @5xl/workspace:grid-cols-2">
              {([ ["บุคลากรโรงพยาบาลที่รอเปิดใช้งาน", "HOSPITAL_MEMBER"], ["อสม. ที่รอเปิดใช้งาน", "OSM"] ] as const).map(([title, kind]) => {
                const groupRows = pendingRows.filter((row) => row.kind === kind);
                return groupRows.length > 0 ? <PendingActivationGroup hospitalId={selectedHospitalId} key={`${kind}:${groupRows.map((row) => row.id).join(",")}`} kind={kind} pending={pending} rows={groupRows} title={title} /> : null;
              })}
            </div>
          )}
          <nav aria-label="หน้ารายชื่อสำหรับพิมพ์ใบ" className="mt-4 flex flex-wrap gap-3">
            {pageInfo.staffNextCursor ? <Link className={buttonClassName({ variant: "secondary", size: "compact" })} href={importHref({ staffCursor: pageInfo.staffNextCursor })}>หน้าถัดไป · บุคลากร</Link> : null}
            {pageInfo.osmNextCursor ? <Link className={buttonClassName({ variant: "secondary", size: "compact" })} href={importHref({ osmCursor: pageInfo.osmNextCursor })}>หน้าถัดไป · อสม.</Link> : null}
            {(pageInfo.staffCursor || pageInfo.osmCursor) ? <Link className="inline-flex min-h-10 items-center text-sm font-semibold underline" href={importHref({ staffCursor: null, osmCursor: null })}>กลับหน้าแรก</Link> : null}
          </nav>
        </section>
      </div>
    </div>
  );
}
