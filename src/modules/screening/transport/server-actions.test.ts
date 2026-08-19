import { Role } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError } from "@/shared/errors/application-error";

const mockedActor = vi.hoisted(() => vi.fn());
const mockedSubmit = vi.hoisted(() => vi.fn());
const mockedRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mockedActor,
}));
vi.mock("../services/screening-service", () => ({
  submitScreening: mockedSubmit,
}));
vi.mock("next/cache", () => ({ revalidatePath: mockedRevalidatePath }));

import { initialScreeningActionState } from "./action-state";
import * as serverActions from "./server-actions";
import { submitScreeningAction } from "./server-actions";

const relationshipId = "11111111-1111-4111-8111-111111111111";
const nonce = "22222222-2222-4222-8222-222222222222";
const actor = {
  userId: "33333333-3333-4333-8333-333333333333",
  personId: "44444444-4444-4444-8444-444444444444",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
} satisfies ActorContext;

function screeningFormData(): FormData {
  const data = new FormData();
  data.set("patientHospitalRelationshipId", relationshipId);
  data.set("submissionNonce", nonce);
  for (let index = 1; index <= 5; index += 1) {
    data.set(`pam-${index}`, "2");
  }
  for (let index = 1; index <= 4; index += 1) {
    data.set(`proms-${index}`, "3");
  }
  data.set("confidenceScore", "7");
  data.set("confidenceImprovementPlan", "แผนต้นแบบ");
  return data;
}

describe("Screening Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedActor.mockResolvedValue(actor);
    mockedSubmit.mockResolvedValue({
      screeningAssessmentId: "55555555-5555-4555-8555-555555555555",
      patientHospitalRelationshipId: relationshipId,
      hospitalId: "66666666-6666-4666-8666-666666666666",
      submittedAt: new Date("2026-08-16T05:00:00.000Z"),
      result: {
        pamTotal: 10,
        promsTotal: 12,
        promsMin: 3,
        combinedTotal: 22,
        percentage: 50,
        level: "L3",
        zone: "YELLOW",
      },
    });
  });

  it("exports only async Server Action functions", () => {
    expect(Object.keys(serverActions)).toEqual(["submitScreeningAction"]);
    expect(serverActions.submitScreeningAction.constructor.name).toBe("AsyncFunction");
  });

  it("passes only raw validated answers and opaque references to the service", async () => {
    const result = await submitScreeningAction(initialScreeningActionState, screeningFormData());

    expect(result).toMatchObject({ status: "SUCCESS" });
    expect(mockedSubmit).toHaveBeenCalledWith(actor, {
      patientHospitalRelationshipId: relationshipId,
      submissionNonce: nonce,
      responses: {
        pam: { "pam-1": 2, "pam-2": 2, "pam-3": 2, "pam-4": 2, "pam-5": 2 },
        proms: { "proms-1": 3, "proms-2": 3, "proms-3": 3, "proms-4": 3 },
        confidenceScore: 7,
        confidenceImprovementPlan: "แผนต้นแบบ",
      },
    });
    expect(mockedRevalidatePath).toHaveBeenCalledWith(`/app/patients/${relationshipId}`);
    expect(mockedRevalidatePath).toHaveBeenCalledWith(`/app/patients/${relationshipId}/screenings`);
  });

  it.each(["missing answer", "duplicate answer", "browser result"]) (
    "rejects %s before invoking the service",
    async (caseName) => {
      const data = screeningFormData();

      if (caseName === "missing answer") {
        data.delete("pam-1");
      }

      if (caseName === "duplicate answer") {
        data.append("pam-1", "3");
      }

      if (caseName === "browser result") {
        data.set("level", "L4");
      }

      const result = await submitScreeningAction(initialScreeningActionState, data);

      expect(result).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
      expect(mockedSubmit).not.toHaveBeenCalled();
    },
  );

  it("maps a forbidden server decision to a safe user-facing error", async () => {
    mockedSubmit.mockRejectedValue(new ForbiddenError());

    await expect(submitScreeningAction(initialScreeningActionState, screeningFormData())).resolves.toEqual({
      status: "ERROR",
      code: "FORBIDDEN",
      message: "บัญชีนี้ไม่มีสิทธิ์ทำแบบประเมินสำหรับผู้ป่วยรายนี้",
    });
  });
});
