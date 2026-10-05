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
  HospitalContactField,
  HospitalContactMutationActionState,
  HospitalContactReadActionState,
} from "./action-state";
import { hospitalContactMutationSchema } from "../schemas/hospital-contact-schemas";
import {
  readHospitalContactForOwner,
  updateHospitalContact,
} from "../services/hospital-contact-service";

function getFieldErrors(
  issues: readonly { path: readonly PropertyKey[] }[],
): Partial<Record<HospitalContactField, string>> {
  const fieldErrors: Partial<Record<HospitalContactField, string>> = {};

  for (const issue of issues) {
    const field = issue.path[0];

    if (field === "addressText" && !fieldErrors.addressText) {
      fieldErrors.addressText = "ตรวจสอบที่อยู่และข้อความที่กรอกอีกครั้ง";
    }

    if (field === "phoneNumber" && !fieldErrors.phoneNumber) {
      fieldErrors.phoneNumber = "ตรวจสอบหมายเลขโทรศัพท์และข้อความที่กรอกอีกครั้ง";
    }
  }

  return fieldErrors;
}

function mapMutationError(error: unknown): Extract<HospitalContactMutationActionState, { status: "ERROR" }> {
  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") {
      return {
        status: "ERROR",
        code: "VALIDATION",
        message: "กรุณาตรวจสอบข้อมูลติดต่อที่กรอก",
      };
    }

    if (error.code === "CONFLICT") {
      return {
        status: "ERROR",
        code: "CONFLICT",
        message: "ข้อมูลติดต่อเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลปัจจุบันเพื่อตรวจสอบ",
      };
    }

    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED" || error.code === "NOT_FOUND") {
      return {
        status: "ERROR",
        code: "FORBIDDEN",
        message: "บัญชีนี้ไม่มีสิทธิ์จัดการข้อมูลติดต่อของโรงพยาบาลนี้",
      };
    }
  }

  return {
    status: "ERROR",
    code: "UNAVAILABLE",
    message: "ระบบไม่พร้อมบันทึกข้อมูลติดต่อ กรุณาลองใหม่ภายหลัง",
  };
}

export async function readHospitalContactForOwnerAction(
  hospitalId: unknown,
): Promise<HospitalContactReadActionState> {
  try {
    const actor = await getProtectedApplicationActor();
    const contact = await readHospitalContactForOwner(actor, hospitalId);
    return { status: "SUCCESS", contact };
  } catch (error: unknown) {
    if (
      error instanceof ForbiddenError ||
      error instanceof UnauthenticatedError ||
      error instanceof NotFoundError
    ) {
      return { status: "FORBIDDEN" };
    }

    return { status: "UNAVAILABLE" };
  }
}

export async function updateHospitalContactAction(
  input: unknown,
): Promise<HospitalContactMutationActionState> {
  let actor;

  try {
    actor = await getProtectedApplicationActor();
  } catch (error: unknown) {
    return mapMutationError(error);
  }

  const parsed = hospitalContactMutationSchema.safeParse(input);

  if (!parsed.success) {
    const fieldErrors = getFieldErrors(parsed.error.issues);
    return {
      status: "ERROR",
      code: "VALIDATION",
      message: "กรุณาตรวจสอบข้อมูลติดต่อที่กรอก",
      ...(Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {}),
    };
  }

  try {
    const result = await updateHospitalContact(actor, input);

    if (result.outcome === "UNCONFIRMED") {
      return { status: "UNCONFIRMED" };
    }

    try {
      revalidatePath("/app/hospitals/contact");
      revalidatePath("/app/personal");
    } catch {
      // The transaction result is already known and must not be submitted again.
    }

    return { status: "SUCCESS", result };
  } catch (error: unknown) {
    return mapMutationError(error);
  }
}
