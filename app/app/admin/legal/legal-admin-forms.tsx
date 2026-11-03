"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";

import { LegalDocumentBody } from "@/components/legal/legal-document-body";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { inputClassName } from "@/components/ui/input";
import { notify } from "@/components/ui/notify";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { LEGAL_DOCUMENT_KINDS, LEGAL_DOCUMENT_TITLES } from "@/modules/legal/domain/legal-documents";
import { formatLegalDateTime } from "@/modules/legal/domain/legal-views";
import {
  CONSENT_DECISION_LABELS,
  initialLegalActionState,
  initialUserLegalHistoryState,
} from "@/modules/legal/transport/legal-action-state";
import type { AdminLegalVersionView } from "@/modules/legal/transport/legal-admin-context";
import {
  createLegalDraftAction,
  lookupUserLegalHistoryAction,
  publishLegalVersionAction,
  updateLegalDraftAction,
} from "@/modules/legal/transport/server-actions";

const labelClass = "block text-sm font-semibold text-text";
const hintClass = "text-sm leading-6 text-text-muted";
const MARKDOWN_HINT = "รองรับ # หัวข้อ, ย่อหน้าคั่นด้วยบรรทัดว่าง, รายการ - หรือ 1. และ **ตัวหนา** ข้อความอื่นแสดงตามที่พิมพ์";

function DraftFields({ defaults, disabled }: { defaults?: Pick<AdminLegalVersionView, "versionLabel" | "title" | "body">; disabled: boolean }): React.JSX.Element {
  return (
    <>
      <div className="space-y-2">
        <label className={labelClass} htmlFor="legal-version-label">ชื่อฉบับ</label>
        <input
          aria-describedby="legal-version-label-hint"
          className={inputClassName}
          defaultValue={defaults?.versionLabel}
          disabled={disabled}
          id="legal-version-label"
          maxLength={40}
          name="versionLabel"
          pattern="[A-Za-z0-9][A-Za-z0-9._\-]{0,39}"
          required
        />
        <p className={hintClass} id="legal-version-label-hint">ตัวอักษรอังกฤษ ตัวเลข จุด ขีด เช่น 2026-11 ใช้เป็นส่วนหนึ่งของลิงก์ฉบับนี้</p>
      </div>
      <div className="space-y-2">
        <label className={labelClass} htmlFor="legal-title">ชื่อเอกสาร</label>
        <input className={inputClassName} defaultValue={defaults?.title} disabled={disabled} id="legal-title" maxLength={200} name="title" required />
      </div>
      <div className="space-y-2">
        <label className={labelClass} htmlFor="legal-body">เนื้อหา</label>
        <textarea
          aria-describedby="legal-body-hint"
          className={`${inputClassName} min-h-72 py-3 leading-7`}
          defaultValue={defaults?.body}
          disabled={disabled}
          id="legal-body"
          maxLength={100000}
          name="body"
          required
        />
        <p className={hintClass} id="legal-body-hint">{MARKDOWN_HINT}</p>
      </div>
    </>
  );
}

/** `/app/admin/legal`: new draft of one kind; opens the draft for preview and publication. */
export function LegalDraftCreateForm(): React.JSX.Element {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createLegalDraftAction, initialLegalActionState);

  useEffect(() => {
    if (state.status === "SUCCESS" && state.versionId) {
      notify.success("สร้างร่างแล้ว");
      router.push(`/app/admin/legal/${state.versionId}`);
    }
  }, [router, state]);

  return (
    <Panel aria-labelledby="legal-new-draft-heading" className="space-y-4">
      <h2 className="text-lg font-semibold text-text" id="legal-new-draft-heading">สร้างร่างฉบับใหม่</h2>
      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <label className={labelClass} htmlFor="legal-kind">เอกสาร</label>
          <Select disabled={pending} id="legal-kind" name="kind" required>
            {LEGAL_DOCUMENT_KINDS.map((kind) => <option key={kind} value={kind}>{LEGAL_DOCUMENT_TITLES[kind]}</option>)}
          </Select>
        </div>
        <DraftFields disabled={pending} />
        {state.status === "ERROR" ? <Alert variant="danger">{state.message}</Alert> : null}
        <Button disabled={pending} loading={pending} type="submit">{pending ? "กำลังสร้าง..." : "สร้างร่าง"}</Button>
      </form>
    </Panel>
  );
}

