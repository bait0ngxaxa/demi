import type { Metadata } from "next";
import Link from "next/link";

import { SelfRegistrationForm } from "./self-registration-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "ลงทะเบียนครั้งแรก",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function RegisterPage(): React.JSX.Element {
  return (
    <main className="min-h-svh bg-canvas lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(28rem,0.95fr)]">
      <section className="relative overflow-hidden bg-brand-deep px-6 py-8 text-white sm:px-10 lg:flex lg:min-h-svh lg:flex-col lg:justify-between lg:px-14 lg:py-12 xl:px-20">
        <div className="relative flex items-center gap-3">
          <span aria-hidden="true" className="h-9 w-1 rounded-full bg-brand-bright" />
          <span className="text-2xl font-bold tracking-[-0.03em]">DEMI</span>
        </div>
        <div className="relative mt-12 max-w-xl lg:my-auto lg:py-16">
          <h1 className="max-w-lg text-balance text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl">
            เริ่มใช้งานบัญชีของคุณ
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-brand-pale sm:text-lg sm:leading-8">
            ลงทะเบียนได้เมื่อโรงพยาบาลจัดเตรียมข้อมูลบัญชีของคุณไว้แล้ว
          </p>
        </div>
        <p className="relative mt-12 hidden max-w-md text-sm leading-6 text-brand-pale/80 lg:block">
          สำหรับบุคลากรโรงพยาบาล อสม. และผู้ป่วย
        </p>
      </section>

      <section className="flex px-6 py-10 sm:px-10 lg:min-h-svh lg:items-center lg:px-14 xl:px-20">
        <div className="mx-auto w-full max-w-md">
          <h2 className="text-3xl font-semibold tracking-[-0.03em] text-ink">ลงทะเบียนครั้งแรก</h2>
          <p className="mt-3 text-base leading-7 text-muted">
            กรอกเลขบัตรประชาชนที่โรงพยาบาลใช้จัดเตรียมบัญชี แล้วตั้งรหัสผ่านด้วยตนเอง
          </p>
          <SelfRegistrationForm />
          <p className="mt-6 text-center text-sm leading-6 text-muted">
            มีบัญชีแล้ว?{" "}
            <Link
              className="font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
              href="/login"
            >
              เข้าสู่ระบบ
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
