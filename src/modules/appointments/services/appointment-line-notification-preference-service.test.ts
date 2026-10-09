import { describe, expect, it } from "vitest";

import { appointmentLineNotificationPreferenceInternals } from "./appointment-line-notification-preference-service";

describe("appointment LINE opt-in binding generation", () => {
  const currentBinding = [{ id: "binding-current", lifecycleVersion: 3, lineUserId: "synthetic-line-user" }];

  it("requires explicit enabled preference for exactly the current binding generation", () => {
    expect(appointmentLineNotificationPreferenceInternals.isPreferenceEnabledForCurrentBinding({
      enabled: true,
      bindingId: "binding-current",
      bindingLifecycleVersion: 3,
    }, currentBinding)).toBe(true);
    expect(appointmentLineNotificationPreferenceInternals.isPreferenceEnabledForCurrentBinding(null, currentBinding)).toBe(false);
    expect(appointmentLineNotificationPreferenceInternals.isPreferenceEnabledForCurrentBinding({
      enabled: false,
      bindingId: "binding-current",
      bindingLifecycleVersion: 3,
    }, currentBinding)).toBe(false);
  });

  it("invalidates previous opt-in on unlink, relink, duplicate, or missing LINE authority", () => {
    expect(appointmentLineNotificationPreferenceInternals.isPreferenceEnabledForCurrentBinding({
      enabled: true,
      bindingId: "binding-current",
      bindingLifecycleVersion: 2,
    }, currentBinding)).toBe(false);
    expect(appointmentLineNotificationPreferenceInternals.isPreferenceEnabledForCurrentBinding({
      enabled: true,
      bindingId: "binding-old",
      bindingLifecycleVersion: 3,
    }, currentBinding)).toBe(false);
    expect(appointmentLineNotificationPreferenceInternals.isPreferenceEnabledForCurrentBinding({
      enabled: true,
      bindingId: "binding-current",
      bindingLifecycleVersion: 3,
    }, [...currentBinding, { id: "binding-conflict", lifecycleVersion: 1, lineUserId: "synthetic-2" }])).toBe(false);
    expect(appointmentLineNotificationPreferenceInternals.isPreferenceEnabledForCurrentBinding({
      enabled: true,
      bindingId: "binding-current",
      bindingLifecycleVersion: 3,
    }, [{ id: "binding-current", lifecycleVersion: 3, lineUserId: null }])).toBe(false);
  });
});
