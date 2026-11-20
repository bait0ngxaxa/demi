import { getPrisma } from "@/lib/db/prisma";
import { searchOnboardingHospitals } from "@/modules/hospital-onboarding/services/onboarding-hospital-service";

const allowEverySearch = { consume: async (): Promise<boolean> => true };

/**
 * Which of these Hospitals the public onboarding search offers, searching each one by its own name (codes are not
 * searchable; the search answers at most ten matches, so a shared integration database is never listed whole).
 * Rate limiting is covered by its own tests; here every search is allowed.
 */
export async function publiclyFoundHospitalIds(hospitalIds: readonly string[]): Promise<string[]> {
  const hospitals = await getPrisma().hospital.findMany({
    where: { id: { in: [...hospitalIds] } },
    select: { name: true },
  });
  const found = await Promise.all(
    hospitals.map(({ name }) =>
      searchOnboardingHospitals(name, { ipAddress: "127.0.0.1" }, { rateLimiter: allowEverySearch })),
  );

  return found.flat().map(({ id }) => id).filter((id) => hospitalIds.includes(id));
}
