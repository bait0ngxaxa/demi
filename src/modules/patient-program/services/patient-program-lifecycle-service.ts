import "server-only";

import { HospitalStatus, PatientProgramStatus, Prisma, Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/shared/errors/application-error";

import { resolveOwnPatientRelationshipContext } from "@/modules/patient-self/services/patient-self-query-service";
import { decidePatientSelfRoundRecordPolicy, PATIENT_PROGRAM_ROUND_SELF_RECORD } from "@/modules/patient-self/policies/patient-self-policy";
import { currentOpenRound } from "@/modules/patient-program-rounds/services/round-sequencing";
import { RoundConflictError } from "@/modules/patient-program-rounds/domain/round-conflict-error";
import type { RoundStepCode } from "@/modules/patient-program-rounds/domain/round-steps";

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
  patientSelfRecording?: boolean;
  recordingRoundNumber?: number;
};

/**
 * Serializes a Program-owned mutation with Program completion by performing
 * the same conditional no-op update used by the Service 1 workflow.
 */
export async function lockActivePatientProgram(
  transaction: Prisma.TransactionClient,
  actor: ActorContext,
  patientProgramId: string,
  recording?: { stepCode: RoundStepCode; roundNumber?: number },
): Promise<ActivePatientProgramMutationContext> {
  let access: PatientProgramAccessContext;
  let patientSelfRecording = false;
  try {
    access = await resolvePatientProgramByIdAccessContext(actor, patientProgramId, PATIENT_PROGRAM_MANAGE_CAPABILITY, transaction);
  } catch (error: unknown) {
    if (!recording || !(error instanceof ForbiddenError || error instanceof NotFoundError)) throw error;
    if (!actor.roles.includes(Role.PATIENT)) throw error;
    const locator = await transaction.patientProgram.findUnique({ where: { id: patientProgramId }, select: { patientHospitalRelationshipId: true, patientHospitalRelationship: { select: { hospitalId: true } } } });
    if (!locator) throw new ForbiddenError();
    let relationship;
    try {
      relationship = await resolveOwnPatientRelationshipContext(actor, locator.patientHospitalRelationshipId, { database: transaction });
    } catch (scopeError: unknown) {
      if (scopeError instanceof NotFoundError) throw new ForbiddenError();
      throw scopeError;
    }
    if (relationship.careEndedAt !== null || relationship.hospitalStatus !== HospitalStatus.ACTIVE) throw new ForbiddenError();
    access = {
      actor: { ...actor, roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] },
      patient: { userId: actor.userId, patientHospitalRelationshipId: relationship.relationshipId, displayName: "ผู้ป่วย", hospitalNumber: relationship.hospitalNumber, hospital: { id: locator.patientHospitalRelationship.hospitalId, name: relationship.hospitalName } },
      target: { hospitalId: locator.patientHospitalRelationship.hospitalId, hospitalStatus: relationship.hospitalStatus, assignedOsmUserId: null },
    };
    patientSelfRecording = true;
  }
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
    if (patientSelfRecording) throw new RoundConflictError("ไม่สามารถบันทึกข้อมูลในโปรแกรมที่เสร็จสิ้นแล้ว");
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

  let recordingRoundNumber = recording?.roundNumber;
  if (patientSelfRecording && recording) {
    const current = await currentOpenRound(transaction, program.id);
    const items = await transaction.patientProgramRoundPlanItem.findMany({ where: { patientProgramId: program.id, roundNumber: current, removedAt: null }, select: { stepCode: true } });
    const decision = decidePatientSelfRoundRecordPolicy({ actor: access.actor, capability: PATIENT_PROGRAM_ROUND_SELF_RECORD, ownActiveRelationship: true, programActive: true, roundNumber: recording.roundNumber ?? current, currentOpenRoundNumber: current, stepCode: recording.stepCode, activePlanStepCodes: items.map((item) => item.stepCode) });
    if (!decision.allowed) throw new RoundConflictError("บันทึกได้เฉพาะรายการที่ผู้ป่วยบันทึกเองได้ในแผนครั้งที่เปิดอยู่");
    recordingRoundNumber = current;
  }
  return { access, program, ...(recording ? { patientSelfRecording, recordingRoundNumber } : {}) };
}

