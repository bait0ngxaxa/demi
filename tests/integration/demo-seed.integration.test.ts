import { HospitalStatus, Role, UserStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPrisma } from "@/lib/db/prisma";
import { resolveActorAccessByUserId } from "@/modules/auth/services/actor-context-service";
import type { PasswordAuthAdminProvider } from "@/modules/auth/services/password-auth-provisioning-service";
import { createChildFacility } from "@/modules/hospital-service-areas/services/child-facility-service";
import { getHospitalReportingDatasetForExport } from "@/modules/reporting/services/hospital-report-query-service";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";

import { assertDemoSeedAllowed } from "../../scripts/demo-guard.mjs";
import { DEMO_ACCOUNT_LIST, demoNationalId } from "../../scripts/demo/demo-identities";
import { countDemoData, DEMO_CHILDREN, resetDemoScenario, seedDemoScenario } from "../../scripts/demo/demo-scenario";

/**
 * P1 Part C: the demo seed is repeatable, reset removes only demo data, and the guard fails closed. The Supabase
 * auth provider is replaced by an in-memory one; everything else is the production code path.
 */
const prisma = getPrisma();
const suffix = randomUUID().slice(0, 6).toUpperCase();
const PASSWORD = "Demo-Password-For-Tests-Only-1";
// Outside the demo identity range (demoNationalId) and not used by other suites.
const CHILD_OWNER_NATIONAL_ID = "1999999999999";
const liveAuthUsers = new Set<string>();
const authProvider: PasswordAuthAdminProvider = {
  createUser: async () => {
    const id = randomUUID();
    liveAuthUsers.add(id);
    return { data: { user: { id } }, error: null };
  },
  deleteUser: async (id) => {
    liveAuthUsers.delete(id);
    return { error: null };
  },
};
const deleteAuthUser = async (subject: string): Promise<void> => {
  liveAuthUsers.delete(subject);
};
const dependencies = { password: PASSWORD, authProvider, deleteAuthUser, parentHospitalCode: `DEMOP-${suffix}` };
const hospitalIds: string[] = [];
let outsiderPersonId: string;

