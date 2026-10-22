"use server";

import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError, ConflictError, ForbiddenError, ValidationError } from "@/shared/errors/application-error";

import { hospitalSelfRegistrationSettingSchema } from "../schemas/hospital-self-registration-settings-schema";
import { setHospitalSelfRegistrationEnabled } from "../services/hospital-self-registration-settings-service";

export type HospitalSelfRegistrationSettingActionState =
  | { status: "IDLE" }
  | { status: "SUCCESS"; enabled: boolean; changed: boolean }
  | { status: "ERROR"; message: string };

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function setHospitalSelfRegistrationEnabledAction(
  _previousState: HospitalSelfRegistrationSettingActionState,
  formData: FormData,
): Promise<HospitalSelfRegistrationSettingActionState> {
  const enabledValue = getString(formData, "enabled");
  const parsed = hospitalSelfRegistrationSettingSchema.safeParse({
    hospitalId: getString(formData, "hospitalId"),
    enabled: enabledValue === "true" ? true : enabledValue === "false" ? false : undefined,
  });
  if (!parsed.success) return { status: "ERROR", message: "ข้อมูลการตั้งค่าไม่ถูกต้อง กรุณาลองใหม่" };

  try {
    const actor = await getProtectedApplicationActor();
    const result = await setHospitalSelfRegistrationEnabled(actor, parsed.data);
    revalidatePath("/app/settings");
    revalidatePath("/app/workforce");
    revalidatePath("/app/patients");
    return { status: "SUCCESS", ...result };
  } catch (error: unknown) {
    if (error instanceof ValidationError) return { status: "ERROR", message: "ข้อมูลการตั้งค่าไม่ถูกต้อง กรุณาลองใหม่" };
    if (error instanceof ForbiddenError || error instanceof ApplicationError && error.code === "UNAUTHENTICATED") {
      return { status: "ERROR", message: "บัญชีนี้ไม่มีสิทธิ์เปลี่ยนการตั้งค่าโรงพยาบาล" };
    }
    if (error instanceof ConflictError) return { status: "ERROR", message: "ข้อมูลเปลี่ยนแปลงแล้ว กรุณาโหลดการตั้งค่าใหม่" };
    return { status: "ERROR", message: "บันทึกการตั้งค่าไม่สำเร็จ กรุณาลองใหม่" };
  }
}
