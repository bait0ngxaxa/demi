import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthenticatedError, ValidationError } from "@/shared/errors/application-error";

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

  it("revalidates the patient history after a confirmed create", async () => {
    mocked.create.mockResolvedValue({
      outcome: "CREATED",
      item: {
        measurementId: "22222222-2222-4222-8222-222222222222",
        measuredAt: new Date("2026-10-16T05:00:00.000Z"),
        createdAt: new Date("2026-10-16T05:00:00.000Z"),
        weight: 70,
        bloodSugar: null,
        systolicBloodPressure: null,
        diastolicBloodPressure: null,
        note: null,
      },
    });

    const result: PatientSelfMeasurementActionState = await createOwnPatientSelfMeasurementAction(
      { status: "IDLE" },
      measurementForm,
    );

    expect(result).toEqual({ status: "SUCCESS", message: "บันทึกแล้ว" });
    expect(mocked.revalidate).toHaveBeenCalledWith("/app/personal/measurements");
  });

  it("marks only known input validation failures as recoverable", async () => {
    mocked.create.mockRejectedValueOnce(new ValidationError());

    const result: PatientSelfMeasurementActionState = await createOwnPatientSelfMeasurementAction(
      { status: "IDLE" },
      measurementForm,
    );

    expect(result).toEqual({
      status: "ERROR",
      message: "กรุณาตรวจสอบค่าที่บันทึกและวันเวลา หากบันทึกน้ำตาลให้ใช้หน่วย mg/dL (ไม่เป็นอนาคตและไม่เกิน 1 ปีย้อนหลัง)",
      recovery: "RECOVERABLE",
    });
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
      message: "หมดเวลาเข้าสู่ระบบ กรุณาเข้าสู่ระบบอีกครั้ง",
      recovery: "CRITICAL",
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
      recovery: "CRITICAL",
    });
  });
});
