"use client";

import { HospitalContentCategory, HospitalContentStatus } from "@prisma/client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type FormEvent, type MouseEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, buttonClassName } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  HOSPITAL_CONTENT_CATEGORY_LABELS,
  HOSPITAL_CONTENT_STATUS_LABELS,
  HOSPITAL_CONTENT_STATUS_VARIANTS,
} from "@/modules/hospital-content/domain/hospital-content";
import type { HospitalContentDetailProjection } from "@/modules/hospital-content/types/hospital-content-projections";
import type {
  HospitalContentField,
  HospitalContentMutationActionState,
  HospitalContentReadActionState,
} from "@/modules/hospital-content/transport/action-state";
import {
  archiveHospitalContentAction,
  editHospitalContentDraftAction,
  publishHospitalContentAction,
  readHospitalContentCurrentAction,
  withdrawHospitalContentAction,
} from "@/modules/hospital-content/transport/server-actions";

type ContentDraft = {
  title: string;
  body: string;
  category: HospitalContentCategory;
  sourceText: string;
};

function toDraft(content: HospitalContentDetailProjection): ContentDraft {
  return {
    title: content.title,
    body: content.body,
    category: content.category,
    sourceText: content.sourceText ?? "",
  };
}

function valuesMatchDraft(content: HospitalContentDetailProjection, draft: ContentDraft): boolean {
  return content.title === draft.title
    && content.body === draft.body
    && content.category === draft.category
    && (content.sourceText ?? "") === draft.sourceText;
}

