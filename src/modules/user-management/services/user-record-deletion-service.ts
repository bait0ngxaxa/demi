import "server-only";

import {
  MembershipStatus,
  MembershipType,
  PatientClassificationSource,
  Prisma,
  Role,
  UserStatus,
  WorkforceActivationOperationState,
  type PrismaClient,
} from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { runSerializableTransaction } from "@/lib/db/serializable-transaction";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { lockFirstCredentialOperation } from "@/modules/identity/services/first-credential-serialization";
import { assertOwnerInDatabase } from "@/modules/workforce/services/workforce-service";
import {
  ApplicationError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  NotFoundError,
  ValidationError,
} from "@/shared/errors/application-error";

import type { UserKind } from "../domain/user-management-values";
import { userRecordDeletionSchema } from "../schemas/user-management-schemas";

/**
 * UM-1 (UM-D2a) "ลบรายการ": only a record that was never activated, holds no data, and whose Person has no other
 * relationship or role may be hard-deleted. Every relation of the touched models is classified below; TypeScript
 * rejects a missing key and `findRelationRegistryGaps` rejects any relation the generated client knows but the
 * registry does not, so an unknown relation always makes the record NOT deletable (fail closed).
 *
 * - OWNER_SIDE: the foreign key this row holds (its parent); never data about the record.
 * - CHECKED: inspected explicitly below (the record itself, or an unmodified import snapshot).
 * - EMPTY: any row at all blocks deletion.
 */
type RelationRule = "OWNER_SIDE" | "CHECKED" | "EMPTY";
type Relations<Include> = Exclude<keyof Include, "_count">;

