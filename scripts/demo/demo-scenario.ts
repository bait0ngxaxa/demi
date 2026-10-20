/**
 * Synthetic demo scenario (P1 Part C): one Parent hospital, two direct Child รพ.สต., every role and every care
 * state, all dated relative to "today" in Asia/Bangkok.
 *
 * Data is created through the domain services the Server Actions call (each action is parse → service →
 * revalidate; the CLI has no Next request context for the action wrapper), with actors resolved from the
 * database by the production resolver and fresh nonces. Direct Prisma writes are limited to:
 * - a second Platform ADMIN when the environment already has one (no service adds a second ADMIN);
 * - reset, which deletes demo-tagged rows and returns the demo hospitals to PENDING_VERIFICATION.
 */
import { randomUUID } from "node:crypto";

import { HospitalStatus, MembershipType, Prisma, Profession, Role, UserStatus, type PrismaClient } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import { recordAuditEvent } from "@/modules/audit/services/audit-service";
import { resolveActorAccessByUserId } from "@/modules/auth/services/actor-context-service";
import {
  provisionPasswordAuthIdentity,
  type PasswordAuthAdminProvider,
  type ProvisionPasswordAuthIdentityResult,
} from "@/modules/auth/services/password-auth-provisioning-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  completeAppointment,
  createAppointment,
  requestOwnPatientAppointmentCancellation,
  submitAppointmentRescheduleRequest,
} from "@/modules/appointments/services/appointment-service";
import { createPersonalExercise } from "@/modules/exercises/services/personal-exercise-service";
import { acceptAppointmentGrant, proposeAppointmentGrant } from "@/modules/family/services/appointment-grant-service";
import { acceptCaregiverInvitation, createCaregiverInvitation } from "@/modules/family/services/caregiver-relationship-service";
import { createFollowup, createFollowupForProgram } from "@/modules/followups/services/followup-service";
import { createGoalPlanForProgram } from "@/modules/goals/services/goal-service";
import { approveHospitalOnboarding, submitHospitalOnboarding } from "@/modules/hospital-onboarding/services/hospital-onboarding-service";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { createPersonalMedication } from "@/modules/medications/services/personal-medication-service";
import { completePatientActivation, issuePatientActivation } from "@/modules/patient-activation/services/patient-activation-service";
import { assignOsmToPatient } from "@/modules/patient-assignment/services/patient-osm-assignment-service";
import { createPatientBaseline } from "@/modules/patient-baseline/services/patient-baseline-service";
import { createPatientFinalAssessment } from "@/modules/patient-final-assessment/services/patient-final-assessment-service";
import { currentBuddhistYear } from "@/modules/patient-hospital-profile/schemas/patient-health-history-schemas";
import { updatePatientHealthHistory } from "@/modules/patient-hospital-profile/services/patient-health-history-service";
import { updateStaffPatientHospitalProfile } from "@/modules/patient-hospital-profile/services/patient-hospital-profile-service";
import { endPatientHospitalRelationship } from "@/modules/patient-hospital-relationship/services/patient-hospital-relationship-end-service";
import { completePatientProgram, openPatientProgram } from "@/modules/patient-program/services/patient-program-service";
import {
  recordPatientProgramServiceOneConfidence,
  recordPatientProgramServiceOneDreamCard,
  recordPatientProgramServiceOneFloatingChart,
  recordPatientProgramServiceOneRoutine,
} from "@/modules/patient-program/services/patient-program-service-one-service";
import { recordPatientProgramRoundReview, recordPatientProgramRoundVitals } from "@/modules/patient-program-rounds/services/round-service";
import { provisionPatient } from "@/modules/patient-provisioning/services/patient-provisioning-service";
import { createOwnPatientSelfMeasurement } from "@/modules/patient-self-measurements/services/patient-self-measurement-service";
import { bootstrapPlatformAdmin } from "@/modules/platform-admin-bootstrap/services/platform-admin-bootstrap-service";
import { getHospitalReportingDatasetForExport, getParentChildHospitalReportingPage } from "@/modules/reporting/services/hospital-report-query-service";
import { submitScreening } from "@/modules/screening/services/screening-service";
import { createSupportReport } from "@/modules/support/services/support-report-service";
import { completeWorkforceActivation, provisionHospitalMember, provisionOsm, setHospitalMembershipReportExportGrant } from "@/modules/workforce/services/workforce-service";
import { toServiceDateOnly } from "@/shared/time/service-date";

import { DEMO_ACCOUNT_LIST, DEMO_ACCOUNTS, demoNationalId, demoPhone, type DemoAccount, type DemoAccountKey } from "./demo-identities";

export type DemoScenarioDependencies = {
  /** One password for every demo account; supplied by the caller from an environment variable, never stored. */
  password: string;
  /** Supabase admin auth provider; the default is the configured Supabase project. */
  authProvider?: PasswordAuthAdminProvider;
  /** Deletes one Supabase auth user; the default uses the configured Supabase project. */
  deleteAuthUser?: (authSubject: string) => Promise<void>;
  /** Asia/Bangkok service date treated as today (YYYY-MM-DD); defaults to the current date. */
  today?: string;
  /** Parent hospital code; defaults to the first eligible Parent of the Hospital master. */
  parentHospitalCode?: string;
};

export type DemoSeedReport = {
  hospitals: { parent: string; children: [string, string] };
  accounts: readonly { role: string; login: string; displayName: string }[];
  counts: Record<string, number>;
  verification: Record<string, number>;
};

type HospitalRef = { id: string; hospitalCode: string; name: string };
type PatientRef = { key: DemoAccountKey; userId: string; relationshipId: string; hospitalId: string };

const FAMILY_ENABLED = { enabled: true } as const;

const database = (): PrismaClient => getPrisma();
const at = (day: string, time = "10:00"): Date => new Date(`${day}T${time}:00+07:00`);
const clock = (day: string, time?: string) => ({ now: () => at(day, time) });

