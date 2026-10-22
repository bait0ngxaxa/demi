import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { resolveCurrentActorAccess } from "@/modules/auth/services/actor-context-service";
import {
  isLineQuickActionLoginReturnTo,
  isLineWorkflowLoginReturnTo,
  loginReturnToSchema,
} from "@/modules/auth/schemas/login-schema";

import { ClearHospitalContentRecoveryOnLogin } from "./clear-hospital-content-recovery";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "เข้าสู่ระบบ",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<React.JSX.Element> {
  await connection();
  const query = await searchParams;
  const parsedReturnTo = loginReturnToSchema.safeParse(query.returnTo);
  const safeReturnTo = parsedReturnTo.success ? parsedReturnTo.data : null;
  const access = await resolveCurrentActorAccess();

  if (access.status === "AUTHORIZED") {
    redirect(
      safeReturnTo === "/line/account" || isLineQuickActionLoginReturnTo(safeReturnTo) ||
        isLineWorkflowLoginReturnTo(safeReturnTo)
        ? safeReturnTo
        : "/app",
    );
  }

  return (
    <main className="min-h-svh bg-canvas lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(28rem,0.95fr)]">
      <ClearHospitalContentRecoveryOnLogin />
      <section className="relative overflow-hidden bg-brand-deep px-6 py-8 text-white sm:px-10 lg:flex lg:min-h-svh lg:flex-col lg:justify-between lg:px-14 lg:py-12 xl:px-20">
        <div
          aria-hidden="true"
          className="absolute -right-20 top-20 h-64 w-64 rounded-full border border-white/10 lg:h-96 lg:w-96"
        />
        <div
          aria-hidden="true"
          className="absolute -right-8 top-32 h-40 w-40 rounded-full border border-white/15 lg:h-64 lg:w-64"
        />

        <div className="relative flex items-center gap-3">
          <span className="h-9 w-1 rounded-full bg-brand-bright" aria-hidden="true" />
          <span className="text-2xl font-bold tracking-[-0.03em]">DEMI</span>
        </div>

        <div className="relative mt-14 max-w-xl lg:my-auto lg:py-16">
          <h1 className="max-w-lg text-balance text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl">
            ระบบบริการสุขภาพสำหรับโรงพยาบาล อสม. และผู้ป่วย
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-brand-pale sm:text-lg sm:leading-8">
            ติดตามการดูแล นัดหมาย และงานที่รับผิดชอบได้ในที่เดียว
          </p>
        </div>
      </section>

      <section className="flex px-6 py-10 sm:px-10 lg:min-h-svh lg:items-center lg:px-14 xl:px-20">
        <div className="mx-auto w-full max-w-md">
          <h2 className="text-3xl font-semibold tracking-[-0.03em] text-ink">เข้าสู่ระบบ DEMI</h2>
          <p className="mt-3 text-base leading-7 text-muted">
            ใช้เลขบัตรประชาชนและรหัสผ่านของบัญชีที่เปิดใช้งานแล้ว หากเป็นผู้ดูแลระบบ DEMI ให้ใช้รหัสผู้ดูแลระบบแทนเลขบัตรประชาชน
          </p>

          <LoginForm applicationAccessDenied={access.status === "APPLICATION_ACCESS_DENIED"} safeReturnTo={safeReturnTo} />

          <p className="mt-5 text-sm leading-6 text-muted">
            <Link
              className="font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
              href="/register"
            >
              ลงทะเบียนครั้งแรก (บุคลากร / อสม. / ผู้ป่วย)
            </Link>
          </p>

          <p className="mt-4 text-sm leading-6 text-muted">
            ลืมรหัสผ่าน? ขณะนี้ยังไม่มีช่องทางกู้คืนบัญชีที่รองรับ โปรดติดต่อผู้ดูแลระบบเพื่อสอบถามแนวทาง
          </p>

          <p className="mt-6 border-t border-line pt-6 text-center text-sm leading-6 text-muted">
            ต้องการใช้ DEMI ในนามโรงพยาบาล?{" "}
            <Link
              className="font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
              href="/hospital/onboarding"
            >
              ขอใช้งาน DEMI สำหรับโรงพยาบาล
            </Link>
          </p>

          <p className="mt-8 text-sm leading-6 text-muted">
            การเข้าสู่ระบบไม่ได้เปิดให้ใช้ทุกส่วน ระบบจะแสดงเฉพาะงานที่บัญชีของคุณเข้าใช้ได้
          </p>
        </div>
      </section>
    </main>
  );
}
