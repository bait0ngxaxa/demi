import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { patientProvisionScopeSchema } from "@/modules/patient-provisioning/schemas/patient-provisioning-schemas";
import {
  patientImportDownloadErrorResponse,
  patientImportDownloadResponse,
} from "@/modules/patient-provisioning/transport/patient-import-download-responses";
import { createPatientImportTemplateDownload } from "@/modules/patient-provisioning/transport/patient-import-downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parsed = patientProvisionScopeSchema.safeParse({
    targetHospitalId: url.searchParams.get("hospitalId"),
  });
  const queryKeys = [...url.searchParams.keys()];

  if (!parsed.success || queryKeys.length !== 1 || queryKeys[0] !== "hospitalId") {
    return Response.json(
      { error: "ข้อมูลคำขอ Template ไม่ถูกต้อง" },
      { status: 400, headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  }

  try {
    const actor = await getProtectedApplicationActor();
    return patientImportDownloadResponse(
      await createPatientImportTemplateDownload(actor, parsed.data.targetHospitalId),
    );
  } catch (error: unknown) {
    return patientImportDownloadErrorResponse(error);
  }
}
