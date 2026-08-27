import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

import {
  buildRosterOsmAssignmentPreview,
  listEligibleRosterOsmCandidates,
  normalizeRosterOsmCaregiverName,
  resolveRosterOsmCandidate,
  type PatientOsmRosterCandidate,
} from "./patient-osm-roster-resolver";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const ownerUserId = "22222222-2222-4222-8222-222222222222";

const candidates: PatientOsmRosterCandidate[] = [
  { osmUserId: "33333333-3333-4333-8333-333333333333", displayName: "สมชาย ใจดี" },
  { osmUserId: "44444444-4444-4444-8444-444444444444", displayName: "สุดา รักษา" },
];

const owner: ActorContext = {
  userId: ownerUserId,
  personId: "55555555-5555-4555-8555-555555555555",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [{
    hospitalId,
    membershipType: MembershipType.OWNER,
    profession: null,
    status: MembershipStatus.ACTIVE,
    hospitalStatus: HospitalStatus.ACTIVE,
  }],
  osmHospitalRelationships: [],
};

const member: ActorContext = {
  ...owner,
  userId: "66666666-6666-4666-8666-666666666666",
  hospitalMemberships: [{
    hospitalId,
    membershipType: MembershipType.MEMBER,
    profession: null,
    status: MembershipStatus.ACTIVE,
    hospitalStatus: HospitalStatus.ACTIVE,
  }],
};

describe("OSM roster resolver", () => {
  it("normalizes only NFC and surrounding Unicode whitespace", () => {
    expect(normalizeRosterOsmCaregiverName("\uFEFF  สมชาย\u00A0  ใจดี  ")).toBe("สมชาย ใจดี");
    expect(normalizeRosterOsmCaregiverName("นายสมชาย ใจดี")).toBe("นายสมชาย ใจดี");
    expect(normalizeRosterOsmCaregiverName("สมชาย, ใจดี")).toBe("สมชาย, ใจดี");
  });

  it("returns bounded deterministic resolution states without fuzzy matching", () => {
    expect(resolveRosterOsmCandidate({ sourceCaregiverName: null, candidates }).status).toBe(
      "OSM_NOT_APPLICABLE",
    );
    expect(resolveRosterOsmCandidate({
      sourceCaregiverName: "\uFEFF สมชาย\u00A0 ใจดี ",
      candidates,
    })).toMatchObject({
      status: "OSM_MATCHED",
      normalizedSourceCaregiverName: "สมชาย ใจดี",
      candidates: [candidates[0]],
    });
    expect(resolveRosterOsmCandidate({ sourceCaregiverName: "สมชัย ใจดี", candidates }).status).toBe(
      "OSM_NOT_FOUND",
    );
    expect(resolveRosterOsmCandidate({
      sourceCaregiverName: "สมชาย ใจดี",
      candidates: [
        ...candidates,
        { osmUserId: "77777777-7777-4777-8777-777777777777", displayName: "สมชาย ใจดี" },
      ],
    }).status).toBe("OSM_AMBIGUOUS");
  });

  it("reports assignment readiness, same-assignment NOOP, and OWNER-only conflicts", () => {
    const matched = buildRosterOsmAssignmentPreview({
      sourceCaregiverName: "สมชาย ใจดี",
      currentAssignment: null,
      candidates,
      actor: owner,
      targetHospitalId: hospitalId,
    });
    expect(matched).toMatchObject({
      resolutionStatus: "OSM_MATCHED",
      assignmentStatus: "OSM_ASSIGNMENT_READY",
      resolvedOsmUserId: candidates[0].osmUserId,
    });

    const same = buildRosterOsmAssignmentPreview({
      sourceCaregiverName: "สมชาย ใจดี",
      currentAssignment: { osmUserId: candidates[0].osmUserId, displayName: candidates[0].displayName },
      candidates,
      actor: member,
      targetHospitalId: hospitalId,
    });
    expect(same.assignmentStatus).toBe("OSM_ASSIGNMENT_ALREADY_EXISTS");

    const memberNeedsOwner = buildRosterOsmAssignmentPreview({
      sourceCaregiverName: "สุดา รักษา",
      currentAssignment: null,
      candidates,
      actor: member,
      targetHospitalId: hospitalId,
    });
    expect(memberNeedsOwner.assignmentStatus).toBe("OSM_OWNER_REQUIRED");
  });

  it("queries only active OSM relationships in the requested active Hospital", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: candidates[0].osmUserId,
        person: { givenName: "สมชาย", familyName: "ใจดี" },
      },
    ]);
    const database = {
      user: { findMany },
    } as unknown as Pick<PrismaClient, "user">;

    await expect(listEligibleRosterOsmCandidates(database, hospitalId)).resolves.toEqual([
      candidates[0],
    ]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        status: UserStatus.ACTIVE,
        roles: { some: { role: Role.OSM } },
        osmHospitalRelationships: {
          some: {
            hospitalId,
            status: MembershipStatus.ACTIVE,
            hospital: { status: HospitalStatus.ACTIVE },
          },
        },
      },
    }));
  });
});
