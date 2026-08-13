import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { resolveCurrentActorAccess } from "@/modules/auth/services/actor-context-service";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "เข้าสู่ระบบ",
};

export default async function LoginPage() {
  await connection();
  const access = await resolveCurrentActorAccess();

  if (access.status === "AUTHORIZED") {
    redirect("/app");
  }

  return (
    <main className="min-h-svh bg-canvas lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(28rem,0.95fr)]">
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
            เข้าถึงงานที่ได้รับอนุญาตอย่างมั่นใจ
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-brand-pale sm:text-lg sm:leading-8">
            DEMI ตรวจสอบทั้งตัวตนจากผู้ให้บริการและสิทธิ์ของบัญชีในระบบ
            ก่อนเปิดพื้นที่ทำงานทุกครั้ง
          </p>
        </div>

        <p className="relative mt-12 hidden max-w-md text-sm leading-6 text-brand-pale/80 lg:block">
          ระบบบริการสุขภาพที่ยืนยันสิทธิ์จากข้อมูล DEMI ฝั่งเซิร์ฟเวอร์
        </p>
      </section>

      <section className="flex px-6 py-10 sm:px-10 lg:min-h-svh lg:items-center lg:px-14 xl:px-20">
        <div className="mx-auto w-full max-w-md">
          <h2 className="text-3xl font-semibold tracking-[-0.03em] text-ink">เข้าสู่ระบบ DEMI</h2>
          <p className="mt-3 text-base leading-7 text-muted">
            ใช้เลขบัตรประชาชนและรหัสผ่านของบัญชีที่ได้รับการเปิดใช้งาน
          </p>

          <LoginForm applicationAccessDenied={access.status === "APPLICATION_ACCESS_DENIED"} />

          <p className="mt-7 text-center text-sm leading-6 text-muted">
            ต้องการลงทะเบียนโรงพยาบาล?{" "}
            <Link
              className="font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
              href="/hospital/onboarding"
            >
              ส่งคำขอ onboarding
            </Link>
          </p>

          <p className="mt-8 text-sm leading-6 text-muted">
            การเข้าสู่ระบบสำเร็จไม่ได้หมายถึงได้รับสิทธิ์ใช้งานโดยอัตโนมัติ
            DEMI จะตรวจสอบสถานะบัญชีและบทบาทจากระบบอีกครั้ง
          </p>
        </div>
      </section>
    </main>
  );
}