export const userRelationRules = {
  person: "OWNER_SIDE",
  roles: "CHECKED",
  memberships: "CHECKED",
  osmHospitalRelationships: "CHECKED",
  workforceActivations: "CHECKED",
  patientActivations: "CHECKED",
  serviceAreasCreated: "EMPTY",
  serviceAreasEnded: "EMPTY",
  networkRolesClassified: "EMPTY",
  hospitalsRetired: "EMPTY",
  hospitalsRegistered: "EMPTY",
  hospitalRetirementEvents: "EMPTY",
  childOwnerInvitationsIssued: "EMPTY",
  reportExportGrantsIssued: "EMPTY",
  networkPatientReadGrantsIssued: "EMPTY",
  patientSelfMeasurementsDeleted: "EMPTY",
  workforceActivationsCreated: "EMPTY",
  workforceBulkSubmissions: "EMPTY",
  patientActivationsCreated: "EMPTY",
  accountRecoveries: "EMPTY",
  accountRecoveriesIssued: "EMPTY",
  caregiverInvitationsReceived: "EMPTY",
  caregiverInvitationsIssued: "EMPTY",
  caregiverInvitationsRevoked: "EMPTY",
  caregiverRelationships: "EMPTY",
  caregiverRelationshipsRevoked: "EMPTY",
  appointmentGrants: "EMPTY",
  appointmentGrantsProposed: "EMPTY",
  appointmentGrantsAccepted: "EMPTY",
  appointmentGrantsRevoked: "EMPTY",
  resourceGrants: "EMPTY",
  resourceGrantsProposed: "EMPTY",
  resourceGrantsAccepted: "EMPTY",
  resourceGrantsRevoked: "EMPTY",
  patientOsmAssignments: "EMPTY",
  patientOsmAssignmentsCreated: "EMPTY",
  patientOsmAssignmentsEnded: "EMPTY",
  patientHospitalRelationshipsEnded: "EMPTY",
  screeningAssessmentsConducted: "EMPTY",
  goalPlansCreated: "EMPTY",
  appointmentsResponsible: "EMPTY",
  appointmentsCreated: "EMPTY",
  appointmentsAssignedOsm: "EMPTY",
  appointmentAcknowledgementsRecorded: "EMPTY",
  appointmentAssigneeAcceptancesRecorded: "EMPTY",
  appointmentCancellationRequestsSubmitted: "EMPTY",
  appointmentRescheduleRequestsSubmitted: "EMPTY",
  appointmentCancellationRequestsResolved: "EMPTY",
  appointmentRescheduleRequestsResolved: "EMPTY",
  appointmentCoordinationEventsRecorded: "EMPTY",
  followupsCreated: "EMPTY",
  patientProgramsCreated: "EMPTY",
  patientBaselinesRecorded: "EMPTY",
  patientClassificationsUpdated: "EMPTY",
  patientClassificationHistoryChanged: "EMPTY",
  patientServiceOfferingsCreated: "EMPTY",
  patientServiceOfferingsUpdated: "EMPTY",
  patientServiceRequestsRequested: "EMPTY",
  patientServiceRequestsPreferredOsm: "EMPTY",
  patientServiceRequestsReviewed: "EMPTY",
  patientServiceRequestsStarted: "EMPTY",
  patientServiceRequestsWithdrawn: "EMPTY",
  patientAccessRequestsReviewed: "EMPTY",
  patientAccessRequestsResolved: "EMPTY",
  patientFinalAssessmentsRecorded: "EMPTY",
  patientProgramRoundActivitiesRecorded: "EMPTY",
  patientProgramRoundVitalsRecorded: "EMPTY",
  patientProgramRoundCompletions: "EMPTY",
  patientProgramRoundStepSkips: "EMPTY",
  patientEvidenceArtifactsCreated: "EMPTY",
  patientProgramServiceOneRoutinesRecorded: "EMPTY",
  patientProgramServiceOneFloatingChartsRecorded: "EMPTY",
  patientProgramServiceOneDreamCardsRecorded: "EMPTY",
  patientProgramServiceOneConfidencesRecorded: "EMPTY",
  auditEvents: "EMPTY",
  lineAccountBindings: "EMPTY",
  lineAccountActionIntents: "EMPTY",
  lineAppointmentNotificationPreference: "EMPTY",
  appointmentLineNotificationIntents: "EMPTY",
  contactSetting: "EMPTY",
  lineMedicationReminderPreference: "EMPTY",
  medicationLineReminderIntents: "EMPTY",
  supportReports: "EMPTY",
  supportReportsUpdated: "EMPTY",
  hospitalOnboardingApplications: "EMPTY",
  hospitalOnboardingReviews: "EMPTY",
  takeoverLock: "EMPTY",
  takeoverLocksIssued: "EMPTY",
} as const satisfies Record<Relations<Prisma.UserInclude>, RelationRule>;

export const personRelationRules = {
  user: "CHECKED",
  patientProfile: "CHECKED",
  patientAccessRequestsResolved: "EMPTY",
} as const satisfies Record<Relations<Prisma.PersonInclude>, RelationRule>;

export const patientProfileRelationRules = {
  person: "OWNER_SIDE",
  hospitalRelationships: "CHECKED",
  patientClassification: "CHECKED",
  classificationHistory: "CHECKED",
  caregiverInvitations: "EMPTY",
  caregiverRelationships: "EMPTY",
  appointmentGrants: "EMPTY",
  resourceGrants: "EMPTY",
  personalMedications: "EMPTY",
  personalMealEntries: "EMPTY",
  personalMealCreateReceipts: "EMPTY",
  personalExerciseEntries: "EMPTY",
  personalExerciseCreateReceipts: "EMPTY",
  personalWeightGoal: "EMPTY",
  personalWeightGoalCreateReceipts: "EMPTY",
  selfMeasurements: "EMPTY",
} as const satisfies Record<Relations<Prisma.PatientProfileInclude>, RelationRule>;

