"use client";

import { HospitalContentCategory } from "@prisma/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent, type MouseEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, buttonClassName } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { notify } from "@/components/ui/notify";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import {
  HOSPITAL_CONTENT_CATEGORY_LABELS,
  HOSPITAL_CONTENT_IMAGE_LIMIT,
  HOSPITAL_CONTENT_IMAGE_LIMIT_MESSAGE,
} from "@/modules/hospital-content/domain/hospital-content";
import {
  runHospitalContentPublishFlow,
  type HospitalContentPublishFlowDependencies,
  type HospitalContentPublishFlowProgress,
  type HospitalContentPublishFlowResult,
  type HospitalContentPublishFlowState,
} from "@/modules/hospital-content/client/hospital-content-publish-flow";
import type { HospitalContentOwnerHospital } from "@/modules/hospital-content/types/hospital-content-projections";
import type {
  HospitalContentCreateActionState,
  HospitalContentField,
  HospitalContentReconciliationActionState,
} from "@/modules/hospital-content/transport/action-state";
import {
  createHospitalContentAction,
  publishHospitalContentAction,
  readHospitalContentCurrentAction,
  reconcileHospitalContentCreateAction,
} from "@/modules/hospital-content/transport/server-actions";
import {
  hospitalContentFormEntriesToObject,
  normalizeHospitalContentBody,
  normalizeHospitalContentSourceText,
  normalizeHospitalContentTitle,
} from "@/modules/hospital-content/schemas/hospital-content-schemas";
import { hospitalContentCreateRecoveryStorageKey } from "@/modules/hospital-content/transport/create-recovery-storage";

import { HospitalContentComposerImages, type ComposerImage } from "./hospital-content-composer-images";

type CreateDraft = {
  title: string;
  body: string;
  category: HospitalContentCategory | "";
  sourceText: string;
};

type CreateAttemptMarker = { hospitalId: string; submissionNonce: string };
type CreateConfirmationIntent =
  | { kind: "EXIT"; href: string }
  | { kind: "SWITCH_HOSPITAL"; hospitalId: string }
  | { kind: "RECONCILE_HOSPITAL"; hospitalId: string }
  | { kind: "OPEN_RECORD"; contentId: string; title: string }
  | { kind: "DISCARD" };

type CreateFields = { title: string; body: string; category: string; sourceText: string | null };
type StoppedFlow = Extract<HospitalContentPublishFlowResult, { status: "STOPPED" }>;
type FlowRun = { publish: boolean; fields: CreateFields; state: HospitalContentPublishFlowState; createdHospitalId: string | null };

const emptyDraft: CreateDraft = { title: "", body: "", category: "", sourceText: "" };
const requiredFieldMessages = {
  title: "ตรวจสอบหัวข้อและความยาวอีกครั้ง",
  body: "ตรวจสอบเนื้อหาและความยาวอีกครั้ง",
  category: "เลือกหมวดหมู่ที่ต้องการ",
} as const;
const imageUploadFailureMessage = "อัปโหลดรูปไม่สำเร็จ กรุณาเปิดฉบับร่างเพื่อตรวจสอบและเพิ่มรูปอีกครั้ง";

function isImageIdResult(value: unknown): value is { imageId: string } {
  return typeof value === "object" && value !== null && "imageId" in value && typeof value.imageId === "string";
}

function errorTextOf(value: unknown): string | null {
  return typeof value === "object" && value !== null && "error" in value && typeof value.error === "string" ? value.error : null;
}

/** The server normalizes text before storing it, so a replayed create is compared after the same normalization. */
function storedMatchesFields(content: { title: string; body: string; category: string; sourceText: string | null }, fields: CreateFields): boolean {
  try {
    return content.title === normalizeHospitalContentTitle(fields.title)
      && content.body === normalizeHospitalContentBody(fields.body)
      && content.category === fields.category
      && content.sourceText === normalizeHospitalContentSourceText(fields.sourceText);
  } catch {
    return false;
  }
}

function stoppedTitle(stop: StoppedFlow): string {
  if (stop.step === "UPLOAD") return `อัปโหลดรูปที่ ${stop.imageNumber ?? ""} ไม่สำเร็จ`;
  return "เผยแพร่ไม่สำเร็จ";
}

function stoppedDetail(stop: StoppedFlow): string {
  if (stop.reason === "UNKNOWN") return "ยังยืนยันผลไม่ได้ กด “ลองต่อ” เพื่อทำต่อจากขั้นตอนนี้ ระบบจะไม่สร้างเนื้อหาหรือรูปซ้ำ";
  if (stop.reason === "CONFLICT") return "ฉบับร่างถูกเปลี่ยนแปลงแล้ว กรุณาเปิดฉบับร่างเพื่อตรวจสอบก่อนเผยแพร่";
  return stop.message ?? "กรุณาเปิดฉบับร่างเพื่อตรวจสอบและดำเนินการต่อ";
}

function parseMarker(value: string): CreateAttemptMarker | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (Object.keys(record).length !== 2 || typeof record.hospitalId !== "string" || typeof record.submissionNonce !== "string") return null;
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
    if (!uuidPattern.test(record.hospitalId) || !uuidPattern.test(record.submissionNonce)) return null;
    return { hospitalId: record.hospitalId, submissionNonce: record.submissionNonce };
  } catch {
    return null;
  }
}

function hasDraftText(draft: CreateDraft): boolean {
  return draft.title.length > 0 || draft.body.length > 0 || draft.category !== "" || draft.sourceText.length > 0;
}

function fieldMessage(state: HospitalContentCreateActionState, field: HospitalContentField): string {
  return state.status === "ERROR" ? state.fieldErrors?.[field] ?? "" : "";
}

