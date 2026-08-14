import type {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Profession,
  Role,
} from "@prisma/client";

export type ActorHospitalMembership = {
  hospitalId: string;
  membershipType: MembershipType;
  profession: Profession | null;
  status: MembershipStatus;
  hospitalStatus: HospitalStatus;
};

export type ActorOsmHospitalRelationship = {
  hospitalId: string;
  status: MembershipStatus;
  hospitalStatus: HospitalStatus;
};

export type ActorContext = {
  userId: string;
  personId: string;
  roles: readonly Role[];
  hospitalMemberships: readonly ActorHospitalMembership[];
  osmHospitalRelationships: readonly ActorOsmHospitalRelationship[];
};
