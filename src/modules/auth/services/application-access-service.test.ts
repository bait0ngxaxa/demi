import { describe, expect, it } from "vitest";

import {
  ForbiddenError,
  InfrastructureError,
  UnauthenticatedError,
} from "@/shared/errors/application-error";

import type { ActorContext } from "../types/actor-context";
import { getProtectedApplicationActor } from "./application-access-service";

const actor: ActorContext = {
  userId: "user-1",
  personId: "person-1",
  roles: [],
  hospitalMemberships: [],
};

describe("protected application access", () => {
  it("denies a request without a provider session", async () => {
    await expect(
      getProtectedApplicationActor(async () => ({ status: "UNAUTHENTICATED" })),
    ).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("allows an active mapped DEMI actor", async () => {
    await expect(
      getProtectedApplicationActor(async () => ({ status: "AUTHORIZED", actor })),
    ).resolves.toBe(actor);
  });

  it("denies an authenticated provider user without application access", async () => {
    await expect(
      getProtectedApplicationActor(async () => ({
        status: "APPLICATION_ACCESS_DENIED",
        reason: "UNMAPPED",
      })),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("does not downgrade an infrastructure failure to unauthenticated", async () => {
    const infrastructureFailure = new InfrastructureError("Database unavailable");

    await expect(
      getProtectedApplicationActor(async () => {
        throw infrastructureFailure;
      }),
    ).rejects.toBe(infrastructureFailure);
  });
});
