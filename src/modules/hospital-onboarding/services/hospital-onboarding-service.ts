import "server-only";

import {
  HospitalOnboardingApplicationStatus,
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Prisma,
  Role,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import { getSupabaseAdminClient } from "@/lib/auth/supabase-admin";
import { getPrisma } from "@/lib/db/prisma";
import {
  provisionPasswordAuthIdentity,
  PasswordAuthProvisioningReconciliationError,
  type ProvisionPasswordAuthIdentityResult,
} from "@/modules/auth/services/password-auth-provisioning-service";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import {
  hospitalOnboardingApplicationIdSchema,
  hospitalOnboardingRejectionSchema,
  hospitalOnboardingSubmissionSchema,
  type HospitalOnboardingSubmissionInput,
} from "../schemas/hospital-onboarding-schemas";

export type HospitalOnboardingDatabase = PrismaClient;

export type HospitalOnboardingDependencies = {
  database?: HospitalOnboardingDatabase;
  provisionIdentity?: (
    input: Pick<HospitalOnboardingSubmissionInput, "password"> & { userId: string },
  ) => Promise<ProvisionPasswordAuthIdentityResult>;
  deleteProviderIdentity?: (authSubject: string) => Promise<void>;
  now?: () => Date;
};

export type HospitalOnboardingSubmissionResult = {
  applicationId: string;
  applicantUserId: string;
};

export type HospitalOnboardingApplicationSummary = {
  id: string;
  status: HospitalOnboardingApplicationStatus;
  createdAt: Date;
  reviewedAt: Date | null;
  hospitalCode: string;
  hospitalName: string;
  applicantGivenName: string | null;
  applicantFamilyName: string | null;
};

const applicationSummarySelect = {
  id: true,
  status: true,
  createdAt: true,
  reviewedAt: true,
  hospital: {
    select: {
      hospitalCode: true,
      name: true,
    },
  },
  applicantUser: {
    select: {
      person: {
        select: {
          givenName: true,
          familyName: true,
        },
      },
    },
  },
} satisfies Prisma.HospitalOnboardingApplicationSelect;

const applicationDetailSelect = {
  ...applicationSummarySelect,
  rejectionReason: true,
  reviewedByUser: {
    select: {
      person: {
        select: {
          givenName: true,
          familyName: true,
        },
      },
    },
  },
} satisfies Prisma.HospitalOnboardingApplicationSelect;

function getDatabase(dependencies: HospitalOnboardingDependencies): HospitalOnboardingDatabase {
  return dependencies.database ?? getPrisma();
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function normalizeDatabaseError(error: unknown, fallbackMessage: string): ApplicationError {
  if (error instanceof ApplicationError) {
    return error;
  }

  if (isUniqueViolation(error)) {
    return new ConflictError("The requested onboarding state already exists");
  }

  return new InfrastructureError(fallbackMessage);
}

async function createApplicantIdentity(
  database: HospitalOnboardingDatabase,
  input: {
    identityKeyHash: string;
    givenName: string;
    familyName: string;
  },
): Promise<{ personId: string; userId: string }> {
  try {
    return await database.$transaction(async (transaction) => {
      const person = await transaction.person.create({
        data: {
          identityKeyHash: input.identityKeyHash,
          givenName: input.givenName,
          familyName: input.familyName,
        },
        select: { id: true },
      });
      const user = await transaction.user.create({
        data: {
          personId: person.id,
          status: UserStatus.PROVISIONED,
        },
        select: { id: true },
      });

      return { personId: person.id, userId: user.id };
    });
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Applicant identity could not be created");
  }
}

async function deleteApplicantIdentity(
  database: HospitalOnboardingDatabase,
  identity: { personId: string; userId: string },
  expectedAuthSubject: string | null,
): Promise<void> {
  try {
    await database.$transaction(async (transaction) => {
      const deletedUser = await transaction.user.deleteMany({
        where: expectedAuthSubject
          ? { id: identity.userId, authSubject: expectedAuthSubject }
          : { id: identity.userId, authSubject: null, status: UserStatus.PROVISIONED },
      });

      if (deletedUser.count !== 1) {
        throw new Error("Applicant identity changed during compensation");
      }

      const deletedPerson = await transaction.person.deleteMany({ where: { id: identity.personId } });

      if (deletedPerson.count !== 1) {
        throw new Error("Applicant person changed during compensation");
      }
    });
  } catch {
    throw new InfrastructureError("Hospital onboarding requires identity reconciliation");
  }
}

async function deleteProviderIdentityByDefault(authSubject: string): Promise<void> {
  try {
    const { error } = await getSupabaseAdminClient().auth.admin.deleteUser(authSubject);

    if (error) {
      throw error;
    }
  } catch {
    throw new InfrastructureError("Hospital onboarding requires provider reconciliation");
  }
}

async function compensateProvisionedApplicant(
  database: HospitalOnboardingDatabase,
  identity: { personId: string; userId: string },
  authSubject: string,
  dependencies: HospitalOnboardingDependencies,
): Promise<void> {
  const deleteProviderIdentity =
    dependencies.deleteProviderIdentity ?? deleteProviderIdentityByDefault;

  try {
    await deleteProviderIdentity(authSubject);
  } catch {
    throw new InfrastructureError("Hospital onboarding requires provider reconciliation");
  }

  await deleteApplicantIdentity(database, identity, authSubject);
}

async function assertPlatformAdmin(
  transaction: Prisma.TransactionClient,
  reviewerUserId: string,
): Promise<void> {
  const reviewer = await transaction.user.findUnique({
    where: { id: reviewerUserId },
    select: {
      status: true,
      roles: { select: { role: true } },
    },
  });

  if (reviewer?.status !== UserStatus.ACTIVE || !reviewer.roles.some(({ role }) => role === Role.ADMIN)) {
    throw new ForbiddenError();
  }
}

async function throwDecisionConflict(
  transaction: Prisma.TransactionClient,
  applicationId: string,
): Promise<never> {
  const current = await transaction.hospitalOnboardingApplication.findUnique({
    where: { id: applicationId },
    select: { status: true },
  });

  if (!current) {
    throw new NotFoundError("Hospital onboarding application was not found");
  }

  throw new ConflictError("Hospital onboarding application has already been decided");
}

export async function submitHospitalOnboarding(
  input: HospitalOnboardingSubmissionInput,
  dependencies: HospitalOnboardingDependencies = {},
): Promise<HospitalOnboardingSubmissionResult> {
  const parsed = hospitalOnboardingSubmissionSchema.safeParse(input);

  if (!parsed.success) {
    throw new ValidationError("Hospital onboarding data is invalid");
  }

  const database = getDatabase(dependencies);
  const hospitalCode = parsed.data.hospitalCode;
  let hospital: { id: string; status: HospitalStatus } | null;
  let existingApplication: { id: string } | null;
  let existingPerson: { id: string } | null;

  try {
    hospital = await database.hospital.findUnique({
      where: { hospitalCode },
      select: { id: true, status: true },
    });

    existingApplication = hospital
      ? await database.hospitalOnboardingApplication.findFirst({
          where: { hospitalId: hospital.id },
          select: { id: true },
        })
      : null;

    const identityKeyHash = hashIdentityReference({
      namespace: "thai-national-id",
      value: parsed.data.nationalId,
    });
    existingPerson = await database.person.findUnique({
      where: { identityKeyHash },
      select: { id: true },
    });
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Hospital onboarding could not be checked");
  }

  if (!hospital || hospital.status !== HospitalStatus.PENDING_VERIFICATION) {
    throw new ConflictError("The selected hospital is not available for onboarding");
  }

  if (existingApplication) {
    throw new ConflictError("The selected hospital already has an onboarding decision");
  }

  if (existingPerson) {
    throw new ConflictError("This identity must use the existing account path");
  }

  const identity = await createApplicantIdentity(database, {
    identityKeyHash: hashIdentityReference({
      namespace: "thai-national-id",
      value: parsed.data.nationalId,
    }),
    givenName: parsed.data.givenName,
    familyName: parsed.data.familyName,
  });

  const provisionIdentity = dependencies.provisionIdentity ?? provisionPasswordAuthIdentity;
  let provisionedIdentity: ProvisionPasswordAuthIdentityResult;

  try {
    provisionedIdentity = await provisionIdentity({
      userId: identity.userId,
      password: parsed.data.password,
    });
  } catch (error: unknown) {
    if (error instanceof PasswordAuthProvisioningReconciliationError) {
      throw error;
    }

    try {
      await deleteApplicantIdentity(database, identity, null);
    } catch (compensationError: unknown) {
      throw compensationError;
    }

    throw normalizeDatabaseError(error, "Applicant authentication could not be provisioned");
  }

  if (provisionedIdentity.userId !== identity.userId || !provisionedIdentity.authSubject.trim()) {
    if (!provisionedIdentity.authSubject.trim()) {
      await deleteApplicantIdentity(database, identity, null);
      throw new InfrastructureError("Applicant authentication returned an invalid identity");
    }

    try {
      await compensateProvisionedApplicant(
        database,
        identity,
        provisionedIdentity.authSubject,
        dependencies,
      );
    } catch (error: unknown) {
      throw error;
    }

    throw new InfrastructureError("Applicant authentication returned an invalid identity");
  }

  let persistedUser: { authSubject: string | null; status: UserStatus } | null;

  try {
    persistedUser = await database.user.findUnique({
      where: { id: identity.userId },
      select: { authSubject: true, status: true },
    });
  } catch {
    await compensateProvisionedApplicant(
      database,
      identity,
      provisionedIdentity.authSubject,
      dependencies,
    );
    throw new InfrastructureError("Applicant authentication mapping could not be verified");
  }

  if (
    !persistedUser ||
    persistedUser.authSubject !== provisionedIdentity.authSubject ||
    persistedUser.status !== UserStatus.PROVISIONED
  ) {
    await compensateProvisionedApplicant(
      database,
      identity,
      provisionedIdentity.authSubject,
      dependencies,
    );
    throw new InfrastructureError("Applicant authentication mapping is not ready");
  }

  try {
    const application = await database.$transaction(async (transaction) => {
      const created = await transaction.hospitalOnboardingApplication.create({
        data: {
          hospitalId: hospital.id,
          applicantUserId: identity.userId,
          status: HospitalOnboardingApplicationStatus.PENDING,
        },
        select: { id: true },
      });

      await recordAuditEvent(
        {
          actorUserId: null,
          action: "hospital_onboarding.submitted",
          resourceType: "HospitalOnboardingApplication",
          resourceId: created.id,
          metadata: {
            hospitalCode,
            status: HospitalOnboardingApplicationStatus.PENDING,
          },
        },
        transaction,
      );

      return created;
    });

    return {
      applicationId: application.id,
      applicantUserId: identity.userId,
    };
  } catch (error: unknown) {
    const normalizedError = normalizeDatabaseError(
      error,
      "Hospital onboarding application could not be created",
    );

    await compensateProvisionedApplicant(
      database,
      identity,
      provisionedIdentity.authSubject,
      dependencies,
    );

    throw normalizedError;
  }
}

export async function listPendingHospitalOnboardingApplications(
  database: HospitalOnboardingDatabase = getPrisma(),
): Promise<HospitalOnboardingApplicationSummary[]> {
  try {
    const applications = await database.hospitalOnboardingApplication.findMany({
      where: { status: HospitalOnboardingApplicationStatus.PENDING },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: applicationSummarySelect,
    });

    return applications.map((application) => ({
      id: application.id,
      status: application.status,
      createdAt: application.createdAt,
      reviewedAt: application.reviewedAt,
      hospitalCode: application.hospital.hospitalCode,
      hospitalName: application.hospital.name,
      applicantGivenName: application.applicantUser.person.givenName,
      applicantFamilyName: application.applicantUser.person.familyName,
    }));
  } catch {
    throw new InfrastructureError("Hospital onboarding applications could not be loaded");
  }
}

export async function getHospitalOnboardingApplication(
  applicationId: string,
  database: HospitalOnboardingDatabase = getPrisma(),
): Promise<HospitalOnboardingApplicationSummary & { rejectionReason: string | null; reviewerName: string | null }> {
  const parsedId = hospitalOnboardingApplicationIdSchema.safeParse(applicationId);

  if (!parsedId.success) {
    throw new NotFoundError("Hospital onboarding application was not found");
  }

  try {
    const application = await database.hospitalOnboardingApplication.findUnique({
      where: { id: parsedId.data },
      select: applicationDetailSelect,
    });

    if (!application) {
      throw new NotFoundError("Hospital onboarding application was not found");
    }

    const reviewerPerson = application.reviewedByUser?.person;

    return {
      id: application.id,
      status: application.status,
      createdAt: application.createdAt,
      reviewedAt: application.reviewedAt,
      hospitalCode: application.hospital.hospitalCode,
      hospitalName: application.hospital.name,
      applicantGivenName: application.applicantUser.person.givenName,
      applicantFamilyName: application.applicantUser.person.familyName,
      rejectionReason: application.rejectionReason,
      reviewerName: reviewerPerson
        ? [reviewerPerson.givenName, reviewerPerson.familyName].filter(Boolean).join(" ")
        : null,
    };
  } catch (error: unknown) {
    if (error instanceof NotFoundError) {
      throw error;
    }

    throw new InfrastructureError("Hospital onboarding application could not be loaded");
  }
}

export async function approveHospitalOnboarding(
  input: { applicationId: string; reviewerUserId: string },
  dependencies: HospitalOnboardingDependencies = {},
): Promise<{ applicationId: string }> {
  const parsedApplicationId = hospitalOnboardingApplicationIdSchema.safeParse(input.applicationId);
  const parsedReviewerId = hospitalOnboardingApplicationIdSchema.safeParse(input.reviewerUserId);

  if (!parsedApplicationId.success || !parsedReviewerId.success) {
    throw new ValidationError("Hospital onboarding review data is invalid");
  }

  const database = getDatabase(dependencies);
  const now = dependencies.now ?? (() => new Date());

  try {
    const result = await database.$transaction(async (transaction) => {
      await assertPlatformAdmin(transaction, parsedReviewerId.data);

      const application = await transaction.hospitalOnboardingApplication.findUnique({
        where: { id: parsedApplicationId.data },
        select: {
          id: true,
          status: true,
          hospital: { select: { id: true, hospitalCode: true, status: true } },
          applicantUser: { select: { id: true, status: true, authSubject: true } },
        },
      });

      if (!application) {
        throw new NotFoundError("Hospital onboarding application was not found");
      }

      if (application.status !== HospitalOnboardingApplicationStatus.PENDING) {
        throw new ConflictError("Hospital onboarding application has already been decided");
      }

      const claimed = await transaction.hospitalOnboardingApplication.updateMany({
        where: {
          id: parsedApplicationId.data,
          status: HospitalOnboardingApplicationStatus.PENDING,
        },
        data: {
          status: HospitalOnboardingApplicationStatus.APPROVED,
          reviewedAt: now(),
          reviewedByUserId: parsedReviewerId.data,
        },
      });

      if (claimed.count !== 1) {
        return throwDecisionConflict(transaction, parsedApplicationId.data);
      }

      if (application.hospital.status !== HospitalStatus.PENDING_VERIFICATION) {
        throw new ConflictError("Hospital is not in an approvable state");
      }

      if (
        !application.applicantUser.authSubject?.trim() ||
        application.applicantUser.status !== UserStatus.PROVISIONED &&
        application.applicantUser.status !== UserStatus.ACTIVE
      ) {
        throw new ConflictError("Applicant account is not ready for activation");
      }

      const existingMembership = await transaction.hospitalMembership.findUnique({
        where: {
          userId_hospitalId: {
            userId: application.applicantUser.id,
            hospitalId: application.hospital.id,
          },
        },
        select: { id: true },
      });

      if (existingMembership) {
        throw new ConflictError("Applicant already has a relationship with this hospital");
      }

      const existingOwner = await transaction.hospitalMembership.findFirst({
        where: {
          hospitalId: application.hospital.id,
          membershipType: MembershipType.OWNER,
          status: MembershipStatus.ACTIVE,
        },
        select: { id: true },
      });

      if (existingOwner) {
        throw new ConflictError("Hospital ownership is already assigned");
      }

      const activatedHospital = await transaction.hospital.updateMany({
        where: {
          id: application.hospital.id,
          status: HospitalStatus.PENDING_VERIFICATION,
        },
        data: { status: HospitalStatus.ACTIVE },
      });

      if (activatedHospital.count !== 1) {
        throw new ConflictError("Hospital changed state during approval");
      }

      const activatedUser = await transaction.user.updateMany({
        where: {
          id: application.applicantUser.id,
          authSubject: { not: null },
          status: { in: [UserStatus.PROVISIONED, UserStatus.ACTIVE] },
        },
        data: { status: UserStatus.ACTIVE },
      });

      if (activatedUser.count !== 1) {
        throw new ConflictError("Applicant account changed state during approval");
      }

      await transaction.userRole.upsert({
        where: {
          userId_role: {
            userId: application.applicantUser.id,
            role: Role.HOSPITAL,
          },
        },
        update: {},
        create: {
          userId: application.applicantUser.id,
          role: Role.HOSPITAL,
        },
      });

      await transaction.hospitalMembership.create({
        data: {
          userId: application.applicantUser.id,
          hospitalId: application.hospital.id,
          membershipType: MembershipType.OWNER,
          status: MembershipStatus.ACTIVE,
        },
      });

      await recordAuditEvent(
        {
          actorUserId: parsedReviewerId.data,
          action: "hospital_onboarding.approved",
          resourceType: "HospitalOnboardingApplication",
          resourceId: application.id,
          metadata: {
            hospitalCode: application.hospital.hospitalCode,
            status: HospitalOnboardingApplicationStatus.APPROVED,
          },
        },
        transaction,
      );

      return { applicationId: application.id };
    });

    return result;
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Hospital onboarding approval could not be completed");
  }
}

export async function rejectHospitalOnboarding(
  input: { applicationId: string; reviewerUserId: string; rejectionReason?: string },
  dependencies: HospitalOnboardingDependencies = {},
): Promise<{ applicationId: string }> {
  const parsedApplicationId = hospitalOnboardingApplicationIdSchema.safeParse(input.applicationId);
  const parsedReviewerId = hospitalOnboardingApplicationIdSchema.safeParse(input.reviewerUserId);
  const parsedReason = hospitalOnboardingRejectionSchema.safeParse(input.rejectionReason);

  if (!parsedApplicationId.success || !parsedReviewerId.success || !parsedReason.success) {
    throw new ValidationError("Hospital onboarding review data is invalid");
  }

  const database = getDatabase(dependencies);
  const now = dependencies.now ?? (() => new Date());

  try {
    return await database.$transaction(async (transaction) => {
      await assertPlatformAdmin(transaction, parsedReviewerId.data);

      const application = await transaction.hospitalOnboardingApplication.findUnique({
        where: { id: parsedApplicationId.data },
        select: { id: true, status: true },
      });

      if (!application) {
        throw new NotFoundError("Hospital onboarding application was not found");
      }

      if (application.status !== HospitalOnboardingApplicationStatus.PENDING) {
        throw new ConflictError("Hospital onboarding application has already been decided");
      }

      const claimed = await transaction.hospitalOnboardingApplication.updateMany({
        where: {
          id: parsedApplicationId.data,
          status: HospitalOnboardingApplicationStatus.PENDING,
        },
        data: {
          status: HospitalOnboardingApplicationStatus.REJECTED,
          reviewedAt: now(),
          reviewedByUserId: parsedReviewerId.data,
          rejectionReason: parsedReason.data ?? null,
        },
      });

      if (claimed.count !== 1) {
        return throwDecisionConflict(transaction, parsedApplicationId.data);
      }

      await recordAuditEvent(
        {
          actorUserId: parsedReviewerId.data,
          action: "hospital_onboarding.rejected",
          resourceType: "HospitalOnboardingApplication",
          resourceId: application.id,
          metadata: {
            status: HospitalOnboardingApplicationStatus.REJECTED,
          },
        },
        transaction,
      );

      return { applicationId: application.id };
    });
  } catch (error: unknown) {
    throw normalizeDatabaseError(error, "Hospital onboarding rejection could not be completed");
  }
}
