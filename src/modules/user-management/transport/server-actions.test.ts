import { UserTakeoverProviderState } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  revalidatePath: vi.fn(),
  deleteRecord: vi.fn(),
  lock: vi.fn(),
  correctName: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/modules/auth/services/application-access-service", () => ({ getProtectedApplicationActor: mocks.actor }));
vi.mock("../services/user-record-deletion-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/user-record-deletion-service")>()),
  deleteUnusedUserRecord: mocks.deleteRecord,
}));
vi.mock("../services/user-takeover-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/user-takeover-service")>()),
  lockSuspectedTakeover: mocks.lock,
}));
vi.mock("@/modules/patient-hospital-profile/services/patient-name-correction-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/patient-hospital-profile/services/patient-name-correction-service")>()),
  correctWorkforcePersonName: mocks.correctName,
}));

import { PatientNameCorrectionRequiresAdminError } from "@/modules/patient-hospital-profile/services/patient-name-correction-service";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

import { UserRecordNotDeletableError } from "../services/user-record-deletion-service";
import { UserTakeoverNotEligibleError, UserTakeoverRequiresAdminError } from "../services/user-takeover-service";
import { initialUserRecordDeletionActionState, initialUserTakeoverActionState } from "./action-state";
import { correctWorkforcePersonNameAction, deleteUserRecordAction, lockSuspectedTakeoverAction } from "./server-actions";

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.actor.mockResolvedValue({ userId: "owner" });
});

describe("deleteUserRecordAction", () => {
  it("confirms a deletion only on the service result", async () => {
    mocks.deleteRecord.mockResolvedValue({ kind: "staff", hospitalId: "h" });
    await expect(deleteUserRecordAction(initialUserRecordDeletionActionState, new FormData())).resolves.toMatchObject({ success: true, outcome: "DELETED" });
  });

  it.each([
    [new UserRecordNotDeletableError(["HAS_DATA", "ACTIVATED"]), "NOT_DELETABLE", ["HAS_DATA", "ACTIVATED"]],
    [new ConflictError("changed"), "CONFLICT", []],
    [new NotFoundError(), "NOT_FOUND", []],
    [new ValidationError("bad"), "INVALID_CONFIRMATION", []],
    [new ForbiddenError(), "FORBIDDEN", []],
    [new Error("lost"), "UNAVAILABLE", []],
  ])("maps %s", async (error, outcome, blockers) => {
    mocks.deleteRecord.mockRejectedValue(error);
    await expect(deleteUserRecordAction(initialUserRecordDeletionActionState, new FormData())).resolves.toMatchObject({ success: false, outcome, blockers });
  });
});

describe("lockSuspectedTakeoverAction", () => {
  it("reports a quarantined provider result as locked but unconfirmed", async () => {
    mocks.lock.mockResolvedValue({ providerState: UserTakeoverProviderState.RECONCILIATION_REQUIRED, alreadyLocked: false });
    const state = await lockSuspectedTakeoverAction(initialUserTakeoverActionState, new FormData());
    expect(state).toMatchObject({ success: true, outcome: "LOCKED", providerState: "RECONCILIATION_REQUIRED" });
    expect(state.message).toContain("กดซ้ำ");
  });

  it.each([
    [new UserTakeoverRequiresAdminError(), "REQUIRES_ADMIN"],
    [new UserTakeoverNotEligibleError("NOT_ACTIVATED"), "NOT_ELIGIBLE"],
    [new ConflictError("changed"), "CONFLICT"],
    [new ValidationError("bad"), "INVALID_CONFIRMATION"],
    [new ForbiddenError(), "FORBIDDEN"],
    [new Error("lost"), "UNAVAILABLE"],
  ])("maps %s", async (error, outcome) => {
    mocks.lock.mockRejectedValue(error);
    await expect(lockSuspectedTakeoverAction(initialUserTakeoverActionState, new FormData())).resolves.toMatchObject({ success: false, outcome });
  });
});

describe("correctWorkforcePersonNameAction", () => {
  it.each([
    [new PatientNameCorrectionRequiresAdminError(), "FORBIDDEN"],
    [new ConflictError("changed"), "CONFLICT"],
    [new ValidationError("bad"), "INVALID_INPUT"],
    [new Error("lost"), "UNAVAILABLE"],
  ])("maps %s", async (error, code) => {
    mocks.correctName.mockRejectedValue(error);
    await expect(correctWorkforcePersonNameAction("staff", "relationship", { status: "IDLE", message: "" }, new FormData()))
      .resolves.toMatchObject({ status: "ERROR", code });
  });
});
