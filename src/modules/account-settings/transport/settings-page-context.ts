import "server-only";

import { redirect } from "next/navigation";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";
import { Role } from "@prisma/client";
import { getOwnAppointmentLineNotificationPreference } from "@/modules/appointments/services/appointment-line-notification-preference-service";
import { getOwnMedicationLineReminderPreference } from "@/modules/medications/services/medication-line-reminder-preference-service";
import { getOwnContactSetting } from "../services/contact-setting-service";

export async function getSettingsPageContext() {
  let actor;
  try { actor = await getProtectedApplicationActor(); }
  catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
  const contact = await getOwnContactSetting(actor);
  if (!actor.roles.includes(Role.PATIENT)) return { contact, patient: null };
  const [appointment, medication] = await Promise.all([
    getOwnAppointmentLineNotificationPreference(actor),
    getOwnMedicationLineReminderPreference(actor).catch((error: unknown) => error instanceof ForbiddenError ? null : Promise.reject(error)),
  ]);
  return { contact, patient: appointment ? { appointment, medication } : null };
}
