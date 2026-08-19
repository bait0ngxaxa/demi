import { afterEach, describe, expect, it, vi } from "vitest";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ConflictError } from "@/shared/errors/application-error";

import {
  completePatientActivation,
  getPatientActivationDetails,
  issuePatientActivation,
} from "../services/patient-activation-service";
import { findPatientActivationCandidates } from "../services/patient-activation-query-service";
import {
  initialPatientActivationCompletionActionState,
  initialPatientActivationIssueActionState,
} from "./action-state";
import {
  completePatientActivationAction,
  findPatientActivationCandidatesAction,
  getPatientActivationDetailsAction,
  issuePatientActivationAction,
} from "./server-actions";

const mockedRedirect = vi.hoisted(() => vi.fn());
const mockedRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect: mockedRedirect }));
vi.mock("next/cache", () => ({ revalidatePath: mockedRevalidatePath }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: vi.fn(),
}));
vi.mock("../services/patient-activation-service", () => ({
  completePatientActivation: vi.fn(),
  getPatientActivationDetails: vi.fn(),
  issuePatientActivation: vi.fn(),
}));
vi.mock("../services/patient-activation-query-service", () => ({
  findPatientActivationCandidates: vi.fn(),
}));

const mockedGetProtectedApplicationActor = vi.mocked(getProtectedApplicationActor);
const mockedIssuePatientActivation = vi.mocked(issuePatientActivation);
const mockedGetPatientActivationDetails = vi.mocked(getPatientActivationDetails);
const mockedCompletePatientActivation = vi.mocked(completePatientActivation);
const mockedFindPatientActivationCandidates = vi.mocked(findPatientActivationCandidates);

function createIssueFormData(reissue = false): FormData {
  const formData = new FormData();
  formData.set("userId", "11111111-1111-4111-8111-111111111111");
  formData.set("targetHospitalId", "22222222-2222-4222-8222-222222222222");
  formData.set("reissue", String(reissue));
  formData.set("role", "ADMIN");
  formData.set("status", "ACTIVE");
  return formData;
}

function createLookupFormData(lookupType = "NATIONAL_ID", value = "1000000000009"): FormData {
  const formData = new FormData();
  formData.set("targetHospitalId", "22222222-2222-4222-8222-222222222222");
  formData.set("lookupType", lookupType);
  formData.set("value", value);
  return formData;
}

