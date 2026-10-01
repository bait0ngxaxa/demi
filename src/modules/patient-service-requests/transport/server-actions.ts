"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";

import {
  createPatientServiceRequest,
  reviewPatientServiceRequest,
  withdrawOwnPatientServiceRequest,
} from "../services/patient-service-request-service";
import { setHospitalServiceOffering } from "../services/patient-service-catalog-service";
import {
  hospitalServiceOfferingMutationSchema,
  patientServiceRequestCreateSchema,
  patientServiceRequestIdSchema,
} from "../schemas/patient-service-request-schemas";
import type { PatientServiceMutationActionState } from "./action-state";

const hospitalServiceRequestReviewSchema = z
  .object({
    requestId: z.uuid(),
    decision: z.enum(["APPROVE", "REJECT", "START"]),
  })
  .strict();

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function mapMutationError(error: unknown): PatientServiceMutationActionState {
  if (error instanceof ApplicationError) {
    if (error.code === "FORBIDDEN") {
      return { status: "ERROR", message: "บัญชีนี้ไม่มีสิทธิ์ดำเนินการในขอบเขตนี้" };
    }

    if (error.code === "NOT_FOUND") {
      return { status: "ERROR", message: "ไม่พบรายการที่ต้องการดำเนินการ" };
    }

    if (error.code === "CONFLICT") {
      return { status: "ERROR", message: "คำขอซ้ำหรือสถานะเปลี่ยนไปแล้ว กรุณาตรวจสอบรายการอีกครั้ง" };
    }

    if (error.code === "VALIDATION") {
      return { status: "ERROR", message: "กรุณาตรวจสอบข้อมูลที่เลือกแล้วลองอีกครั้ง" };
    }
  }

  return { status: "ERROR", message: "ระบบไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง" };
}

export async function setHospitalServiceOfferingAction(
  _previousState: PatientServiceMutationActionState,
  formData: FormData,
): Promise<PatientServiceMutationActionState> {
  const enabledValue = formString(formData, "enabled");
  const parsed = hospitalServiceOfferingMutationSchema.safeParse({
    hospitalId: formString(formData, "hospitalId"),
    code: formString(formData, "code"),
    enabled: enabledValue === "true" ? true : enabledValue === "false" ? false : undefined,
  });

  if (!parsed.success) {
    return { status: "ERROR", message: "กรุณาตรวจสอบรายการบริการที่เลือก" };
  }

  try {
    const actor = await getProtectedApplicationActor();
    await setHospitalServiceOffering(actor, parsed.data);
    revalidatePath("/app/patients/service-catalog");
    revalidatePath("/app/patients/service-requests");
    revalidatePath("/app/personal/services");
    return { status: "SUCCESS" };
  } catch (error: unknown) {
    return mapMutationError(error);
  }
}

export async function createPatientServiceRequestAction(
  _previousState: PatientServiceMutationActionState,
  formData: FormData,
): Promise<PatientServiceMutationActionState> {
  const preferredOsmRelationshipId = formString(formData, "preferredOsmRelationshipId");
  const parsed = patientServiceRequestCreateSchema.safeParse({
    relationshipId: formString(formData, "relationshipId"),
    offeringId: formString(formData, "offeringId"),
    preferredOsmRelationshipId: preferredOsmRelationshipId || null,
  });

  if (!parsed.success) {
    return { status: "ERROR", message: "กรุณาเลือกบริการและตรวจสอบผู้ดูแลที่ต้องการ" };
  }

  try {
    const actor = await getProtectedApplicationActor();
    await createPatientServiceRequest(actor, parsed.data);
    revalidatePath("/app/personal/services");
    revalidatePath("/app/personal");
    revalidatePath("/app/patients/service-requests");
    return { status: "SUCCESS" };
  } catch (error: unknown) {
    return mapMutationError(error);
  }
}

export async function withdrawOwnPatientServiceRequestAction(
  _previousState: PatientServiceMutationActionState,
  formData: FormData,
): Promise<PatientServiceMutationActionState> {
  const parsed = patientServiceRequestIdSchema.safeParse({
    requestId: formString(formData, "requestId"),
  });

  if (!parsed.success) {
    return { status: "ERROR", message: "ไม่พบคำขอที่ต้องการถอน" };
  }

  try {
    const actor = await getProtectedApplicationActor();
    await withdrawOwnPatientServiceRequest(actor, parsed.data);
    revalidatePath("/app/personal/services");
    revalidatePath("/app/patients/service-requests");
    return { status: "SUCCESS" };
  } catch (error: unknown) {
    return mapMutationError(error);
  }
}

export async function reviewPatientServiceRequestAction(
  _previousState: PatientServiceMutationActionState,
  formData: FormData,
): Promise<PatientServiceMutationActionState> {
  const parsed = hospitalServiceRequestReviewSchema.safeParse({
    requestId: formString(formData, "requestId"),
    decision: formString(formData, "decision"),
  });

  if (!parsed.success) {
    return { status: "ERROR", message: "ไม่พบคำขอหรือการดำเนินการที่เลือก" };
  }

  try {
    const actor = await getProtectedApplicationActor();
    await reviewPatientServiceRequest(actor, { requestId: parsed.data.requestId }, parsed.data.decision);
    revalidatePath("/app/patients/service-requests");
    revalidatePath("/app/personal/services");
    return { status: "SUCCESS" };
  } catch (error: unknown) {
    return mapMutationError(error);
  }
}
