import "server-only";

import { createHash } from "node:crypto";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { hasDirectHospitalProgramManageScope } from "@/modules/patient-program/policies/patient-program-policy";
import { lockActivePatientProgram } from "@/modules/patient-program/services/patient-program-lifecycle-service";
import { ForbiddenError } from "@/shared/errors/application-error";

import { RoundConflictError } from "../domain/round-conflict-error";
import { roundAchieveScoreRequestSchema, type RoundAchieveScoreRequest } from "../schemas/round-schemas";
import { findRoundSubmissionReceipt, roundAchieveScoreReceiptQuery } from "./round-recording-receipt";
import {
  patientProgramRoundServiceInternals,
  type PatientProgramRoundServiceDependencies,
  type PatientProgramRoundWriteResult,
} from "./round-service";

export const ROUND_ACHIEVE_SCORE_RECORDED_ACTION = "patient_program_round.achieve_score_recorded";

export type RoundAchieveScoreResult = PatientProgramRoundWriteResult & { score: number | null };

function requestHash(input: RoundAchieveScoreRequest): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

/**
 * AS-1 (AS-D1/AS-D2): records, corrects or clears (null) the hospital's Achieve score of an opened round.
 * Direct Hospital OWNER/MEMBER only, while the Program is ACTIVE; a completed round stays recordable because
 * the score is often judged at the next visit. Every change is audited with its old and new value, and that
 * audit row is the immutable nonce receipt, so a retried request never reapplies a value after a correction.
 */
export async function recordRoundAchieveScore(
  actor: ActorContext | null | undefined,
  input: unknown,
  dependencies: PatientProgramRoundServiceDependencies = {},
): Promise<RoundAchieveScoreResult> {
  const { runRoundWrite, writeResult, auditMetadata } = patientProgramRoundServiceInternals;

  return runRoundWrite<RoundAchieveScoreRequest, RoundAchieveScoreResult>(
    roundAchieveScoreRequestSchema,
    "ข้อมูล Achieve score ไม่ถูกต้อง",
    actor,
    input,
    dependencies,
    async (transaction, authorizedActor, parsed, now) => {
      const context = await lockActivePatientProgram(transaction, authorizedActor, parsed.patientProgramId.toLowerCase());

      if (!hasDirectHospitalProgramManageScope({ actor: context.access.actor, target: context.access.target })) {
        throw new ForbiddenError();
      }

      const hash = requestHash({ ...parsed, patientProgramId: context.program.id });
      const receipt = await findRoundSubmissionReceipt(transaction, roundAchieveScoreReceiptQuery(parsed.submissionNonce));

      if (receipt) {
        if (receipt.actorUserId !== context.access.actor.userId || receipt.requestHash !== hash) {
          throw new RoundConflictError("รหัสคำขอนี้ถูกใช้กับข้อมูลอื่นแล้ว");
        }

        return { ...writeResult("ALREADY_RECORDED", context, parsed.roundNumber), score: parsed.score };
      }

      const round = await transaction.patientProgramRound.findUnique({
        where: { patientProgramId_roundNumber: { patientProgramId: context.program.id, roundNumber: parsed.roundNumber } },
        select: { roundNumber: true },
      });

      if (!round) {
        throw new RoundConflictError(`ครั้งที่ ${parsed.roundNumber} ยังไม่เปิด จึงยังบันทึก Achieve score ไม่ได้`);
      }

      const existing = await transaction.patientProgramRoundAchieveScore.findUnique({
        where: { patientProgramId_roundNumber: { patientProgramId: context.program.id, roundNumber: parsed.roundNumber } },
        select: { id: true, score: true },
      });
      const previousScore = existing?.score?.toNumber() ?? null;
      const changed = previousScore !== parsed.score;
      let recordId = existing?.id;

      if (changed) {
        const written = {
          score: parsed.score,
          recordedByUserId: context.access.actor.userId,
          recordedAt: now,
          submissionNonce: parsed.submissionNonce,
        };
        const record = existing
          ? await transaction.patientProgramRoundAchieveScore.update({
              where: { id: existing.id },
              data: written,
              select: { id: true },
            })
          : await transaction.patientProgramRoundAchieveScore.create({
              data: {
                ...written,
                patientProgramId: context.program.id,
                patientHospitalRelationshipId: context.access.patient.patientHospitalRelationshipId,
                roundNumber: parsed.roundNumber,
              },
              select: { id: true },
            });
        recordId = record.id;
      }

      // An unchanged value is still receipted, so a retry of it cannot undo a later correction.
      await recordAuditEvent(
        {
          actorUserId: context.access.actor.userId,
          action: ROUND_ACHIEVE_SCORE_RECORDED_ACTION,
          resourceType: "PatientProgramRoundAchieveScore",
          ...(recordId ? { resourceId: recordId } : {}),
          metadata: {
            ...auditMetadata(context, parsed.roundNumber),
            previousScore,
            score: parsed.score,
            changed,
            submissionNonce: parsed.submissionNonce,
            requestHash: hash,
          },
        },
        transaction,
      );

      return { ...writeResult(changed ? "RECORDED" : "ALREADY_RECORDED", context, parsed.roundNumber), score: parsed.score };
    },
  );
}
