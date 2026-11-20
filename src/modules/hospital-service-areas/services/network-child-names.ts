import "server-only";

import { HospitalStatus, type Prisma } from "@prisma/client";

import { normalizeHospitalName } from "@/modules/hospital-governance/domain/hospital-registration-csv";
import { ConflictError } from "@/shared/errors/application-error";

/** A Child's name, normalized, is already used by another Child of the same Parent network. */
export class DuplicateNetworkChildNameError extends ConflictError {
  constructor() {
    super("A Child facility with this name is already in this network");
  }
}

/**
 * Hospital codes are never shown and `Hospital.name` is not unique, so within one Parent's network a Child name
 * (normalized with `normalizeHospitalName`) must not match another Child currently attached to, or registered for
 * (and not retired), that Parent. Call inside the serializable transaction that creates, renames or attaches the
 * Child: a concurrent writer of the same name then fails the transaction instead of slipping through.
 */
export async function assertUniqueNetworkChildName(
  tx: Prisma.TransactionClient,
  input: { parentHospitalId: string; name: string; exceptHospitalId?: string },
): Promise<void> {
  const siblings = await tx.hospital.findMany({
    where: {
      ...(input.exceptHospitalId ? { id: { not: input.exceptHospitalId } } : {}),
      OR: [
        { serviceAreaAssignments: { some: { parentHospitalId: input.parentHospitalId, endedAt: null } } },
        { registeredForParentHospitalId: input.parentHospitalId, status: { not: HospitalStatus.RETIRED } },
      ],
    },
    select: { name: true },
  });
  const wanted = normalizeHospitalName(input.name);
  if (siblings.some(({ name }) => normalizeHospitalName(name) === wanted)) throw new DuplicateNetworkChildNameError();
}
