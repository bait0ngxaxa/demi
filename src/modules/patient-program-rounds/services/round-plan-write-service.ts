import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { lockActivePatientProgram } from "@/modules/patient-program/services/patient-program-lifecycle-service";
import { RoundConflictError } from "../domain/round-conflict-error";
import { MAX_PROGRAM_ROUNDS } from "../domain/round-catalog";
import { computeRoundStatus, roundPlan, roundPlanItemUnavailableReason, ROUND_ITEM_CATALOG } from "../domain/round-steps";
import { roundCompletionRequestSchema, roundPlanItemIdSchema } from "../schemas/round-schemas";
import { patientProgramRoundServiceInternals, type PatientProgramRoundServiceDependencies, type PatientProgramRoundWriteResult } from "./round-service";
import { buildProgramRoundFacts, loadProgramRoundRecord } from "./round-query-service";
import { assertRoundWritable } from "./round-sequencing";


export const addRoundPlanItemSchema = roundCompletionRequestSchema.extend({
  stepCode: z.enum(Object.keys(ROUND_ITEM_CATALOG) as [keyof typeof ROUND_ITEM_CATALOG, ...(keyof typeof ROUND_ITEM_CATALOG)[]]),
  customTitle: z.string().trim().min(1).max(120).optional(),
}).refine((input) => input.stepCode === "CUSTOM" ? input.customTitle !== undefined : input.customTitle === undefined);

export const changeRoundPlanItemSchema = roundCompletionRequestSchema.extend({ planItemId: roundPlanItemIdSchema });
export const customItemDoneSchema = changeRoundPlanItemSchema.extend({ note: z.string().trim().max(500).optional() });
export const addProgramRoundSchema = roundCompletionRequestSchema.omit({ roundNumber: true });

type PlanWriteResult = PatientProgramRoundWriteResult & { planItemId?: string };
type PlanOperation = "added" | "removed" | "done" | "undone";

/** The Program lock serializes edits and completion. The audit receipt makes a nonce retry independent of later edits. */
async function changePlan(
  actor: ActorContext | null | undefined,
  input: unknown,
  operation: PlanOperation,
  dependencies: PatientProgramRoundServiceDependencies,
): Promise<PlanWriteResult> {
  const { runRoundWrite, writeResult, auditMetadata } = patientProgramRoundServiceInternals;
  const schema = operation === "added" ? addRoundPlanItemSchema : operation === "done" ? customItemDoneSchema : changeRoundPlanItemSchema;
  return runRoundWrite<z.output<typeof schema>, PlanWriteResult>(schema, "ข้อมูลรายการในแผนไม่ถูกต้อง", actor, input, dependencies, async (tx, authorizedActor, parsed, now) => {
    const context = await lockActivePatientProgram(tx, authorizedActor, parsed.patientProgramId.toLowerCase(), operation === "done" ? { stepCode: "CUSTOM", roundNumber: parsed.roundNumber } : undefined);
    const requestHash = createHash("sha256").update(JSON.stringify({ operation, ...parsed })).digest("hex");
    const receipt = await tx.auditEvent.findFirst({
      where: { metadata: { path: ["submissionNonce"], equals: parsed.submissionNonce } },
      select: { actorUserId: true, resourceId: true, metadata: true },
    });
    if (receipt) {
      const metadata = receipt.metadata;
      if (receipt.actorUserId !== context.access.actor.userId || !metadata || typeof metadata !== "object" || Array.isArray(metadata) || metadata.requestHash !== requestHash) {
        throw new RoundConflictError("คำขอนี้ใช้กับข้อมูลอื่นแล้ว");
      }
      return { ...writeResult("ALREADY_RECORDED", context, parsed.roundNumber), planItemId: receipt.resourceId ?? undefined };
    }
    await assertRoundWritable(tx, context.program.id, parsed.roundNumber);
    const record = await loadProgramRoundRecord(tx, context.program.id, context.access.patient.patientHospitalRelationshipId);
    const facts = buildProgramRoundFacts(record);
    const status = computeRoundStatus(facts, parsed.roundNumber, roundPlan(facts, parsed.roundNumber));
    let planItemId: string;
    if (operation === "added" && "stepCode" in parsed) {
      const reason = roundPlanItemUnavailableReason(facts, parsed.roundNumber, parsed.stepCode);
      if (reason) throw new RoundConflictError(reason);
      const position = await tx.patientProgramRoundPlanItem.aggregate({ where: { patientProgramId: context.program.id, roundNumber: parsed.roundNumber }, _max: { position: true } });
      const created = await tx.patientProgramRoundPlanItem.create({ data: {
        patientProgramId: context.program.id, patientHospitalRelationshipId: context.access.patient.patientHospitalRelationshipId,
        roundNumber: parsed.roundNumber, stepCode: parsed.stepCode, customTitle: parsed.customTitle ?? null,
        position: (position._max.position ?? 0) + 1, origin: "ADDED", addedByUserId: context.access.actor.userId, createdAt: now,
      }, select: { id: true } });
      planItemId = created.id;
    } else if ("planItemId" in parsed) {
      const item = await tx.patientProgramRoundPlanItem.findFirst({ where: { id: parsed.planItemId, patientProgramId: context.program.id, roundNumber: parsed.roundNumber, removedAt: null }, select: { id: true, stepCode: true } });
      if (!item) throw new RoundConflictError("รายการนี้ไม่อยู่ในแผนที่เปิดอยู่");
      planItemId = item.id;
      if (operation === "removed") {
        if (status.steps.find((step) => step.planItemId === item.id)?.status === "DONE" || await tx.patientProgramRoundStepSkip.findUnique({ where: { planItemId: item.id }, select: { id: true } })) {
          throw new RoundConflictError("ตัดออกได้เฉพาะรายการที่ยังไม่ทำ และต้องยกเลิกการข้ามก่อน");
        }
        await tx.patientProgramRoundPlanItem.update({ where: { id: item.id }, data: { removedAt: now, removedByUserId: context.access.actor.userId }, select: { id: true } });
      } else {
        if (item.stepCode !== "CUSTOM") throw new RoundConflictError("ทำเครื่องหมายได้เฉพาะรายการกำหนดเอง");
        await tx.patientProgramRoundPlanItem.update({ where: { id: item.id }, data: operation === "done"
          ? { doneAt: now, doneByUserId: context.access.actor.userId, doneNote: "note" in parsed ? parsed.note || null : null }
          : { doneAt: null, doneByUserId: null, doneNote: null }, select: { id: true } });
      }
    } else {
      throw new RoundConflictError("ข้อมูลรายการไม่สอดคล้องกับคำขอ");
    }
    await recordAuditEvent({ actorUserId: context.access.actor.userId, action: `patient_program_round_plan_item.${operation}`, resourceType: "PatientProgramRoundPlanItem", resourceId: planItemId, metadata: { ...auditMetadata(context, parsed.roundNumber), submissionNonce: parsed.submissionNonce, requestHash } }, tx);
    return { ...writeResult("RECORDED", context, parsed.roundNumber), planItemId };
  });
}

