import "server-only";

import { HospitalServiceAreaFacilityKind, HospitalStatus, MembershipStatus, MembershipType, type Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

import { hospitalCodeSchema } from "../schemas/hospital-onboarding-schemas";

export type OnboardingHospitalOption = {
  id: string;
  hospitalCode: string;
  name: string;
  /** ADMIN-set network role (ADR-0015); a grouping label only. */
  networkRole: HospitalServiceAreaFacilityKind | null;
};

export type OnboardingHospitalDatabase = Pick<PrismaClient, "hospital"> | Prisma.TransactionClient;

const onboardingHospitalSelect = {
  id: true,
  hospitalCode: true,
  name: true,
  serviceAreaEligibility: { select: { kind: true } },
} satisfies Prisma.HospitalSelect;

function toOnboardingHospitalOption(
  hospital: Prisma.HospitalGetPayload<{ select: typeof onboardingHospitalSelect }>,
): OnboardingHospitalOption {
  return {
    id: hospital.id,
    hospitalCode: hospital.hospitalCode,
    name: hospital.name,
    networkRole: hospital.serviceAreaEligibility?.kind ?? null,
  };
}

/**
 * ADR-0018 (O-D1/O-D2): public onboarding is for Parents only. A Hospital is onboardable while it waits for its first
 * OWNER (PENDING_VERIFICATION), has network role PARENT and has never been the Child of any area (active or ended),
 * so a Parent-created Child is refused even when its code is known. Submit and ADMIN approval re-check this predicate.
 */
export const onboardableHospitalWhere = {
  status: HospitalStatus.PENDING_VERIFICATION,
  serviceAreaEligibility: { is: { kind: HospitalServiceAreaFacilityKind.PARENT } },
  serviceAreaAssignments: { none: {} },
} satisfies Prisma.HospitalWhereInput;

/**
 * ADR-0024 (Q1): the public path (list, code lookup, submission, approval) also excludes a Hospital while platform ADMIN
 * has an open OWNER invitation for it. ADMIN-side reads keep `onboardableHospitalWhere`.
 */
export const publicOnboardableHospitalWhere = {
  ...onboardableHospitalWhere,
  memberships: {
    none: { membershipType: MembershipType.OWNER, status: { in: [MembershipStatus.PROVISIONED, MembershipStatus.INVITED] } },
  },
} satisfies Prisma.HospitalWhereInput;

/**
 * Public onboarding list: onboardable Parents only; ACTIVE, SUSPENDED, RETIRED and Child facilities are never offered,
 * nor a Parent with an open ADMIN OWNER invitation.
 */
export async function listOnboardingHospitals(
  database: OnboardingHospitalDatabase = getPrisma(),
): Promise<OnboardingHospitalOption[]> {
  try {
    const hospitals = await database.hospital.findMany({
      where: publicOnboardableHospitalWhere,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: onboardingHospitalSelect,
    });

    return hospitals.map(toOnboardingHospitalOption);
  } catch {
    throw new InfrastructureError("Hospital list could not be loaded");
  }
}

export async function findOnboardingHospitalByCode(
  hospitalCode: string,
  database: OnboardingHospitalDatabase = getPrisma(),
): Promise<OnboardingHospitalOption> {
  const parsedCode = hospitalCodeSchema.safeParse(hospitalCode);

  if (!parsedCode.success) {
    throw new ValidationError("Hospital selection is invalid");
  }

  try {
    const hospital = await database.hospital.findFirst({
      where: { hospitalCode: parsedCode.data, ...publicOnboardableHospitalWhere },
      select: onboardingHospitalSelect,
    });

    if (!hospital) {
      throw new NotFoundError("Selected hospital is not available");
    }

    return toOnboardingHospitalOption(hospital);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      throw error;
    }

    throw new InfrastructureError("Hospital list could not be loaded");
  }
}
