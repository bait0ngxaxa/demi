"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { setOwnAppointmentLineNotificationPreference } from "@/modules/appointments/services/appointment-line-notification-preference-service";

export type AppointmentLineNotificationPreferenceActionState =
  | { status: "IDLE" }
  | { status: "SUCCESS"; enabled: boolean; canEnable: boolean }
  | { status: "ERROR"; message: string };

const targetSchema = z.enum(["true", "false"]);

export async function setAppointmentLineNotificationPreferenceAction(
  _previousState: AppointmentLineNotificationPreferenceActionState,
  formData: FormData,
): Promise<AppointmentLineNotificationPreferenceActionState> {
  const values = formData.getAll("enabled");
  const parsed = values.length === 1 && typeof values[0] === "string"
    ? targetSchema.safeParse(values[0])
    : null;
  if (!parsed?.success) {
    return { status: "ERROR", message: "คำขอไม่ถูกต้อง กรุณาโหลดหน้าแล้วลองใหม่" };
  }

  try {
    const actor = await getProtectedApplicationActor();
    const result = await setOwnAppointmentLineNotificationPreference(actor, parsed.data === "true");
    revalidatePath("/line/account");
    return { status: "SUCCESS", ...result };
  } catch {
    return {
      status: "ERROR",
      message: "บันทึกการตั้งค่าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
    };
  }
}
