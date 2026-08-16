import { Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";

const mockedActor = vi.hoisted(() => vi.fn());
const mockedAssign = vi.hoisted(() => vi.fn());
const mockedUnassign = vi.hoisted(() => vi.fn());
const mockedRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedActor,
}));
vi.mock("next/cache", () => ({ revalidatePath: mockedRevalidatePath }));
vi.mock("../services/patient-osm-assignment-service", () => ({
  assignOsmToPatient: mockedAssign,
  unassignOsmFromPatient: mockedUnassign,
}));

import {
  assignOsmToPatientAction,
  unassignOsmFromPatientAction,
} from "./server-actions";
import { initialPatientOsmAssignmentActionState } from "./action-state";

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
});
