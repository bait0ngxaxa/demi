import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HospitalStatus, MembershipStatus, MembershipType, Profession, Role } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  actor: { userId: "owner", personId: "person", roles: ["HOSPITAL"], hospitalMemberships: [{ hospitalId: "hospital-a", membershipType: "OWNER", profession: "NURSE", status: "ACTIVE", hospitalStatus: "ACTIVE" }], osmHospitalRelationships: [] } as Record<string, unknown>,
  contacts: [{ id: "hospital-a", name: "โรงพยาบาล ก" }],
  catalogs: [{ hospitalId: "hospital-a", hospitalName: "โรงพยาบาล ก", offerings: [] }],
  selfRegistration: [{ hospitalId: "hospital-a", hospitalName: "โรงพยาบาล ก", enabled: true }],
  contactRead: vi.fn(),
  catalogRead: vi.fn(),
  selfRegistrationRead: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("next/navigation", () => ({
  redirect: (href: string) => mocks.redirect(href),
  notFound: () => mocks.notFound(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children?: ReactNode }) => createElement("a", { ...props, href }, children),
}));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: () => Promise.resolve(mocks.actor),
}));
vi.mock("@/modules/hospital-contact/services/hospital-contact-service", () => ({
  listEligibleHospitalContactOwnerHospitals: () => mocks.contactRead(),
}));
vi.mock("@/modules/patient-service-requests/services/patient-service-catalog-service", () => ({
  listManagedHospitalServiceCatalog: () => mocks.catalogRead(),
}));
vi.mock("@/modules/hospital-settings/services/hospital-self-registration-settings-service", () => ({
  listOwnedHospitalSelfRegistrationSettings: () => mocks.selfRegistrationRead(),
}));
vi.mock("../../settings/hospital-self-registration-settings", () => ({
  HospitalSelfRegistrationSettings: ({ hospitals }: { hospitals: readonly { hospitalId: string }[] }) => hospitals.length > 0 ? createElement("section", null, "ตั้งค่าการลงทะเบียนเอง") : null,
}));

import HospitalSettingsPage from "./page";

describe("Hospital Settings workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor = { userId: "owner", personId: "person", roles: [Role.HOSPITAL], hospitalMemberships: [{ hospitalId: "hospital-a", membershipType: MembershipType.OWNER, profession: Profession.NURSE, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }], osmHospitalRelationships: [] };
    mocks.contacts = [{ id: "hospital-a", name: "โรงพยาบาล ก" }];
    mocks.catalogs = [{ hospitalId: "hospital-a", hospitalName: "โรงพยาบาล ก", offerings: [] }];
    mocks.selfRegistration = [{ hospitalId: "hospital-a", hospitalName: "โรงพยาบาล ก", enabled: true }];
    mocks.contactRead.mockImplementation(() => Promise.resolve(mocks.contacts));
    mocks.catalogRead.mockImplementation(() => Promise.resolve(mocks.catalogs));
    mocks.selfRegistrationRead.mockImplementation(() => Promise.resolve(mocks.selfRegistration));
    mocks.redirect.mockImplementation((href: string) => { throw new Error(`REDIRECT:${href}`); });
    mocks.notFound.mockImplementation(() => { throw new Error("NOT_FOUND"); });
  });

  it("groups the existing settings destinations while retaining each hospital context", async () => {
    const html = renderToStaticMarkup(await HospitalSettingsPage({ searchParams: Promise.resolve({ hospitalId: "hospital-a" }) }));

    expect(html).toContain("ตั้งค่าโรงพยาบาล");
    expect(html).toContain("ข้อมูลติดต่อ");
    expect(html).toContain("บริการที่ผู้ป่วยขอได้");
    expect(html).toContain("ตั้งค่าการลงทะเบียนเอง");
    expect(html).toContain('href="/app/hospitals/contact?hospitalId=hospital-a"');
    expect(html).toContain('href="/app/patients/service-catalog?hospitalId=hospital-a"');
  });

  it("shows only the configuration section returned by its own read permission", async () => {
    mocks.catalogs = [];
    mocks.selfRegistration = [];
    const html = renderToStaticMarkup(await HospitalSettingsPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain("ข้อมูลติดต่อ");
    expect(html).not.toContain("บริการที่ผู้ป่วยขอได้");
    expect(html).not.toContain("ตั้งค่าการลงทะเบียนเอง");
  });

  it("keeps a Hospital MEMBER outside the OWNER settings workspace", async () => {
    mocks.actor = { userId: "member", personId: "person", roles: [Role.HOSPITAL], hospitalMemberships: [{ hospitalId: "hospital-a", membershipType: MembershipType.MEMBER, profession: Profession.NURSE, status: MembershipStatus.ACTIVE, hospitalStatus: HospitalStatus.ACTIVE }], osmHospitalRelationships: [] };
    mocks.contacts = [];
    mocks.catalogs = [];
    mocks.selfRegistration = [];

    await expect(HospitalSettingsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/app");
    expect(mocks.contactRead).not.toHaveBeenCalled();
    expect(mocks.catalogRead).not.toHaveBeenCalled();
  });
});