describe("patient activation Server Actions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not resolve an actor for malformed issuance input", async () => {
    const result = await issuePatientActivationAction(
      initialPatientActivationIssueActionState,
      new FormData(),
    );

    expect(result).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    expect(mockedGetProtectedApplicationActor).not.toHaveBeenCalled();
    expect(mockedIssuePatientActivation).not.toHaveBeenCalled();
  });

  it("rejects an invalid reissue flag instead of defaulting it", async () => {
    const formData = createIssueFormData();
    formData.set("reissue", "unexpected");

    const result = await issuePatientActivationAction(
      initialPatientActivationIssueActionState,
      formData,
    );

    expect(result).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    expect(mockedGetProtectedApplicationActor).not.toHaveBeenCalled();
    expect(mockedIssuePatientActivation).not.toHaveBeenCalled();
  });

  it("does not resolve an actor for malformed activation lookup input", async () => {
    const result = await findPatientActivationCandidatesAction(
      { status: "IDLE" },
      new FormData(),
    );

    expect(result).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    expect(mockedGetProtectedApplicationActor).not.toHaveBeenCalled();
    expect(mockedFindPatientActivationCandidates).not.toHaveBeenCalled();
  });

  it("serializes only the activation lookup projection", async () => {
    mockedGetProtectedApplicationActor.mockResolvedValue({
      userId: "33333333-3333-4333-8333-333333333333",
      personId: "44444444-4444-4444-8444-444444444444",
      roles: [],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    });
    mockedFindPatientActivationCandidates.mockResolvedValue([
      {
        userId: "11111111-1111-4111-8111-111111111111",
        patientProfileId: "55555555-5555-4555-8555-555555555555",
        hospitalId: "22222222-2222-4222-8222-222222222222",
        displayName: "สมชาย ผู้ป่วย",
        hospitalNumber: "HN-001",
        accountStatus: "PROVISIONED",
        activationStatus: "NOT_ISSUED",
        activationExpiresAt: null,
        activationMayBeIssued: true,
      },
    ]);

    const result = await findPatientActivationCandidatesAction(
      { status: "IDLE" },
      createLookupFormData(),
    );

    expect(mockedFindPatientActivationCandidates).toHaveBeenCalledWith(
      expect.anything(),
      {
        targetHospitalId: "22222222-2222-4222-8222-222222222222",
        lookupType: "NATIONAL_ID",
        value: "1000000000009",
      },
    );
    expect(result).toEqual({
      status: "SUCCESS",
      candidates: [
        expect.objectContaining({
          displayName: "สมชาย ผู้ป่วย",
          activationStatus: "NOT_ISSUED",
          activationExpiresAt: null,
        }),
      ],
    });
    expect(JSON.stringify(result)).not.toContain("1000000000009");
    expect(JSON.stringify(result)).not.toContain("identityKeyHash");
  });

  it("returns actionable guidance when a name search is ambiguous", async () => {
    mockedGetProtectedApplicationActor.mockResolvedValue({
      userId: "33333333-3333-4333-8333-333333333333",
      personId: "44444444-4444-4444-8444-444444444444",
      roles: [],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    });
    mockedFindPatientActivationCandidates.mockRejectedValue(
      new ConflictError("Patient activation lookup returned too many matches"),
    );

    const result = await findPatientActivationCandidatesAction(
      { status: "IDLE" },
      createLookupFormData("NAME", "สมชาย"),
    );

    expect(result).toEqual({
      status: "ERROR",
      code: "TOO_MANY_RESULTS",
      message: "พบผู้ป่วยหลายรายการ กรุณาระบุชื่อให้ละเอียดขึ้น",
    });
  });

  it("passes only the explicit activation request and serializes an ephemeral URL token", async () => {
    mockedGetProtectedApplicationActor.mockResolvedValue({
      userId: "33333333-3333-4333-8333-333333333333",
      personId: "44444444-4444-4444-8444-444444444444",
      roles: [],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    });
    mockedIssuePatientActivation.mockResolvedValue({
      outcome: "ISSUED",
      userId: "11111111-1111-4111-8111-111111111111",
      patientProfileId: "55555555-5555-4555-8555-555555555555",
      hospitalId: "22222222-2222-4222-8222-222222222222",
      activationToken: "raw-token-is-returned-once",
      activationExpiresAt: new Date("2026-08-16T00:00:00.000Z"),
    });

    const result = await issuePatientActivationAction(
      initialPatientActivationIssueActionState,
      createIssueFormData(true),
    );

    expect(mockedIssuePatientActivation).toHaveBeenCalledWith(
      expect.anything(),
      {
        userId: "11111111-1111-4111-8111-111111111111",
        targetHospitalId: "22222222-2222-4222-8222-222222222222",
        reissue: true,
      },
    );
    expect(result).toMatchObject({
      status: "SUCCESS",
      result: {
        outcome: "ISSUED",
        activationToken: "raw-token-is-returned-once",
        activationExpiresAt: "2026-08-16T00:00:00.000Z",
      },
    });
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/app/patients/activation");
    expect(JSON.stringify(result)).not.toContain("ADMIN");
  });

  it("returns an explicit already-active result without asking for a new token", async () => {
    mockedGetProtectedApplicationActor.mockResolvedValue({
      userId: "33333333-3333-4333-8333-333333333333",
      personId: "44444444-4444-4444-8444-444444444444",
      roles: [],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    });
    mockedIssuePatientActivation.mockResolvedValue({
      outcome: "ALREADY_ACTIVE",
      userId: "11111111-1111-4111-8111-111111111111",
      patientProfileId: "55555555-5555-4555-8555-555555555555",
      hospitalId: "22222222-2222-4222-8222-222222222222",
      activationToken: null,
      activationExpiresAt: null,
    });

    const result = await issuePatientActivationAction(
      initialPatientActivationIssueActionState,
      createIssueFormData(),
    );

    expect(result).toMatchObject({ status: "SUCCESS", result: { outcome: "ALREADY_ACTIVE" } });
    expect(JSON.stringify(result)).not.toContain("password");
  });

  it("maps public activation details to safe display data", async () => {
    mockedGetPatientActivationDetails.mockResolvedValue({
      displayName: "สมชาย ผู้ป่วย",
      hospitalName: "โรงพยาบาลทดสอบ",
      activationExpiresAt: new Date("2026-08-16T00:00:00.000Z"),
    });

    await expect(getPatientActivationDetailsAction("opaque-token")).resolves.toEqual({
      status: "AVAILABLE",
      displayName: "สมชาย ผู้ป่วย",
      hospitalName: "โรงพยาบาลทดสอบ",
      activationExpiresAt: "2026-08-16T00:00:00.000Z",
    });
  });

  it("uses a generic public state for an invalid activation", async () => {
    mockedGetPatientActivationDetails.mockRejectedValue(new ConflictError());

    await expect(getPatientActivationDetailsAction("unknown-token")).resolves.toEqual({
      status: "INVALID",
      message: "ลิงก์เปิดใช้งานไม่ถูกต้องหรือหมดอายุ",
    });
  });

  it("validates password confirmation before calling the claim service", async () => {
    const formData = new FormData();
    formData.set("password", "patient-password-123");
    formData.set("passwordConfirmation", "different-password");

    const result = await completePatientActivationAction(
      "opaque-token",
      initialPatientActivationCompletionActionState,
      formData,
    );

    expect(result).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    expect(mockedCompletePatientActivation).not.toHaveBeenCalled();
  });

  it("passes the patient-owned password to the service and redirects after completion", async () => {
    mockedCompletePatientActivation.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      hospitalId: "22222222-2222-4222-8222-222222222222",
    });
    const formData = new FormData();
    formData.set("password", "patient-password-123");
    formData.set("passwordConfirmation", "patient-password-123");

    await completePatientActivationAction(
      "opaque-token",
      initialPatientActivationCompletionActionState,
      formData,
    );

    expect(mockedCompletePatientActivation).toHaveBeenCalledWith("opaque-token", {
      password: "patient-password-123",
      passwordConfirmation: "patient-password-123",
    });
    expect(mockedRedirect).toHaveBeenCalledWith("/login?activated=1");
  });
});
