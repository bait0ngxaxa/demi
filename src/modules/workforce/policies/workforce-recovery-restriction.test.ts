import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import { decideWorkforcePasswordResetPolicy } from "./workforce-password-reset-policy";

describe("global credential ownership boundary", () => {
  it.each([Role.HOSPITAL, Role.ADMIN])("does not accept %s authority as account-owner proof", (role) => {
    const actor: ActorContext = {
      userId: "issuer", personId: "issuer-person", roles: [role],
      hospitalMemberships: [{ hospitalId: "hospital-a", membershipType: MembershipType.OWNER,
        profession: null, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }],
      osmHospitalRelationships: [],
    };
    expect(decideWorkforcePasswordResetPolicy({ actor, targetUserId: "target",
      targetHospitalId: "hospital-a", targetKind: role === Role.ADMIN ? "HOSPITAL_OWNER" : "HOSPITAL_MEMBER",
    }).allowed).toBe(false);
  });
});
