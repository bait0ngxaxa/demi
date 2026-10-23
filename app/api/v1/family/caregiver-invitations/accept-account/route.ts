import { revalidatePath } from "next/cache";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ApplicationError } from "@/shared/errors/application-error";
import { getTrustedClientIpAddress, publicSelfRegistrationJson, readBoundedJsonBody } from "@/modules/self-registration/transport/http-response";
import {
  CaregiverAccountClaimRateLimitedError,
  CaregiverAccountClaimRejectedError,
  createCaregiverAccountFromInvitation,
} from "@/modules/family/services/caregiver-account-claim-service";
import { CAREGIVER_INVITATION_UNAVAILABLE_MESSAGE } from "@/modules/family/transport/action-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rejectedResponse = {
  status: "ERROR",
  message: CAREGIVER_INVITATION_UNAVAILABLE_MESSAGE,
} as const;

export async function POST(request: Request): Promise<Response> {
  try {
    await getProtectedApplicationActor();
    return publicSelfRegistrationJson(rejectedResponse, 400);
  } catch (error: unknown) {
    if (!(error instanceof ApplicationError) || error.code !== "UNAUTHENTICATED") {
      return publicSelfRegistrationJson(rejectedResponse, 400);
    }
  }

  let input: unknown;
  try {
    input = await readBoundedJsonBody(request);
  } catch {
    return publicSelfRegistrationJson(rejectedResponse, 400);
  }

  try {
    await createCaregiverAccountFromInvitation(input, {
      ipAddress: getTrustedClientIpAddress(request) ?? "",
    });
    revalidatePath("/app/family");
    revalidatePath("/app/family/invitations");
    return publicSelfRegistrationJson({ status: "ACCEPTED" }, 201);
  } catch (error: unknown) {
    if (error instanceof CaregiverAccountClaimRateLimitedError) {
      return publicSelfRegistrationJson({ status: "ERROR", message: "ลองใหม่ภายหลัง" }, 429);
    }
    if (error instanceof CaregiverAccountClaimRejectedError) {
      return publicSelfRegistrationJson(rejectedResponse, 400);
    }
    return publicSelfRegistrationJson({
      status: "ERROR",
      message: "ระบบไม่สามารถสร้างบัญชีได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง",
    }, 503);
  }
}
