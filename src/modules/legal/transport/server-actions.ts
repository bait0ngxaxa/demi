"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";

import { LEGAL_VERSION_CHANGED_MESSAGE } from "../domain/legal-documents";
import { formatLegalDateTime } from "../domain/legal-views";
import {
  acceptCurrentLegalTerms,
  createLegalDraft,
  getUserLegalHistory,
  publishLegalVersion,
  recordConsentDecision,
  updateLegalDraft,
} from "../services/legal-service";
import { LegalVersionConflictError } from "../services/legal-version-reader";
import { getRequestLegalChannel } from "./legal-request";
import { LEGAL_ACCEPTANCE_SOURCE_LABELS, LEGAL_CHANNEL_LABELS, type LegalActionState, type UserLegalHistoryState } from "./legal-action-state";

function mapLegalActionError(error: unknown, fallback: string): LegalActionState {
  if (error instanceof LegalVersionConflictError) {
    return { status: "ERROR", code: "LEGAL_VERSION_CHANGED", message: LEGAL_VERSION_CHANGED_MESSAGE };
  }
  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") return { status: "ERROR", code: "VALIDATION", message: "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบแล้วลองอีกครั้ง" };
    if (error.code === "CONFLICT") return { status: "ERROR", code: "CONFLICT", message: "สถานะเปลี่ยนไปแล้ว กรุณาโหลดข้อมูลล่าสุด" };
    if (error.code === "NOT_FOUND") return { status: "ERROR", code: "CONFLICT", message: "ไม่พบเอกสารฉบับนี้ กรุณาโหลดข้อมูลล่าสุด" };
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
      return { status: "ERROR", code: "FORBIDDEN", message: "บัญชีนี้ไม่มีสิทธิ์ดำเนินการนี้" };
    }
  }
  return { status: "ERROR", code: "UNAVAILABLE", message: fallback };
}

function revalidateLegal(): void {
  revalidatePath("/app", "layout");
  revalidatePath("/app/settings/legal");
}

/** Settings "ยอมรับเวอร์ชันใหม่" (LG-D7). */
export async function acceptCurrentLegalTermsAction(input: unknown): Promise<LegalActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    const pair = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    await acceptCurrentLegalTerms(actor, { ...pair, channel: await getRequestLegalChannel() });
    revalidateLegal();
    return { status: "SUCCESS" };
  } catch (error: unknown) {
    return mapLegalActionError(error, "บันทึกการยอมรับไม่สำเร็จ กรุณาลองใหม่");
  }
}

/** Settings give/withdraw consent (LG-D4, PATIENT only); the nonce makes a retry of the same click idempotent. */
export async function recordConsentDecisionAction(input: unknown): Promise<LegalActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    const decision = input && typeof input === "object" && !Array.isArray(input) ? input : {};
    await recordConsentDecision(actor, { ...decision, channel: await getRequestLegalChannel() });
    revalidateLegal();
    return { status: "SUCCESS" };
  } catch (error: unknown) {
    return mapLegalActionError(error, "บันทึกความยินยอมไม่สำเร็จ กรุณาลองใหม่");
  }
}

function formString(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

/** ADMIN: new draft (LG-D3). */
export async function createLegalDraftAction(_previous: LegalActionState, formData: FormData): Promise<LegalActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    const { versionId } = await createLegalDraft(actor, {
      kind: formString(formData, "kind"),
      versionLabel: formString(formData, "versionLabel"),
      title: formString(formData, "title"),
      body: formString(formData, "body"),
    });
    revalidatePath("/app/admin/legal");
    return { status: "SUCCESS", versionId };
  } catch (error: unknown) {
    if (error instanceof ApplicationError && error.code === "CONFLICT") {
      return { status: "ERROR", code: "CONFLICT", message: "มีฉบับที่ใช้ชื่อฉบับนี้แล้ว กรุณาตั้งชื่อฉบับใหม่" };
    }
    return mapLegalActionError(error, "สร้างร่างไม่สำเร็จ กรุณาลองใหม่");
  }
}

/** ADMIN: edit a draft; a published version can no longer change. */
export async function updateLegalDraftAction(_previous: LegalActionState, formData: FormData): Promise<LegalActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    const versionId = formString(formData, "versionId");
    await updateLegalDraft(actor, {
      versionId,
      versionLabel: formString(formData, "versionLabel"),
      title: formString(formData, "title"),
      body: formString(formData, "body"),
    });
    revalidatePath("/app/admin/legal");
    revalidatePath(`/app/admin/legal/${versionId}`);
    return { status: "SUCCESS", versionId };
  } catch (error: unknown) {
    return mapLegalActionError(error, "บันทึกร่างไม่สำเร็จ กรุณาลองใหม่");
  }
}

/** ADMIN: publish the exact draft that was previewed (confirmation dialog in the UI). */
export async function publishLegalVersionAction(input: unknown): Promise<LegalActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    const { versionId } = await publishLegalVersion(actor, input);
    revalidatePath("/app/admin/legal");
    revalidatePath(`/app/admin/legal/${versionId}`);
    revalidatePath("/app", "layout");
    return { status: "SUCCESS", versionId };
  } catch (error: unknown) {
    return mapLegalActionError(error, "ประกาศใช้ไม่สำเร็จ กรุณาลองใหม่");
  }
}

/** ADMIN: one User's legal history by exact national ID (DPO request); every lookup is audited by the service. */
export async function lookupUserLegalHistoryAction(_previous: UserLegalHistoryState, formData: FormData): Promise<UserLegalHistoryState> {
  try {
    const actor = await getProtectedApplicationActor();
    const history = await getUserLegalHistory(actor, { nationalId: formString(formData, "nationalId").replace(/[\s-]/gu, "") });
    if (!history) return { status: "NOT_FOUND" };
    return {
      status: "FOUND",
      displayName: history.displayName,
      acceptances: history.acceptances.map((acceptance) => ({
        id: acceptance.id,
        acceptedAt: formatLegalDateTime(acceptance.acceptedAt.toISOString()),
        terms: acceptance.terms.versionLabel,
        privacy: acceptance.privacy.versionLabel,
        source: LEGAL_ACCEPTANCE_SOURCE_LABELS[acceptance.source],
        channel: acceptance.channel ? LEGAL_CHANNEL_LABELS[acceptance.channel] : "คำสั่งผู้ดูแลระบบ DEMI",
      })),
      consentEvents: history.consentEvents.map((event) => ({
        id: event.id,
        kind: event.kind,
        decision: event.decision,
        decidedAt: formatLegalDateTime(event.decidedAt.toISOString()),
        versionLabel: event.version.versionLabel,
        channel: LEGAL_CHANNEL_LABELS[event.channel],
      })),
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError && error.code === "VALIDATION") {
      return { status: "ERROR", message: "กรุณากรอกเลขบัตรประชาชน 13 หลักให้ถูกต้อง" };
    }
    const mapped = mapLegalActionError(error, "ค้นหาไม่สำเร็จ กรุณาลองใหม่");
    return { status: "ERROR", message: mapped.status === "ERROR" ? mapped.message : "ค้นหาไม่สำเร็จ กรุณาลองใหม่" };
  }
}
