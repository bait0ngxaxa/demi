import type { Metadata } from "next";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getOwnPersonalMedication, listOwnPersonalMedications } from "@/modules/medications/services/personal-medication-query-service";
import { ForbiddenError, UnauthenticatedError, NotFoundError, ValidationError } from "@/shared/errors/application-error";
import { PersonalMedicationWorkspace } from "./personal-medication-workspace";

export const metadata: Metadata = { title: "ยาของฉัน" };

export default async function PersonalMedicationsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.JSX.Element> {
  await connection();
  const params = await searchParams;
  let workspace: Parameters<typeof PersonalMedicationWorkspace>[0];
  let presentationKey: string | undefined;
  try {
    const actor = await getProtectedApplicationActor();
    const [active, stopped] = await Promise.all([
      listOwnPersonalMedications(actor, { status: "ACTIVE", cursor: params.activeCursor }),
      listOwnPersonalMedications(actor, { status: "STOPPED", cursor: params.stoppedCursor }),
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
    workspace = { active, stopped, selected, safeError };
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      workspace = { active: { items: [], nextCursor: null }, stopped: { items: [], nextCursor: null }, selected: null, safeError: "ไม่พบหน้ารายการที่ต้องการ กรุณากลับไปโหลดรายการล่าสุด" };
    } else {
      throw error;
    }
  }
  return <PersonalMedicationWorkspace key={presentationKey} {...workspace} />;
}
