import "server-only";

import { HospitalServiceAreaFacilityKind, HospitalStatus, MembershipStatus, MembershipType, type Prisma, type PrismaClient } from "@prisma/client";

import { z } from "zod";

import { getPrisma } from "@/lib/db/prisma";
import {
  createPublicSelfRegistrationRateLimiter,
  type PublicSelfRegistrationRateLimiter,
} from "@/modules/self-registration/services/public-self-registration-rate-limit";
import {
  HOSPITAL_SEARCH_MAX_LENGTH,
  HOSPITAL_SEARCH_RESULT_LIMIT,
  ONBOARDING_HOSPITAL_SEARCH_MIN_LENGTH,
} from "@/shared/search/hospital-search";
import { NotFoundError, ValidationError } from "@/shared/errors/application-error";

import { hospitalCodeSchema } from "../schemas/hospital-onboarding-schemas";
import { toInfrastructureError } from "@/shared/errors/unexpected-error-report";

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
 * ADR-0024 (Q1): the public path (search, code lookup, submission, approval) also excludes a Hospital while platform ADMIN
 * has an open OWNER invitation for it. ADMIN-side reads keep `onboardableHospitalWhere`.
 */
export const publicOnboardableHospitalWhere = {
  ...onboardableHospitalWhere,
  memberships: {
    none: { membershipType: MembershipType.OWNER, status: { in: [MembershipStatus.PROVISIONED, MembershipStatus.INVITED] } },
  },
} satisfies Prisma.HospitalWhereInput;

const onboardingHospitalSearchSchema = z
  .string()
  .trim()
  .min(ONBOARDING_HOSPITAL_SEARCH_MIN_LENGTH)
  .max(HOSPITAL_SEARCH_MAX_LENGTH);

export type OnboardingHospitalSearchDependencies = {
  database?: OnboardingHospitalDatabase;
  rateLimiter?: PublicSelfRegistrationRateLimiter;
  now?: () => Date;
};

/** The public search refused the client for now; the applicant waits and tries again. */
export class OnboardingHospitalSearchRateLimitedError extends Error {
  constructor() {
    super("Hospital search is rate limited");
    this.name = "OnboardingHospitalSearchRateLimitedError";
  }
}

/**
 * Public onboarding search: the applicant types a name or hospital code (at least two characters) and gets at most
 * ten onboardable Parents by name. ACTIVE, SUSPENDED, RETIRED and Child facilities are never offered, nor a Parent with
 * an open ADMIN OWNER invitation. Rate limited per client IP before any read; an unknown IP fails closed.
 */
export async function searchOnboardingHospitals(
  value: unknown,
  client: { ipAddress: string },
  dependencies: OnboardingHospitalSearchDependencies = {},
): Promise<OnboardingHospitalOption[]> {
  const limiter = dependencies.rateLimiter ?? createPublicSelfRegistrationRateLimiter();
  if (!await limiter.consume("HOSPITAL_SEARCH", client.ipAddress, dependencies.now?.() ?? new Date())) {
    throw new OnboardingHospitalSearchRateLimitedError();
  }

  const parsed = onboardingHospitalSearchSchema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError("Hospital search is invalid");
  }

  try {
    const hospitals = await (dependencies.database ?? getPrisma()).hospital.findMany({
      where: {
        AND: [
          publicOnboardableHospitalWhere,
          { OR: [
            { name: { contains: parsed.data, mode: "insensitive" } },
            { hospitalCode: { contains: parsed.data, mode: "insensitive" } },
          ] },
        ],
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: HOSPITAL_SEARCH_RESULT_LIMIT,
      select: onboardingHospitalSelect,
    });

    return hospitals.map(toOnboardingHospitalOption);
  } catch (error: unknown) {
    throw toInfrastructureError("hospital-onboarding.searchOnboardingHospitals", error, "Hospital list could not be loaded");
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

    throw toInfrastructureError("hospital-onboarding.findOnboardingHospitalByCode", error, "Hospital list could not be loaded");
  }
}
