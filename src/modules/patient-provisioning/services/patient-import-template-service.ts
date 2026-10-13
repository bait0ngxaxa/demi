import "server-only";

import { getPrisma } from "@/lib/db/prisma";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  ApplicationError,
  ForbiddenError,
  InfrastructureError,
} from "@/shared/errors/application-error";

import type { PatientImportTemplateTarget } from "../import/patient-import-template-validation";
import { assertPatientProvisioningActorInDatabase } from "./patient-provisioning-transaction";
import { validateRosterImportTarget } from "./patient-roster-import-preview";
import type { PatientRosterImportDatabase } from "./patient-roster-import-types";

/**
 * Resolves the Hospital a template, preview, commit or failed-rows export is bound
 * to. Authorization is the import policy itself (direct, active scope in that
 * Hospital); an out-of-scope Hospital fails closed before any workbook exists.
 */
export async function resolvePatientImportTemplateTarget(
  actor: ActorContext | null | undefined,
  targetHospitalId: string,
  database: PatientRosterImportDatabase = getPrisma(),
): Promise<PatientImportTemplateTarget> {
  const hospitalId = validateRosterImportTarget(actor, targetHospitalId);

  if (!actor) {
    throw new ForbiddenError();
  }

  try {
    await assertPatientProvisioningActorInDatabase(database, actor.userId, hospitalId, "BULK");

    const hospital = await database.hospital.findUnique({
      where: { id: hospitalId },
      select: { hospitalCode: true, name: true },
    });

    if (!hospital) {
      throw new ForbiddenError();
    }

    return {
      hospitalId,
      hospitalCode: hospital.hospitalCode,
      hospitalName: hospital.name,
    };
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }

    throw new InfrastructureError("Patient import Hospital could not be resolved");
  }
}