export const patientRelationshipRelationRules = {
  patientProfile: "OWNER_SIDE",
  hospital: "OWNER_SIDE",
  endedByUser: "OWNER_SIDE",
  hospitalProfile: "CHECKED",
  healthHistory: "CHECKED",
  baseline: "CHECKED",
  appointmentGrants: "EMPTY",
  accountRecoveries: "EMPTY",
  osmAssignments: "EMPTY",
  screeningAssessments: "EMPTY",
  goalPlans: "EMPTY",
  appointments: "EMPTY",
  lineNotificationIntents: "EMPTY",
  followups: "EMPTY",
  programs: "EMPTY",
  finalAssessments: "EMPTY",
  evidenceArtifacts: "EMPTY",
  serviceRequests: "EMPTY",
  patientAccessRequestsResolved: "EMPTY",
} as const satisfies Record<Relations<Prisma.PatientHospitalRelationshipInclude>, RelationRule>;

/** Grant and invitation links are CHECKED: their foreign-key columns must be null on a deletable membership. */
export const hospitalMembershipRelationRules = {
  user: "OWNER_SIDE",
  hospital: "OWNER_SIDE",
  invitedBy: "CHECKED",
  invitedViaServiceArea: "CHECKED",
  reportExportGrantedByUser: "CHECKED",
  networkPatientReadGrantedByUser: "CHECKED",
} as const satisfies Record<Relations<Prisma.HospitalMembershipInclude>, RelationRule>;

export const osmRelationshipRelationRules = {
  user: "OWNER_SIDE",
  hospital: "OWNER_SIDE",
} as const satisfies Record<Relations<Prisma.OsmHospitalRelationshipInclude>, RelationRule>;

const registries = {
  User: userRelationRules,
  Person: personRelationRules,
  PatientProfile: patientProfileRelationRules,
  PatientHospitalRelationship: patientRelationshipRelationRules,
  HospitalMembership: hospitalMembershipRelationRules,
  OsmHospitalRelationship: osmRelationshipRelationRules,
} as const;

/** Relations the generated client has but a registry lacks (or the reverse); any gap blocks every deletion. */
export function findRelationRegistryGaps(
  models: readonly { name: string; fields: readonly { name: string; kind: string }[] }[] = Prisma.dmmf.datamodel.models,
): string[] {
  const gaps: string[] = [];
  for (const [modelName, rules] of Object.entries(registries)) {
    const model = models.find(({ name }) => name === modelName);
    if (!model) {
      gaps.push(modelName);
      continue;
    }
    const known = new Set(Object.keys(rules));
    const actual = new Set(model.fields.filter(({ kind }) => kind === "object").map(({ name }) => name));
    for (const name of actual) if (!known.has(name)) gaps.push(`${modelName}.${name}`);
    for (const name of known) if (!actual.has(name)) gaps.push(`${modelName}.${name}`);
  }
  return gaps;
}

const listRelations = new Map(Prisma.dmmf.datamodel.models.map((model) => [
  model.name,
  new Set(model.fields.filter(({ kind, isList }) => kind === "object" && isList).map(({ name }) => name)),
]));

/** `_count` for EMPTY list relations and an existence probe for EMPTY singular ones. */
function emptinessSelect(modelName: keyof typeof registries): Record<string, unknown> {
  const lists = listRelations.get(modelName) ?? new Set<string>();
  const empty = Object.entries(registries[modelName]).filter(([, rule]) => rule === "EMPTY").map(([name]) => name);
  return {
    _count: { select: Object.fromEntries(empty.filter((name) => lists.has(name)).map((name) => [name, true])) },
    ...Object.fromEntries(empty.filter((name) => !lists.has(name)).map((name) => [name, true])),
  };
}

function nonEmptyRelations(modelName: keyof typeof registries, row: Record<string, unknown>): string[] {
  const lists = listRelations.get(modelName) ?? new Set<string>();
  const counts = (row._count ?? {}) as Record<string, number>;
  return Object.entries(registries[modelName])
    .filter(([name, rule]) => rule === "EMPTY" && (lists.has(name) ? (counts[name] ?? 1) !== 0 : row[name] !== null))
    .map(([name]) => `${modelName}.${name}`);
}

export type UserRecordDeletionBlocker =
  | "REMOVED"
  | "OWNER_MEMBERSHIP"
  | "ACTIVATED"
  | "ACTIVATION_STARTED"
  | "OTHER_RELATIONSHIP"
  | "OTHER_ROLE"
  | "HAS_DATA"
  | "UNKNOWN_RELATION";

