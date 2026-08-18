"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";

import { hospitalGovernanceMutationSchema } from "../schemas/hospital-governance-schemas";
import { restoreHospital, suspendHospital } from "../services/hospital-governance-service";
import type { HospitalGovernanceMutationActionState } from "./action-state";

function getString(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function getMutationInput(formData: FormData): {
  hospitalId: string;
  expectedUpdatedAt: string;
} {
  return {
    hospitalId: getString(formData, "hospitalId"),
    expectedUpdatedAt: getString(formData, "expectedUpdatedAt"),
  };
}

function mapHospitalGovernanceError(error: unknown): {
  code: "INVALID_INPUT" | "FORBIDDEN" | "CONFLICT" | "UNAVAILABLE";
  message: string;
} {
  if (error instanceof ApplicationError) {
    if (error.code === "VALIDATION") {
      return {
        code: "INVALID_INPUT",
        message: "ข้อมูลการเปลี่ยนสถานะโรงพยาบาลไม่ถูกต้อง",
      };
    }

    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
      return {
        code: "FORBIDDEN",
        message: "บัญชีนี้ไม่มีสิทธิ์จัดการสถานะโรงพยาบาล",
      };
    }

    if (error.code === "CONFLICT" || error.code === "NOT_FOUND") {
      return {
        code: "CONFLICT",
        message: "สถานะโรงพยาบาลเปลี่ยนแปลงแล้วหรือข้อมูลที่โหลดไว้ล้าสมัย กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง",
      };
    }
  }

  return {
    code: "UNAVAILABLE",
    message: "ระบบไม่พร้อมเปลี่ยนสถานะโรงพยาบาลในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  };
}

function toMutationResultState(
  result: Awaited<ReturnType<typeof suspendHospital>>,
): HospitalGovernanceMutationActionState {
  if (result.status !== "ACTIVE" && result.status !== "SUSPENDED") {
    throw new Error("Unexpected Hospital governance lifecycle status");
  }

  return {
    status: "SUCCESS",
    result: {
      hospitalId: result.id,
      status: result.status,
      updatedAt: result.updatedAt.toISOString(),
    },
  };
}

function revalidateHospitalGovernance(hospitalId: string): void {
  revalidatePath("/app/admin/hospitals");
  revalidatePath(`/app/admin/hospitals/${hospitalId}`);
}

export async function suspendHospitalAction(
  _previousState: HospitalGovernanceMutationActionState,
  formData: FormData,
): Promise<HospitalGovernanceMutationActionState> {
  const parsed = hospitalGovernanceMutationSchema.safeParse(getMutationInput(formData));

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "ข้อมูลการระงับโรงพยาบาลไม่ถูกต้อง กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await suspendHospital(actor, parsed.data);
    revalidateHospitalGovernance(result.id);
    return toMutationResultState(result);
  } catch (error: unknown) {
    return { status: "ERROR", ...mapHospitalGovernanceError(error) };
  }
}

export async function restoreHospitalAction(
  _previousState: HospitalGovernanceMutationActionState,
  formData: FormData,
): Promise<HospitalGovernanceMutationActionState> {
  const parsed = hospitalGovernanceMutationSchema.safeParse(getMutationInput(formData));

  if (!parsed.success) {
    return {
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "ข้อมูลการคืนสถานะโรงพยาบาลไม่ถูกต้อง กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง",
    };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await restoreHospital(actor, parsed.data);
    revalidateHospitalGovernance(result.id);
    return toMutationResultState(result);
  } catch (error: unknown) {
    return { status: "ERROR", ...mapHospitalGovernanceError(error) };
  }
}
