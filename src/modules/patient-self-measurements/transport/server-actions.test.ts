import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

const mocked = vi.hoisted(() => ({
  actor: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocked.revalidate }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mocked.actor,
}));
vi.mock("../services/patient-self-measurement-service", () => ({
  createOwnPatientSelfMeasurement: mocked.create,
  deleteOwnPatientSelfMeasurement: mocked.remove,
}));

import {
  createOwnPatientSelfMeasurementAction,
  deleteOwnPatientSelfMeasurementAction,
  type PatientSelfMeasurementActionState,
} from "./server-actions";

const measurementForm = new FormData();
measurementForm.set("submissionNonce", "11111111-1111-4111-8111-111111111111");
measurementForm.set("measuredAt", "2026-10-17T09:30");
measurementForm.set("weight", "70");
measurementForm.set("bloodSugarUnit", "mg/dL");
measurementForm.set("note", "");

describe("Patient self-measurement Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.actor.mockResolvedValue({ userId: "patient" });
  });

  it.each([
    ["create", createOwnPatientSelfMeasurementAction, mocked.create],
    ["delete", deleteOwnPatientSelfMeasurementAction, mocked.remove],
  ] as const)("distinguishes expired sessions from forbidden access for %s", async (_name, action, service) => {
    service.mockRejectedValueOnce(new UnauthenticatedError());
    const expired: PatientSelfMeasurementActionState = await action(
      { status: "IDLE" },
      measurementForm,
    );
    expect(expired).toEqual({
      status: "ERROR",
      message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง",
      loginHref: "/login",
    });

    service.mockRejectedValueOnce(new ForbiddenError());
    const forbidden: PatientSelfMeasurementActionState = await action(
      { status: "IDLE" },
      measurementForm,
    );
    expect(forbidden).toEqual({
      status: "ERROR",
      message: "บัญชีนี้ไม่มีสิทธิ์บันทึกข้อมูลนี้",
    });
  });
});