export type UserRecordDeletionAssessment = {
  kind: UserKind;
  relationshipId: string;
  hospitalId: string;
  userId: string;
  personId: string;
  patientProfileId: string | null;
  relationshipUpdatedAt: Date;
  blockers: UserRecordDeletionBlocker[];
  /** Diagnostic only (tests, logs): which relations held data. Never shown with names. */
  blockingRelations: string[];
};

export class UserRecordNotDeletableError extends ConflictError {
  constructor(readonly blockers: readonly UserRecordDeletionBlocker[]) {
    super("The record cannot be deleted; remove it from the system instead");
    this.name = "UserRecordNotDeletableError";
  }
}

const userSelect = {
  id: true,
  personId: true,
  status: true,
  authSubject: true,
  roles: { select: { role: true } },
  memberships: { select: { id: true } },
  osmHospitalRelationships: { select: { id: true } },
  workforceActivations: { select: { claimedAt: true, usedAt: true, reconciliationRequiredAt: true, operationState: true } },
  patientActivations: { select: { claimedAt: true, usedAt: true, reconciliationRequiredAt: true } },
  ...emptinessSelect("User"),
  person: {
    select: {
      id: true,
      patientProfile: { select: { id: true } },
      ...emptinessSelect("Person"),
    },
  },
} as const;

type UserForDeletion = {
  id: string;
  personId: string;
  status: UserStatus;
  authSubject: string | null;
  roles: { role: Role }[];
  memberships: { id: string }[];
  osmHospitalRelationships: { id: string }[];
  workforceActivations: { claimedAt: Date | null; usedAt: Date | null; reconciliationRequiredAt: Date | null; operationState: WorkforceActivationOperationState }[];
  patientActivations: { claimedAt: Date | null; usedAt: Date | null; reconciliationRequiredAt: Date | null }[];
  person: { id: string; patientProfile: { id: string } | null } & Record<string, unknown>;
} & Record<string, unknown>;

/** Rules shared by every kind: the account was never activated and nothing but this one record hangs off it. */
function userBlockers(
  user: UserForDeletion,
  expected: { role: Role; membershipId: string | null; osmRelationshipId: string | null; patientProfileId: string | null },
): { blockers: UserRecordDeletionBlocker[]; relations: string[] } {
  const blockers = new Set<UserRecordDeletionBlocker>();
  if (user.status !== UserStatus.PROVISIONED || user.authSubject !== null) blockers.add("ACTIVATED");
  if (
    user.workforceActivations.some((activation) => activation.claimedAt || activation.usedAt || activation.reconciliationRequiredAt ||
      activation.operationState !== WorkforceActivationOperationState.NOT_STARTED) ||
    user.patientActivations.some((activation) => activation.claimedAt || activation.usedAt || activation.reconciliationRequiredAt)
  ) {
    blockers.add("ACTIVATION_STARTED");
  }
  if (user.roles.length !== 1 || user.roles[0]?.role !== expected.role) blockers.add("OTHER_ROLE");
  const onlyOwn = (rows: { id: string }[], ownId: string | null) => rows.every(({ id }) => id === ownId) && rows.length === (ownId ? 1 : 0);
  if (
    !onlyOwn(user.memberships, expected.membershipId) ||
    !onlyOwn(user.osmHospitalRelationships, expected.osmRelationshipId) ||
    (user.person.patientProfile?.id ?? null) !== expected.patientProfileId
  ) {
    blockers.add("OTHER_RELATIONSHIP");
  }
  const relations = [...nonEmptyRelations("User", user), ...nonEmptyRelations("Person", user.person)];
  if (relations.length) blockers.add("HAS_DATA");
  return { blockers: [...blockers], relations };
}

function withRegistryGaps(blockers: UserRecordDeletionBlocker[], relations: string[]): UserRecordDeletionBlocker[] {
  const gaps = findRelationRegistryGaps();
  relations.push(...gaps);
  return gaps.length ? [...new Set<UserRecordDeletionBlocker>([...blockers, "UNKNOWN_RELATION"])] : blockers;
}