describe("synthetic demo seed and reset (P1 Part C)", () => {
  beforeAll(async () => {
    const parent = await prisma.hospital.create({
      data: { hospitalCode: `DEMOP-${suffix}`, name: `โรงพยาบาลแม่ข่ายทดสอบ ${suffix}`, status: HospitalStatus.PENDING_VERIFICATION },
      select: { id: true },
    });
    hospitalIds.push(parent.id);
    // Pre-ADR-0018 demo Child rows: the seed no longer onboards them and reset must leave them untouched (O-D9).
    for (const code of ["A", "B", "C"]) {
      const child = await prisma.hospital.create({
        data: { hospitalCode: `DEMOP-${suffix}-${code}`, name: `รพ.สต.ทดสอบ ${code} ${suffix}`, status: HospitalStatus.PENDING_VERIFICATION },
        select: { id: true },
      });
      hospitalIds.push(child.id);
    }
    // Non-demo data that reset must keep.
    const outsider = await prisma.person.create({ data: { identityKeyHash: `outsider-${randomUUID()}`, givenName: "ไม่ใช่เดโม" }, select: { id: true } });
    outsiderPersonId = outsider.id;
  });

  afterAll(async () => {
    await resetDemoScenario({ deleteAuthUser });
    await prisma.userRole.deleteMany({ where: { user: { personId: outsiderPersonId } } });
    await prisma.user.deleteMany({ where: { personId: outsiderPersonId } });
    await prisma.person.deleteMany({ where: { id: outsiderPersonId } });
    // The Child OWNER invitee is not a demo identity, so reset keeps its (PROVISIONED, membership-less) account.
    const invitee = { person: { identityKeyHash: hashIdentityReference({ namespace: "thai-national-id", value: CHILD_OWNER_NATIONAL_ID }) } };
    await prisma.userRole.deleteMany({ where: { user: invitee } });
    await prisma.user.deleteMany({ where: invitee });
    await prisma.person.deleteMany({ where: invitee.person });
    await prisma.hospitalServiceAreaEligibility.deleteMany({ where: { hospitalId: { in: hospitalIds } } });
    await prisma.hospital.deleteMany({ where: { id: { in: hospitalIds } } });
  });

  it("refuses to run without the flag, against a non-allowlisted ref, or on this local database", () => {
    const ref = "jfsbcqpllvwzmkrmclgw";
    const allowed = {
      DEMI_DEMO_SEED_ALLOWED: "true",
      DEMI_DEMO_SUPABASE_REF: ref,
      DATABASE_URL: `postgresql://postgres.${ref}:x@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
      DIRECT_URL: `postgresql://postgres:x@db.${ref}.supabase.co:5432/postgres`,
      NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
    };
    expect(assertDemoSeedAllowed(allowed)).toBe(ref);
    expect(() => assertDemoSeedAllowed({ ...allowed, DEMI_DEMO_SEED_ALLOWED: "false" })).toThrow("DEMI_DEMO_SEED_ALLOWED");
    expect(() => assertDemoSeedAllowed({ ...allowed, DEMI_DEMO_SUPABASE_REF: "abcdefghijklmnopqrst" })).toThrow("does not point");
    expect(() => assertDemoSeedAllowed({ ...process.env, DEMI_DEMO_SEED_ALLOWED: "true", DEMI_DEMO_SUPABASE_REF: ref })).toThrow("DATABASE_URL");
  });

  it("seeds a complete scenario twice with the same result, then reset removes only demo data", async () => {
    const onboardingAudits = { where: { action: { startsWith: "hospital_onboarding." } } };
    const onboardingAuditsBefore = await prisma.auditEvent.count(onboardingAudits);
    const first = await seedDemoScenario(dependencies);

    // Every account exists, has a provider identity and resolves as an authorized actor.
    for (const account of DEMO_ACCOUNT_LIST) {
      const user = await prisma.user.findFirstOrThrow({
        where: { person: { identityKeyHash: hashIdentityReference({ namespace: "thai-national-id", value: demoNationalId(account.index) }) } },
        select: { id: true, status: true, authSubject: true, roles: { select: { role: true } } },
      });
      expect({ key: account.key, status: user.status, hasAuth: user.authSubject !== null }).toEqual({ key: account.key, status: UserStatus.ACTIVE, hasAuth: true });
      expect((await resolveActorAccessByUserId(user.id)).status).toBe("AUTHORIZED");
    }
    const osmPatientRoles = await prisma.userRole.findMany({
      where: { user: { person: { identityKeyHash: hashIdentityReference({ namespace: "thai-national-id", value: demoNationalId(7) }) } } },
      select: { role: true },
    });
    expect(osmPatientRoles.map(({ role }) => role).sort()).toEqual([Role.OSM, Role.PATIENT].sort());

    expect(first.counts).toMatchObject({
      hospitals: 3, accounts: DEMO_ACCOUNT_LIST.length, relationships: 14, programs: 9, finalAssessments: 3, caregiverGrants: 1, supportReports: 1,
    });
    expect(first.verification.childAProgramRows).toBe(4);
    expect(first.verification.childBProgramRows).toBe(5);
    expect(first.verification.childACompletedWithBeforeAfter).toBe(1);
    expect(first.verification.childBCompletedWithBeforeAfter).toBe(2);
    expect(first.verification.childAParentSummaryPrograms).toBeGreaterThan(0);
    expect(first.verification.childBParentSummaryPrograms).toBeGreaterThan(0);
    expect(liveAuthUsers.size).toBe(DEMO_ACCOUNT_LIST.length);

    // Child A workbook rounds 1–6 and Before/After for the completed Program, read as the OWNER sees it.
    const demoParentRow = await prisma.hospital.findUniqueOrThrow({ where: { hospitalCode: `DEMOP-${suffix}` }, select: { id: true } });
    const childA = await prisma.hospital.findFirstOrThrow({
      where: { registeredForParentHospitalId: demoParentRow.id, name: DEMO_CHILDREN[0].name }, select: { id: true, status: true, hospitalCode: true },
    });
    expect(childA.hospitalCode).toMatch(/^H-[2-9A-HJKMNP-Z]{6}$/u);
    expect(childA.status).toBe(HospitalStatus.ACTIVE);
    const ownerA = await prisma.hospitalMembership.findFirstOrThrow({ where: { hospitalId: childA.id, membershipType: "OWNER" }, select: { userId: true } });
    const ownerActor = await resolveActorAccessByUserId(ownerA.userId);
    if (ownerActor.status !== "AUTHORIZED") throw new Error("OWNER must resolve");
    const dataset = await getHospitalReportingDatasetForExport(ownerActor.actor, { hospitalId: childA.id });
    const completed = dataset.programs.find((program) => program.lifecycle.status === "COMPLETED")!;
    expect(completed.followups.items.map((followup) => followup.achievement?.ratePercent ?? null)).toEqual([53, 87, 100, 88]);
    expect(completed.bmi.baseline).toMatchObject({ state: "RECORDED" });
    expect(completed.bmi.after).toMatchObject({ state: "RECORDED" });
    expect(completed.weeklyExercise.before).toEqual({ state: "RECORDED", value: 28.8 });
    expect(completed.weeklyExercise.after).toEqual({ state: "RECORDED", value: 28.8 });
    expect(completed.screening.pam.state).toBe("PRESENT");
    expect(completed.screening.proms.state).toBe("PRESENT");
    expect(Object.values(completed.serviceOne).every((activity) => activity.state === "PRESENT")).toBe(true);
    expect(dataset.counts.relationshipsWithoutProgram.value).toBe(1);

    const ledger = await prisma.patientProgramRoundActivity.findMany({
      where: { patientProgram: { patientHospitalRelationship: { hospitalId: childA.id } }, mode: "REVIEWED" },
      select: { roundNumber: true, toolCode: true, source: true },
      orderBy: [{ roundNumber: "asc" }],
    });
    // Phase R1: per-round tools are recorded, not reviewed. Only the completed Program reaches round 5 (a PAM
    // review, EXTRA) and round 6 (the confirmed เส้นทางสุขภาพ review, PLANNED).
    expect(ledger).toEqual([
      { roundNumber: 5, toolCode: "PAM", source: "EXTRA" },
      { roundNumber: 6, toolCode: "HEALTH_PATH", source: "PLANNED" },
    ]);
    // Every round of the completed Program was completed in sequence through the real service (SR-D4/D5).
    expect(
      await prisma.patientProgramRoundCompletion.count({
        where: { patientProgram: { patientHospitalRelationship: { hospitalId: childA.id }, status: "COMPLETED" } },
      }),
    ).toBe(6);

    // A second run (with an unrelated ADMIN now present) gives the same dataset with no duplicates.
    const otherAdmin = await prisma.user.create({
      data: { personId: outsiderPersonId, status: UserStatus.ACTIVE, roles: { create: [{ role: Role.ADMIN }] } },
      select: { id: true },
    });
    const second = await seedDemoScenario(dependencies);
    expect(second.counts).toEqual(first.counts);
    expect(second.verification).toEqual(first.verification);
    expect(liveAuthUsers.size).toBe(DEMO_ACCOUNT_LIST.length);

    // ADR-0018: a Child facility the demo Parent OWNER registers is a demo artifact; reset removes it entirely.
    const demoParent = await prisma.hospital.findUniqueOrThrow({ where: { hospitalCode: `DEMOP-${suffix}` }, select: { id: true } });
    const parentOwner = await prisma.hospitalMembership.findFirstOrThrow({ where: { hospitalId: demoParent.id, membershipType: "OWNER", status: "ACTIVE" }, select: { userId: true } });
    const parentOwnerAccess = await resolveActorAccessByUserId(parentOwner.userId);
    if (parentOwnerAccess.status !== "AUTHORIZED") throw new Error("Parent OWNER must resolve");
    const createdChild = await createChildFacility(parentOwnerAccess.actor, {
      parentHospitalId: demoParent.id, name: `รพ.สต.สร้างในเดโม ${suffix}`, nationalId: CHILD_OWNER_NATIONAL_ID,
      givenName: "ผู้ดูแล", familyName: "เดโม", mode: "REMOTE", submissionNonce: randomUUID(),
    });

    const removed = await resetDemoScenario({ deleteAuthUser });
    expect(removed).toMatchObject({ hospitals: 4, accounts: DEMO_ACCOUNT_LIST.length, relationships: 14 });
    // Parent-created Children (the seeded ones and the extra one) are gone; the pre-ADR-0018 rows remain pending.
    expect(await prisma.hospital.count({ where: { OR: [{ id: createdChild.child.id }, { registeredForParentHospitalId: demoParent.id }] } })).toBe(0);
    // No demo onboarding audit is left behind (they carry no actor, only the application id).
    expect(await prisma.auditEvent.count(onboardingAudits)).toBe(onboardingAuditsBefore);
    expect(Object.values(await countDemoData()).every((count) => count === 0)).toBe(true);
    expect(liveAuthUsers.size).toBe(0);
    const hospitals = await prisma.hospital.findMany({ where: { id: { in: hospitalIds } }, select: { status: true } });
    expect(hospitals.every((hospital) => hospital.status === HospitalStatus.PENDING_VERIFICATION)).toBe(true);
    await expect(prisma.user.findUnique({ where: { id: otherAdmin.id }, select: { id: true } })).resolves.toEqual({ id: otherAdmin.id });
  }, 240_000);
});
