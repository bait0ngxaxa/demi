import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "../types/actor-context";
import { resolveActorContextByAuthSubject, type ActorContextStore } from "./actor-context-service";

const actor: ActorContext = {
  userId: "user-1",
  personId: "person-1",
  roles: [Role.PATIENT],
  hospitalMemberships: [
    {
      hospitalId: "hospital-a",
      membershipType: MembershipType.MEMBER,
      profession: null,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: HospitalStatus.ACTIVE,
    },
  ],
};

describe("ActorContext resolution", () => {
  it("normalizes an authenticated provider subject before lookup", async () => {
    let receivedSubject = "";
    const store: ActorContextStore = {
      async findActiveUserByAuthSubject(authSubject): Promise<ActorContext | null> {
        receivedSubject = authSubject;
        return actor;
      },
    };

    const result = await resolveActorContextByAuthSubject("  supabase-user-1  ", store);

    expect(receivedSubject).toBe("supabase-user-1");
    expect(result).toBe(actor);
  });

  it("fails closed when the provider subject is empty", async () => {
    const store: ActorContextStore = {
      async findActiveUserByAuthSubject(): Promise<ActorContext | null> {
        throw new Error("The store must not be called");
      },
    };

    await expect(resolveActorContextByAuthSubject("  ", store)).resolves.toBeNull();
  });
});