/** Staff query: a MEMBER HospitalMembership with no grant/invitation links and an unused account. */
export async function assessStaffRecordDeletion(
  transaction: Prisma.TransactionClient,
  hospitalId: string,
  relationshipId: string,
): Promise<UserRecordDeletionAssessment | null> {
  const membership = await transaction.hospitalMembership.findFirst({
    where: { id: relationshipId, hospitalId },
    select: {
      id: true,
      status: true,
      updatedAt: true,
      membershipType: true,
      invitedByUserId: true,
      invitedViaServiceAreaId: true,
      reportExportGrantedByUserId: true,
      networkPatientReadGrantedByUserId: true,
      user: { select: userSelect },
    },
  });
  if (!membership) return null;
  const user = membership.user as unknown as UserForDeletion;
  const { blockers, relations } = userBlockers(user, {
    role: Role.HOSPITAL, membershipId: membership.id, osmRelationshipId: null, patientProfileId: null,
  });
  if (membership.status === MembershipStatus.ENDED) blockers.push("REMOVED");
  if (membership.membershipType !== MembershipType.MEMBER) blockers.push("OWNER_MEMBERSHIP");
  if (membership.invitedByUserId || membership.invitedViaServiceAreaId || membership.reportExportGrantedByUserId ||
    membership.networkPatientReadGrantedByUserId) {
    relations.push("HospitalMembership.grants");
    if (!blockers.includes("HAS_DATA")) blockers.push("HAS_DATA");
  }
  return {
    kind: "staff", relationshipId: membership.id, hospitalId, userId: user.id, personId: user.personId,
    patientProfileId: null, relationshipUpdatedAt: membership.updatedAt,
    blockers: withRegistryGaps(blockers, relations), blockingRelations: relations,
  };
}

/** OSM query: an OsmHospitalRelationship of an unused OSM-only account. */
export async function assessOsmRecordDeletion(
  transaction: Prisma.TransactionClient,
  hospitalId: string,
  relationshipId: string,
): Promise<UserRecordDeletionAssessment | null> {
  const relationship = await transaction.osmHospitalRelationship.findFirst({
    where: { id: relationshipId, hospitalId },
    select: { id: true, status: true, updatedAt: true, user: { select: userSelect } },
  });
  if (!relationship) return null;
  const user = relationship.user as unknown as UserForDeletion;
  const { blockers, relations } = userBlockers(user, {
    role: Role.OSM, membershipId: null, osmRelationshipId: relationship.id, patientProfileId: null,
  });
  if (relationship.status === MembershipStatus.ENDED) blockers.push("REMOVED");
  return {
    kind: "osm", relationshipId: relationship.id, hospitalId, userId: user.id, personId: user.personId,
    patientProfileId: null, relationshipUpdatedAt: relationship.updatedAt,
    blockers: withRegistryGaps(blockers, relations), blockingRelations: relations,
  };
}

/**
 * Patient query: the only Hospital relationship of an unused Patient account. The import snapshot (UM-D7) is part of
 * the record only while it is provably unmodified: hospital profile version 1 with no staff or round write,
 * health history version 1 with its import audit, Baseline with its ROSTER_IMPORT audit, and a classification whose
 * single history row is the import. Anything else is data and blocks deletion.
 */
