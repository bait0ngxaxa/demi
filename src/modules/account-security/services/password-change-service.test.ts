import { Role } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, InfrastructureError, ValidationError } from "@/shared/errors/application-error";

import { changeAuthenticatedUserPassword } from "./password-change-service";

const actor: ActorContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  personId: "22222222-2222-4222-8222-222222222222",
  roles: [Role.PATIENT, Role.HOSPITAL, Role.OSM],
  hospitalMemberships: [],
  osmHospitalRelationships: [],
};
const input = {
  currentPassword: "current-password",
  newPassword: "a-different-long-password",
  passwordConfirmation: "a-different-long-password",
};

describe("authenticated account password change", () => {
  it("changes the one authenticated User credential for a multi-role account", async () => {
    const provider = vi.fn().mockResolvedValue(undefined);
    const audit = vi.fn().mockResolvedValue(undefined);

    await expect(changeAuthenticatedUserPassword(actor, input, { provider, audit })).resolves.toBeUndefined();
    expect(provider).toHaveBeenCalledOnce();
    expect(provider).toHaveBeenCalledWith({
      userId: actor.userId,
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
    });
    expect(audit).toHaveBeenCalledWith({
      actorUserId: actor.userId,
      action: "ACCOUNT_PASSWORD_CHANGED",
      resourceType: "USER",
      resourceId: actor.userId,
    });
  });

  it("returns a safe generic failure when the provider rejects the current password", async () => {
    const provider = vi.fn().mockRejectedValue(new Error("wrong password from provider"));

    await expect(changeAuthenticatedUserPassword(actor, input, { provider })).rejects.toBeInstanceOf(
      InfrastructureError,
    );
    expect(provider).toHaveBeenCalledOnce();
  });

  it("requires authentication and validates passwords before provider I/O", async () => {
    const provider = vi.fn();

    await expect(changeAuthenticatedUserPassword(null, input, { provider })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(
      changeAuthenticatedUserPassword(actor, { ...input, targetUserId: actor.userId }, { provider }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(provider).not.toHaveBeenCalled();
  });

  it("does not report a credential as unchanged when only the audit write fails", async () => {
    const provider = vi.fn().mockResolvedValue(undefined);
    const audit = vi.fn().mockRejectedValue(new Error("database details"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(changeAuthenticatedUserPassword(actor, input, { provider, audit })).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      "Password change succeeded but the security audit event could not be stored",
    );
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(input.currentPassword);
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(input.newPassword);
    consoleError.mockRestore();
  });
});
