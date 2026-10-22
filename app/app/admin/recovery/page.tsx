import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { PageHeader } from "@/components/ui/page-header";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { AdminMediatedPasswordResetSearch } from "./reset-search";

export const metadata: Metadata = { title: "คืนบัญชีผู้ใช้" };

async function requireAdmin(): Promise<void> {
  try {
    const actor = await getProtectedApplicationActor();
    if (!actor.roles.includes("ADMIN")) throw new ForbiddenError();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError) redirect("/login");
    if (error instanceof ForbiddenError) redirect("/app");
    throw error;
  }
}

export default async function AdminPasswordRecoveryPage(): Promise<React.JSX.Element> {
  await connection();
  await requireAdmin();
  return (
    <div className="content-detail space-y-6">
      <PageHeader
        breadcrumbs={[{ href: "/app", label: "หน้าหลัก" }, { label: "ผู้ดูแลระบบ" }, { label: "คืนบัญชีผู้ใช้" }]}
        description="ค้นหาด้วยเลขบัตรประชาชนแบบตรงกัน และให้เจ้าของบัญชียืนยันตัวตนก่อนตั้งรหัสผ่านใหม่"
        title="คืนบัญชีผู้ใช้"
      />
      <AdminMediatedPasswordResetSearch />
    </div>
  );
}