export async function assessPatientRecordDeletion(
  transaction: Prisma.TransactionClient,
  hospitalId: string,
  relationshipId: string,
): Promise<UserRecordDeletionAssessment | null> {
  const relationship = await transaction.patientHospitalRelationship.findFirst({
    where: { id: relationshipId, hospitalId },
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      endedAt: true,
      hospitalProfile: { select: { version: true } },
      healthHistory: { select: { version: true } },
      baseline: { select: { id: true } },
      ...emptinessSelect("PatientHospitalRelationship"),
      patientProfile: {
        select: {
          id: true,
          hospitalRelationships: { select: { id: true } },
          patientClassification: { select: { classification: true, updatedAt: true } },
          classificationHistory: { select: { source: true, fromClassification: true, toClassification: true, changedAt: true } },
          ...emptinessSelect("PatientProfile"),
          person: { select: { user: { select: userSelect } } },
        },
      },
    },
  });
  if (!relationship) return null;
  const profile = relationship.patientProfile;
  const user = profile.person.user as unknown as UserForDeletion | null;
  if (!user) return null;

  const { blockers, relations } = userBlockers(user, {
    role: Role.PATIENT, membershipId: null, osmRelationshipId: null, patientProfileId: profile.id,
  });
  if (relationship.endedAt) blockers.push("REMOVED");
  if (profile.hospitalRelationships.length !== 1 || profile.hospitalRelationships[0]?.id !== relationship.id) {
    if (!blockers.includes("OTHER_RELATIONSHIP")) blockers.push("OTHER_RELATIONSHIP");
  }
  relations.push(
    ...nonEmptyRelations("PatientHospitalRelationship", relationship as unknown as Record<string, unknown>),
    ...nonEmptyRelations("PatientProfile", profile as unknown as Record<string, unknown>),
  );

  const [profileWrites, healthImport, baselineImport] = await Promise.all([
    // Staff and round writers audit every profile write; the Patient's own edit needs an activated account.
    relationship.hospitalProfile
      ? transaction.auditEvent.count({ where: { OR: [
          { action: "patient.hospital_profile.updated", resourceType: "PatientHospitalRelationship", resourceId: relationship.id },
          { action: "patient_program_round.profile_updated", resourceType: "PatientHospitalProfile", resourceId: relationship.id },
        ] } })
      : Promise.resolve(0),
    relationship.healthHistory
      ? transaction.auditEvent.count({ where: { action: "patient.health_history.imported", resourceType: "PatientHospitalRelationship",
        resourceId: relationship.id, metadata: { path: ["source"], equals: "ROSTER_IMPORT" } } })
      : Promise.resolve(1),
    relationship.baseline
      ? transaction.auditEvent.count({ where: { action: "patient_baseline.created", resourceType: "PatientBaseline",
        resourceId: relationship.baseline.id, metadata: { path: ["source"], equals: "ROSTER_IMPORT" } } })
      : Promise.resolve(1),
  ]);
  const history = profile.classificationHistory;
  const classification = profile.patientClassification;
  const classificationIsImport = classification
    ? history.length === 1 && history[0]?.source === PatientClassificationSource.ROSTER_IMPORT &&
      history[0].fromClassification === null && history[0].toClassification === classification.classification &&
      history[0].changedAt.getTime() === classification.updatedAt.getTime()
    : history.length === 0;
  if (relationship.hospitalProfile && (relationship.hospitalProfile.version !== 1 || profileWrites !== 0)) {
    relations.push("PatientHospitalRelationship.hospitalProfile");
  }
  if (relationship.healthHistory && (relationship.healthHistory.version !== 1 || healthImport === 0)) {
    relations.push("PatientHospitalRelationship.healthHistory");
  }
  if (baselineImport === 0) relations.push("PatientHospitalRelationship.baseline");
  if (!classificationIsImport) relations.push("PatientProfile.patientClassification");
  if (relations.length && !blockers.includes("HAS_DATA")) blockers.push("HAS_DATA");

  return {
    kind: "patient", relationshipId: relationship.id, hospitalId, userId: user.id, personId: user.personId,
    patientProfileId: profile.id, relationshipUpdatedAt: relationship.updatedAt,
    blockers: withRegistryGaps(blockers, relations), blockingRelations: relations,
  };
}

export function assessUserRecordDeletion(
  transaction: Prisma.TransactionClient,
  kind: UserKind,
  hospitalId: string,
  relationshipId: string,
): Promise<UserRecordDeletionAssessment | null> {
  switch (kind) {
    case "staff":
      return assessStaffRecordDeletion(transaction, hospitalId, relationshipId);
    case "osm":
      return assessOsmRecordDeletion(transaction, hospitalId, relationshipId);
    case "patient":
      return assessPatientRecordDeletion(transaction, hospitalId, relationshipId);
  }
}

