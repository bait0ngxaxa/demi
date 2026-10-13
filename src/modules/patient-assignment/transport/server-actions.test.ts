import { Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

const mockedActor = vi.hoisted(() => vi.fn());
const mockedAssign = vi.hoisted(() => vi.fn());
const mockedBulkAssign = vi.hoisted(() => vi.fn());
const mockedUnassign = vi.hoisted(() => vi.fn());
const mockedBulkCandidates = vi.hoisted(() => vi.fn());
const mockedRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedActor,
}));
vi.mock("next/cache", () => ({ revalidatePath: mockedRevalidatePath }));
vi.mock("../services/patient-osm-assignment-query-service", () => ({
  listPatientOsmBulkCandidates: mockedBulkCandidates,
}));
vi.mock("../services/patient-osm-assignment-service", () => ({
  assignOsmToPatient: mockedAssign,
  assignOsmToPatients: mockedBulkAssign,
  unassignOsmFromPatient: mockedUnassign,
}));

import {
  assignOsmToPatientAction,
  bulkAssignOsmToPatientsAction,
  searchPatientOsmBulkCandidatesAction,
  unassignOsmFromPatientAction,
} from "./server-actions";
import {
  initialPatientOsmAssignmentActionState,
  initialPatientOsmBulkAssignmentActionState,
} from "./action-state";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const osmUserId = "22222222-2222-4222-8222-222222222222";

const actor = {
  userId: "33333333-3333-4333-8333-333333333333",
  personId: "44444444-4444-4444-8444-444444444444",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
} satisfies ActorContext;

function formData(values: Record<string, string>): FormData {
  const data = new FormData();

  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }

  return data;
}

