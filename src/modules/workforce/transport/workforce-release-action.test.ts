import { beforeEach, describe, expect, it, vi } from "vitest";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import {
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from "@/shared/errors/application-error";

import { releaseWorkforceRelationship } from "../services/workforce-service";
import { initialWorkforceReleaseActionState } from "./action-state";
import { releaseWorkforceAction } from "./workforce-release-action";

const mockedRevalidatePath = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ revalidatePath: mockedRevalidatePath }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: vi.fn(),
}));
vi.mock("../services/workforce-service", () => ({ releaseWorkforceRelationship: vi.fn() }));

const form = new FormData();
form.set("relationshipId", "relationship-1");
form.set("confirmation", "นำออกจากระบบ");

beforeEach(() => {
  vi.mocked(getProtectedApplicationActor).mockReset().mockResolvedValue({ userId: "actor-1" } as never);
  vi.mocked(releaseWorkforceRelationship).mockReset().mockResolvedValue({ relationshipId: "relationship-1", hospitalId: "hospital-1" });
  mockedRevalidatePath.mockReset();
});

describe("releaseWorkforceAction outcome classification", () => {
  it("returns RELEASED only after the service committed and revalidates the roster", async () => {
    const result = await releaseWorkforceAction(initialWorkforceReleaseActionState, form);

    expect(result).toEqual({ success: true, outcome: "RELEASED", message: "นำออกจากระบบถาวรแล้ว ประวัติยังคงอยู่" });
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/app/workforce", "layout");
  });

  it("classifies a confirmed conflict, including the last eligible Owner guard, as CONFLICT", async () => {
    vi.mocked(releaseWorkforceRelationship).mockRejectedValueOnce(new ConflictError("last owner"));

    const result = await releaseWorkforceAction(initialWorkforceReleaseActionState, form);

    expect(result).toMatchObject({ success: false, outcome: "CONFLICT" });
    expect(mockedRevalidatePath).not.toHaveBeenCalled();
  });

  it("classifies a missing typed confirmation as INVALID_CONFIRMATION", async () => {
    vi.mocked(releaseWorkforceRelationship).mockRejectedValueOnce(new ValidationError("bad"));

    const result = await releaseWorkforceAction(initialWorkforceReleaseActionState, form);

    expect(result).toEqual({ success: false, outcome: "INVALID_CONFIRMATION", message: "กรุณาพิมพ์ นำออกจากระบบ เพื่อยืนยัน" });
  });

  it.each([new ForbiddenError(), new UnauthenticatedError()])("classifies %s as FORBIDDEN", async (error) => {
    vi.mocked(releaseWorkforceRelationship).mockRejectedValueOnce(error);

    expect(await releaseWorkforceAction(initialWorkforceReleaseActionState, form)).toMatchObject({
      success: false,
      outcome: "FORBIDDEN",
    });
  });

  it.each([new NotFoundError(), new InfrastructureError("database"), new Error("unexpected")])(
    "does not claim a confirmed refusal for %s",
    async (error) => {
      vi.mocked(releaseWorkforceRelationship).mockRejectedValueOnce(error);

      const result = await releaseWorkforceAction(initialWorkforceReleaseActionState, form);

      expect(result).toMatchObject({ success: false, outcome: "UNAVAILABLE" });
      expect(JSON.stringify(result)).not.toContain("database");
      expect(JSON.stringify(result)).not.toContain("unexpected");
    },
  );

  it("classifies an actor lookup failure without calling the release service", async () => {
    vi.mocked(getProtectedApplicationActor).mockRejectedValueOnce(new UnauthenticatedError());

    expect(await releaseWorkforceAction(initialWorkforceReleaseActionState, form)).toMatchObject({ outcome: "FORBIDDEN" });
    expect(releaseWorkforceRelationship).not.toHaveBeenCalled();
  });
});
