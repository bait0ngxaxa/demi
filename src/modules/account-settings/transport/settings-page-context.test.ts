import { Role } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

const actor = vi.hoisted(() => ({ roles: [] as string[] }));

vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); } }));
vi.mock("@/modules/auth/services/application-access-service", () => ({
  getProtectedApplicationActor: () => Promise.resolve({ userId: "u", personId: "p", roles: actor.roles, hospitalMemberships: [], osmHospitalRelationships: [] }),
}));
vi.mock("../services/contact-setting-service", () => ({ getOwnContactSetting: () => Promise.resolve({ phoneNumber: null }) }));
vi.mock("@/modules/appointments/services/appointment-line-notification-preference-service", () => ({
  getOwnAppointmentLineNotificationPreference: () => Promise.resolve({ enabled: true }),
}));
vi.mock("@/modules/medications/services/medication-line-reminder-preference-service", () => ({
  getOwnMedicationLineReminderPreference: () => Promise.resolve({ enabled: false }),
}));
vi.mock("@/modules/hospital-settings/services/hospital-self-registration-settings-service", () => ({
  listOwnedHospitalSelfRegistrationSettings: () => Promise.resolve([]),
}));

import { getSettingsPageContext } from "./settings-page-context";

describe("settings page context password entry", () => {
  it.each([
    [[Role.PATIENT], true],
    [[Role.PATIENT, Role.OSM], true],
    [[Role.OSM], true],
    [[Role.HOSPITAL], true],
    [[Role.ADMIN], true],
  ])("makes password change available to every authenticated role (%j)", async (roles, expected) => {
    actor.roles = roles;

    await expect(getSettingsPageContext()).resolves.toMatchObject({ canChangePassword: expected });
  });
});
