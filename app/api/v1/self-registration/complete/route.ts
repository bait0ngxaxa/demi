import { revalidatePath } from "next/cache";

import { ApplicationError, InfrastructureError, ValidationError } from "@/shared/errors/application-error";
import { completePublicSelfRegistration } from "@/modules/self-registration/services/self-registration-service";
import { publicSelfRegistrationJson, readBoundedJsonBody } from "@/modules/self-registration/transport/http-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const COMPLETION_UNAVAILABLE_MESSAGE = "ไม่สามารถลงทะเบียนได้ กรุณาเริ่มต้นใหม่หรือลองใหม่ภายหลัง";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await readBoundedJsonBody(request);
  } catch {
    return publicSelfRegistrationJson({ status: "ERROR", message: "กรุณาตรวจสอบข้อมูลแล้วลองใหม่" }, 400);
  }

  try {
    await completePublicSelfRegistration(body);
    revalidatePath("/app/workforce");
    revalidatePath("/app/patients");
    revalidatePath("/app/patients/assigned");
    return publicSelfRegistrationJson({ status: "SUCCESS" });
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return publicSelfRegistrationJson({ status: "ERROR", message: "กรุณาตรวจสอบชื่อและรหัสผ่านแล้วลองใหม่" }, 400);
    }
    if (error instanceof InfrastructureError && "requiresReconciliation" in error && error.requiresReconciliation === true) {
      return publicSelfRegistrationJson({ status: "ERROR", message: COMPLETION_UNAVAILABLE_MESSAGE }, 503);
    }
    if (error instanceof ApplicationError) {
      return publicSelfRegistrationJson({ status: "ERROR", message: COMPLETION_UNAVAILABLE_MESSAGE }, 409);
    }
    return publicSelfRegistrationJson({ status: "ERROR", message: COMPLETION_UNAVAILABLE_MESSAGE }, 503);
  }
}