/** Draft editor + preview of the saved text + publish with confirmation (LG-D3). */
export function LegalDraftEditor({ version }: { version: AdminLegalVersionView }): React.JSX.Element {
  const router = useRouter();
  const [state, formAction, saving] = useActionState(updateLegalDraftAction, initialLegalActionState);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishing, startPublish] = useTransition();
  const [publishError, setPublishError] = useState<string | null>(null);
  // Unsaved edits belong to the revision they were made on; a saved revision (new updatedAt) clears them.
  const [editedRevision, setEditedRevision] = useState<string | null>(null);
  const dirty = editedRevision === version.updatedAt;

  useEffect(() => {
    if (state.status === "SUCCESS") {
      notify.success("บันทึกร่างแล้ว");
      router.refresh();
    }
  }, [router, state]);

  function publish(): void {
    setPublishError(null);
    startPublish(async () => {
      const result = await publishLegalVersionAction({ versionId: version.id, expectedUpdatedAt: version.updatedAt });
      setConfirmOpen(false);
      if (result.status === "SUCCESS") {
        notify.success("ประกาศใช้แล้ว");
        router.refresh();
        return;
      }
      if (result.status === "ERROR") setPublishError(result.message);
    });
  }

  return (
    <div className="space-y-6">
      <Panel aria-labelledby="legal-edit-heading" className="space-y-4">
        <h2 className="text-lg font-semibold text-text" id="legal-edit-heading">แก้ไขร่าง</h2>
        <form action={formAction} className="space-y-4" onChange={() => setEditedRevision(version.updatedAt)}>
          <input name="versionId" type="hidden" value={version.id} />
          <DraftFields defaults={version} disabled={saving || publishing} />
          {state.status === "ERROR" ? <Alert variant="danger">{state.message}</Alert> : null}
          <Button disabled={saving || publishing} loading={saving} type="submit" variant="secondary">{saving ? "กำลังบันทึก..." : "บันทึกร่าง"}</Button>
        </form>
      </Panel>

      <section aria-labelledby="legal-preview-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-text" id="legal-preview-heading">ตัวอย่างฉบับที่บันทึกแล้ว</h2>
          <Button disabled={dirty || saving || publishing} onClick={() => setConfirmOpen(true)}>ประกาศใช้ฉบับนี้</Button>
        </div>
        {dirty ? <Alert variant="warning">มีการแก้ไขที่ยังไม่บันทึก บันทึกร่างก่อนเพื่อดูตัวอย่างและประกาศใช้</Alert> : null}
        {publishError ? <Alert variant="danger">{publishError}</Alert> : null}
        <div className="rounded-panel border border-border bg-surface px-5 py-5 sm:px-7">
          <h3 className="text-xl font-bold tracking-[-0.02em] text-text">{version.title}</h3>
          <p className="mt-1 text-sm text-text-muted">ฉบับ {version.versionLabel} · บันทึกล่าสุด {formatLegalDateTime(version.updatedAt)}</p>
          <div className="mt-5"><LegalDocumentBody body={version.body} /></div>
        </div>
      </section>

      <ConfirmDialog
        confirmLabel="ประกาศใช้"
        description={`${LEGAL_DOCUMENT_TITLES[version.kind]} ฉบับ ${version.versionLabel} จะเป็นฉบับปัจจุบันทันที และแก้ไขหรือลบไม่ได้อีก`}
        details={version.kind === "TERMS" || version.kind === "PRIVACY_POLICY"
          ? "ผู้ใช้ทุกคนจะเห็นแถบแจ้งให้ยอมรับฉบับใหม่ในการตั้งค่า โดยยังใช้งานได้ตามปกติ"
          : "ความยินยอมที่ผู้ใช้ให้ไว้กับฉบับเดิมยังคงอยู่ และจะแสดงว่ามีเวอร์ชันใหม่"}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={publish}
        open={confirmOpen}
        pending={publishing}
        pendingLabel="กำลังประกาศใช้..."
        title="ยืนยันการประกาศใช้"
      />
    </div>
  );
}

/** DPO request support: one User's acceptance and consent history by exact national ID (every lookup audited). */
export function UserLegalHistoryLookup(): React.JSX.Element {
  const [state, formAction, pending] = useActionState(lookupUserLegalHistoryAction, initialUserLegalHistoryState);
  return (
    <Panel aria-labelledby="legal-history-lookup-heading" className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-text" id="legal-history-lookup-heading">ประวัติการยอมรับและความยินยอมของผู้ใช้</h2>
        <p className={hintClass}>สำหรับคำขอของเจ้าของข้อมูลหรือ DPO ค้นหาด้วยเลขบัตรประชาชนแบบตรงตัว ระบบบันทึกการค้นหาทุกครั้ง</p>
      </div>
      <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-2">
          <label className={labelClass} htmlFor="legal-history-national-id">เลขบัตรประชาชน</label>
          <input autoComplete="off" className={inputClassName} disabled={pending} id="legal-history-national-id" inputMode="numeric" maxLength={17} name="nationalId" required />
        </div>
        <Button disabled={pending} loading={pending} type="submit" variant="secondary">ค้นหา</Button>
      </form>
      {state.status === "ERROR" ? <Alert variant="danger">{state.message}</Alert> : null}
      {state.status === "NOT_FOUND" ? <Alert>ไม่พบผู้ใช้ที่ตรงกับเลขบัตรประชาชนนี้</Alert> : null}
      {state.status === "FOUND" ? (
        <div className="space-y-4 text-sm">
          <p className="font-medium text-text">{state.displayName}</p>
          <div>
            <h3 className="font-semibold text-text">การยอมรับข้อกำหนดและนโยบาย</h3>
            {state.acceptances.length === 0 ? <p className={hintClass}>ไม่มีบันทึก</p> : (
              <ul className="mt-1 divide-y divide-border">
                {state.acceptances.map((acceptance) => (
                  <li className="py-2" key={acceptance.id}>
                    <p className="text-text">ข้อกำหนด {acceptance.terms} · นโยบาย {acceptance.privacy}</p>
                    <p className="text-text-muted">{acceptance.acceptedAt} · {acceptance.source} · {acceptance.channel}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-text">ความยินยอม</h3>
            {state.consentEvents.length === 0 ? <p className={hintClass}>ไม่มีบันทึก</p> : (
              <ul className="mt-1 divide-y divide-border">
                {state.consentEvents.map((event) => (
                  <li className="py-2" key={event.id}>
                    <p className="text-text">{LEGAL_DOCUMENT_TITLES[event.kind]}</p>
                    <p className="text-text-muted">{CONSENT_DECISION_LABELS[event.decision]} · ฉบับ {event.versionLabel} · {event.decidedAt} · {event.channel}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