async function deleteRecordInTransaction(transaction: Prisma.TransactionClient, assessment: UserRecordDeletionAssessment): Promise<void> {
  if (assessment.kind === "patient" && assessment.patientProfileId) {
    const relationshipId = assessment.relationshipId;
    await transaction.patientHospitalHealthHistory.deleteMany({ where: { patientHospitalRelationshipId: relationshipId } });
    await transaction.patientBaseline.deleteMany({ where: { patientHospitalRelationshipId: relationshipId } });
    await transaction.patientHospitalProfile.deleteMany({ where: { patientHospitalRelationshipId: relationshipId } });
    await transaction.patientHospitalRelationship.delete({ where: { id: relationshipId } });
    await transaction.patientClassificationHistory.deleteMany({ where: { patientProfileId: assessment.patientProfileId } });
    await transaction.patientClassification.deleteMany({ where: { patientProfileId: assessment.patientProfileId } });
    await transaction.patientProfile.delete({ where: { id: assessment.patientProfileId } });
  } else if (assessment.kind === "staff") {
    await transaction.hospitalMembership.delete({ where: { id: assessment.relationshipId } });
  } else {
    await transaction.osmHospitalRelationship.delete({ where: { id: assessment.relationshipId } });
  }
  // Outstanding invite links and self-registration capabilities are bound to this User: deleting them revokes them.
  await transaction.workforceActivation.deleteMany({ where: { userId: assessment.userId } });
  await transaction.patientActivation.deleteMany({ where: { userId: assessment.userId } });
  await transaction.userRole.deleteMany({ where: { userId: assessment.userId } });
  await transaction.user.delete({ where: { id: assessment.userId } });
  await transaction.person.delete({ where: { id: assessment.personId } });
}

/** UM-D2a: hard-delete an unused record. Re-authorizes the OWNER and re-runs the assessment inside the transaction. */
export async function deleteUnusedUserRecord(
  actor: ActorContext | null | undefined,
  input: unknown,
  database: PrismaClient = getPrisma(),
): Promise<{ kind: UserKind; hospitalId: string }> {
  if (!actor) throw new ForbiddenError();
  const parsed = userRecordDeletionSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Record deletion data is invalid");
  const { kind, relationshipId, targetHospitalId, expectedUpdatedAt } = parsed.data;

  try {
    return await runSerializableTransaction(database, async (transaction) => {
      await assertOwnerInDatabase(transaction, actor.userId, targetHospitalId);
      const located = await assessUserRecordDeletion(transaction, kind, targetHospitalId, relationshipId);
      if (!located) throw new NotFoundError();
      // Serialize with activation and self-registration claims for this User, then assess the locked state.
      await lockFirstCredentialOperation(transaction, located.userId);
      const assessment = await assessUserRecordDeletion(transaction, kind, targetHospitalId, relationshipId);
      if (!assessment) throw new NotFoundError();
      if (assessment.relationshipUpdatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()) {
        throw new ConflictError("The record changed");
      }
      if (assessment.blockers.length) throw new UserRecordNotDeletableError(assessment.blockers);

      await deleteRecordInTransaction(transaction, assessment);
      // UM-D2a: no name, national ID, or record id in the audit; the Hospital is the resource.
      await recordAuditEvent({
        actorUserId: actor.userId,
        action: "user_record.deleted",
        resourceType: "Hospital",
        resourceId: targetHospitalId,
        metadata: { kind, outcome: "DELETED" },
      }, transaction);
      return { kind, hospitalId: targetHospitalId };
    });
  } catch (error: unknown) {
    if (error instanceof ApplicationError) throw error;
    // A foreign key we did not classify still refuses the delete: never deletable, never partial.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new UserRecordNotDeletableError(["UNKNOWN_RELATION"]);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) {
      throw new ConflictError("The record changed");
    }
    throw new InfrastructureError("The record could not be deleted");
  }
}