function stateMessage(state: HospitalContentCreateActionState): string | null {
  if (state.status !== "ERROR") return null;
  if (state.code === "VALIDATION") return "ตรวจสอบหัวข้อ เนื้อหา หมวดหมู่ และแหล่งข้อมูลอีกครั้ง";
  if (state.code === "FORBIDDEN" || state.code === "NOT_FOUND") return "สิทธิ์จัดการโรงพยาบาลนี้อาจเปลี่ยนแปลงแล้ว กรุณาเปิดหน้านี้ใหม่";
  if (state.code === "CONFLICT") return "ระบบพบข้อมูลที่เปลี่ยนแปลง กรุณาตรวจสอบรายการปัจจุบันก่อนดำเนินการต่อ";
  return "ระบบไม่พร้อมบันทึกฉบับร่าง ข้อมูลที่กรอกยังอยู่ในหน้านี้";
}

export function HospitalContentCreateForm({
  hospitals,
  selectedHospitalId,
  recoveryScope,
}: {
  hospitals: readonly HospitalContentOwnerHospital[];
  selectedHospitalId: string;
  recoveryScope: string;
}): React.JSX.Element {
  const router = useRouter();
  const [draft, setDraft] = useState<CreateDraft>(emptyDraft);
  const [actionState, setActionState] = useState<HospitalContentCreateActionState>({ status: "IDLE" });
  const [reconciliationState, setReconciliationState] = useState<HospitalContentReconciliationActionState | null>(null);
  const [marker, setMarker] = useState<CreateAttemptMarker | null>(null);
  const [recoveryLoaded, setRecoveryLoaded] = useState(false);
  const [recoveryChecked, setRecoveryChecked] = useState(false);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [confirmationIntent, setConfirmationIntent] = useState<CreateConfirmationIntent | null>(null);
  const [navigationBlockedWhilePending, setNavigationBlockedWhilePending] = useState(false);
  const [images, setImages] = useState<ComposerImage[]>([]);
  const [progress, setProgress] = useState<HospitalContentPublishFlowProgress | null>(null);
  const [runMode, setRunMode] = useState<"PUBLISH" | "DRAFT" | null>(null);
  const [flowStop, setFlowStop] = useState<StoppedFlow | null>(null);
  const [savedContentId, setSavedContentId] = useState<string | null>(null);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const flowRef = useRef<FlowRun | null>(null);
  const imagesRef = useRef<ComposerImage[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const nonceRef = useRef<string | null>(null);
  const createInFlight = useRef(false);
  const mountedRef = useRef(false);
  const requestGeneration = useRef(0);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const sourceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => () => {
    for (const image of imagesRef.current) URL.revokeObjectURL(image.previewUrl);
  }, []);

  useEffect(() => {
    let parsed: CreateAttemptMarker | null = null;
    let storageFailed = false;
    try {
      const key = hospitalContentCreateRecoveryStorageKey(recoveryScope);
      const raw = window.sessionStorage.getItem(key);
      if (raw) {
        parsed = parseMarker(raw);
        if (!parsed) window.sessionStorage.removeItem(key);
      }
    } catch {
      storageFailed = true;
    }
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      if (parsed) {
        setMarker(parsed);
        nonceRef.current = parsed.submissionNonce;
      }
      if (storageFailed) setStorageUnavailable(true);
      setRecoveryLoaded(true);
    });
    return () => { mounted = false; };
  }, [recoveryScope]);

  useEffect(() => {
    if (actionState.status !== "ERROR" || actionState.code !== "VALIDATION" || isPending) return;
    const invalidControl = actionState.fieldErrors?.title
      ? titleRef.current
      : actionState.fieldErrors?.body
        ? bodyRef.current
        : actionState.fieldErrors?.category
          ? categoryRef.current
          : actionState.fieldErrors?.sourceText
            ? sourceRef.current
            : null;
    if (invalidControl && !invalidControl.disabled) invalidControl.focus();
  }, [actionState, isPending]);

  // Once the draft is stored on the server, leaving the page loses nothing the detail page cannot resume.
  const dirty = savedContentId === null && (hasDraftText(draft) || images.length > 0);
  const activeMarker = marker;
  const recoveryHospitalMatches = activeMarker?.hospitalId === selectedHospitalId;
  const selectedHospital = hospitals.find(({ id }) => id === selectedHospitalId);

  useEffect(() => {
    if (!dirty && !isPending && !activeMarker) return;
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, isPending, activeMarker]);

  function clearMarker(): void {
    try {
      window.sessionStorage.removeItem(hospitalContentCreateRecoveryStorageKey(recoveryScope));
    } catch {
      // The in-memory attempt can still be explicitly discarded.
    }
    setMarker(null);
    setRecoveryChecked(false);
    setReconciliationState(null);
    nonceRef.current = null;
  }

  function removeStoredMarker(): void {
    try {
      window.sessionStorage.removeItem(hospitalContentCreateRecoveryStorageKey(recoveryScope));
    } catch {
      // Keep the confirmed result usable in memory if browser storage is unavailable.
    }
  }

  function storeMarker(value: CreateAttemptMarker): boolean {
    try {
      window.sessionStorage.setItem(hospitalContentCreateRecoveryStorageKey(recoveryScope), JSON.stringify(value));
      setMarker(value);
      setStorageUnavailable(false);
      return true;
    } catch {
      setStorageUnavailable(true);
      return false;
    }
  }

  function handleExit(event: MouseEvent<HTMLAnchorElement>): void {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!dirty && !activeMarker && !isPending) return;

    event.preventDefault();
    if (isPending) {
      setNavigationBlockedWhilePending(true);
      return;
    }

    const anchor = event.currentTarget;
    setConfirmationIntent({ kind: "EXIT", href: `${anchor.pathname}${anchor.search}${anchor.hash}` });
  }

  function requestHospitalSwitch(nextHospitalId: string, select?: HTMLSelectElement): void {
    if (!nextHospitalId || nextHospitalId === selectedHospitalId) {
      if (select) select.value = selectedHospitalId;
      return;
    }

    if (isPending) {
      if (select) select.value = selectedHospitalId;
      setNavigationBlockedWhilePending(true);
      return;
    }

    if (activeMarker?.hospitalId === nextHospitalId) {
      if (dirty) {
        if (select) select.value = selectedHospitalId;
        setConfirmationIntent({ kind: "RECONCILE_HOSPITAL", hospitalId: nextHospitalId });
      } else {
        router.push(`/app/hospitals/knowledge/new?hospitalId=${encodeURIComponent(nextHospitalId)}`);
      }
      return;
    }

    if (dirty || activeMarker) {
      if (select) select.value = selectedHospitalId;
      setConfirmationIntent({ kind: "SWITCH_HOSPITAL", hospitalId: nextHospitalId });
      return;
    }

    requestGeneration.current += 1;
    clearMarker();
    router.push(`/app/hospitals/knowledge/new?hospitalId=${encodeURIComponent(nextHospitalId)}`);
  }

  function switchHospital(nextHospitalId: string, select: HTMLSelectElement): void {
    requestHospitalSwitch(nextHospitalId, select);
  }

  function openMarkerHospital(): void {
    if (!activeMarker) return;
    requestHospitalSwitch(activeMarker.hospitalId);
  }

  function confirmIntent(): void {
    const intent = confirmationIntent;
    if (!intent || isPending) return;

    setConfirmationIntent(null);
    if (intent.kind === "EXIT") {
      requestGeneration.current += 1;
      clearMarker();
      router.push(intent.href);
    } else if (intent.kind === "SWITCH_HOSPITAL") {
      requestGeneration.current += 1;
      clearMarker();
      router.push(`/app/hospitals/knowledge/new?hospitalId=${encodeURIComponent(intent.hospitalId)}`);
    } else if (intent.kind === "RECONCILE_HOSPITAL") {
      router.push(`/app/hospitals/knowledge/new?hospitalId=${encodeURIComponent(intent.hospitalId)}`);
    } else if (intent.kind === "OPEN_RECORD") {
      requestGeneration.current += 1;
      clearMarker();
      router.push(`/app/hospitals/knowledge/${intent.contentId}`);
    } else {
      clearMarker();
      setDraft(emptyDraft);
      for (const image of images) URL.revokeObjectURL(image.previewUrl);
      setImages([]);
      flowRef.current = null;
      setActionState({ status: "IDLE" });
    }
  }

  function cancelIntent(): void {
    setConfirmationIntent(null);
  }

  function reconcileAttempt(): void {
    if (!activeMarker || isPending) return;
    setNavigationBlockedWhilePending(false);
    const generation = ++requestGeneration.current;
    setReconciliationState(null);
    setRecoveryChecked(false);
    startTransition(async () => {
      try {
        const result = await reconcileHospitalContentCreateAction(activeMarker);
        if (generation !== requestGeneration.current) return;
        setReconciliationState(result);
        if (result.status === "SUCCESS") {
          setRecoveryChecked(true);
          if (result.result.status === "FOUND") removeStoredMarker();
        }
      } catch {
        if (generation === requestGeneration.current) {
          setReconciliationState({ status: "ERROR", code: "UNAVAILABLE", message: "ระบบยังตรวจสอบคำขอไม่ได้" });
        }
      }
    });
  }

  function addImages(added: ComposerImage[]): void {
    setImages((current) => [...current, ...added].slice(0, HOSPITAL_CONTENT_IMAGE_LIMIT));
  }

  function removeImage(index: number): void {
    const removed = images[index];
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    setImages((current) => current.filter((_, position) => position !== index));
  }

  function moveImage(index: number, direction: -1 | 1): void {
    setImages((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target] as ComposerImage, next[index] as ComposerImage];
      return next;
    });
  }

  /** Reads the create fields and starts a new run, or continues the run whose draft is already stored. */
  function startFlow(form: HTMLFormElement | null, publish: boolean): void {
    if (createInFlight.current || isPending || !recoveryLoaded || storageUnavailable || (activeMarker && (!recoveryChecked || !recoveryHospitalMatches))) return;
    setNavigationBlockedWhilePending(false);

    if (!flowRef.current?.state.contentId) {
      if (!form) return;
      let fields: Record<string, string>;
      try {
        fields = hospitalContentFormEntriesToObject(new FormData(form).entries(), "CREATE");
      } catch {
        setActionState({ status: "ERROR", code: "VALIDATION", message: "ตรวจสอบข้อมูลในแบบฟอร์มอีกครั้ง" });
        return;
      }
      // A run that has not stored a draft yet may be rebuilt from the current form; image nonces stay stable per file.
      flowRef.current = {
        publish,
        fields: { title: fields.title, body: fields.body, category: fields.category, sourceText: fields.sourceText === "" ? null : fields.sourceText },
        state: { images: images.map(({ nonce, file }) => ({ nonce, file })) },
        createdHospitalId: null,
      };
    } else {
      flowRef.current.publish = publish;
    }
    const run = flowRef.current;
    createInFlight.current = true;
    setFlowStop(null);
    setRunMode(publish ? "PUBLISH" : "DRAFT");
    const generation = ++requestGeneration.current;
    const stale = (): boolean => generation !== requestGeneration.current;

    const dependencies: HospitalContentPublishFlowDependencies = {
      create: async () => {
        const submissionNonce = nonceRef.current ?? window.crypto.randomUUID();
        nonceRef.current = submissionNonce;
        const nextMarker = { hospitalId: selectedHospitalId, submissionNonce };
        if (!storeMarker(nextMarker)) {
          setActionState({ status: "ERROR", code: "UNAVAILABLE", message: "ไม่สามารถเตรียมรหัสคำขอสำหรับการตรวจสอบผลได้ จึงยังไม่ได้ส่งข้อมูล" });
          return { kind: "REJECTED", message: "" };
        }
        setActionState({ status: "IDLE" });
        setReconciliationState(null);
        setRecoveryChecked(false);
        let result: HospitalContentCreateActionState;
        try {
          result = await createHospitalContentAction({ hospitalId: selectedHospitalId, submissionNonce, ...run.fields });
        } catch {
          if (stale()) return { kind: "UNKNOWN" };
          setMarker(nextMarker);
          setRecoveryChecked(false);
          setActionState({ status: "UNCONFIRMED" });
          return { kind: "UNKNOWN" };
        }
        if (stale()) return { kind: "UNKNOWN" };
        if (result.status === "UNCONFIRMED") {
          setActionState(result);
          setMarker(nextMarker);
          setRecoveryChecked(false);
          return { kind: "UNKNOWN" };
        }
        if (result.status !== "SUCCESS") {
          setActionState(result);
          if (result.status === "ERROR" && result.code === "VALIDATION") {
            try { window.sessionStorage.removeItem(hospitalContentCreateRecoveryStorageKey(recoveryScope)); } catch { /* Keep the in-memory nonce. */ }
            setMarker(null);
            setRecoveryChecked(false);
          }
          return { kind: "REJECTED", message: "" };
        }
        const { content } = result.result;
        if (result.result.outcome === "REPLAY" && !(content.status === "DRAFT" && content.imageIds.length === 0 && storedMatchesFields(content, run.fields))) {
          // A replay that is not exactly this composer's untouched draft is never published or filled with images.
          setActionState(result);
          removeStoredMarker();
          setMarker(nextMarker);
          setRecoveryChecked(true);
          return { kind: "CONFLICT" };
        }
        if (!run.publish && result.result.outcome === "CREATED") setActionState(result);
        clearMarker();
        run.createdHospitalId = content.hospital.id;
        setSavedContentId(content.id);
        return { kind: "OK", contentId: content.id, expectedUpdatedAt: content.expectedUpdatedAt };
      },
      upload: async (contentId, image) => {
        const body = new FormData();
        body.append("file", image.file, image.file.name);
        body.append("caption", image.nonce);
        let response: Response;
        try {
          response = await fetch(`/api/hospital-content/${contentId}/images`, { method: "POST", body, cache: "no-store" });
        } catch {
          return { kind: "UNKNOWN" };
        }
        const payload: unknown = await response.json().catch(() => null);
        if (response.ok && isImageIdResult(payload)) return { kind: "OK", imageId: payload.imageId };
        // An unusable answer or a server fault may still have stored the image; the same nonce replays it safely.
        if (response.ok || response.status >= 500) return { kind: "UNKNOWN" };
        return { kind: "REJECTED", message: errorTextOf(payload) ?? imageUploadFailureMessage };
      },
      publish: async (contentId, expectedUpdatedAt) => {
        try {
          const result = await publishHospitalContentAction({ contentId, expectedUpdatedAt });
          if (result.status === "SUCCESS") return { kind: "OK" };
          if (result.status === "UNCONFIRMED") return { kind: "UNKNOWN" };
          if (result.status === "ERROR" && result.code === "CONFLICT") return { kind: "CONFLICT" };
          if (result.status === "ERROR" && result.code === "UNAVAILABLE") return { kind: "UNKNOWN" };
          return { kind: "REJECTED", message: result.status === "ERROR" && result.code === "VALIDATION" && result.message === HOSPITAL_CONTENT_IMAGE_LIMIT_MESSAGE ? result.message : "ไม่สามารถเผยแพร่ได้ กรุณาเปิดฉบับร่างเพื่อตรวจสอบ" };
        } catch {
          return { kind: "UNKNOWN" };
        }
      },
      readCurrent: async (contentId) => {
        try {
          const result = await readHospitalContentCurrentAction(contentId);
          return result.status === "SUCCESS"
            ? { kind: "OK", status: result.content.status, expectedUpdatedAt: result.content.expectedUpdatedAt }
            : { kind: "UNKNOWN" };
        } catch {
          return { kind: "UNKNOWN" };
        }
      },
    };

    startTransition(async () => {
      try {
        const result = await runHospitalContentPublishFlow(run.state, { publish: run.publish, onProgress: (next) => { if (!stale()) setProgress(next); } }, dependencies);
        if (stale()) return;
        setProgress(null);
        if (result.status === "DONE") {
          // Only a draft of the hospital shown here is announced.
          if (mountedRef.current && run.createdHospitalId === selectedHospitalId) notify.success(result.published ? "เผยแพร่เนื้อหาแล้ว" : "สร้างฉบับร่างแล้ว");
          router.push(`/app/hospitals/knowledge/${result.contentId}`);
        } else if (run.state.contentId) {
          setFlowStop(result);
        }
      } catch {
        if (stale()) return;
        setProgress(null);
        if (run.state.contentId) setFlowStop({ status: "STOPPED", step: "PUBLISH", reason: "UNKNOWN", resumable: true });
        else setActionState({ status: "UNCONFIRMED" });
      } finally {
        if (!stale()) createInFlight.current = false;
      }
    });
  }

  function submitCreate(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    startFlow(event.currentTarget, false);
  }

  function requestPublish(): void {
    if (isPending || fieldsLocked) return;
    const missing: Partial<Record<HospitalContentField, string>> = {};
    if (!draft.title.trim()) missing.title = requiredFieldMessages.title;
    if (!draft.body.trim()) missing.body = requiredFieldMessages.body;
    if (!draft.category) missing.category = requiredFieldMessages.category;
    if (Object.keys(missing).length > 0) {
      setActionState({ status: "ERROR", code: "VALIDATION", message: "กรุณาตรวจสอบข้อมูลที่กรอก", fieldErrors: missing });
      return;
    }
    setActionState({ status: "IDLE" });
    setPublishConfirmOpen(true);
  }

  function confirmPublish(): void {
    setPublishConfirmOpen(false);
    startFlow(formRef.current, true);
  }

  function resumeFlow(): void {
    startFlow(formRef.current, flowRef.current?.publish ?? false);
  }

  function requestOpenRecoveredRecord(contentId: string, title: string): void {
    if (isPending) return;
    if (dirty || activeMarker) {
      setConfirmationIntent({ kind: "OPEN_RECORD", contentId, title });
      return;
    }
    requestGeneration.current += 1;
    clearMarker();
    router.push(`/app/hospitals/knowledge/${contentId}`);
  }

  function requestDiscardAttempt(): void {
    if (isPending) return;
    setConfirmationIntent({ kind: "DISCARD" });
  }

  const confirmationTitle = confirmationIntent?.kind === "EXIT"
    ? activeMarker ? "ออกจากคำขอที่ยังตรวจสอบไม่เสร็จหรือไม่" : "ออกจากแบบร่างหรือไม่"
    : confirmationIntent?.kind === "SWITCH_HOSPITAL"
      ? "เปลี่ยนโรงพยาบาลหรือไม่"
      : confirmationIntent?.kind === "RECONCILE_HOSPITAL"
        ? "ไปยังโรงพยาบาลของคำขอหรือไม่"
        : confirmationIntent?.kind === "OPEN_RECORD"
          ? "เปิดเนื้อหาที่ตรวจสอบพบหรือไม่"
          : "ทิ้งแบบร่างและคำขอนี้หรือไม่";
  const confirmationDescription = confirmationIntent?.kind === "EXIT"
    ? activeMarker
      ? "การออกจากหน้านี้จะล้างคำขอและข้อมูลฉบับร่างที่รอตรวจสอบ"
      : "แบบร่างที่ยังไม่ได้บันทึกจะถูกทิ้งเมื่อออกจากหน้านี้"
    : confirmationIntent?.kind === "SWITCH_HOSPITAL"
      ? activeMarker
        ? "คำขอที่ยังตรวจสอบไม่เสร็จและแบบร่างในหน้านี้จะถูกล้างเมื่อเปลี่ยนโรงพยาบาล"
        : "แบบร่างที่ยังไม่ได้บันทึกจะถูกทิ้งเมื่อเปลี่ยนโรงพยาบาล"
      : confirmationIntent?.kind === "RECONCILE_HOSPITAL"
        ? "แบบร่างที่ยังไม่ได้บันทึกจะถูกทิ้ง แต่ระบบจะเก็บคำขอนี้ไว้ให้ตรวจสอบต่อ"
        : confirmationIntent?.kind === "OPEN_RECORD"
          ? "การเปิดรายการจะออกจากแบบร่างในหน้านี้"
          : "รหัสคำขอและข้อมูลฉบับร่างที่อยู่ในหน้านี้จะถูกล้าง";
  const confirmationLabel = confirmationIntent?.kind === "SWITCH_HOSPITAL"
    ? "เปลี่ยนโรงพยาบาล"
    : confirmationIntent?.kind === "RECONCILE_HOSPITAL"
      ? "ไปยังโรงพยาบาล"
      : confirmationIntent?.kind === "OPEN_RECORD"
        ? "เปิดรายการ"
        : confirmationIntent?.kind === "DISCARD"
          ? "ทิ้งแบบร่าง"
          : "ออกจากหน้านี้";
  const confirmationDetails = confirmationIntent?.kind === "SWITCH_HOSPITAL" || confirmationIntent?.kind === "RECONCILE_HOSPITAL"
    ? <p>ปลายทาง: {hospitals.find(({ id }) => id === confirmationIntent.hospitalId)?.name ?? "โรงพยาบาลที่เลือก"}</p>
    : confirmationIntent?.kind === "OPEN_RECORD"
      ? <p>รายการ: {confirmationIntent.title}</p>
      : null;

  const replayContent = actionState.status === "SUCCESS" && actionState.result.outcome === "REPLAY"
    ? actionState.result.content
    : null;
  const reconciledContent = reconciliationState?.status === "SUCCESS" && reconciliationState.result.status === "FOUND"
    ? reconciliationState.result.content
    : replayContent;
  const retryAllowed = recoveryChecked && reconciliationState?.status === "SUCCESS" && reconciliationState.result.status === "ABSENT";
  const fieldsLocked = isPending || Boolean(activeMarker && !retryAllowed) || savedContentId !== null;

  return (
    <div className="max-w-4xl">
      <PageHeader
        onBreadcrumbClick={handleExit}
        breadcrumbs={[
          { label: "หน้าหลัก", href: "/app" },
          { label: "ข่าวสารและความรู้", href: `/app/hospitals/knowledge?hospitalId=${encodeURIComponent(selectedHospitalId)}` },
          { label: "สร้างฉบับร่าง" },
        ]}
        description="กรอกเนื้อหา เพิ่มรูปได้ไม่เกิน 3 รูป แล้วเผยแพร่ทันที หรือบันทึกเป็นฉบับร่างไว้ก่อน"
        title="สร้างข่าวสารและความรู้"
      />

      {navigationBlockedWhilePending && isPending ? (
        <Alert className="mt-4" variant="warning">
          กรุณารอให้ระบบบันทึกหรือตรวจสอบคำขอเสร็จก่อนเปลี่ยนหน้า
        </Alert>
      ) : null}

      {hospitals.length > 1 ? (
        <div className="mt-6 max-w-xl">
          <label className="type-label mb-2 block text-text" htmlFor="hospital-content-create-hospital">เลือกโรงพยาบาล</label>
          <select
            className="type-control min-h-12 w-full rounded-control border border-border-strong bg-surface px-4 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            disabled={isPending || Boolean(activeMarker && !recoveryChecked)}
            id="hospital-content-create-hospital"
            value={selectedHospitalId}
            onChange={(event) => switchHospital(event.currentTarget.value, event.currentTarget)}
          >
            {hospitals.map((hospital) => <option key={hospital.id} value={hospital.id}>{hospital.name}</option>)}
          </select>
        </div>
      ) : null}

      {selectedHospital ? (
        <div className="mt-5 min-w-0">
          <h2 className="break-words text-lg font-semibold text-text">{selectedHospital.name}</h2>
        </div>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {isPending ? "กำลังตรวจสอบหรือบันทึกฉบับร่าง" : ""}
      </p>

      {actionState.status === "UNCONFIRMED" ? (
        <Alert className="mt-5" variant="warning">
          <p className="font-semibold">ยังยืนยันผลการบันทึกไม่ได้</p>
          <p className="mt-1">เก็บรหัสคำขอเดิมไว้แล้ว กรุณาตรวจสอบสถานะก่อนส่งซ้ำ ระบบจะไม่สร้างรหัสใหม่ให้อัตโนมัติ</p>
        </Alert>
      ) : null}

      {actionState.status === "SUCCESS" && actionState.result.outcome === "REPLAY" ? (
        <Alert className="mt-5" variant="warning">
          <p className="font-semibold">รายการนี้ถูกสร้างแล้ว ข้อมูลที่ส่งซ้ำไม่ได้ถูกบันทึก</p>
          <p className="mt-1">เปิดรายการปัจจุบันเพื่อตรวจสอบ รายการอาจถูกแก้ไขหรือเปลี่ยนสถานะไปแล้ว</p>
          <Button className="mt-4" onClick={() => requestOpenRecoveredRecord(actionState.result.content.id, actionState.result.content.title)} type="button" variant="secondary">
            เปิดรายการที่สร้างไว้
          </Button>
        </Alert>
      ) : null}

      {actionState.status === "SUCCESS" && actionState.result.outcome === "CREATED" ? (
        // Announced by the success Toast; this Alert is the visible state while the detail page opens.
        <Alert className="mt-5" role="none" variant="success">สร้างฉบับร่างแล้ว กำลังเปิดรายการปัจจุบัน</Alert>
      ) : null}

      {actionState.status === "ERROR" ? (
        <Alert className="mt-5" variant={actionState.code === "VALIDATION" ? "warning" : "danger"}>
          <p className="font-semibold">{stateMessage(actionState)}</p>
        </Alert>
      ) : null}

      {isPending && progress ? (
        <Panel aria-labelledby="hospital-content-progress-heading" className="mt-5">
          <h2 className="text-base font-semibold text-text" id="hospital-content-progress-heading">กำลังดำเนินการ อย่าปิดหน้านี้</h2>
          <ol className="mt-3 space-y-1 text-sm leading-6 text-text-muted">
            <li aria-current={progress.step === "CREATE" ? "step" : undefined} className={progress.step === "CREATE" ? "font-semibold text-text" : undefined}>1. บันทึกเนื้อหา</li>
            {progress.imageTotal > 0 ? (
              <li aria-current={progress.step === "UPLOAD" ? "step" : undefined} className={progress.step === "UPLOAD" ? "font-semibold text-text" : undefined}>
                2. อัปโหลดรูป {progress.step === "UPLOAD" ? `${progress.imageNumber ?? 1}/${progress.imageTotal}` : `${progress.imageTotal} รูป`}
              </li>
            ) : null}
            {runMode === "PUBLISH" ? (
              <li aria-current={progress.step === "PUBLISH" ? "step" : undefined} className={progress.step === "PUBLISH" ? "font-semibold text-text" : undefined}>{progress.imageTotal > 0 ? "3" : "2"}. เผยแพร่</li>
            ) : null}
          </ol>
        </Panel>
      ) : null}

      {savedContentId !== null && flowStop ? (
        <Alert className="mt-5" variant={flowStop.reason === "UNKNOWN" ? "warning" : "danger"}>
          <p className="font-semibold">{stoppedTitle(flowStop)}</p>
          <p className="mt-1">บันทึกฉบับร่างไว้แล้ว เนื้อหายังไม่ถูกเผยแพร่{flowStop.step === "UPLOAD" ? " และรูปที่ยังไม่ได้อัปโหลดต้องเพิ่มในหน้าฉบับร่าง" : ""}</p>
          <p className="mt-1">{stoppedDetail(flowStop)}</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            {flowStop.resumable ? <Button disabled={isPending} onClick={resumeFlow} type="button">ลองต่อ</Button> : null}
            <Button disabled={isPending} onClick={() => router.push(`/app/hospitals/knowledge/${savedContentId}`)} type="button" variant="secondary">เปิดฉบับร่าง</Button>
          </div>
        </Alert>
      ) : null}

      {activeMarker ? (
        <Panel aria-labelledby="hospital-content-recovery-heading" className="mt-5">
          <h2 className="text-lg font-semibold text-text" id="hospital-content-recovery-heading">ตรวจสอบคำขอสร้างฉบับร่าง</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
            การค้นหาใช้เฉพาะรหัสคำขอและโรงพยาบาลที่เลือก ข้อความบทความไม่ได้เก็บไว้ในเบราว์เซอร์
          </p>
          {!recoveryHospitalMatches ? (
            <div className="mt-4">
              <p className="text-sm leading-6 text-text">คำขอนี้ผูกกับโรงพยาบาลอื่น กรุณากลับไปยังโรงพยาบาลของคำขอเดิมก่อนตรวจสอบ</p>
              <Button className="mt-3" disabled={isPending} onClick={openMarkerHospital} type="button" variant="secondary">
                ไปยังโรงพยาบาลของคำขอเดิม
              </Button>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Button disabled={isPending || !recoveryLoaded} loading={isPending} onClick={reconcileAttempt} type="button" variant="secondary">
                {isPending ? "กำลังตรวจสอบ..." : "ตรวจสอบสถานะคำขอเดิม"}
              </Button>
              <Button disabled={isPending} onClick={requestDiscardAttempt} type="button" variant="ghost">ทิ้งคำขอนี้</Button>
            </div>
          )}

          {reconciliationState?.status === "ERROR" ? (
            <Alert className="mt-4" variant="danger">
              <p className="font-semibold">ยังตรวจสอบคำขอไม่ได้</p>
              <p className="mt-1">ผลนี้ไม่ใช่การยืนยันว่าไม่พบรายการ กรุณาลองตรวจสอบอีกครั้ง</p>
            </Alert>
          ) : null}
          {reconciliationState?.status === "SUCCESS" && reconciliationState.result.status === "ABSENT" ? (
            <Alert className="mt-4" variant="info">
              <p className="font-semibold">ยังไม่พบรายการในขณะตรวจสอบ</p>
              <p className="mt-1">ผลนี้ไม่ยืนยันว่าไม่มีคำขอที่กำลังทำงานอยู่ หากส่งซ้ำ ระบบจะใช้รหัสคำขอเดิม</p>
              {!dirty ? <p className="mt-1">กรอกข้อมูลบทความอีกครั้ง ข้อความเดิมไม่ได้ถูกบันทึกไว้ในเบราว์เซอร์</p> : null}
            </Alert>
          ) : null}
          {reconciledContent ? (
            <div className="mt-4 border-t border-border pt-4">
              <p className="font-semibold text-text">พบรายการปัจจุบันสำหรับรหัสคำขอนี้</p>
              <p className="mt-1 break-words text-text">{reconciledContent.title}</p>
              <p className="mt-1 text-sm text-text-muted">สถานะ: {reconciledContent.status === "DRAFT" ? "ฉบับร่าง" : reconciledContent.status === "PUBLISHED" ? "เผยแพร่แล้ว" : "เก็บถาวร"}</p>
              <Button className="mt-4" onClick={() => requestOpenRecoveredRecord(reconciledContent.id, reconciledContent.title)} type="button" variant="secondary">
                เปิดรายการปัจจุบันเพื่อตรวจสอบ
              </Button>
              <p className="mt-2 text-sm leading-6 text-text-muted">ข้อมูลที่ส่งซ้ำอาจไม่ตรงกับรายการปัจจุบัน และไม่ได้ถูกบันทึกจากการตรวจสอบนี้</p>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {recoveryLoaded && (!activeMarker || (retryAllowed && recoveryHospitalMatches)) && !reconciledContent ? (
        <>
          <Panel aria-labelledby="hospital-content-create-heading" className="mt-6">
            <h2 className="text-lg font-semibold text-text" id="hospital-content-create-heading">ข้อมูลฉบับร่าง</h2>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              ข่าวสารและความรู้เป็นข้อมูลที่โรงพยาบาลจัดทำ โรงพยาบาลผู้เผยแพร่รับผิดชอบความถูกต้องของเนื้อหา
            </p>

            {storageUnavailable ? (
              <Alert className="mt-4" variant="warning">
                <p className="font-semibold">พื้นที่กู้คืนคำขอไม่พร้อมใช้งาน</p>
                <p className="mt-1">ระบบจะยังไม่ส่งคำขอสร้าง เพื่อให้ตรวจสอบผลเดิมได้หากการเชื่อมต่อขาดหาย</p>
              </Alert>
            ) : null}

            <form className="mt-6 space-y-5" noValidate onSubmit={submitCreate} ref={formRef}>
              <div className="min-w-0">
                <label className="type-label mb-2 block text-text" htmlFor="hospital-content-title">หัวข้อ</label>
                <input
                  aria-describedby="hospital-content-title-description hospital-content-title-error"
                  aria-invalid={Boolean(actionState.status === "ERROR" && actionState.fieldErrors?.title)}
                  className="type-control min-h-12 w-full max-w-full rounded-control border border-border-strong bg-surface px-4 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 aria-invalid:border-danger"
                  disabled={fieldsLocked}
                  id="hospital-content-title"
                  maxLength={1_000}
                  name="title"
                  ref={titleRef}
                  required
                  value={draft.title}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.value;
                    setDraft((current) => ({ ...current, title: nextValue }));
                  }}
                />
                <p className="mt-2 text-sm leading-6 text-text-muted" id="hospital-content-title-description">หัวข้อหนึ่งบรรทัด ไม่เกิน 200 ตัวอักษรหลังตัดช่องว่างหัวท้าย</p>
                <p className="mt-1 min-h-6 text-sm leading-6 text-danger" id="hospital-content-title-error">{fieldMessage(actionState, "title")}</p>
              </div>

              <div className="min-w-0">
                <label className="type-label mb-2 block text-text" htmlFor="hospital-content-body">เนื้อหา</label>
                <textarea
                  aria-describedby="hospital-content-body-description hospital-content-body-error"
                  aria-invalid={Boolean(actionState.status === "ERROR" && actionState.fieldErrors?.body)}
                  className="type-control min-h-72 w-full max-w-full resize-y rounded-control border border-border-strong bg-surface px-4 py-3 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 aria-invalid:border-danger"
                  disabled={fieldsLocked}
                  id="hospital-content-body"
                  maxLength={24_000}
                  name="body"
                  ref={bodyRef}
                  required
                  value={draft.body}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.value;
                    setDraft((current) => ({ ...current, body: nextValue }));
                  }}
                />
                <p className="mt-2 text-sm leading-6 text-text-muted" id="hospital-content-body-description">ข้อความธรรมดา ระบบคงบรรทัดใหม่และไม่แปล Markdown หรือ HTML</p>
                <p className="mt-1 min-h-6 text-sm leading-6 text-danger" id="hospital-content-body-error">{fieldMessage(actionState, "body")}</p>
              </div>

              <div className="min-w-0">
                <label className="type-label mb-2 block text-text" htmlFor="hospital-content-category">หมวดหมู่</label>
                <select
                  aria-describedby="hospital-content-category-description hospital-content-category-error"
                  aria-invalid={Boolean(actionState.status === "ERROR" && actionState.fieldErrors?.category)}
                  className="type-control min-h-12 w-full max-w-full rounded-control border border-border-strong bg-surface px-4 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 aria-invalid:border-danger"
                  disabled={fieldsLocked}
                  id="hospital-content-category"
                  name="category"
                  ref={categoryRef}
                  required
                  value={draft.category}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.value as HospitalContentCategory | "";
                    setDraft((current) => ({ ...current, category: nextValue }));
                  }}
                >
                  <option disabled value="">เลือกหมวดหมู่</option>
                  {Object.values(HospitalContentCategory).map((category) => (
                    <option key={category} value={category}>{HOSPITAL_CONTENT_CATEGORY_LABELS[category]}</option>
                  ))}
                </select>
                <p className="mt-2 text-sm leading-6 text-text-muted" id="hospital-content-category-description">เลือกหนึ่งหมวดหมู่ก่อนบันทึก ระบบไม่มีหมวดหมู่เริ่มต้น</p>
                <p className="mt-1 min-h-6 text-sm leading-6 text-danger" id="hospital-content-category-error">{fieldMessage(actionState, "category")}</p>
              </div>

              <div className="min-w-0">
                <label className="type-label mb-2 block text-text" htmlFor="hospital-content-source">แหล่งข้อมูล/อ้างอิง</label>
                <input
                  aria-describedby="hospital-content-source-description hospital-content-source-error"
                  aria-invalid={Boolean(actionState.status === "ERROR" && actionState.fieldErrors?.sourceText)}
                  className="type-control min-h-12 w-full max-w-full rounded-control border border-border-strong bg-surface px-4 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2 aria-invalid:border-danger"
                  disabled={fieldsLocked}
                  id="hospital-content-source"
                  maxLength={2_000}
                  name="sourceText"
                  ref={sourceRef}
                  value={draft.sourceText}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.value;
                    setDraft((current) => ({ ...current, sourceText: nextValue }));
                  }}
                />
                <p className="mt-2 text-sm leading-6 text-text-muted" id="hospital-content-source-description">ระบุข้อความอ้างอิงหนึ่งรายการ ระบบจะแสดงเป็นข้อความธรรมดาและไม่ตรวจสอบแหล่งที่มา</p>
                <p className="mt-1 min-h-6 text-sm leading-6 text-danger" id="hospital-content-source-error">{fieldMessage(actionState, "sourceText")}</p>
              </div>

              <HospitalContentComposerImages
                disabled={fieldsLocked}
                images={images}
                onAdd={addImages}
                onMove={moveImage}
                onRemove={removeImage}
              />

              {savedContentId === null ? (
                <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <Link className={buttonClassName({ variant: "ghost" })} href={`/app/hospitals/knowledge?hospitalId=${encodeURIComponent(selectedHospitalId)}`} onClick={handleExit}>
                    กลับไปรายการ
                  </Link>
                  <div className="flex flex-col-reverse gap-3 sm:flex-row">
                    <Button disabled={isPending || !recoveryLoaded || storageUnavailable || Boolean(activeMarker && !retryAllowed)} loading={isPending && runMode === "DRAFT"} type="submit" variant="secondary">
                      {isPending && runMode === "DRAFT" ? "กำลังบันทึก..." : activeMarker ? "บันทึกฉบับร่างด้วยรหัสคำขอเดิม" : "บันทึกฉบับร่าง"}
                    </Button>
                    <Button disabled={isPending || !recoveryLoaded || storageUnavailable || Boolean(activeMarker && !retryAllowed)} loading={isPending && runMode === "PUBLISH"} onClick={requestPublish} type="button">
                      {isPending && runMode === "PUBLISH" ? "กำลังเผยแพร่..." : "เผยแพร่"}
                    </Button>
                  </div>
                </div>
              ) : null}
              {activeMarker && !retryAllowed ? (
                <p className="mt-3 text-sm leading-6 text-warning">ตรวจสอบคำขอเดิมก่อนส่งข้อมูลซ้ำ</p>
              ) : null}
            </form>
          </Panel>
        </>
      ) : null}

      {!recoveryLoaded ? <p aria-live="polite" className="mt-5 text-sm text-text-muted">กำลังตรวจสอบคำขอที่อาจค้างอยู่...</p> : null}

      <ConfirmDialog
        confirmLabel="เผยแพร่"
        description="เมื่อเผยแพร่ ผู้ป่วยที่เชื่อมกับโรงพยาบาลและเจ้าหน้าที่ที่เกี่ยวข้องจะเห็นเนื้อหานี้ กรุณาตรวจทานตัวอย่างก่อนยืนยัน"
        details={(
          <div className="min-w-0 space-y-2 text-left">
            <p className="text-sm text-text-muted">{selectedHospital?.name}{draft.category ? ` · ${HOSPITAL_CONTENT_CATEGORY_LABELS[draft.category]}` : ""}</p>
            <p className="break-words text-base font-semibold text-text">{draft.title.trim()}</p>
            <p className="line-clamp-6 whitespace-pre-wrap break-words text-sm leading-6 text-text">{draft.body.trim()}</p>
            {draft.sourceText.trim() ? <p className="break-all text-sm text-text-muted">แหล่งข้อมูล/อ้างอิง: {draft.sourceText.trim()}</p> : null}
            {images.length > 0 ? (
              <div>
                <p className="text-sm text-text-muted">{images.length} รูป ตามลำดับที่แสดง</p>
                <div className="mt-2 flex gap-2">
                  {images.map((image, index) => (
                    // eslint-disable-next-line @next/next/no-img-element -- local blob: preview of an unsent file; the Next optimizer cannot fetch it
                    <img alt={`ตัวอย่างภาพที่ ${index + 1}`} className="aspect-[4/3] w-1/3 rounded-control bg-surface-muted object-contain" key={image.key} src={image.previewUrl} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
        onCancel={() => setPublishConfirmOpen(false)}
        onConfirm={confirmPublish}
        open={publishConfirmOpen}
        title="เผยแพร่เนื้อหานี้หรือไม่"
      />

      <ConfirmDialog
        confirmLabel={confirmationLabel}
        confirmVariant="destructive"
        description={confirmationDescription}
        details={confirmationDetails}
        onCancel={cancelIntent}
        onConfirm={confirmIntent}
        open={confirmationIntent !== null}
        title={confirmationTitle}
      />
    </div>
  );
}
