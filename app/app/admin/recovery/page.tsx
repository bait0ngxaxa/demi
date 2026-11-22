import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { PageHeader } from "@/components/ui/page-header";
import { listQuarantinedMediatedPasswordResets } from "@/modules/account-security/services/mediated-password-reset-service";
import { getRequestApplicationActor } from "@/modules/auth/services/request-application-actor";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { QuarantinedMediatedResets } from "./quarantined-resets";
import { AdminMediatedPasswordResetSearch } from "./reset-search";

export const metadata: Metadata = { title: "กู้คืนบัญชีผู้ใช้" };

async function requireAdmin(): Promise<ActorContext> {
  try {
    const actor = await getRequestApplicationActor();
    if (!actor.roles.includes("ADMIN")) throw new ForbiddenError();
    return actor;
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
}

export default async function AdminPasswordRecoveryPage(): Promise<React.JSX.Element> {
  await connection();
  const actor = await requireAdmin();
  const quarantined = await listQuarantinedMediatedPasswordResets(actor);
  return (
    <div className="content-detail space-y-6">
      <PageHeader
        breadcrumbs={[{ href: "/app", label: "หน้าหลัก" }, { label: "ผู้ดูแลระบบ DEMI" }, { label: "กู้คืนบัญชีผู้ใช้" }]}
        description="ตรวจสอบตัวตนก่อนส่งลิงก์ให้เจ้าของบัญชี"
        title="กู้คืนบัญชีผู้ใช้"
      />
      <AdminMediatedPasswordResetSearch />
      <QuarantinedMediatedResets
        resets={quarantined.map((reset) => ({
          resetId: reset.resetId,
          displayName: reset.displayName,
          hospitalName: reset.hospitalName,
          mode: reset.mode,
          verificationMethod: reset.verificationMethod,
          claimedAt: reset.claimedAt.toISOString(),
        }))}
      />
    </div>
  );
}
