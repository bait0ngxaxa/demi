import { HospitalStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";

import {
  initialHospitalGovernanceMutationActionState,
} from "./action-state";
import {
  restoreHospitalAction,
  suspendHospitalAction,
} from "./server-actions";

const mockedRedirect = vi.hoisted(() => vi.fn());
const mockedRevalidatePath = vi.hoisted(() => vi.fn());
const mockedSuspendHospital = vi.hoisted(() => vi.fn());
const mockedRestoreHospital = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect: mockedRedirect }));
vi.mock("next/cache", () => ({ revalidatePath: mockedRevalidatePath }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: vi.fn(),
}));
vi.mock("../services/hospital-governance-service", () => ({
  restoreHospital: mockedRestoreHospital,
  suspendHospital: mockedSuspendHospital,
}));

const mockedGetProtectedApplicationActor = vi.mocked(getProtectedApplicationActor);

function createMutationFormData(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  formData.set("hospitalId", "11111111-1111-4111-8111-111111111111");
  formData.set("expectedUpdatedAt", "2026-08-18T05:00:00.000Z");

  for (const [key, value] of Object.entries(overrides)) {
    formData.set(key, value);
  }

  return formData;
}

describe("Hospital governance Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects malformed suspend input before resolving the actor", async () => {
    const result = await suspendHospitalAction(
      initialHospitalGovernanceMutationActionState,
      new FormData(),
    );

    expect(result).toMatchObject({ status: "ERROR", code: "INVALID_INPUT" });
    expect(mockedGetProtectedApplicationActor).not.toHaveBeenCalled();
    expect(mockedSuspendHospital).not.toHaveBeenCalled();
  });

  it("forwards only the exact Hospital and stale-write value for suspend", async () => {
    mockedGetProtectedApplicationActor.mockResolvedValue({
      userId: "admin-1",
      personId: "person-1",
      roles: [],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    });
    mockedSuspendHospital.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      hospitalCode: "DEMI-01",
      name: "โรงพยาบาลตัวอย่าง",
      status: HospitalStatus.SUSPENDED,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-18T05:00:01.000Z"),
    });

    const result = await suspendHospitalAction(
      initialHospitalGovernanceMutationActionState,
      createMutationFormData({ role: "ADMIN", status: "ACTIVE", reason: "untrusted" }),
    );

    expect(mockedSuspendHospital).toHaveBeenCalledWith(
      expect.anything(),
      {
        hospitalId: "11111111-1111-4111-8111-111111111111",
        expectedUpdatedAt: "2026-08-18T05:00:00.000Z",
      },
    );
    expect(result).toMatchObject({
      status: "SUCCESS",
      result: {
        hospitalId: "11111111-1111-4111-8111-111111111111",
        status: "SUSPENDED",
      },
    });
    expect(JSON.stringify(result)).not.toContain("untrusted");
  });

  it("uses the separate restore action and revalidates both governance routes", async () => {
    mockedGetProtectedApplicationActor.mockResolvedValue({
      userId: "admin-1",
      personId: "person-1",
      roles: [],
      hospitalMemberships: [],
      osmHospitalRelationships: [],
    });
    mockedRestoreHospital.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      hospitalCode: "DEMI-01",
      name: "โรงพยาบาลตัวอย่าง",
      status: HospitalStatus.ACTIVE,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-18T05:00:01.000Z"),
    });

    const result = await restoreHospitalAction(
      initialHospitalGovernanceMutationActionState,
      createMutationFormData({ status: "SUSPENDED" }),
    );

    expect(mockedRestoreHospital).toHaveBeenCalledWith(
      expect.anything(),
      {
        hospitalId: "11111111-1111-4111-8111-111111111111",
        expectedUpdatedAt: "2026-08-18T05:00:00.000Z",
      },
    );
    expect(mockedRevalidatePath).toHaveBeenNthCalledWith(1, "/app/admin/hospitals");
    expect(mockedRevalidatePath).toHaveBeenNthCalledWith(
      2,
      "/app/admin/hospitals/11111111-1111-4111-8111-111111111111",
    );
    expect(result).toMatchObject({ status: "SUCCESS", result: { status: "ACTIVE" } });
  });
});
