import "server-only";

import { PatientProgramStatus, Prisma } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  ConflictError,
  NotFoundError,
} from "@/shared/errors/application-error";

import { PATIENT_PROGRAM_MANAGE_CAPABILITY } from "../policies/patient-program-policy";
import {
  resolvePatientProgramByIdAccessContext,
  type PatientProgramAccessContext,
} from "./patient-program-access-service";

export const patientProgramLifecycleSelect = {
  id: true,
  patientHospitalRelationshipId: true,
  status: true,
  completedAt: true,
  startedAt: true,
} satisfies Prisma.PatientProgramSelect;

export type PatientProgramLifecycleRecord = Prisma.PatientProgramGetPayload<{
  select: typeof patientProgramLifecycleSelect;
}>;

export type ActivePatientProgramMutationContext = {
  access: PatientProgramAccessContext;
  program: PatientProgramLifecycleRecord;
};

/**
 * Serializes a Program-owned mutation with Program completion by performing
 * the same conditional no-op update used by the Service 1 workflow.
 */
export async function lockActivePatientProgram(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  patientProgramId: string,
): Promise<ActivePatientProgramMutationContext> {
  const access = await resolvePatientProgramByIdAccessContext(
    actor,
    patientProgramId,
    PATIENT_PROGRAM_MANAGE_CAPABILITY,
    transaction,
  );
  const program = await transaction.patientProgram.findFirst({
    where: {
      id: patientProgramId,
      patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
    },
    select: patientProgramLifecycleSelect,
  });

  if (!program) {
    throw new NotFoundError();
  }

  if (program.status !== PatientProgramStatus.ACTIVE || program.completedAt !== null) {
    throw new ConflictError("ไม่สามารถบันทึกข้อมูลในโปรแกรมที่เสร็จสิ้นแล้ว");
  }

  // Completion updates this same row with the same lifecycle predicates. If
  // completion wins the serialization order, this update affects zero rows.
  const locked = await transaction.patientProgram.updateMany({
    where: {
      id: program.id,
      patientHospitalRelationshipId: program.patientHospitalRelationshipId,
      status: PatientProgramStatus.ACTIVE,
      completedAt: null,
    },
    data: { startedAt: program.startedAt },
  });

  if (locked.count !== 1) {
    throw new ConflictError("โปรแกรมถูกเปลี่ยนสถานะแล้ว กรุณาตรวจสอบข้อมูลล่าสุด");
  }

  return { access, program };
}

