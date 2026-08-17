import {
  AppointmentStatus,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, NotFoundError } from "@/shared/errors/application-error";

import {
  getAppointmentDetail,
  getAppointmentHistory,
  getAppointmentCreateContext,
  type AppointmentQueryDatabase,
} from "./appointment-query-service";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";
const appointmentId = "33333333-3333-4333-8333-333333333333";
const actorUserId = "44444444-4444-4444-8444-444444444444";
const responsibleUserId = "55555555-5555-4555-8555-555555555555";
const updatedAt = new Date("2026-08-17T05:00:00.000Z");

const hospitalActor: ActorContext = {
  userId: actorUserId,
  personId: "66666666-6666-4666-8666-666666666666",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [
    {
      hospitalId,
      membershipType: MembershipType.MEMBER,
      profession: null,
      status: MembershipStatus.ACTIVE,
      hospitalStatus: HospitalStatus.ACTIVE,
    },
  ],
  osmHospitalRelationships: [],
};

function appointmentRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: appointmentId,
    patientHospitalRelationshipId: relationshipId,
    responsibleUserId,
    type: "CONSULTATION",
    scheduledAt: new Date("2026-08-20T03:30:00.000Z"),
    durationMinutes: 30,
    locationType: "ONLINE",
    locationDetail: "ลิงก์ส่วนตัว",
    note: "บันทึกส่วนตัว",
    status: AppointmentStatus.SCHEDULED,
    createdAt: updatedAt,
    updatedAt,
    responsibleUser: { person: { givenName: "สมหญิง", familyName: "ผู้รับผิดชอบ" } },
    createdByUser: { person: { givenName: "ผู้สร้าง", familyName: "รายการ" } },
    ...overrides,
  };
}

function createDatabase(options: {
  appointmentRecords?: Array<Record<string, unknown>>;
  detailRecord?: Record<string, unknown> | null;
  osm?: boolean;
  assignedOsmUserId?: string | null;
  manageAllowed?: boolean;
} = {}): AppointmentQueryDatabase {
  const osm = options.osm ?? false;
  const manageAllowed = options.manageAllowed ?? true;
  const actorRecord = {
    id: actorUserId,
    personId: hospitalActor.personId,
    status: UserStatus.ACTIVE,
    roles: [{ role: osm ? Role.OSM : Role.HOSPITAL }],
    memberships: manageAllowed && !osm
      ? [
          {
            hospitalId,
            membershipType: MembershipType.MEMBER,
            profession: null,
            status: MembershipStatus.ACTIVE,
            hospital: { status: HospitalStatus.ACTIVE },
          },
        ]
      : [],
    osmHospitalRelationships: osm
      ? [
          {
            hospitalId,
            status: MembershipStatus.ACTIVE,
            hospital: { status: HospitalStatus.ACTIVE },
          },
        ]
      : [],
  };
  const database = {
    user: { findUnique: vi.fn().mockResolvedValue(actorRecord) },
    patientHospitalRelationship: {
      findUnique: vi.fn().mockResolvedValue({
        id: relationshipId,
        hospitalId,
        hospitalNumber: "HN-001",
        hospital: { id: hospitalId, name: "โรงพยาบาล ก", status: HospitalStatus.ACTIVE },
        patientProfile: {
          person: {
            givenName: "สมชาย",
            familyName: "ผู้ป่วย",
            user: { roles: [{ role: Role.PATIENT }] },
          },
        },
        osmAssignments: options.assignedOsmUserId
          ? [{ osmUserId: options.assignedOsmUserId }]
          : [],
      }),
    },
    patientAppointment: {
      findMany: vi.fn().mockResolvedValue(options.appointmentRecords ?? [appointmentRecord()]),
      findFirst: vi.fn().mockResolvedValue(
        options.detailRecord === undefined ? appointmentRecord() : options.detailRecord,
      ),
    },
    hospitalMembership: {
      findMany: vi.fn().mockResolvedValue([
        {
          userId: responsibleUserId,
          membershipType: MembershipType.MEMBER,
          profession: null,
          user: { person: { givenName: "สมหญิง", familyName: "ผู้รับผิดชอบ" } },
        },
      ]),
    },
  };

  return database as unknown as AppointmentQueryDatabase;
}

describe("Appointment query service", () => {
  it("returns a bounded relationship-scoped history with minimal staff projections", async () => {
    const database = createDatabase();
    const history = await getAppointmentHistory(hospitalActor, relationshipId, { database });

    expect(history.patient).toMatchObject({ patientHospitalRelationshipId: relationshipId });
    expect(history.items[0]).toMatchObject({
      appointmentId,
      type: "CONSULTATION",
      status: AppointmentStatus.SCHEDULED,
      responsibleDisplayName: "สมหญิง ผู้รับผิดชอบ",
    });
    expect(JSON.stringify(history)).toContain("สมชาย ผู้ป่วย");
    expect(JSON.stringify(history)).not.toContain("ลิงก์ส่วนตัว");
  });

  it("does not expose manage projection to an exact-assigned OSM", async () => {
    const osm: ActorContext = {
      ...hospitalActor,
      roles: [Role.OSM],
      hospitalMemberships: [],
      osmHospitalRelationships: [
        {
          hospitalId,
          status: MembershipStatus.ACTIVE,
          hospitalStatus: HospitalStatus.ACTIVE,
        },
      ],
    };
    const database = createDatabase({ osm: true, assignedOsmUserId: actorUserId });

    const history = await getAppointmentHistory(osm, relationshipId, { database });

    expect(history.canManage).toBe(false);
  });

  it("returns safe not-found for an Appointment outside the relationship", async () => {
    const database = createDatabase({ detailRecord: null });

    await expect(getAppointmentDetail(hospitalActor, relationshipId, appointmentId, { database })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("loads only active direct Hospital members for the manage form", async () => {
    const database = createDatabase();
    const context = await getAppointmentCreateContext(hospitalActor, relationshipId, { database });
    const membershipFindMany = (database as unknown as {
      hospitalMembership: { findMany: ReturnType<typeof vi.fn> };
    }).hospitalMembership.findMany;

    expect(context.responsibleMembers).toMatchObject([
      { userId: responsibleUserId, displayName: "สมหญิง ผู้รับผิดชอบ" },
    ]);
    expect(membershipFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ hospitalId, status: MembershipStatus.ACTIVE }),
        select: expect.objectContaining({ userId: true, user: expect.anything() }),
      }),
    );
  });

  it("fails closed when the actor loses direct membership before a read", async () => {
    const database = createDatabase({ manageAllowed: false });
    const actorWithoutMembership: ActorContext = {
      ...hospitalActor,
      hospitalMemberships: [],
    };

    await expect(getAppointmentHistory(actorWithoutMembership, relationshipId, { database })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
