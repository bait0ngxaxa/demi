import "server-only";

import { HospitalStatus, type Prisma, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { InfrastructureError, NotFoundError, ValidationError } from "@/shared/errors/application-error";

import { hospitalCodeSchema } from "../schemas/hospital-onboarding-schemas";

export type HospitalMasterRecord = {
  id: string;
  hospitalCode: string;
  name: string;
  parentHospitalCode: string | null;
};

export type HospitalMasterDatabase = Pick<PrismaClient, "hospital"> | Prisma.TransactionClient;

const hospitalMasterSelect = {
  id: true,
  hospitalCode: true,
  name: true,
  parentHospital: {
    select: { hospitalCode: true },
  },
} satisfies Prisma.HospitalSelect;

function toHospitalMasterRecord(
  hospital: Prisma.HospitalGetPayload<{ select: typeof hospitalMasterSelect }>,
): HospitalMasterRecord {
  return {
    id: hospital.id,
    hospitalCode: hospital.hospitalCode,
    name: hospital.name,
    parentHospitalCode: hospital.parentHospital?.hospitalCode ?? null,
  };
}

export async function listAvailableHospitalMaster(
  database: HospitalMasterDatabase = getPrisma(),
): Promise<HospitalMasterRecord[]> {
  try {
    const hospitals = await database.hospital.findMany({
      where: { status: HospitalStatus.PENDING_VERIFICATION },
      orderBy: [{ name: "asc" }, { hospitalCode: "asc" }],
      select: hospitalMasterSelect,
    });

    return hospitals.map(toHospitalMasterRecord);
  } catch {
    throw new InfrastructureError("Hospital master data could not be loaded");
  }
}

export async function findHospitalMasterByCode(
  hospitalCode: string,
  database: HospitalMasterDatabase = getPrisma(),
): Promise<HospitalMasterRecord> {
  const parsedCode = hospitalCodeSchema.safeParse(hospitalCode);

  if (!parsedCode.success) {
    throw new ValidationError("Hospital selection is invalid");
  }

  try {
    const hospital = await database.hospital.findUnique({
      where: { hospitalCode: parsedCode.data },
      select: hospitalMasterSelect,
    });

    if (!hospital) {
      throw new NotFoundError("Selected hospital is not available");
    }

    return toHospitalMasterRecord(hospital);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      throw error;
    }

    throw new InfrastructureError("Hospital master data could not be loaded");
  }
}
