import { describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, InfrastructureError } from "@/shared/errors/application-error";
import { progressRelationship, progressStaff, progressPatient } from "../../../../tests/support/service-progress";
import { buildServiceProgress, getOwnServiceProgress } from "./patient-service-progress-query-service";
import type { PatientSelfQueryDatabase } from "./patient-self-query-service";

const actor: ActorContext = { userId: progressPatient.id, personId: "own-person", roles: [Role.PATIENT], hospitalMemberships: [], osmHospitalRelationships: [] };

describe("own service progress", () => {
  it("batches every ongoing own Hospital and enforces current database identity, role and lifecycle", async () => {
    const row = progressRelationship();
    const findFirst = vi.fn().mockResolvedValue({ patientProfile: { hospitalRelationships: [
      { ...row, appointments: [] }, { ...row, id: "second", hospital: { ...row.hospital, name: "โรงพยาบาลสอง" }, appointments: [{ scheduledAt: new Date("2026-11-01") }] },
    ] } });
    const database = { person: { findFirst } } as unknown as PatientSelfQueryDatabase;
    const progress = await getOwnServiceProgress(actor, { database, now: new Date("2026-10-29") });
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: actor.personId, user: { is: { id: actor.userId, status: "ACTIVE", roles: { some: { role: "PATIENT" } } } } },
      select: { patientProfile: { select: { hospitalRelationships: expect.objectContaining({
        where: { endedAt: null, hospital: { is: { status: "ACTIVE" } } },
        orderBy: [{ hospital: { name: "asc" } }, { id: "asc" }],
      }) } } },
    }));
    expect(progress).toHaveLength(2);
    expect(progress[0].nextAppointment).toBeNull();
    expect(progress[1].nextAppointment?.scheduledAt).toEqual(new Date("2026-11-01"));
    expect(progress[0].recordingRound?.canSelfRecord).toBe(true);
  });

  it("denies a non-PATIENT before reading, returns nothing for a missing own identity and sanitizes failures", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const database = { person: { findFirst } } as unknown as PatientSelfQueryDatabase;
    await expect(getOwnServiceProgress({ ...actor, roles: [Role.HOSPITAL] }, { database })).rejects.toBeInstanceOf(ForbiddenError);
    expect(findFirst).not.toHaveBeenCalled();
    await expect(getOwnServiceProgress(actor, { database })).resolves.toEqual([]);
    findFirst.mockRejectedValue(new Error("SQL private"));
    await expect(getOwnServiceProgress(actor, { database })).rejects.toEqual(new InfrastructureError("Patient service progress could not be loaded"));
  });

  it("splits TODO/done, excludes skips and FR-7 partial staff records without disclosing names or notes", () => {
    const record = progressRelationship();
    const program = record.programs[0];
    program.roundVitals = [{ id: "vitals", roundNumber: 1, serviceDate: new Date(), recordedAt: new Date(), weight: 70, heightCm: null, waistCircumference: null, systolicBloodPressure: null, diastolicBloodPressure: null, bloodSugar: null, recordedByUser: progressStaff }];
    program.serviceOneConfidences = [{ roundNumber: 1, recordedAt: new Date(), recordedByUser: progressPatient, score: 8, improvementPlan: "ข้อความลับ" }];
    program.roundStepSkips = [{ roundNumber: 1, planItemId: "plan-ROUTINE", stepCode: "ROUTINE", reasonCode: "PATIENT_DECLINED", note: "ข้อความลับ", createdAt: new Date(), skippedByUser: progressStaff }];
    const { progress, recordingRound } = buildServiceProgress(record, null, { readOnly: false });
    const round = progress.currentRound;
    expect(round?.selfRecordable.some(({ planItemId }) => planItemId === "plan-VITALS")).toBe(false);
    expect(round?.staffWillDo.some(({ planItemId }) => planItemId === "plan-VITALS")).toBe(true);
    expect(round?.done).toContainEqual(expect.objectContaining({ planItemId: "plan-CONFIDENCE_RULER", byPatient: true }));
    expect([...round?.selfRecordable ?? [], ...round?.staffWillDo ?? [], ...round?.done ?? []].some(({ planItemId }) => planItemId === "plan-ROUTINE")).toBe(false);
    expect(JSON.stringify(progress)).not.toMatch(/ชื่อเจ้าหน้าที่ลับ|ชื่อผู้ป่วย|ข้อความลับ|byDisplayName|doneNote/);
    expect(JSON.stringify(recordingRound)).not.toMatch(/ชื่อเจ้าหน้าที่ลับ|ชื่อผู้ป่วย/);
    expect(buildServiceProgress(record, undefined).recordingRound).toBeNull();
    expect(buildServiceProgress(record, undefined).progress).not.toHaveProperty("nextAppointment");
  });

  it("uses the patient wording for baseline, no program, final assessment and extra rounds", () => {
    const record = progressRelationship();
    record.programs = [];
    expect(buildServiceProgress(record, null).progress.stageLabel).toBe("ยังไม่เริ่ม");
    record.baseline = { id: "baseline" };
    expect(buildServiceProgress(record, null).progress.stageLabel).toBe("รอเริ่มโปรแกรม");
    record.programs = progressRelationship().programs;
    record.programs[0].rounds = [{ ...record.programs[0].rounds[0], roundNumber: 7, planItems: [] }];
    expect(buildServiceProgress(record, null).progress.stageLabel).toBe("ครั้งเพิ่มเติม 7");
    record.programs[0].roundCompletions = Array.from({ length: 6 }, (_, index) => ({ roundNumber: index + 1, completedAt: new Date(), completedByUser: progressStaff }));
    record.programs[0].rounds = Array.from({ length: 6 }, (_, index) => ({ roundNumber: index + 1, planItems: [] }));
    expect(buildServiceProgress(record, null).progress.stageLabel).toBe("รอการประเมินสุดท้าย");
    record.programs[0].finalAssessment = { serviceDate: new Date(), recordedAt: new Date(), recordedBy: progressStaff };
    expect(buildServiceProgress(record, null).progress.stageLabel).toBe("รอจบโปรแกรม");
  });
});
