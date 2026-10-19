import type { Metadata } from "next";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getOwnPersonalMedication, listOwnPersonalMedications } from "@/modules/medications/services/personal-medication-query-service";
import { ForbiddenError, UnauthenticatedError, NotFoundError, ValidationError } from "@/shared/errors/application-error";
import { PersonalMedicationWorkspace } from "./personal-medication-workspace";
import { buildLoginReturnHref } from "@/modules/auth/transport/login-return";
import { LINE_WEB_NAVIGATION_PATHS } from "@/modules/line/domain/line-navigation-intents";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { getOwnMedicationLineReminderPreference } from "@/modules/medications/services/medication-line-reminder-preference-service";
import { PatientAccessUnavailableState } from "../patient-access-unavailable-state";

export const metadata: Metadata = { title: "ยาของฉัน" };

export default async function PersonalMedicationsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  await connection();
  const params = await searchParams;
  let actor: ActorContext;
  try {
    actor = await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect(buildLoginReturnHref(LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_MEDICATIONS));
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
  let workspace: Parameters<typeof PersonalMedicationWorkspace>[0];
  let presentationKey: string | undefined;
  try {
    const [active, stopped, reminder] = await Promise.all([
      listOwnPersonalMedications(actor, { status: "ACTIVE", cursor: params.activeCursor }),
      listOwnPersonalMedications(actor, { status: "STOPPED", cursor: params.stoppedCursor }),
      // Read-only readback; an ineligible account (no ACTIVE Hospital relationship) shows no reminder state.
      getOwnMedicationLineReminderPreference(actor).catch((error: unknown) => error instanceof ForbiddenError ? null : Promise.reject(error)),
    ]);
    let selected = null;
    let safeError: string | undefined;
    if (params.item) {
      try { selected = await getOwnPersonalMedication(actor, params.item); }
      catch (error: unknown) {
        if (!(error instanceof NotFoundError)) throw error;
        safeError = "ไม่พบรายการที่ต้องการ";
      }
    }
    // Opaque presentation key remounts local drafts on account change without exposing identity.
    presentationKey = createHash("sha256").update(`personal-medication:${actor.userId}`).digest("hex");
    workspace = { active, stopped, selected, safeError, reminder };
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect(buildLoginReturnHref(LINE_WEB_NAVIGATION_PATHS.OPEN_PATIENT_MEDICATIONS));
    // A denied SELF read (no usable Patient access) is explained, not redirected.
    if (error instanceof ForbiddenError) return <PatientAccessUnavailableState title="ยาของฉัน" />;
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      workspace = { active: { items: [], nextCursor: null }, stopped: { items: [], nextCursor: null }, selected: null, safeError: "ไม่พบหน้ารายการที่ต้องการ กรุณากลับไปโหลดรายการล่าสุด", reminder: null };
    } else {
      throw error;
    }
  }
  return <PersonalMedicationWorkspace key={presentationKey} {...workspace} />;
}