export async function addRoundPlanItem(actor: ActorContext | null | undefined, input: unknown, dependencies: PatientProgramRoundServiceDependencies = {}): Promise<PlanWriteResult> {
  return changePlan(actor, input, "added", dependencies);
}

export async function removeRoundPlanItem(actor: ActorContext | null | undefined, input: unknown, dependencies: PatientProgramRoundServiceDependencies = {}): Promise<PlanWriteResult> {
  return changePlan(actor, input, "removed", dependencies);
}

export async function markCustomItemDone(actor: ActorContext | null | undefined, input: unknown, dependencies: PatientProgramRoundServiceDependencies = {}): Promise<PlanWriteResult> {
  return changePlan(actor, input, "done", dependencies);
}

export async function unmarkCustomItemDone(actor: ActorContext | null | undefined, input: unknown, dependencies: PatientProgramRoundServiceDependencies = {}): Promise<PlanWriteResult> {
  return changePlan(actor, input, "undone", dependencies);
}

export async function addProgramRound(actor: ActorContext | null | undefined, input: unknown, dependencies: PatientProgramRoundServiceDependencies = {}): Promise<PatientProgramRoundWriteResult> {
  const { runRoundWrite, writeResult, auditMetadata } = patientProgramRoundServiceInternals;
  return runRoundWrite(addProgramRoundSchema, "ข้อมูลครั้งบริการไม่ถูกต้อง", actor, input, dependencies, async (tx, authorizedActor, parsed, now) => {
    const context = await lockActivePatientProgram(tx, authorizedActor, parsed.patientProgramId.toLowerCase());
    const receipt = await tx.patientProgramRound.findUnique({ where: { submissionNonce: parsed.submissionNonce }, select: { patientProgramId: true, openedByUserId: true, roundNumber: true } });
    if (receipt) {
      if (receipt.patientProgramId !== context.program.id || receipt.openedByUserId !== context.access.actor.userId) throw new RoundConflictError("คำขอนี้ใช้กับข้อมูลอื่นแล้ว");
      return writeResult("ALREADY_RECORDED", context, receipt.roundNumber);
    }
    const opened = await tx.patientProgramRound.findMany({ where: { patientProgramId: context.program.id }, select: { roundNumber: true } });
    const completions = await tx.patientProgramRoundCompletion.findMany({ where: { patientProgramId: context.program.id }, select: { roundNumber: true } });
    const completed = new Set(completions.map((round) => round.roundNumber));
    const next = Math.max(0, ...opened.map((round) => round.roundNumber)) + 1;
    if (next < 7 || next > MAX_PROGRAM_ROUNDS || opened.some((round) => !completed.has(round.roundNumber))) throw new RoundConflictError("ต้องจบบริการทุกครั้งก่อน และเพิ่มได้ไม่เกิน 12 ครั้ง");
    if (await tx.patientFinalAssessment.findUnique({ where: { patientProgramId: context.program.id }, select: { id: true } })) throw new RoundConflictError("บันทึกการประเมินหลังจบโปรแกรมแล้ว เพิ่มครั้งบริการไม่ได้");
    const round = await tx.patientProgramRound.create({ data: { patientProgramId: context.program.id, patientHospitalRelationshipId: context.access.patient.patientHospitalRelationshipId, roundNumber: next, origin: "EXTRA", openedByUserId: context.access.actor.userId, openedAt: now, submissionNonce: parsed.submissionNonce }, select: { id: true } });
    await recordAuditEvent({ actorUserId: context.access.actor.userId, action: "patient_program_round.opened", resourceType: "PatientProgramRound", resourceId: round.id, metadata: auditMetadata(context, next) }, tx);
    return writeResult("RECORDED", context, next);
  });
}
