import "server-only";

import { HospitalStatus, type HospitalServiceAreaFacilityKind, type Prisma, type PrismaClient } from "@prisma/client";

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
 * Public onboarding list: ADMIN-registered Hospitals still waiting for their first OWNER (PENDING_VERIFICATION).
 * ACTIVE, SUSPENDED and RETIRED Hospitals are never offered.
 */
export async function listOnboardingHospitals(
  database: OnboardingHospitalDatabase = getPrisma(),
): Promise<OnboardingHospitalOption[]> {
  try {
    const hospitals = await database.hospital.findMany({
      where: { status: HospitalStatus.PENDING_VERIFICATION },
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
      where: { hospitalCode: parsedCode.data, status: HospitalStatus.PENDING_VERIFICATION },
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
