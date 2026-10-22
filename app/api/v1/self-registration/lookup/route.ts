import { InfrastructureError, ValidationError } from "@/shared/errors/application-error";
import {
  lookupPublicSelfRegistration,
  SELF_REGISTRATION_RETRY_MESSAGE,
  SelfRegistrationRateLimitedError,
} from "@/modules/self-registration/services/self-registration-service";
import {
  getTrustedClientIpAddress,
  publicSelfRegistrationJson,
  readBoundedJsonBody,
} from "@/modules/self-registration/transport/http-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await readBoundedJsonBody(request);
  } catch {
    return publicSelfRegistrationJson(
      { message: "กรุณากรอกเลขบัตรประชาชน 13 หลักให้ถูกต้อง" },
      400,
    );
  }

  try {
    const outcome = await lookupPublicSelfRegistration(
      body,
      { ipAddress: getTrustedClientIpAddress(request) ?? "" },
    );
    return publicSelfRegistrationJson(outcome);
  } catch (error: unknown) {
    if (error instanceof SelfRegistrationRateLimitedError) {
      return publicSelfRegistrationJson({ outcome: "RETRY", message: SELF_REGISTRATION_RETRY_MESSAGE }, 429);
    }
    if (error instanceof ValidationError) {
      return publicSelfRegistrationJson(
        { message: "กรุณากรอกเลขบัตรประชาชน 13 หลักให้ถูกต้อง" },
        400,
      );
    }
    if (error instanceof InfrastructureError) {
      return publicSelfRegistrationJson({ outcome: "RETRY", message: SELF_REGISTRATION_RETRY_MESSAGE }, 503);
    }
    return publicSelfRegistrationJson({ outcome: "RETRY", message: SELF_REGISTRATION_RETRY_MESSAGE }, 503);
  }
}