function addDays(day: string, offset: number): string {
  const value = new Date(`${day}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}

function identityHash(account: DemoAccount): string {
  return hashIdentityReference({ namespace: "thai-national-id", value: demoNationalId(account.index) });
}

async function actorOf(userId: string): Promise<ActorContext> {
  const access = await resolveActorAccessByUserId(userId);
  if (access.status !== "AUTHORIZED") throw new Error(`Demo actor could not be resolved (${access.status})`);
  return access.actor;
}

function provisioner(dependencies: DemoScenarioDependencies) {
  return (input: { userId: string; password: string }): Promise<ProvisionPasswordAuthIdentityResult> =>
    provisionPasswordAuthIdentity(input, dependencies.authProvider ? { provider: dependencies.authProvider } : {});
}

async function defaultDeleteAuthUser(authSubject: string): Promise<void> {
  const { getSupabaseAdminClient } = await import("@/lib/auth/supabase-admin");
  const { error } = await getSupabaseAdminClient().auth.admin.deleteUser(authSubject);
  if (error && (error as { status?: number }).status !== 404) throw new Error("Demo auth user could not be deleted");
}

// ---------------------------------------------------------------------------------------------------------------
// Hospital selection
// ---------------------------------------------------------------------------------------------------------------

/** One Parent and its first two Children, all PENDING_VERIFICATION with no onboarding decision yet. */
async function selectDemoHospitals(parentHospitalCode?: string): Promise<{ parent: HospitalRef; children: [HospitalRef, HospitalRef] }> {
  const available = { status: HospitalStatus.PENDING_VERIFICATION, onboardingApplications: { none: {} } };
  const parents = await database().hospital.findMany({
    where: {
      ...available,
      parentHospitalId: null,
      ...(parentHospitalCode ? { hospitalCode: parentHospitalCode } : {}),
    },
    orderBy: { hospitalCode: "asc" },
    select: {
      id: true,
      hospitalCode: true,
      name: true,
      childHospitals: { where: available, orderBy: { hospitalCode: "asc" }, take: 2, select: { id: true, hospitalCode: true, name: true } },
    },
  });
  const parent = parents.find((candidate) => candidate.childHospitals.length === 2);
  if (!parent) {
    throw new Error(parentHospitalCode
      ? "The requested Parent hospital is not available (needs PENDING_VERIFICATION and two such Children without onboarding)"
      : "No Parent hospital with two available Children was found in the Hospital master");
  }
  const [first, second] = parent.childHospitals;
  return { parent: { id: parent.id, hospitalCode: parent.hospitalCode, name: parent.name }, children: [first!, second!] };
}

// ---------------------------------------------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------------------------------------------

async function seedPlatformAdmin(dependencies: DemoScenarioDependencies): Promise<string> {
  const account = DEMO_ACCOUNTS.admin;
  const existingAdmin = await database().userRole.findFirst({ where: { role: Role.ADMIN }, select: { userId: true } });
  if (!existingAdmin) {
    const result = await bootstrapPlatformAdmin(
      { nationalId: demoNationalId(account.index), givenName: account.givenName, familyName: account.familyName, password: dependencies.password },
      { provisionIdentity: provisioner(dependencies) },
    );
    return result.userId;
  }

  // Direct write (documented): the bootstrap service refuses once any ADMIN exists and no service adds another.
  const user = await database().$transaction(async (transaction) => {
    const person = await transaction.person.create({
      data: { identityKeyHash: identityHash(account), givenName: account.givenName, familyName: account.familyName },
      select: { id: true },
    });
    return transaction.user.create({ data: { personId: person.id, status: UserStatus.PROVISIONED }, select: { id: true } });
  });
  await provisioner(dependencies)({ userId: user.id, password: dependencies.password });
  await database().$transaction(async (transaction) => {
    await transaction.user.update({ where: { id: user.id }, data: { status: UserStatus.ACTIVE } });
    await transaction.userRole.create({ data: { userId: user.id, role: Role.ADMIN } });
  });
  await recordAuditEvent({
    actorUserId: user.id,
    action: "demo_seed.platform_admin.created",
    resourceType: "User",
    resourceId: user.id,
    metadata: { reason: "existing_admin_present" },
  });
  return user.id;
}

async function onboardHospital(hospital: HospitalRef, owner: DemoAccount, adminUserId: string, dependencies: DemoScenarioDependencies): Promise<string> {
  const submission = await submitHospitalOnboarding(
    {
      hospitalCode: hospital.hospitalCode,
      nationalId: demoNationalId(owner.index),
      givenName: owner.givenName,
      familyName: owner.familyName,
      password: dependencies.password,
      passwordConfirmation: dependencies.password,
    },
    { provisionIdentity: provisioner(dependencies) },
  );
  await approveHospitalOnboarding({ applicationId: submission.applicationId, reviewerUserId: adminUserId });
  const membership = await database().hospitalMembership.findFirstOrThrow({
    where: { hospitalId: hospital.id, membershipType: MembershipType.OWNER, user: { person: { identityKeyHash: identityHash(owner) } } },
    select: { userId: true },
  });
  return membership.userId;
}

async function seedWorkforce(
  kind: "MEMBER" | "OSM",
  account: DemoAccount,
  hospitalId: string,
  ownerActor: ActorContext,
  dependencies: DemoScenarioDependencies,
): Promise<{ userId: string; relationshipId: string }> {
  const input = { nationalId: demoNationalId(account.index), givenName: account.givenName, familyName: account.familyName, targetHospitalId: hospitalId };
  const provisioned = kind === "MEMBER"
    ? await provisionHospitalMember(ownerActor, { ...input, profession: Profession.NURSE })
    : await provisionOsm(ownerActor, input);
  if (provisioned.activationToken) {
    await completeWorkforceActivation(
      provisioned.activationToken,
      { nationalId: input.nationalId, password: dependencies.password, passwordConfirmation: dependencies.password },
      { provisionIdentity: provisioner(dependencies) },
    );
  }
  return { userId: provisioned.userId, relationshipId: provisioned.relationshipId };
}

async function seedPatient(
  key: DemoAccountKey,
  hospitalId: string,
  staffActor: ActorContext,
  dependencies: DemoScenarioDependencies,
  options: { hospitalNumber?: string; activate?: boolean } = {},
): Promise<PatientRef> {
  const account = DEMO_ACCOUNTS[key];
  const provisioned = await provisionPatient(staffActor, {
    identity: { namespace: "thai-national-id", value: demoNationalId(account.index) },
    givenName: account.givenName,
    familyName: account.familyName,
    hospitalNumber: options.hospitalNumber ?? `DEMO-${String(account.index).padStart(4, "0")}`,
    targetHospitalId: hospitalId,
  });
  const user = await database().user.findFirstOrThrow({
    where: { person: { identityKeyHash: identityHash(account) } },
    select: { id: true, authSubject: true },
  });
  if (options.activate !== false && !user.authSubject) {
    const issued = await issuePatientActivation(staffActor, { userId: user.id, targetHospitalId: hospitalId, reissue: false });
    if (!issued.activationToken) throw new Error("Demo patient activation was not issued");
    await completePatientActivation(
      issued.activationToken,
      { password: dependencies.password, passwordConfirmation: dependencies.password },
      { provisionIdentity: provisioner(dependencies) },
    );
  }
  await updateStaffPatientHospitalProfile(staffActor, provisioned.relationshipId, {
    expectedVersion: 0,
    phoneNumber: demoPhone(account.index),
    province: "ทดสอบจังหวัด",
    district: "ทดสอบอำเภอ",
    emergencyContactName: `ทดสอบญาติของ${account.givenName.replace("ทดสอบ", "")}`,
    emergencyContactPhone: demoPhone(account.index + 50),
    emergencyContactRelationship: "บุตร",
  });
  return { key, userId: user.id, relationshipId: provisioned.relationshipId, hospitalId };
}

// ---------------------------------------------------------------------------------------------------------------
// Care data
// ---------------------------------------------------------------------------------------------------------------

type Vitals = { weight: number; heightCm: number; waist: number; systolic: number; diastolic: number; dtx: number; hba1c: number; cvd: number };
type ProgramStage = "ROUND_1" | "ROUND_2" | "ROUND_4" | "ROUND_5" | "COMPLETED";

const PLAN_V1 = [
  { activityCode: "reduce_rice", targetDays: 5 },
  { activityCode: "stop_sweet", targetDays: 7 },
  { activityCode: "cardio", targetDays: 3, targetValue: 30, targetUnit: "minutes" },
];
const PLAN_V2: typeof PLAN_V1 = [
  { activityCode: "reduce_rice", targetDays: 5 },
  { activityCode: "stop_sweet", targetDays: 7 },
  { activityCode: "cardio", targetDays: 4, targetValue: 30, targetUnit: "minutes" },
];

async function seedHealthHistory(staffActor: ActorContext, relationshipId: string, yearsAgo: number): Promise<void> {
  await updatePatientHealthHistory(staffActor, relationshipId, {
    expectedVersion: 0,
    diabetes: "YES",
    hypertension: yearsAgo % 2 === 0 ? "YES" : "NO",
    otherConditions: null,
    familyHypertension: "YES",
    familyDiabetes: yearsAgo % 3 === 0 ? "UNKNOWN" : "YES",
    familyHeartDisease: "NO",
    familyStroke: "NO",
    diagnosisYear: currentBuddhistYear() - yearsAgo,
  });
}

async function seedBaseline(staffActor: ActorContext, relationshipId: string, day: string, vitals: Vitals): Promise<void> {
  await createPatientBaseline(staffActor, {
    patientHospitalRelationshipId: relationshipId,
    recordedOn: day,
    weight: vitals.weight,
    heightCm: vitals.heightCm,
    waistCircumference: vitals.waist,
    bloodPressureSystolic: vitals.systolic,
    bloodPressureDiastolic: vitals.diastolic,
    bloodSugarDtx: vitals.dtx,
    hba1c: vitals.hba1c,
    cvdRiskScore: vitals.cvd,
    adaptationSummary: null,
    adaptationObstacles: null,
    adaptationOpportunities: null,
    confidenceScore: 6,
    confidenceImprovementPlan: null,
    summary: "ทดสอบ: ข้อมูลตั้งต้นสังเคราะห์สำหรับการสาธิต",
    recommendations: null,
  }, clock(day, "09:00"));
}

function screeningInput(relationshipId: string, programId: string | undefined, level: number) {
  const pam = Object.fromEntries([1, 2, 3, 4, 5].map((index) => [`pam-${index}`, Math.min(4, Math.max(1, level + (index % 2)))]));
  const proms = Object.fromEntries([1, 2, 3, 4].map((index) => [`proms-${index}`, Math.min(6, Math.max(1, level + 2 + (index % 2)))]));
  return {
    patientHospitalRelationshipId: relationshipId,
    ...(programId ? { patientProgramId: programId } : {}),
    submissionNonce: randomUUID(),
    responses: { pam, proms, confidenceScore: Math.min(10, level + 4), confidenceImprovementPlan: undefined },
  };
}

type FollowupSpec = {
  day: string; dtx: number; weight: number; planAdjusted: boolean; obstacle: boolean;
  /** Achieved days for reduce_rice, stop_sweet and cardio against the source plan's targets. */
  progress: [number, number, number];
  plan: typeof PLAN_V1;
};

async function seedProgramFollowup(osmActor: ActorContext, programId: string, goalPlanId: string, spec: FollowupSpec): Promise<string> {
  const status = (achieved: number, target: number) => (achieved >= target ? "DONE" : achieved === 0 ? "NOT_DONE" : "PARTIAL");
  const result = await createFollowupForProgram(osmActor, {
    patientProgramId: programId,
    submissionNonce: randomUUID(),
    sourceGoalPlanId: goalPlanId,
    serviceDate: spec.day,
    planAdjusted: spec.planAdjusted,
    hasObstacle: spec.obstacle,
    obstacleNote: spec.obstacle ? "ทดสอบ: ช่วงเทศกาลควบคุมอาหารได้ยาก" : null,
    weight: spec.weight,
    bloodSugar: spec.dtx,
    confidenceScore: 7,
    activityProgress: spec.plan.map((item, index) => ({
      goalActivityCode: item.activityCode,
      status: status(spec.progress[index]!, item.targetDays),
      achievedDays: spec.progress[index]!,
    })),
  }, clock(spec.day, "11:00"));
  return result.followupId;
}

async function seedProgram(input: {
  patient: PatientRef;
  staffActor: ActorContext;
  osmActor: ActorContext;
  stage: ProgramStage;
  startDay: string;
  vitals: Vitals;
  improvement: number;
}): Promise<{ programId: string; finalDay: string | null }> {
  const { patient, staffActor, osmActor, stage, startDay, vitals, improvement } = input;
  const day = (offset: number) => addDays(startDay, offset);
  const relationshipId = patient.relationshipId;

  await seedBaseline(staffActor, relationshipId, startDay, vitals);
  const program = await openPatientProgram(staffActor, { patientHospitalRelationshipId: relationshipId }, clock(startDay, "09:30"));
  const programId = program.patientProgramId;

  // Round 1: vitals, the Program screening and Service 1 tools.
  await recordPatientProgramRoundVitals(osmActor, {
    patientProgramId: programId, roundNumber: 1, submissionNonce: randomUUID(), serviceDate: startDay,
    weight: vitals.weight - 0.5, heightCm: vitals.heightCm, waistCircumference: vitals.waist, systolicBloodPressure: vitals.systolic,
    diastolicBloodPressure: vitals.diastolic, bloodSugar: vitals.dtx - 5,
  }, clock(startDay, "10:00"));
  await submitScreening(osmActor, screeningInput(relationshipId, programId, 2), clock(startDay, "10:10"));
  await recordPatientProgramServiceOneFloatingChart(osmActor, { patientProgramId: programId, summary: "ทดสอบ: กราฟวัดลอยจม" }, clock(startDay, "10:20"));
  await recordPatientProgramServiceOneDreamCard(osmActor, { patientProgramId: programId, description: "ทดสอบ: อยากเล่นกับหลานได้นานขึ้น" }, clock(startDay, "10:25"));
  await recordPatientProgramServiceOneRoutine(osmActor, { patientProgramId: programId }, clock(startDay, "10:30"));
  await recordPatientProgramServiceOneConfidence(osmActor, { patientProgramId: programId, score: 7, improvementPlan: "ทดสอบ: เดินหลังอาหารเย็น" }, clock(startDay, "10:35"));
  if (stage === "ROUND_1") return { programId, finalDay: null };

  // Round 2: vitals and the first Goal Plan (v1).
  const round2 = day(14);
  await recordPatientProgramRoundVitals(osmActor, {
    patientProgramId: programId, roundNumber: 2, submissionNonce: randomUUID(), serviceDate: round2,
    weight: vitals.weight - 1, heightCm: vitals.heightCm, bloodSugar: vitals.dtx - 12,
  }, clock(round2, "10:00"));
  const planV1 = await createGoalPlanForProgram(osmActor, {
    patientProgramId: programId, submissionNonce: randomUUID(), primaryGoalCode: "glucose", items: PLAN_V1,
    weeklyNote: "ทดสอบ: เป้าหมายรายสัปดาห์",
  }, clock(round2, "10:30"));
  if (stage === "ROUND_2") return { programId, finalDay: null };

  // Rounds 3–4: Follow-ups 1–2; round 3 reviews the Dream Card (REVIEWED, planned) and round 4 adjusts the plan (v2).
  await seedProgramFollowup(osmActor, programId, planV1.goalPlanId, {
    day: day(28), dtx: vitals.dtx - 20, weight: vitals.weight - 1.5, planAdjusted: false, obstacle: true, progress: [3, 4, 1], plan: PLAN_V1,
  });
  await recordPatientProgramRoundReview(osmActor, {
    patientProgramId: programId, roundNumber: 3, toolCode: "DREAM_CARD", submissionNonce: randomUUID(),
  }, clock(day(28), "11:30"));
  const adjustingFollowupId = await seedProgramFollowup(osmActor, programId, planV1.goalPlanId, {
    day: day(42), dtx: vitals.dtx - 28, weight: vitals.weight - 2.5, planAdjusted: true, obstacle: false, progress: [5, 6, 2], plan: PLAN_V1,
  });
  const planV2 = await createGoalPlanForProgram(osmActor, {
    patientProgramId: programId, sourceFollowupId: adjustingFollowupId, submissionNonce: randomUUID(), primaryGoalCode: "glucose", items: PLAN_V2,
    weeklyNote: "ทดสอบ: ปรับเพิ่มวันออกกำลังกาย",
  }, clock(day(42), "11:30"));
  if (stage === "ROUND_4") return { programId, finalDay: null };

  // Round 5: Follow-up 3 and an EXTRA activity (a Floating Chart review that round 5 does not recommend).
  await seedProgramFollowup(osmActor, programId, planV2.goalPlanId, {
    day: day(56), dtx: vitals.dtx - 35, weight: vitals.weight - 3.5, planAdjusted: false, obstacle: false, progress: [5, 7, 4], plan: PLAN_V2,
  });
  await recordPatientProgramRoundReview(osmActor, {
    patientProgramId: programId, roundNumber: 5, toolCode: "FLOATING_CHART", submissionNonce: randomUUID(),
  }, clock(day(56), "11:30"));
  if (stage === "ROUND_5") return { programId, finalDay: null };

  // Round 6, Final Assessment (After) and completion.
  await seedProgramFollowup(osmActor, programId, planV2.goalPlanId, {
    day: day(70), dtx: vitals.dtx - 40, weight: vitals.weight - 4, planAdjusted: false, obstacle: false, progress: [4, 7, 3], plan: PLAN_V2,
  });
  const finalDay = day(77);
  await createPatientFinalAssessment(staffActor, {
    patientHospitalRelationshipId: relationshipId,
    patientProgramId: programId,
    serviceDate: finalDay,
    weight: vitals.weight - improvement,
    waistCircumference: vitals.waist - improvement,
    systolicBloodPressure: vitals.systolic - 10,
    diastolicBloodPressure: vitals.diastolic - 6,
    bloodSugar: vitals.dtx - 45,
    hba1c: Math.round((vitals.hba1c - 1.1) * 10) / 10,
    cvdRiskScore: Math.max(1, vitals.cvd - 6),
  }, clock(finalDay, "10:00"));
  await completePatientProgram(staffActor, { patientProgramId: programId }, clock(finalDay, "11:00"));
  return { programId, finalDay };
}

/** D9 windows: self-reported exercise in the 28 days before the Program start (Before) and before the Final Assessment (After). */
async function seedExerciseAround(patientActor: ActorContext, windowEnds: readonly string[]): Promise<number> {
  let created = 0;
  for (const end of windowEnds) {
    for (const [offset, minutes] of [[-20, 30], [-13, 45], [-6, 40]] as const) {
      const occurredOn = addDays(end, offset);
      await createPersonalExercise(patientActor, {
        submissionNonce: randomUUID(), activityName: "ทดสอบ: เดินเร็ว", occurredOn, durationMinutes: minutes, note: null,
      }, clock(occurredOn, "19:00"));
      created += 1;
    }
  }
  return created;
}

async function seedSelfMeasurements(patientActor: ActorContext, today: string, base: number): Promise<number> {
  for (const offset of [-10, -5, -1]) {
    const measuredAt = at(addDays(today, offset), "07:30");
    await createOwnPatientSelfMeasurement(patientActor, {
      submissionNonce: randomUUID(), measuredAt: measuredAt.toISOString(), weight: base - offset * -0.1,
      systolicBloodPressure: 128, diastolicBloodPressure: 82, bloodSugar: 126 + offset, bloodSugarUnit: "mg/dL", note: null,
    }, { now: () => measuredAt });
  }
  return 3;
}

async function seedMedication(patientActor: ActorContext, today: string, name: string, times: string[]): Promise<void> {
  await createPersonalMedication(patientActor, { medicationName: `ทดสอบ ${name}`, instructionText: "ทดสอบ: ตามแพทย์สั่ง", times }, clock(addDays(today, -30), "08:00"));
}

async function seedOutsideProgramCare(osmActor: ActorContext, relationshipId: string, day: string): Promise<void> {
  await submitScreening(osmActor, screeningInput(relationshipId, undefined, 1), clock(day, "10:00"));
  await createFollowup(osmActor, {
    patientHospitalRelationshipId: relationshipId, submissionNonce: randomUUID(), serviceDate: day, planAdjusted: false, hasObstacle: false,
    weight: 66, bloodSugar: 138, activityProgress: [],
  }, clock(day, "10:30"));
}

async function seedAppointment(
  actor: ActorContext,
  relationshipId: string,
  scheduledAt: Date,
  options: { createdOn: string; home?: boolean; note?: string },
): Promise<{ appointmentId: string; updatedAt: Date }> {
  const result = await createAppointment(actor, {
    patientHospitalRelationshipId: relationshipId,
    submissionNonce: randomUUID(),
    scheduledAt: scheduledAt.toISOString(),
    type: "FOLLOW_UP",
    durationMinutes: 30,
    locationType: options.home ? "HOME_VISIT" : "CLINIC",
    locationDetail: options.home ? "ทดสอบ: บ้านผู้ป่วย" : "ทดสอบ: ห้องตรวจโรคเรื้อรัง",
    note: options.note ?? null,
  }, clock(options.createdOn, "09:00"));
  return { appointmentId: result.appointmentId, updatedAt: result.updatedAt };
}

// ---------------------------------------------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------------------------------------------

/** Removes any previous demo data, then creates the scenario. Re-running refreshes every date relative to today. */
export async function seedDemoScenario(dependencies: DemoScenarioDependencies): Promise<DemoSeedReport> {
  await resetDemoScenario(dependencies);
  const today = dependencies.today ?? toServiceDateOnly(new Date());
  const { parent, children } = await selectDemoHospitals(dependencies.parentHospitalCode);
  const [childA, childB] = children;

  const adminUserId = await seedPlatformAdmin(dependencies);
  const parentOwnerId = await onboardHospital(parent, DEMO_ACCOUNTS.parentOwner, adminUserId, dependencies);
  const childAOwnerId = await onboardHospital(childA, DEMO_ACCOUNTS.childAOwner, adminUserId, dependencies);
  const childBOwnerId = await onboardHospital(childB, DEMO_ACCOUNTS.childBOwner, adminUserId, dependencies);
  const ownerA = await actorOf(childAOwnerId);
  const ownerB = await actorOf(childBOwnerId);

  const memberExport = await seedWorkforce("MEMBER", DEMO_ACCOUNTS.memberExport, childA.id, ownerA, dependencies);
  await seedWorkforce("MEMBER", DEMO_ACCOUNTS.member, childA.id, ownerA, dependencies);
  const osmA1 = await seedWorkforce("OSM", DEMO_ACCOUNTS.osmA1, childA.id, ownerA, dependencies);
  const osmA2 = await seedWorkforce("OSM", DEMO_ACCOUNTS.osmA2, childA.id, ownerA, dependencies);
  const osmB1 = await seedWorkforce("OSM", DEMO_ACCOUNTS.osmB1, childB.id, ownerB, dependencies);
  const osmB2 = await seedWorkforce("OSM", DEMO_ACCOUNTS.osmB2, childB.id, ownerB, dependencies);

  const grantTarget = await database().hospitalMembership.findUniqueOrThrow({ where: { id: memberExport.relationshipId }, select: { updatedAt: true } });
  await setHospitalMembershipReportExportGrant(ownerA, {
    relationshipId: memberExport.relationshipId, targetHospitalId: childA.id, expectedUpdatedAt: grantTarget.updatedAt.toISOString(), granted: true,
  });

  // Patients (Child A provisioned by its OWNER, Child B by its OWNER).
  const patients = {} as Record<DemoAccountKey, PatientRef>;
  for (const key of ["patientA1", "patientA2", "patientA3", "patientA4", "patientA5", "patientA6"] as const) {
    patients[key] = await seedPatient(key, childA.id, ownerA, dependencies);
  }
  for (const key of ["patientB1", "patientB2", "patientB3", "patientB4", "patientB5", "patientB6"] as const) {
    patients[key] = await seedPatient(key, childB.id, ownerB, dependencies);
  }
  // Multi-role: an OSM and a Hospital MEMBER who are also Patients at the other Child.
  const osmPatient = await seedPatient("osmA1", childB.id, ownerB, dependencies, { activate: false });
  const memberPatient = await seedPatient("member", childB.id, ownerB, dependencies, { activate: false });

  const assign = async (owner: ActorContext, patient: PatientRef, osmUserId: string) =>
    assignOsmToPatient(owner, { patientHospitalRelationshipId: patient.relationshipId, osmUserId }, clock(addDays(today, -120), "08:00"));
  for (const key of ["patientA1", "patientA2", "patientA3", "patientA4", "patientA6"] as const) await assign(ownerA, patients[key], osmA1.userId);
  await assign(ownerA, patients.patientA5, osmA2.userId);
  for (const key of ["patientB1", "patientB2", "patientB3", "patientB4"] as const) await assign(ownerB, patients[key], osmB1.userId);
  for (const key of ["patientB5", "patientB6"] as const) await assign(ownerB, patients[key], osmB2.userId);
  await assign(ownerB, osmPatient, osmB2.userId);
  await assign(ownerB, memberPatient, osmB2.userId);

  const osm = { A1: await actorOf(osmA1.userId), A2: await actorOf(osmA2.userId), B1: await actorOf(osmB1.userId), B2: await actorOf(osmB2.userId) };
  const histories: Array<[ActorContext, PatientRef, number]> = [
    [ownerA, patients.patientA1, 6], [ownerA, patients.patientA2, 3], [ownerA, patients.patientA3, 2], [ownerA, patients.patientA4, 1],
    [ownerA, patients.patientA5, 4], [ownerA, patients.patientA6, 5], [ownerB, patients.patientB1, 8], [ownerB, patients.patientB2, 2],
    [ownerB, patients.patientB3, 4], [ownerB, patients.patientB4, 1], [ownerB, patients.patientB5, 3], [ownerB, patients.patientB6, 7],
  ];
  for (const [owner, patient, yearsAgo] of histories) await seedHealthHistory(owner, patient.relationshipId, yearsAgo);

  // Programs across every stage.
  const vitals = (weight: number, heightCm: number, dtx: number, hba1c: number, cvd: number): Vitals =>
    ({ weight, heightCm, waist: Math.round(weight * 1.1), systolic: 138, diastolic: 88, dtx, hba1c, cvd });
  const completedA1 = await seedProgram({ patient: patients.patientA1, staffActor: ownerA, osmActor: osm.A1, stage: "COMPLETED", startDay: addDays(today, -84), vitals: vitals(82, 165, 186, 8.4, 24), improvement: 5 });
  await seedProgram({ patient: patients.patientA2, staffActor: ownerA, osmActor: osm.A1, stage: "ROUND_4", startDay: addDays(today, -45), vitals: vitals(74, 158, 172, 7.9, 18), improvement: 0 });
  await seedProgram({ patient: patients.patientA3, staffActor: ownerA, osmActor: osm.A1, stage: "ROUND_2", startDay: addDays(today, -16), vitals: vitals(69, 160, 158, 7.2, 12), improvement: 0 });
  await seedProgram({ patient: patients.patientA4, staffActor: ownerA, osmActor: osm.A1, stage: "ROUND_1", startDay: addDays(today, -3), vitals: vitals(88, 170, 201, 9.1, 28), improvement: 0 });
  const completedB1 = await seedProgram({ patient: patients.patientB1, staffActor: ownerB, osmActor: osm.B1, stage: "COMPLETED", startDay: addDays(today, -90), vitals: vitals(90, 172, 194, 8.8, 26), improvement: 6 });
  const completedB2 = await seedProgram({ patient: patients.patientB2, staffActor: ownerB, osmActor: osm.B1, stage: "COMPLETED", startDay: addDays(today, -100), vitals: vitals(64, 152, 168, 7.6, 15), improvement: 3 });
  await seedProgram({ patient: patients.patientB3, staffActor: ownerB, osmActor: osm.B1, stage: "ROUND_5", startDay: addDays(today, -60), vitals: vitals(78, 168, 177, 8.0, 21), improvement: 0 });
  await seedProgram({ patient: patients.patientB4, staffActor: ownerB, osmActor: osm.B1, stage: "ROUND_2", startDay: addDays(today, -18), vitals: vitals(71, 155, 162, 7.4, 14), improvement: 0 });
  await seedProgram({ patient: patients.patientB5, staffActor: ownerB, osmActor: osm.B2, stage: "ROUND_1", startDay: addDays(today, -2), vitals: vitals(85, 169, 189, 8.6, 23), improvement: 0 });

  // Care outside any Program (counted in the report summary only) and an ended relationship with history.
  await seedOutsideProgramCare(osm.A2, patients.patientA5.relationshipId, addDays(today, -6));
  await seedOutsideProgramCare(osm.B2, patients.patientB6.relationshipId, addDays(today, -4));
  await seedBaseline(ownerA, patients.patientA6.relationshipId, addDays(today, -150), vitals(70, 157, 165, 7.5, 16));
  await seedOutsideProgramCare(osm.A1, patients.patientA6.relationshipId, addDays(today, -140));
  await endPatientHospitalRelationship(ownerA, {
    relationshipId: patients.patientA6.relationshipId, endReason: "ทดสอบ: ย้ายไปรับบริการที่หน่วยบริการอื่น", confirmRetention: true,
  }, clock(addDays(today, -30), "15:00"));

  // Patient self data.
  const patientActor = async (key: DemoAccountKey) => actorOf(patients[key].userId);
  const a1 = await patientActor("patientA1");
  const a2 = await patientActor("patientA2");
  const a3 = await patientActor("patientA3");
  const b1 = await patientActor("patientB1");
  let exerciseEntries = 0;
  exerciseEntries += await seedExerciseAround(a1, [addDays(today, -84), completedA1.finalDay!]);
  exerciseEntries += await seedExerciseAround(b1, [addDays(today, -90), completedB1.finalDay!]);
  exerciseEntries += await seedExerciseAround(await patientActor("patientB2"), [addDays(today, -100), completedB2.finalDay!]);
  exerciseEntries += await seedExerciseAround(a2, [today]);
  let selfMeasurements = 0;
  selfMeasurements += await seedSelfMeasurements(a1, today, 77);
  selfMeasurements += await seedSelfMeasurements(a2, today, 72);
  selfMeasurements += await seedSelfMeasurements(b1, today, 84);
  await seedMedication(a1, today, "เมทฟอร์มิน 500 มก.", ["08:00", "18:00"]);
  await seedMedication(a1, today, "อะมโลดิปีน 5 มก.", ["08:00"]);
  await seedMedication(a2, today, "เมทฟอร์มิน 850 มก.", ["07:30", "19:30"]);
  await seedMedication(b1, today, "กลิพิไซด์ 5 มก.", ["07:00"]);
  await createSupportReport(a2, {
    hospitalId: childA.id, category: "ACCESS", message: "ทดสอบ: เปิดหน้านัดหมายแล้วโหลดช้า",
  }, clock(addDays(today, -1), "20:00"));

  // Appointments: past completed, upcoming within 7 days, a pending reschedule request, a cancellation request,
  // an OSM home visit, and one shared with a caregiver.
  const past = await seedAppointment(ownerA, patients.patientA1.relationshipId, at(addDays(today, -14), "09:30"), { createdOn: addDays(today, -21) });
  await completeAppointment(ownerA, {
    patientHospitalRelationshipId: patients.patientA1.relationshipId, appointmentId: past.appointmentId, expectedUpdatedAt: past.updatedAt.toISOString(),
  }, clock(addDays(today, -14), "10:30"));
  await seedAppointment(ownerA, patients.patientA1.relationshipId, at(addDays(today, 4), "09:00"), { createdOn: addDays(today, -7), note: "ทดสอบ: ตรวจน้ำตาลปลายนิ้ว" });
  const reschedule = await seedAppointment(ownerA, patients.patientA2.relationshipId, at(addDays(today, 3), "10:00"), { createdOn: addDays(today, -5) });
  await submitAppointmentRescheduleRequest(a2, {
    patientHospitalRelationshipId: patients.patientA2.relationshipId, appointmentId: reschedule.appointmentId,
    expectedUpdatedAt: reschedule.updatedAt.toISOString(), submissionNonce: randomUUID(),
    preferredDatetimes: [at(addDays(today, 8), "09:00").toISOString(), at(addDays(today, 9), "13:30").toISOString()],
    reason: "ทดสอบ: ติดธุระต่างจังหวัด",
  }, clock(addDays(today, -1), "18:00"));
  const cancellation = await seedAppointment(ownerA, patients.patientA3.relationshipId, at(addDays(today, 5), "14:00"), { createdOn: addDays(today, -4) });
  await requestOwnPatientAppointmentCancellation(a3, {
    patientHospitalRelationshipId: patients.patientA3.relationshipId, appointmentId: cancellation.appointmentId,
    expectedUpdatedAt: cancellation.updatedAt.toISOString(), submissionNonce: randomUUID(),
  }, clock(addDays(today, -1), "19:00"));
  await seedAppointment(osm.A1, patients.patientA2.relationshipId, at(addDays(today, 2), "15:00"), { createdOn: addDays(today, -2), home: true, note: "ทดสอบ: เยี่ยมบ้านติดตามการออกกำลังกาย" });
  await seedAppointment(ownerB, patients.patientB1.relationshipId, at(addDays(today, 6), "09:30"), { createdOn: addDays(today, -3) });
  await seedAppointment(ownerB, patients.patientB3.relationshipId, at(addDays(today, 20), "10:30"), { createdOn: addDays(today, -3) });

  // Caregiver: Patient B1 accepts Patient A1's invitation and an appointment-sharing grant.
  const invitation = await createCaregiverInvitation(a1, { nationalId: demoNationalId(DEMO_ACCOUNTS.patientB1.index) }, clock(addDays(today, -10), "12:00"));
  const accepted = await acceptCaregiverInvitation(b1, invitation.plaintextToken, clock(addDays(today, -10), "12:30"));
  const grant = await proposeAppointmentGrant(a1, {
    caregiverRelationshipId: accepted.relationshipId, patientHospitalRelationshipId: patients.patientA1.relationshipId,
  }, { ...FAMILY_ENABLED, ...clock(addDays(today, -10), "13:00") });
  await acceptAppointmentGrant(b1, grant.grantId, { ...FAMILY_ENABLED, ...clock(addDays(today, -10), "13:30") });

  return {
    hospitals: { parent: parent.name, children: [childA.name, childB.name] },
    accounts: DEMO_ACCOUNT_LIST.map((account) => ({
      role: account.label,
      login: demoNationalId(account.index),
      displayName: `${account.givenName} ${account.familyName}`,
    })),
    counts: { ...(await countDemoData()), exerciseEntriesSeeded: exerciseEntries, selfMeasurementsSeeded: selfMeasurements },
    verification: await verifyThroughReadModels(parent, children, parentOwnerId, childAOwnerId, childBOwnerId),
  };
}

/** Reads back through the read models the UI uses; throws when a demo surface would be empty. */
async function verifyThroughReadModels(
  parent: HospitalRef,
  children: [HospitalRef, HospitalRef],
  parentOwnerId: string,
  childAOwnerId: string,
  childBOwnerId: string,
): Promise<Record<string, number>> {
  const verification: Record<string, number> = {};
  for (const [label, hospital, ownerId] of [["childA", children[0], childAOwnerId], ["childB", children[1], childBOwnerId]] as const) {
    const dataset = await getHospitalReportingDatasetForExport(await actorOf(ownerId), { hospitalId: hospital.id });
    const completed = dataset.programs.filter((program) => program.lifecycle.status === "COMPLETED");
    const filled = completed.filter((program) =>
      program.bmi.after.state === "RECORDED" && program.finalAssessment.state === "PRESENT" &&
      program.finalAssessment.value.hba1c.state === "RECORDED" && program.finalAssessment.value.cvdRiskScore.state === "RECORDED" &&
      program.weeklyExercise.before.state === "RECORDED" && program.weeklyExercise.after.state === "RECORDED" &&
      program.followups.items.length === 4 && program.roundVitals.round1.state === "PRESENT" && program.roundVitals.round2.state === "PRESENT");
    if (dataset.programs.length === 0 || filled.length === 0) throw new Error(`Demo report for ${label} is not populated`);
    verification[`${label}ProgramRows`] = dataset.programs.length;
    verification[`${label}CompletedWithBeforeAfter`] = filled.length;

    const summary = await getParentChildHospitalReportingPage(await actorOf(parentOwnerId), { parentHospitalId: parent.id, hospitalId: hospital.id });
    if (summary.content.state !== "AVAILABLE" || summary.content.dashboard.state !== "AVAILABLE") throw new Error(`Parent summary for ${label} is unavailable`);
    const programs = summary.content.dashboard.value.programs.total;
    if (programs === 0) throw new Error(`Parent summary for ${label} is empty`);
    verification[`${label}ParentSummaryPrograms`] = programs;
  }
  return verification;
}

// ---------------------------------------------------------------------------------------------------------------
// Demo tag, counts and reset
// ---------------------------------------------------------------------------------------------------------------

type DemoScope = {
  personIds: string[];
  userIds: string[];
  authSubjects: string[];
  profileIds: string[];
  hospitalIds: string[];
  relationshipIds: string[];
};

/** Demo data = everything owned by a demo identity (by deterministic identity hash) and the hospitals they onboarded. */
async function resolveDemoScope(): Promise<DemoScope> {
  const persons = await database().person.findMany({
    where: { identityKeyHash: { in: DEMO_ACCOUNT_LIST.map(identityHash) } },
    select: { id: true, user: { select: { id: true, authSubject: true } }, patientProfile: { select: { id: true } } },
  });
  const userIds = persons.flatMap((person) => (person.user ? [person.user.id] : []));
  const hospitals = await database().hospitalOnboardingApplication.findMany({
    where: { applicantUserId: { in: userIds } },
    select: { hospitalId: true },
  });
  const hospitalIds = [...new Set(hospitals.map((application) => application.hospitalId))];
  const profileIds = persons.flatMap((person) => (person.patientProfile ? [person.patientProfile.id] : []));
  const relationships = await database().patientHospitalRelationship.findMany({
    where: { OR: [{ hospitalId: { in: hospitalIds } }, { patientProfileId: { in: profileIds } }] },
    select: { id: true },
  });
  return {
    personIds: persons.map((person) => person.id),
    userIds,
    authSubjects: persons.flatMap((person) => (person.user?.authSubject ? [person.user.authSubject] : [])),
    profileIds,
    hospitalIds,
    relationshipIds: relationships.map((relationship) => relationship.id),
  };
}

export async function countDemoData(): Promise<Record<string, number>> {
  const scope = await resolveDemoScope();
  const relationship = { patientHospitalRelationshipId: { in: scope.relationshipIds } };
  const profile = { patientProfileId: { in: scope.profileIds } };
  const [programs, followups, goalPlans, finalAssessments, roundVitals, screenings, appointments, medications, exercises, selfMeasurements, caregiverGrants, supportReports] =
    await Promise.all([
      database().patientProgram.count({ where: relationship }),
      database().patientFollowup.count({ where: relationship }),
      database().patientGoalPlan.count({ where: relationship }),
      database().patientFinalAssessment.count({ where: relationship }),
      database().patientProgramRoundVitals.count({ where: { patientProgram: relationship } }),
      database().screeningAssessment.count({ where: relationship }),
      database().patientAppointment.count({ where: relationship }),
      database().personalMedication.count({ where: profile }),
      database().personalExerciseEntry.count({ where: profile }),
      database().patientSelfMeasurement.count({ where: profile }),
      database().caregiverAppointmentGrant.count({ where: { caregiverRelationship: profile } }),
      database().supportReport.count({ where: { hospitalId: { in: scope.hospitalIds } } }),
    ]);
  return {
    hospitals: scope.hospitalIds.length,
    accounts: scope.userIds.length,
    relationships: scope.relationshipIds.length,
    programs, followups, goalPlans, finalAssessments, roundVitals, screenings, appointments,
    medications, exercises, selfMeasurements, caregiverGrants, supportReports,
  };
}

/** Deletes every demo-tagged row and demo auth user, and returns the demo hospitals to PENDING_VERIFICATION. */
async function resetDemoScope(scope: DemoScope, deleteAuthUser: (authSubject: string) => Promise<void>): Promise<void> {
  const { userIds, profileIds, hospitalIds, relationshipIds, personIds } = scope;
  if (personIds.length === 0 && hospitalIds.length === 0) return;
  const relationship = { patientHospitalRelationshipId: { in: relationshipIds } };
  const program = { patientProgram: relationship };
  const profile = { patientProfileId: { in: profileIds } };
  const users = { in: userIds };

  await database().$transaction(async (tx) => {
    const programIds = (await tx.patientProgram.findMany({ where: relationship, select: { id: true } })).map((row) => row.id);
    const appointmentIds = (await tx.patientAppointment.findMany({ where: relationship, select: { id: true } })).map((row) => row.id);
    const medicationIds = (await tx.personalMedication.findMany({ where: profile, select: { id: true } })).map((row) => row.id);
    const caregiverRelationshipIds = (await tx.caregiverRelationship.findMany({
      where: { OR: [profile, { caregiverUserId: users }] }, select: { id: true },
    })).map((row) => row.id);

    // Notifications and LINE state.
    await tx.appointmentLineNotification.deleteMany({ where: { OR: [{ appointmentId: { in: appointmentIds } }, { recipientUserId: users }] } });
    await tx.medicationLineReminderNotification.deleteMany({ where: { OR: [{ personalMedicationId: { in: medicationIds } }, { recipientUserId: users }] } });
    await tx.lineAppointmentNotificationPreference.deleteMany({ where: { userId: users } });
    await tx.lineMedicationReminderPreference.deleteMany({ where: { userId: users } });
    await tx.lineAccountActionIntent.deleteMany({ where: { userId: users } });
    await tx.lineAccountBinding.deleteMany({ where: { userId: users } });

    // Family.
    await tx.caregiverAppointmentGrant.deleteMany({ where: { caregiverRelationshipId: { in: caregiverRelationshipIds } } });
    await tx.caregiverRelationship.deleteMany({ where: { id: { in: caregiverRelationshipIds } } });
    await tx.caregiverInvitation.deleteMany({ where: { OR: [profile, { issuedByUserId: users }] } });

    // Appointments.
    await tx.patientAppointmentAcknowledgement.deleteMany({ where: { appointmentId: { in: appointmentIds } } });
    await tx.patientAppointmentCancellationRequest.deleteMany({ where: { appointmentId: { in: appointmentIds } } });
    await tx.patientAppointmentRescheduleRequest.deleteMany({ where: { appointmentId: { in: appointmentIds } } });
    await tx.patientAppointmentCoordinationEvent.deleteMany({ where: { appointmentId: { in: appointmentIds } } });

    // Program care data.
    await tx.patientProgramRoundActivity.deleteMany({ where: { patientProgramId: { in: programIds } } });
    await tx.patientProgramRoundVitals.deleteMany({ where: { patientProgramId: { in: programIds } } });
    await tx.patientProgramServiceOneArtifactAssociation.deleteMany({ where: { patientProgramId: { in: programIds } } });
    await tx.patientProgramServiceOneRoutine.deleteMany({ where: program });
    await tx.patientProgramServiceOneFloatingChart.deleteMany({ where: program });
    await tx.patientProgramServiceOneDreamCard.deleteMany({ where: program });
    await tx.patientProgramServiceOneConfidence.deleteMany({ where: program });
    await tx.patientFollowupActivityProgress.deleteMany({ where: { followup: relationship } });
    await tx.patientGoalPlan.updateMany({ where: relationship, data: { sourceFollowupId: null } });
    await tx.patientFollowup.deleteMany({ where: relationship });
    await tx.patientFinalAssessment.deleteMany({ where: relationship });
    await tx.patientGoalItem.deleteMany({ where: { goalPlan: relationship } });
    await tx.patientGoalPlan.deleteMany({ where: relationship });
    await tx.patientAppointment.deleteMany({ where: relationship });
    await tx.screeningAssessment.deleteMany({ where: relationship });
    await tx.patientProgram.deleteMany({ where: relationship });
    await tx.patientBaseline.deleteMany({ where: relationship });
    await tx.patientEvidenceArtifact.deleteMany({ where: relationship });

    // Relationship-scoped records.
    await tx.patientHospitalHealthHistory.deleteMany({ where: relationship });
    await tx.patientHospitalProfile.deleteMany({ where: relationship });
    await tx.patientOsmAssignment.deleteMany({ where: relationship });
    await tx.patientServiceRequest.deleteMany({ where: { OR: [relationship, { requestedByUserId: users }] } });
    await tx.accountRecovery.deleteMany({ where: { OR: [relationship, { targetUserId: users }] } });
    await tx.patientAccessRequest.deleteMany({ where: { OR: [{ hospitalId: { in: hospitalIds } }, { resolvedUserId: users }] } });
    await tx.patientActivation.deleteMany({ where: { OR: [{ userId: users }, { hospitalId: { in: hospitalIds } }] } });
    await tx.patientHospitalRelationship.deleteMany({ where: { id: { in: relationshipIds } } });

    // Patient self data (MedicationSchedule may only be deleted while its medication is ACTIVE).
    await tx.medicationSchedule.deleteMany({ where: { personalMedicationId: { in: medicationIds } } });
    await tx.personalMedication.deleteMany({ where: profile });
    await tx.personalExerciseCreateReceipt.deleteMany({ where: profile });
    await tx.personalExerciseEntry.deleteMany({ where: profile });
    await tx.personalMealCreateReceipt.deleteMany({ where: profile });
    await tx.personalMealEntry.deleteMany({ where: profile });
    await tx.personalWeightGoalCreateReceipt.deleteMany({ where: profile });
    await tx.personalWeightGoal.deleteMany({ where: profile });
    await tx.patientSelfMeasurement.deleteMany({ where: profile });
    await tx.patientClassificationHistory.deleteMany({ where: profile });
    await tx.patientClassification.deleteMany({ where: profile });
    await tx.patientProfile.deleteMany({ where: { id: { in: profileIds } } });

    // Hospital and workforce records.
    await tx.supportReport.deleteMany({ where: { OR: [{ hospitalId: { in: hospitalIds } }, { reporterUserId: users }] } });
    await tx.hospitalContent.deleteMany({ where: { hospitalId: { in: hospitalIds } } });
    await tx.hospitalContact.deleteMany({ where: { hospitalId: { in: hospitalIds } } });
    await tx.hospitalServiceOffering.deleteMany({ where: { hospitalId: { in: hospitalIds } } });
    await tx.workforceBulkSubmission.deleteMany({ where: { OR: [{ hospitalId: { in: hospitalIds } }, { actorUserId: users }] } });
    await tx.workforceActivation.deleteMany({ where: { OR: [{ userId: users }, { hospitalId: { in: hospitalIds } }, { createdByUserId: users }] } });
    await tx.osmHospitalRelationship.deleteMany({ where: { OR: [{ userId: users }, { hospitalId: { in: hospitalIds } }] } });
    await tx.hospitalMembership.deleteMany({ where: { OR: [{ userId: users }, { hospitalId: { in: hospitalIds } }] } });
    await tx.hospitalOnboardingApplication.deleteMany({ where: { hospitalId: { in: hospitalIds } } });
    await tx.userContactSetting.deleteMany({ where: { userId: users } });

    await tx.auditEvent.deleteMany({
      where: {
        OR: [
          { actorUserId: users },
          { resourceId: { in: [...userIds, ...personIds, ...profileIds, ...hospitalIds, ...relationshipIds, ...programIds, ...appointmentIds] } },
        ],
      },
    });
    await tx.userRole.deleteMany({ where: { userId: users } });
    await tx.user.deleteMany({ where: { id: users } });
    await tx.person.deleteMany({ where: { id: { in: personIds } } });
    await tx.hospital.updateMany({ where: { id: { in: hospitalIds } }, data: { status: HospitalStatus.PENDING_VERIFICATION } });
  }, { timeout: 120_000, maxWait: 10_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  for (const authSubject of scope.authSubjects) await deleteAuthUser(authSubject);
}

export async function resetDemoScenario(dependencies: Pick<DemoScenarioDependencies, "deleteAuthUser">): Promise<Record<string, number>> {
  const scope = await resolveDemoScope();
  const removed = { hospitals: scope.hospitalIds.length, accounts: scope.userIds.length, relationships: scope.relationshipIds.length };
  await resetDemoScope(scope, dependencies.deleteAuthUser ?? defaultDeleteAuthUser);
  return removed;
}
