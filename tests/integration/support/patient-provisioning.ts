import { Prisma } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { DEFAULT_SERIALIZABLE_TRANSACTION_RETRIES, runSerializableTransaction } from "@/lib/db/serializable-transaction";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { revokeCaregiverInvitationTakeoverSessionsAfterCommit } from "@/modules/account-security/services/caregiver-invitation-takeover-lock";
import { assertPatientBulkProvisioningPolicy, PATIENT_PROVISIONING_CAPABILITY } from "@/modules/patient-provisioning/policies/patient-provisioning-policy";
import { patientProvisionInputSchema, type ProvisionPatientInput } from "@/modules/patient-provisioning/schemas/patient-provisioning-schemas";
import type { PatientProvisioningServiceDependencies } from "@/modules/patient-provisioning/services/patient-provisioning-service";
import { PatientProvisioningConflictError, provisionPatientInTransaction, type PatientProvisioningResult } from "@/modules/patient-provisioning/services/patient-provisioning-transaction";
import { ApplicationError, ForbiddenError, InfrastructureError, ValidationError } from "@/shared/errors/application-error";

/** Tests of care domains seed through the import's internal row operation, never a retired transport. */
export async function provisionPatientFixture(
  actor: ActorContext | null | undefined,
  input: ProvisionPatientInput,
  dependencies: PatientProvisioningServiceDependencies = {},
): Promise<PatientProvisioningResult> {
  const parsed = patientProvisionInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Patient fixture data is invalid");
  assertPatientBulkProvisioningPolicy({ actor, capability: PATIENT_PROVISIONING_CAPABILITY, targetHospitalId: parsed.data.targetHospitalId });
  if (!actor) throw new ForbiddenError();
  try {
    const database = dependencies.database ?? getPrisma();
    const result = await runSerializableTransaction(database, (transaction) =>
      provisionPatientInTransaction(transaction, actor, parsed.data, "BULK"),
    dependencies.transactionRetries ?? DEFAULT_SERIALIZABLE_TRANSACTION_RETRIES);
    if (result.takeoverTask) {
      await revokeCaregiverInvitationTakeoverSessionsAfterCommit(database, result.takeoverTask, {
        revokeProviderSessions: dependencies.revokeProviderSessions,
      });
    }
    return result;
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) {
      throw new PatientProvisioningConflictError("RECONCILIATION_REQUIRED", "Patient fixture conflicted with another request");
    }
    throw new InfrastructureError("Patient fixture could not be created");
  }
}
