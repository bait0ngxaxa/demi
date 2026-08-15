import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { roleLabels } from "@/components/app-shell/actor-presentation";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

export const metadata: Metadata = {
  title: "หน้าหลัก",
};

async function resolveProtectedActor(): Promise<ActorContext> {
  try {
    return await getProtectedApplicationActor();
  } catch (error: unknown) {
    if (error instanceof UnauthenticatedError || error instanceof ForbiddenError) {
      redirect("/login");
    }

    throw error;
  }
}

export default async function ApplicationPage(): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveProtectedActor();

  return (
    <div className="max-w-4xl">
      <PageHeader
        description="พื้นที่ทำงานที่แสดงเมนูตามบทบาทและขอบเขตงานที่ DEMI ยืนยันจากฝั่งเซิร์ฟเวอร์"
        title="ยินดีต้อนรับสู่ DEMI"
      />

      <section aria-labelledby="account-heading" className="pt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-[-0.02em]" id="account-heading">
            บัญชีปัจจุบัน
          </h2>
          <StatusBadge variant="success">พร้อมใช้งาน</StatusBadge>
        </div>
        <p className="mt-2 text-sm leading-6 text-text-muted">
          เลือกงานจากเมนูหลัก ระบบจะตรวจสิทธิ์ของแต่ละรายการอีกครั้งเมื่อเปิดหน้าหรือดำเนินการ
        </p>
        <div className="mt-6 border-y border-border py-5">
          <h3 className="text-sm font-semibold text-text">บทบาทของคุณ</h3>
          {actor.roles.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="บทบาทของผู้ใช้งาน">
              {actor.roles.map((role) => (
                <li key={role}>
                  <StatusBadge variant="info">{roleLabels[role]}</StatusBadge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm leading-6 text-text-muted">ยังไม่มีบทบาทสำหรับแสดงผล</p>
          )}
        </div>
      </section>

      <section aria-labelledby="overview-heading" className="pt-8">
        <h2 className="text-xl font-semibold tracking-[-0.02em]" id="overview-heading">
          ภาพรวม
        </h2>
        <p className="mt-2 text-sm leading-6 text-text-muted">
          ยังไม่มีข้อมูลสรุปสำหรับแสดงผล ใช้เมนูหลักเพื่อเข้าสู่งานที่คุณได้รับสิทธิ์
        </p>
      </section>
    </div>
  );
}