function formatPublisherTime(value: string | null): string {
  if (!value) return "ยังไม่เคยเผยแพร่";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function messageForState(state: HospitalContentMutationActionState): string | null {
  if (state.status === "IDLE" || state.status === "SUCCESS") return null;
  if (state.status === "UNCONFIRMED") return "ยังยืนยันผลไม่ได้ เก็บข้อมูลในหน้านี้ไว้แล้ว กรุณาโหลดข้อมูลปัจจุบันก่อนดำเนินการต่อ";
  if (state.code === "VALIDATION") return "ตรวจสอบหัวข้อ เนื้อหา หมวดหมู่ และแหล่งข้อมูลอีกครั้ง";
  if (state.code === "CONFLICT") return "รายการเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลปัจจุบันและตรวจสอบก่อนบันทึกอีกครั้ง";
  if (state.code === "FORBIDDEN" || state.code === "NOT_FOUND") return "ไม่สามารถจัดการรายการนี้ได้ สิทธิ์อาจเปลี่ยนแปลงแล้ว";
  return "ระบบไม่พร้อมดำเนินการ ข้อมูลที่แก้ไขยังอยู่ในหน้านี้";
}

function fieldMessage(state: HospitalContentMutationActionState, field: HospitalContentField): string {
  return state.status === "ERROR" ? state.fieldErrors?.[field] ?? "" : "";
}

export function HospitalContentDetailWorkspace({
  content: initialContent,
}: {
  content: HospitalContentDetailProjection;
}): React.JSX.Element {
  const [current, setCurrent] = useState<HospitalContentDetailProjection | null>(initialContent);
  const [draft, setDraft] = useState<ContentDraft>(() => toDraft(initialContent));
  const [mutationState, setMutationState] = useState<HospitalContentMutationActionState>({ status: "IDLE" });
  const [readState, setReadState] = useState<HospitalContentReadActionState | null>(null);
  const [reviewCurrent, setReviewCurrent] = useState<HospitalContentDetailProjection | null>(null);
  const [localPreview, setLocalPreview] = useState(false);
  const [reconciliationRequired, setReconciliationRequired] = useState(false);
  const [accessRevoked, setAccessRevoked] = useState(false);
  const [isPending, startTransition] = useTransition();
  const requestGeneration = useRef(0);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const sourceRef = useRef<HTMLInputElement>(null);

  const dirty = current !== null && !valuesMatchDraft(current, draft);

  useEffect(() => {
    if (isPending || mutationState.status !== "ERROR" || mutationState.code !== "VALIDATION") return;
    const control = mutationState.fieldErrors?.title
      ? titleRef.current
      : mutationState.fieldErrors?.body
        ? bodyRef.current
        : mutationState.fieldErrors?.category
          ? categoryRef.current
          : mutationState.fieldErrors?.sourceText
            ? sourceRef.current
            : null;
    if (control && !control.disabled) control.focus();
  }, [isPending, mutationState]);

  useEffect(() => {
    if (!dirty && !reconciliationRequired && !isPending) return;
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, reconciliationRequired, isPending]);

  function leavePage(event: MouseEvent<HTMLAnchorElement>): void {
    if (!dirty && !reconciliationRequired && !isPending) return;
    if (!window.confirm("มีข้อมูลที่ยังไม่ได้บันทึกหรือตรวจสอบ ต้องการออกจากหน้านี้และทิ้งข้อมูลในหน้านี้หรือไม่")) {
      event.preventDefault();
    }
  }

  function handleEdit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!current || current.status !== HospitalContentStatus.DRAFT || !dirty || isPending || reconciliationRequired || accessRevoked) return;
    const savedDraft = draft;
    const expectedUpdatedAt = current.expectedUpdatedAt;
    const generation = ++requestGeneration.current;
    setMutationState({ status: "IDLE" });
    setReadState(null);
    startTransition(async () => {
      try {
        const result = await editHospitalContentDraftAction({
          contentId: current.id,
          expectedUpdatedAt,
          title: savedDraft.title,
          body: savedDraft.body,
          category: savedDraft.category,
          sourceText: savedDraft.sourceText === "" ? null : savedDraft.sourceText,
        });
        if (generation !== requestGeneration.current) return;
        setMutationState(result);
        if (result.status === "SUCCESS") {
          setCurrent(result.result.content);
          setDraft(toDraft(result.result.content));
          setReviewCurrent(null);
          setReconciliationRequired(false);
          setLocalPreview(false);
        } else if (result.status === "UNCONFIRMED" || (result.status === "ERROR" && result.code === "CONFLICT")) {
          setReconciliationRequired(true);
          setReviewCurrent(null);
        } else if (result.status === "ERROR" && (result.code === "FORBIDDEN" || result.code === "NOT_FOUND")) {
          setAccessRevoked(true);
        }
      } catch {
        if (generation !== requestGeneration.current) return;
        setMutationState({ status: "UNCONFIRMED" });
        setReconciliationRequired(true);
        setReviewCurrent(null);
      }
    });
  }

  function runLifecycle(
    command: "PUBLISH" | "WITHDRAW" | "ARCHIVE",
    confirmMessage: string,
  ): void {
    if (!current || isPending || reconciliationRequired || accessRevoked) return;
    if (command === "PUBLISH" && (current.status !== HospitalContentStatus.DRAFT || dirty)) return;
    if (command === "WITHDRAW" && current.status !== HospitalContentStatus.PUBLISHED) return;
    if (command === "ARCHIVE" && current.status === HospitalContentStatus.ARCHIVED) return;
    const confirmedMessage = command === "ARCHIVE" && dirty
      ? `${confirmMessage} ข้อมูลที่แก้ไขแต่ยังไม่บันทึกจะไม่ถูกบันทึกและจะถูกทิ้ง`
      : confirmMessage;
    if (!window.confirm(confirmedMessage)) return;
    const contentId = current.id;
    const expectedUpdatedAt = current.expectedUpdatedAt;
    const generation = ++requestGeneration.current;
    setMutationState({ status: "IDLE" });
    setReadState(null);
    startTransition(async () => {
      try {
        const input = { contentId, expectedUpdatedAt };
        const result = command === "PUBLISH"
          ? await publishHospitalContentAction(input)
          : command === "WITHDRAW"
            ? await withdrawHospitalContentAction(input)
            : await archiveHospitalContentAction(input);
        if (generation !== requestGeneration.current) return;
        setMutationState(result);
        if (result.status === "SUCCESS") {
          setCurrent(result.result.content);
          setDraft(toDraft(result.result.content));
          setReconciliationRequired(false);
          setReviewCurrent(null);
        } else if (result.status === "UNCONFIRMED" || (result.status === "ERROR" && result.code === "CONFLICT")) {
          setReconciliationRequired(true);
          setReviewCurrent(null);
        } else if (result.status === "ERROR" && (result.code === "FORBIDDEN" || result.code === "NOT_FOUND")) {
          setAccessRevoked(true);
        }
      } catch {
        if (generation !== requestGeneration.current) return;
        setMutationState({ status: "UNCONFIRMED" });
        setReconciliationRequired(true);
        setReviewCurrent(null);
      }
    });
  }

  function loadCurrent(): void {
    if (!current || isPending) return;
    const contentId = current.id;
    const generation = ++requestGeneration.current;
    setReadState(null);
    setReviewCurrent(null);
    startTransition(async () => {
      try {
        const result = await readHospitalContentCurrentAction(contentId);
        if (generation !== requestGeneration.current) return;
        setReadState(result);
        if (result.status === "SUCCESS") {
          setReviewCurrent(result.content);
        } else if (result.status === "FORBIDDEN" || result.status === "NOT_FOUND") {
          setAccessRevoked(true);
        }
      } catch {
        if (generation === requestGeneration.current) setReadState({ status: "UNAVAILABLE" });
      }
    });
  }

  function useCurrentAsDraft(): void {
    if (!reviewCurrent) return;
    setCurrent(reviewCurrent);
    setDraft(toDraft(reviewCurrent));
    setMutationState({ status: "IDLE" });
    setReadState(null);
    setReviewCurrent(null);
    setReconciliationRequired(false);
    setLocalPreview(false);
  }

  function reapplyLocalDraft(): void {
    if (!reviewCurrent || reviewCurrent.status !== HospitalContentStatus.DRAFT) return;
    setCurrent(reviewCurrent);
    setMutationState({ status: "IDLE" });
    setReadState(null);
    setReviewCurrent(null);
    setReconciliationRequired(false);
  }

  if (accessRevoked || !current) {
    return (
      <div className="max-w-4xl">
        <PageHeader
          onBreadcrumbClick={leavePage}
          breadcrumbs={[{ label: "หน้าหลัก", href: "/app" }, { label: "ข่าวสารและความรู้", href: "/app/hospitals/knowledge" }]}
          description="จัดการเนื้อหาของโรงพยาบาลที่คุณเป็นเจ้าของโดยตรง"
          title="ข่าวสารและความรู้"
        />
        <Alert className="mt-6" variant="warning">
          <p className="font-semibold">ไม่สามารถแสดงข้อมูลของรายการนี้ได้</p>
          <p className="mt-1">สิทธิ์หรือรายการอาจเปลี่ยนแปลงแล้ว กรุณาเปิดหน้ารายการเพื่อตรวจสอบอีกครั้ง</p>
        </Alert>
        <Link className={`${buttonClassName({ variant: "secondary" })} mt-4`} href="/app/hospitals/knowledge" onClick={leavePage}>กลับไปรายการ</Link>
      </div>
    );
  }

  const listHref = `/app/hospitals/knowledge?hospitalId=${encodeURIComponent(current.hospital.id)}`;
  const serverPreview = !dirty;
  const previewDraft = serverPreview ? toDraft(current) : draft;
  const successMessage = mutationState.status === "SUCCESS"
    ? mutationState.result.outcome === "UPDATED"
      ? "บันทึกฉบับร่างแล้ว"
      : mutationState.result.outcome === "NOOP"
        ? "ข้อมูลฉบับร่างเป็นปัจจุบันแล้ว ไม่มีการเปลี่ยนแปลง"
        : mutationState.result.outcome === "PUBLISHED"
          ? "เผยแพร่เนื้อหาแล้ว"
          : mutationState.result.outcome === "WITHDRAWN"
            ? "ถอนการเผยแพร่แล้ว เนื้อหากลับเป็นฉบับร่าง"
            : "เก็บเนื้อหาเข้าคลังแล้ว"
    : null;

  return (
    <div className="max-w-4xl">
      <PageHeader
        onBreadcrumbClick={leavePage}
        breadcrumbs={[
          { label: "หน้าหลัก", href: "/app" },
          { label: "ข่าวสารและความรู้", href: listHref },
          { label: current.title },
        ]}
        description="ดูแลเนื้อหาปัจจุบันของโรงพยาบาล"
        title="ข่าวสารและความรู้"
      />

      <div aria-live="polite" className="sr-only">
        {isPending ? "กำลังบันทึกหรือโหลดข้อมูลปัจจุบัน" : successMessage ?? messageForState(mutationState) ?? ""}
      </div>

      {successMessage ? <Alert className="mt-5" variant="success">{successMessage}</Alert> : null}
      {mutationState.status === "UNCONFIRMED" ? (
        <Alert className="mt-5" variant="warning">
          <p className="font-semibold">ยังยืนยันผลการดำเนินการไม่ได้</p>
          <p className="mt-1">ข้อมูลที่แก้ไขและรุ่นที่ส่งครั้งแรกยังอยู่ในหน้านี้ กรุณาโหลดข้อมูลปัจจุบันก่อน ระบบจะไม่ส่งคำขอซ้ำให้อัตโนมัติ</p>
        </Alert>
      ) : null}
      {mutationState.status === "ERROR" ? (
        <Alert className="mt-5" variant={mutationState.code === "VALIDATION" ? "warning" : "danger"}>
          <p className="font-semibold">{messageForState(mutationState)}</p>
        </Alert>
      ) : null}

      {reconciliationRequired ? (
        <Panel aria-labelledby="hospital-content-reconcile-heading" className="mt-5">
          <h2 className="font-semibold text-text" id="hospital-content-reconcile-heading">ตรวจสอบรายการปัจจุบันก่อนดำเนินการต่อ</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">ข้อมูลเดิมที่กำลังแก้ไขยังอยู่แยกจากรายการล่าสุด ระบบไม่รวมข้อมูลหรือส่งซ้ำให้อัตโนมัติ</p>
          <Button className="mt-4" disabled={isPending} loading={isPending} onClick={loadCurrent} type="button" variant="secondary">
            {isPending ? "กำลังโหลดข้อมูล..." : "โหลดข้อมูลปัจจุบัน"}
          </Button>
          {readState?.status === "UNAVAILABLE" ? <Alert className="mt-4" variant="danger">โหลดข้อมูลปัจจุบันไม่สำเร็จ กรุณาลองใหม่</Alert> : null}
          {readState?.status === "NOT_FOUND" || readState?.status === "FORBIDDEN" ? <Alert className="mt-4" variant="warning">ไม่พบรายการหรือไม่มีสิทธิ์ดูข้อมูลปัจจุบัน</Alert> : null}
          {reviewCurrent ? (
            <div className="mt-5 border-t border-border pt-5">
              <h3 className="font-semibold text-text">ข้อมูลปัจจุบันจากระบบ</h3>
              <p className="mt-2 break-words font-medium text-text">{reviewCurrent.title}</p>
              <StatusBadge className="mt-3" variant={HOSPITAL_CONTENT_STATUS_VARIANTS[reviewCurrent.status]}>{HOSPITAL_CONTENT_STATUS_LABELS[reviewCurrent.status]}</StatusBadge>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-text">{reviewCurrent.body}</p>
              <Button className="mt-4" disabled={isPending} onClick={useCurrentAsDraft} type="button" variant="secondary">ใช้ข้อมูลปัจจุบันเริ่มแก้ไข</Button>
              {reviewCurrent.status === HospitalContentStatus.DRAFT ? (
                <Button className="mt-4 sm:ml-3" disabled={isPending} onClick={reapplyLocalDraft} type="button" variant="secondary">นำแบบร่างเดิมมาแก้ต่อจากรุ่นปัจจุบัน</Button>
              ) : null}
              <p className="mt-2 text-sm leading-6 text-text-muted">การนำแบบร่างเดิมมาใช้จะยังไม่บันทึก ระบบจะบันทึกเมื่อกดปุ่มบันทึกอย่างชัดเจนเท่านั้น</p>
            </div>
          ) : null}
          {dirty ? (
            <div className="mt-5 border-t border-border pt-5">
              <h3 className="font-semibold text-text">แบบร่างเดิมที่ยังไม่ได้บันทึก</h3>
              <p className="mt-2 break-words text-text">{draft.title}</p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-text">{draft.body}</p>
            </div>
          ) : null}
        </Panel>
      ) : null}

      <Panel aria-labelledby="hospital-content-detail-heading" className="mt-6">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="break-words text-xl font-semibold text-text" id="hospital-content-detail-heading">{current.hospital.name}</h2>
            <p className="mt-1 break-words text-sm text-text-muted">รหัสโรงพยาบาล {current.hospital.hospitalCode}</p>
          </div>
          <StatusBadge variant={HOSPITAL_CONTENT_STATUS_VARIANTS[current.status]}>{HOSPITAL_CONTENT_STATUS_LABELS[current.status]}</StatusBadge>
        </div>

        <p className="mt-4 text-sm leading-6 text-text-muted">ข่าวสารและความรู้เป็นข้อมูลที่โรงพยาบาลจัดทำ โรงพยาบาลผู้เผยแพร่รับผิดชอบความถูกต้องของเนื้อหา</p>

        {current.status !== HospitalContentStatus.DRAFT ? (
          <Button className="mt-5" disabled={isPending} onClick={() => setLocalPreview((value) => !value)} type="button" variant="secondary">
            {localPreview ? "ซ่อนตัวอย่าง" : "ดูตัวอย่างปัจจุบัน"}
          </Button>
        ) : null}

        {current.status === HospitalContentStatus.DRAFT ? (
          <form className="mt-6 space-y-5" noValidate onSubmit={handleEdit}>
            <div className="min-w-0">
              <label className="type-label mb-2 block text-text" htmlFor="hospital-content-title">หัวข้อ</label>
              <input
                aria-describedby="hospital-content-title-description hospital-content-title-error"
                aria-invalid={Boolean(mutationState.status === "ERROR" && mutationState.fieldErrors?.title)}
                className="type-control min-h-12 w-full max-w-full rounded-control border border-border-strong bg-surface px-4 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 aria-invalid:border-danger"
                disabled={isPending || reconciliationRequired}
                id="hospital-content-title"
                maxLength={1_000}
                ref={titleRef}
                value={draft.title}
                onChange={(event) => setDraft((value) => ({ ...value, title: event.currentTarget.value }))}
              />
              <p className="mt-2 text-sm leading-6 text-text-muted" id="hospital-content-title-description">หัวข้อหนึ่งบรรทัด ไม่เกิน 200 ตัวอักษรหลังตัดช่องว่างหัวท้าย</p>
              <p className="mt-1 min-h-6 text-sm leading-6 text-danger" id="hospital-content-title-error">{fieldMessage(mutationState, "title")}</p>
            </div>
            <div className="min-w-0">
              <label className="type-label mb-2 block text-text" htmlFor="hospital-content-body">เนื้อหา</label>
              <textarea
                aria-describedby="hospital-content-body-description hospital-content-body-error"
                aria-invalid={Boolean(mutationState.status === "ERROR" && mutationState.fieldErrors?.body)}
                className="type-control min-h-72 w-full max-w-full resize-y rounded-control border border-border-strong bg-surface px-4 py-3 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 aria-invalid:border-danger"
                disabled={isPending || reconciliationRequired}
                id="hospital-content-body"
                maxLength={24_000}
                ref={bodyRef}
                value={draft.body}
                onChange={(event) => setDraft((value) => ({ ...value, body: event.currentTarget.value }))}
              />
              <p className="mt-2 text-sm leading-6 text-text-muted" id="hospital-content-body-description">ข้อความธรรมดา ระบบคงบรรทัดใหม่และไม่แปล Markdown หรือ HTML</p>
              <p className="mt-1 min-h-6 text-sm leading-6 text-danger" id="hospital-content-body-error">{fieldMessage(mutationState, "body")}</p>
            </div>
            <div className="min-w-0">
              <label className="type-label mb-2 block text-text" htmlFor="hospital-content-category">หมวดหมู่</label>
              <select
                aria-describedby="hospital-content-category-description hospital-content-category-error"
                aria-invalid={Boolean(mutationState.status === "ERROR" && mutationState.fieldErrors?.category)}
                className="type-control min-h-12 w-full max-w-full rounded-control border border-border-strong bg-surface px-4 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 aria-invalid:border-danger"
                disabled={isPending || reconciliationRequired}
                id="hospital-content-category"
                ref={categoryRef}
                value={draft.category}
                onChange={(event) => setDraft((value) => ({ ...value, category: event.currentTarget.value as HospitalContentCategory }))}
              >
                {Object.values(HospitalContentCategory).map((category) => <option key={category} value={category}>{HOSPITAL_CONTENT_CATEGORY_LABELS[category]}</option>)}
              </select>
              <p className="mt-2 text-sm leading-6 text-text-muted" id="hospital-content-category-description">เลือกหนึ่งหมวดหมู่ก่อนบันทึก</p>
              <p className="mt-1 min-h-6 text-sm leading-6 text-danger" id="hospital-content-category-error">{fieldMessage(mutationState, "category")}</p>
            </div>
            <div className="min-w-0">
              <label className="type-label mb-2 block text-text" htmlFor="hospital-content-source">แหล่งข้อมูล/อ้างอิง</label>
              <input
                aria-describedby="hospital-content-source-description hospital-content-source-error"
                aria-invalid={Boolean(mutationState.status === "ERROR" && mutationState.fieldErrors?.sourceText)}
                className="type-control min-h-12 w-full max-w-full rounded-control border border-border-strong bg-surface px-4 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 aria-invalid:border-danger"
                disabled={isPending || reconciliationRequired}
                id="hospital-content-source"
                maxLength={2_000}
                ref={sourceRef}
                value={draft.sourceText}
                onChange={(event) => setDraft((value) => ({ ...value, sourceText: event.currentTarget.value }))}
              />
              <p className="mt-2 text-sm leading-6 text-text-muted" id="hospital-content-source-description">ข้อความอ้างอิงหนึ่งรายการ ระบบไม่ตรวจสอบแหล่งที่มาและไม่ทำเป็นลิงก์</p>
              <p className="mt-1 min-h-6 text-sm leading-6 text-danger" id="hospital-content-source-error">{fieldMessage(mutationState, "sourceText")}</p>
            </div>
            <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
              <Button disabled={isPending} onClick={() => setLocalPreview((value) => !value)} type="button" variant="secondary">{localPreview ? "ซ่อนตัวอย่าง" : "ดูตัวอย่าง"}</Button>
              <Button disabled={!dirty || isPending || reconciliationRequired} loading={isPending} type="submit">{isPending ? "กำลังบันทึก..." : "บันทึกฉบับร่าง"}</Button>
            </div>
          </form>
        ) : (
          <dl className="mt-6 grid min-w-0 gap-5">
            <div className="min-w-0">
              <dt className="text-sm text-text-muted">หัวข้อ</dt>
              <dd className="mt-1 break-words text-lg font-semibold text-text">{current.title}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-sm text-text-muted">เนื้อหา</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-base leading-7 text-text">{current.body}</dd>
            </div>
            <div>
              <dt className="text-sm text-text-muted">หมวดหมู่</dt>
              <dd className="mt-1 text-text">{HOSPITAL_CONTENT_CATEGORY_LABELS[current.category]}</dd>
            </div>
            {current.sourceText !== null ? (
              <div className="min-w-0">
                <dt className="text-sm text-text-muted">แหล่งข้อมูล/อ้างอิง</dt>
                <dd className="mt-1 break-all text-text">{current.sourceText}</dd>
              </div>
            ) : null}
          </dl>
        )}

        {localPreview ? (
          <section aria-labelledby="hospital-content-preview-heading" className="mt-6 border-t border-border pt-5">
            <h3 className="font-semibold text-text" id="hospital-content-preview-heading">{dirty ? "ตัวอย่างข้อมูลที่ยังไม่บันทึก" : `ตัวอย่างปัจจุบัน · ${HOSPITAL_CONTENT_STATUS_LABELS[current.status]}`}</h3>
            <p className="mt-1 break-words text-sm text-text-muted">{current.hospital.name}</p>
            <p className="mt-4 break-words text-lg font-semibold text-text">{previewDraft.title}</p>
            <p className="mt-3 whitespace-pre-wrap break-words text-base leading-7 text-text">{previewDraft.body}</p>
            <p className="mt-3 text-sm text-text-muted">หมวดหมู่: {HOSPITAL_CONTENT_CATEGORY_LABELS[previewDraft.category]}</p>
            {previewDraft.sourceText.trim() ? <p className="mt-3 break-all text-sm leading-6 text-text"><span className="font-semibold">แหล่งข้อมูล/อ้างอิง: </span>{previewDraft.sourceText}</p> : null}
          </section>
        ) : null}

        <dl className="mt-6 grid min-w-0 gap-x-6 gap-y-3 border-t border-border pt-5 text-sm sm:grid-cols-2">
          <div><dt className="text-text-muted">เผยแพร่ครั้งแรก</dt><dd className="mt-1 break-words text-text">{formatPublisherTime(current.firstPublishedAt)}</dd></div>
          <div><dt className="text-text-muted">เผยแพร่ล่าสุด</dt><dd className="mt-1 break-words text-text">{formatPublisherTime(current.latestPublishedAt)}</dd></div>
        </dl>
      </Panel>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link className={buttonClassName({ variant: "ghost" })} href={listHref} onClick={leavePage}>กลับไปรายการ</Link>
        {!reconciliationRequired ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            {current.status === HospitalContentStatus.DRAFT ? (
              <Button disabled={isPending || dirty} onClick={() => runLifecycle("PUBLISH", "เผยแพร่เนื้อหาฉบับปัจจุบันหรือไม่ ต้องบันทึกและตรวจสอบแบบร่างก่อน") } type="button" variant="primary">เผยแพร่</Button>
            ) : null}
            {current.status === HospitalContentStatus.PUBLISHED ? (
              <Button disabled={isPending} onClick={() => runLifecycle("WITHDRAW", "ถอนการเผยแพร่และเปลี่ยนกลับเป็นฉบับร่างหรือไม่") } type="button" variant="secondary">ถอนการเผยแพร่เพื่อแก้ไข</Button>
            ) : null}
            {current.status !== HospitalContentStatus.ARCHIVED ? (
              <Button disabled={isPending} onClick={() => runLifecycle("ARCHIVE", "เก็บเนื้อหานี้เข้าคลังถาวรหรือไม่ หลังจากนั้นจะไม่สามารถแก้ไขหรือคืนสถานะได้") } type="button" variant="danger">เก็บถาวร</Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
