import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
  getProtectedApplicationActor: vi.fn(),
  getStaffPatientHospitalProfile: vi.fn(),
  getPatientHealthHistory: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: mocks.connection }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a className={className} href={href}>{children}</a>
  ),
}));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: mocks.getProtectedApplicationActor,
}));
vi.mock("@/modules/patient-hospital-profile/services/patient-hospital-profile-service", () => ({
  getStaffPatientHospitalProfile: mocks.getStaffPatientHospitalProfile,
}));
vi.mock("@/modules/patient-hospital-profile/services/patient-health-history-service", () => ({
  getPatientHealthHistory: mocks.getPatientHealthHistory,
}));
vi.mock("../../patient-name-correction-form", () => ({
  PatientNameCorrectionForm: () => <form data-testid="name-correction-form" />,
}));
vi.mock("../../patient-care-end-form", () => ({
  PatientCareEndForm: () => <form data-testid="care-end-form" />,
}));
vi.mock("../hospital-patient-edit-form", () => ({
  HospitalPatientEditForm: () => <form data-testid="hospital-patient-edit-form" />,
}));

import HospitalPatientProfilePage from "./page";

const hospitalId = "11111111-1111-4111-8111-111111111111";
const relationshipId = "22222222-2222-4222-8222-222222222222";

function staff(membershipType: MembershipType, status: MembershipStatus = MembershipStatus.ACTIVE): ActorContext {
  return {
    userId: "33333333-3333-4333-8333-333333333333",
    personId: "44444444-4444-4444-8444-444444444444",
    roles: [Role.HOSPITAL],
    hospitalMemberships: [{ hospitalId, membershipType, profession: null, status, hospitalStatus: HospitalStatus.ACTIVE }],
    osmHospitalRelationships: [],
  };
}

async function render(actor: ActorContext): Promise<string> {
  mocks.getProtectedApplicationActor.mockResolvedValue(actor);
  return renderToStaticMarkup(await HospitalPatientProfilePage({ params: Promise.resolve({ relationshipId }) }));
}

describe("Hospital Patient profile page (ADR-0026)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.getStaffPatientHospitalProfile.mockResolvedValue({
      hospital: { id: hospitalId, name: "โรงพยาบาลทดสอบ" },
      hospitalProfile: null,
      patientProfile: { person: { version: 1, givenName: "สมชาย", familyName: "ทดสอบ" } },
    });
    mocks.getPatientHealthHistory.mockResolvedValue(null);
  });

  it("gives a MEMBER the Patient name correction but not the OWNER-only care end", async () => {
    const html = await render(staff(MembershipType.MEMBER));

    expect(html).toContain('data-testid="name-correction-form"');
    expect(html).not.toContain('data-testid="care-end-form"');
    expect(html).not.toContain("สิ้นสุดการดูแลผู้ป่วย");
  });

  it("gives the OWNER both", async () => {
    const html = await render(staff(MembershipType.OWNER));

    expect(html).toContain('data-testid="name-correction-form"');
    expect(html).toContain('data-testid="care-end-form"');
  });

  it("shows a SUSPENDED MEMBER neither action, only who may correct the name", async () => {
    const html = await render(staff(MembershipType.MEMBER, MembershipStatus.SUSPENDED));

    expect(html).not.toContain('data-testid="name-correction-form"');
    expect(html).not.toContain('data-testid="care-end-form"');
    expect(html).toContain("ชื่อ-สกุลแก้ไขได้โดยเจ้าหน้าที่โรงพยาบาลที่ดูแลผู้ป่วย");
  });
});