describe("Patient assignment Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedActor.mockResolvedValue(actor);
    mockedAssign.mockResolvedValue({
      operation: "ASSIGNED",
      patientHospitalRelationshipId: relationshipId,
      hospitalId: "55555555-5555-4555-8555-555555555555",
      assignmentId: "66666666-6666-4666-8666-666666666666",
      osmUserId,
      previousOsmUserId: null,
    });
    mockedUnassign.mockResolvedValue({
      operation: "UNASSIGNED",
      patientHospitalRelationshipId: relationshipId,
      hospitalId: "55555555-5555-4555-8555-555555555555",
      assignmentId: null,
      osmUserId: null,
      previousOsmUserId: osmUserId,
    });
  });

  it("passes only opaque assignment IDs to the application service", async () => {
    const result = await assignOsmToPatientAction(
      initialPatientOsmAssignmentActionState,
      formData({ patientHospitalRelationshipId: relationshipId, osmUserId }),
    );

    expect(result).toMatchObject({ status: "SUCCESS", result: { operation: "ASSIGNED" } });
    expect(mockedAssign).toHaveBeenCalledWith(actor, {
      patientHospitalRelationshipId: relationshipId,
      osmUserId,
    });
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/app/patients/assigned");
  });

  it("rejects malformed IDs before invoking the service", async () => {
    const result = await assignOsmToPatientAction(
      initialPatientOsmAssignmentActionState,
      formData({ patientHospitalRelationshipId: "not-an-id", osmUserId }),
    );

    expect(result).toEqual({
      status: "ERROR",
      code: "INVALID_INPUT",
      message: "กรุณาเลือก อสม. ที่ต้องการมอบหมาย",
    });
    expect(mockedAssign).not.toHaveBeenCalled();
  });

  it("maps forbidden assignment to a safe user-facing error", async () => {
    mockedAssign.mockRejectedValue(new ForbiddenError());

    const result = await assignOsmToPatientAction(
      initialPatientOsmAssignmentActionState,
      formData({ patientHospitalRelationshipId: relationshipId, osmUserId }),
    );

    expect(result).toEqual({
      status: "ERROR",
      code: "FORBIDDEN",
      message: "บัญชีนี้ไม่มีสิทธิ์จัดการการมอบหมายผู้ป่วย",
    });
  });

  it("passes unassignment through the same opaque relationship boundary", async () => {
    const result = await unassignOsmFromPatientAction(
      initialPatientOsmAssignmentActionState,
      formData({ patientHospitalRelationshipId: relationshipId }),
    );

    expect(result).toMatchObject({ status: "SUCCESS", result: { operation: "UNASSIGNED" } });
    expect(mockedUnassign).toHaveBeenCalledWith(actor, {
      patientHospitalRelationshipId: relationshipId,
    });
  });
  describe("bulkAssignOsmToPatientsAction", () => {
    const hospitalId = "55555555-5555-4555-8555-555555555555";
    const nonce = "77777777-7777-4777-8777-777777777777";
    const secondRelationshipId = "88888888-8888-4888-8888-888888888888";

    function bulkFormData(ids: readonly string[] = [relationshipId, secondRelationshipId]): FormData {
      const data = formData({ hospitalId, osmUserId, submissionNonce: nonce });

      for (const id of ids) {
        data.append("patientHospitalRelationshipId", id);
      }

      return data;
    }

    beforeEach(() => {
      mockedBulkAssign.mockResolvedValue({
        operation: "ASSIGNED",
        hospitalId,
        osmUserId,
        assignedCount: 2,
      });
    });

    it("passes only opaque IDs and the nonce to the service and refreshes the patient pages", async () => {
      const result = await bulkAssignOsmToPatientsAction(
        initialPatientOsmBulkAssignmentActionState,
        bulkFormData(),
      );

      expect(result).toMatchObject({ status: "SUCCESS", result: { operation: "ASSIGNED", assignedCount: 2 } });
      expect(mockedBulkAssign).toHaveBeenCalledWith(actor, {
        hospitalId,
        osmUserId,
        submissionNonce: nonce,
        patientHospitalRelationshipIds: [relationshipId, secondRelationshipId],
      });
      expect(mockedRevalidatePath).toHaveBeenCalledWith("/app/patients");
      expect(mockedRevalidatePath).toHaveBeenCalledWith("/app/patients/assign-osm");
    });

    it.each([
      ["no patient selected", []],
      ["a malformed patient id", ["not-an-id"]],
      ["a duplicated patient id", [relationshipId, relationshipId]],
    ])("rejects %s before invoking the service", async (_label, ids) => {
      const result = await bulkAssignOsmToPatientsAction(
        initialPatientOsmBulkAssignmentActionState,
        bulkFormData(ids),
      );

      expect(result).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
      expect(mockedBulkAssign).not.toHaveBeenCalled();
    });

    it("rejects a missing nonce", async () => {
      const data = bulkFormData();
      data.delete("submissionNonce");

      expect(
        await bulkAssignOsmToPatientsAction(initialPatientOsmBulkAssignmentActionState, data),
      ).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
      expect(mockedBulkAssign).not.toHaveBeenCalled();
    });

    it("rejects more than 500 patients", async () => {
      const ids = Array.from(
        { length: 501 },
        (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      );

      expect(
        await bulkAssignOsmToPatientsAction(initialPatientOsmBulkAssignmentActionState, bulkFormData(ids)),
      ).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
      expect(mockedBulkAssign).not.toHaveBeenCalled();
    });

    it("maps a forbidden assignment to the safe permission message", async () => {
      mockedBulkAssign.mockRejectedValue(new ForbiddenError());

      expect(
        await bulkAssignOsmToPatientsAction(initialPatientOsmBulkAssignmentActionState, bulkFormData()),
      ).toEqual({
        status: "ERROR",
        code: "FORBIDDEN",
        message: "บัญชีนี้ไม่มีสิทธิ์จัดการการมอบหมายผู้ป่วย",
      });
    });

    it("maps an already-assigned or vanished patient to a no-change conflict message", async () => {
      for (const error of [new ConflictError(), new NotFoundError()]) {
        mockedBulkAssign.mockRejectedValueOnce(error);

        const result = await bulkAssignOsmToPatientsAction(
          initialPatientOsmBulkAssignmentActionState,
          bulkFormData(),
        );

        expect(result).toMatchObject({ status: "ERROR", code: "CONFLICT" });
        expect(result.status === "ERROR" ? result.message : "").toContain("ระบบไม่บันทึกรายการใดเลย");
      }
    });

    it("returns a replayed result unchanged", async () => {
      mockedBulkAssign.mockResolvedValue({ operation: "REPLAYED", hospitalId, osmUserId, assignedCount: 2 });

      expect(
        await bulkAssignOsmToPatientsAction(initialPatientOsmBulkAssignmentActionState, bulkFormData()),
      ).toMatchObject({ status: "SUCCESS", result: { operation: "REPLAYED" } });
    });
  });

  describe("searchPatientOsmBulkCandidatesAction", () => {
    const hospitalId = "55555555-5555-4555-8555-555555555555";

    it("authorizes through the service with the protected actor and returns one page", async () => {
      mockedBulkCandidates.mockResolvedValue({
        candidates: [{ userId: osmUserId, displayName: "อสม. หนึ่ง" }],
        hasMore: true,
        nextCursor: osmUserId,
      });

      await expect(searchPatientOsmBulkCandidatesAction(hospitalId, "หนึ่ง")).resolves.toEqual({
        status: "OK",
        candidates: [{ userId: osmUserId, displayName: "อสม. หนึ่ง" }],
        hasMore: true,
        nextCursor: osmUserId,
      });
      expect(mockedBulkCandidates).toHaveBeenCalledWith(actor, { hospitalId, value: "หนึ่ง" });
    });

    it("passes the cursor to the service and returns the next cursor", async () => {
      const cursor = "66666666-6666-4666-8666-666666666666";
      mockedBulkCandidates.mockResolvedValue({ candidates: [], hasMore: false, nextCursor: null });

      await expect(searchPatientOsmBulkCandidatesAction(hospitalId, "", cursor)).resolves.toMatchObject({
        status: "OK",
        nextCursor: null,
      });
      expect(mockedBulkCandidates).toHaveBeenCalledWith(actor, { hospitalId, value: "", cursor });
    });

    it("returns a Thai error and no candidates when the service denies or fails", async () => {
      mockedBulkCandidates.mockRejectedValueOnce(new ForbiddenError());
      const denied = await searchPatientOsmBulkCandidatesAction(hospitalId, "");
      mockedBulkCandidates.mockRejectedValueOnce(new ValidationError("bad"));
      const invalid = await searchPatientOsmBulkCandidatesAction(hospitalId, "x");
      mockedActor.mockRejectedValueOnce(new Error("session"));
      const failed = await searchPatientOsmBulkCandidatesAction(hospitalId, "");

      for (const outcome of [denied, invalid, failed]) {
        expect(outcome.status).toBe("ERROR");
        expect(outcome).not.toHaveProperty("candidates");
      }
      expect(invalid).toMatchObject({ message: "คำค้นหา อสม. ไม่ถูกต้องหรือหมดอายุ กรุณาค้นหาใหม่" });
    });
  });
});
