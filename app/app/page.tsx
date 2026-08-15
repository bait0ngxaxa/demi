import { HospitalStatus, MembershipStatus, MembershipType, Role } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  hasDirectHospitalProvisioningScope,
  hasOsmHospitalProvisioningScope,
} from "@/modules/patient-provisioning/policies/patient-provisioning-policy";
import { ForbiddenError, UnauthenticatedError } from "@/shared/errors/application-error";

import { LogoutButton } from "./logout-button";

export const metadata: Metadata = {
  title: "พื้นที่ทำงาน",
};

const roleLabels: Record<Role, string> = {
  [Role.ADMIN]: "ผู้ดูแลระบบ DEMI",
  [Role.HOSPITAL]: "บุคลากรโรงพยาบาล",
  [Role.OSM]: "อสม.",
  [Role.PATIENT]: "ผู้ป่วย",
};

async function resolveProtectedActor(): Promise<ActorContext> {
  try {
    return await getProtectedApplicationActor();
  } catch (error) {
    if (error instanceof UnauthenticatedError || error instanceof ForbiddenError) {
      redirect("/login");
    }

    throw error;
  }
}

export default async function ApplicationPage(): Promise<React.JSX.Element> {
  await connection();
  const actor = await resolveProtectedActor();
  const canManageWorkforce =
    actor.roles.includes(Role.HOSPITAL) &&
    actor.hospitalMemberships.some(
      (membership) =>
        membership.membershipType === MembershipType.OWNER &&
        membership.status === MembershipStatus.ACTIVE &&
        membership.hospitalStatus === HospitalStatus.ACTIVE,
    );
  const canProvisionPatients =
    actor.hospitalMemberships.some(({ hospitalId }) =>
      hasDirectHospitalProvisioningScope(actor, hospitalId),
    ) ||
    actor.osmHospitalRelationships.some(({ hospitalId }) =>
      hasOsmHospitalProvisioningScope(actor, hospitalId),
    );

  return (
    <main className="min-h-svh bg-canvas text-ink">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-6 px-5 py-5 sm:items-center sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <span className="h-8 w-1 rounded-full bg-brand" aria-hidden="true" />
            <div>
              <p className="text-xl font-bold tracking-[-0.03em]">DEMI</p>
              <p className="text-sm text-muted">พื้นที่ทำงานที่ได้รับการยืนยันตัวตน</p>
            </div>
          </div>
          <LogoutButton />
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14 lg:px-10">
        <section className="max-w-3xl">
          <h1 className="text-balance text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
            ยินดีต้อนรับสู่ DEMI
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted sm:text-lg sm:leading-8">
            บัญชีนี้ผ่านการยืนยันตัวตนและได้รับอนุญาตให้เข้าสู่ application shell แล้ว
            โมดูลการทำงานตามบทบาทจะเพิ่มเมื่อมี requirement ที่ยืนยันแล้วเท่านั้น
          </p>
        </section>

        <section className="mt-10 max-w-3xl rounded-[16px] border border-line bg-white p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">ข้อมูลผู้ใช้งานปัจจุบัน</h2>
            <span className="inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1.5 text-sm font-semibold text-success">
              <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
              พร้อมใช้งาน
            </span>
          </div>

          <div className="mt-7 border-t border-line pt-6">
            <h3 className="text-sm font-semibold text-ink">บทบาทจาก DEMI ActorContext</h3>
            {actor.roles.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="บทบาทของผู้ใช้งาน">
                {actor.roles.map((role) => (
                  <li
                    className="rounded-full bg-brand-soft px-3 py-1.5 text-sm font-semibold text-brand-strong"
                    key={role}
                  >
                    {roleLabels[role]}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm leading-6 text-muted">ยังไม่มีบทบาทสำหรับแสดงผล</p>
            )}
          </div>
        </section>

        {actor.roles.includes(Role.ADMIN) ? (
          <section className="mt-6 max-w-3xl rounded-[16px] border border-line bg-white p-5 sm:p-7">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">งาน Platform Admin</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              ตรวจสอบคำขอ onboarding ของโรงพยาบาลที่รอการตัดสินใจ
            </p>
            <Link
              className="mt-5 inline-flex h-11 items-center justify-center rounded-[12px] bg-brand px-5 text-sm font-semibold text-white transition-[background-color,box-shadow] hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft focus-visible:ring-offset-2"
              href="/app/admin/hospital-onboarding"
            >
              เปิดรายการคำขอ
            </Link>
          </section>
        ) : null}

        {canManageWorkforce ? (
          <section className="mt-6 max-w-3xl rounded-[16px] border border-line bg-white p-5 sm:p-7">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">งานบุคลากรโรงพยาบาล</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              เพิ่มบุคลากรโรงพยาบาลหรือ อสม. ให้กับโรงพยาบาลที่คุณเป็นเจ้าของโดยตรง
            </p>
            <Link
              className="mt-5 inline-flex h-11 items-center justify-center rounded-[12px] bg-brand px-5 text-sm font-semibold text-white transition-[background-color,box-shadow] hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft focus-visible:ring-offset-2"
              href="/app/workforce"
            >
              เปิดการจัดการบุคลากร
            </Link>
          </section>
        ) : null}

        {canProvisionPatients ? (
          <section className="mt-6 max-w-3xl rounded-[16px] border border-line bg-white p-5 sm:p-7">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">งานผู้ป่วย</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              เพิ่มข้อมูลผู้ป่วยรายบุคคล หรือเตรียมนำเข้ารายการจาก Excel ตามขอบเขตโรงพยาบาลที่ได้รับอนุญาต
            </p>
            <Link
              className="mt-5 inline-flex h-11 items-center justify-center rounded-[12px] bg-brand px-5 text-sm font-semibold text-white transition-[background-color,box-shadow] hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft focus-visible:ring-offset-2"
              href="/app/patients/provision"
            >
              เปิดการเพิ่มผู้ป่วย
            </Link>
          </section>
        ) : null}
      </div>
    </main>
  );
}
