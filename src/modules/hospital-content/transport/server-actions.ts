"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  ApplicationError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
} from "@/shared/errors/application-error";

import type {
  HospitalContentActionError,
  HospitalContentCreateActionState,
  HospitalContentField,
  HospitalContentMutationActionState,
  HospitalContentReadActionState,
  HospitalContentReconciliationActionState,
} from "./action-state";
import {
  hospitalContentArchiveSchema,
  hospitalContentCreateSchema,
  hospitalContentEditSchema,
  hospitalContentPublishSchema,
  hospitalContentReconcileSchema,
  hospitalContentWithdrawSchema,
} from "../schemas/hospital-content-schemas";
import {
  archiveHospitalContent,
  createHospitalContent,
  editHospitalContentDraft,
  publishHospitalContent,
  readHospitalContentForOwner,
  reconcileHospitalContentCreate,
  withdrawHospitalContent,
} from "../services/hospital-content-service";
import type { HospitalContentMutationResult } from "../types/hospital-content-projections";

const fieldMessages: Readonly<Record<HospitalContentField, string>> = {
  title: "ตรวจสอบหัวข้อและความยาวอีกครั้ง",
  body: "ตรวจสอบเนื้อหาและความยาวอีกครั้ง",
  category: "เลือกหมวดหมู่ที่ต้องการ",
  sourceText: "ตรวจสอบแหล่งข้อมูล/อ้างอิงอีกครั้ง",
};

function getFieldErrors(issues: readonly { path: readonly PropertyKey[] }[]): Partial<Record<HospitalContentField, string>> {
  const errors: Partial<Record<HospitalContentField, string>> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if ((field === "title" || field === "body" || field === "category" || field === "sourceText") && !errors[field]) {
      errors[field] = fieldMessages[field];
    }
  }
  return errors;
}

function mapError(error: unknown): HospitalContentActionError {
  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") return { status: "ERROR", code: "VALIDATION", message: "กรุณาตรวจสอบข้อมูลที่กรอก" };
    if (error.code === "CONFLICT") return { status: "ERROR", code: "CONFLICT", message: "ข้อมูลเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลปัจจุบันเพื่อตรวจสอบ" };
    if (error.code === "NOT_FOUND") return { status: "ERROR", code: "NOT_FOUND", message: "ไม่พบรายการนี้หรือไม่สามารถเข้าถึงได้" };
    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") return { status: "ERROR", code: "FORBIDDEN", message: "บัญชีนี้ไม่มีสิทธิ์จัดการเนื้อหาของโรงพยาบาลนี้" };
  }
  return { status: "ERROR", code: "UNAVAILABLE", message: "ระบบไม่พร้อมดำเนินการ กรุณาลองใหม่ภายหลัง" };
}

async function getActorOrError(): Promise<{ actor: Awaited<ReturnType<typeof getProtectedApplicationActor>> } | { error: HospitalContentActionError }> {
  try {
    return { actor: await getProtectedApplicationActor() };
  } catch (error: unknown) {
    return { error: mapError(error) };
  }
}

function validationError(issues: readonly { path: readonly PropertyKey[] }[]): HospitalContentActionError {
  const fieldErrors = getFieldErrors(issues);
  return {
    status: "ERROR",
    code: "VALIDATION",
    message: "กรุณาตรวจสอบข้อมูลที่กรอก",
    ...(Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {}),
  };
}

function revalidateContentPaths(result: HospitalContentMutationResult): void {
  if (result.outcome === "UNCONFIRMED" || result.outcome === "NOOP") return;
  try {
    revalidatePath("/app/hospitals/knowledge");
    revalidatePath(`/app/hospitals/knowledge/${result.content.id}`);
  } catch {
    // A known committed result remains confirmed if route revalidation fails.
  }
}

export async function createHospitalContentAction(input: unknown): Promise<HospitalContentCreateActionState> {
  const auth = await getActorOrError();
  if ("error" in auth) return auth.error;
  const parsed = hospitalContentCreateSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);
  try {
    const result = await createHospitalContent(auth.actor, input);
    if (result.outcome === "UNCONFIRMED") return { status: "UNCONFIRMED" };
    if (result.outcome === "CREATED") {
      try {
        revalidatePath("/app/hospitals/knowledge");
        revalidatePath(`/app/hospitals/knowledge/${result.content.id}`);
      } catch {
        // Preserve the confirmed transaction result.
      }
    }
    return { status: "SUCCESS", result };
  } catch (error: unknown) {
    return mapError(error);
  }
}

async function runMutation(
  input: unknown,
  parser: typeof hospitalContentEditSchema | typeof hospitalContentPublishSchema | typeof hospitalContentWithdrawSchema | typeof hospitalContentArchiveSchema,
  operation: (actor: Awaited<ReturnType<typeof getProtectedApplicationActor>>, data: unknown) => Promise<HospitalContentMutationResult>,
): Promise<HospitalContentMutationActionState> {
  const auth = await getActorOrError();
  if ("error" in auth) return auth.error;
  const parsed = parser.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);
  try {
    const result = await operation(auth.actor, input);
    if (result.outcome === "UNCONFIRMED") return { status: "UNCONFIRMED" };
    revalidateContentPaths(result);
    return { status: "SUCCESS", result };
  } catch (error: unknown) {
    return mapError(error);
  }
}

export async function editHospitalContentDraftAction(input: unknown): Promise<HospitalContentMutationActionState> {
  return runMutation(input, hospitalContentEditSchema, editHospitalContentDraft);
}

export async function publishHospitalContentAction(input: unknown): Promise<HospitalContentMutationActionState> {
  return runMutation(input, hospitalContentPublishSchema, publishHospitalContent);
}

export async function withdrawHospitalContentAction(input: unknown): Promise<HospitalContentMutationActionState> {
  return runMutation(input, hospitalContentWithdrawSchema, withdrawHospitalContent);
}

export async function archiveHospitalContentAction(input: unknown): Promise<HospitalContentMutationActionState> {
  return runMutation(input, hospitalContentArchiveSchema, archiveHospitalContent);
}

export async function readHospitalContentCurrentAction(contentId: unknown): Promise<HospitalContentReadActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    return { status: "SUCCESS", content: await readHospitalContentForOwner(actor, contentId) };
  } catch (error: unknown) {
    if (error instanceof ForbiddenError || error instanceof UnauthenticatedError) return { status: "FORBIDDEN" };
    if (error instanceof NotFoundError) return { status: "NOT_FOUND" };
    return { status: "UNAVAILABLE" };
  }
}

export async function reconcileHospitalContentCreateAction(input: unknown): Promise<HospitalContentReconciliationActionState> {
  const auth = await getActorOrError();
  if ("error" in auth) return auth.error;
  const parsed = hospitalContentReconcileSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues);
  try {
    const result = await reconcileHospitalContentCreate(auth.actor, input);
    return { status: "SUCCESS", result };
  } catch (error: unknown) {
    return mapError(error);
  }
}
