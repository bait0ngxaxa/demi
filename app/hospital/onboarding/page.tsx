import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { listOnboardingHospitals } from "@/modules/hospital-onboarding/services/onboarding-hospital-service";

import { HospitalOnboardingForm } from "./onboarding-form";

export const metadata: Metadata = {
  title: "ขอใช้งาน DEMI สำหรับโรงพยาบาล",
};

export default async function HospitalOnboardingPage() {
  await connection();
  const hospitals = await listOnboardingHospitals();

  return (
    <main className="min-h-svh bg-canvas text-ink">
      <div className="mx-auto grid min-h-svh w-full max-w-7xl lg:grid-cols-[minmax(20rem,0.7fr)_minmax(0,1.3fr)]">
        <section className="relative overflow-hidden bg-brand-deep px-6 py-8 text-white sm:px-10 lg:flex lg:min-h-svh lg:flex-col lg:justify-between lg:px-12 lg:py-12">
          <div
            aria-hidden="true"
            className="absolute -right-24 top-24 h-72 w-72 rounded-full border border-white/10 lg:h-96 lg:w-96"
          />
          <div
            aria-hidden="true"
            className="absolute -right-8 top-40 h-44 w-44 rounded-full border border-white/15 lg:h-64 lg:w-64"
          />

          <div className="relative flex items-center gap-3">
            <span className="h-9 w-1 rounded-full bg-brand-bright" aria-hidden="true" />
            <span className="text-2xl font-bold tracking-[-0.03em]">DEMI</span>
          </div>

          <div className="relative mt-14 max-w-xl lg:my-auto lg:py-16">
            <p className="text-sm font-semibold text-brand-bright">ขอใช้งาน DEMI สำหรับโรงพยาบาล</p>
            <h1 className="mt-3 max-w-lg text-balance text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl">
              ส่งคำขอใช้งาน DEMI สำหรับโรงพยาบาล
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-brand-pale sm:text-lg sm:leading-8">
              เลือกโรงพยาบาลจากรายชื่อในระบบ แล้วส่งข้อมูลให้ตรวจสอบ
            </p>
          </div>

          <p className="relative mt-12 max-w-md text-sm leading-6 text-brand-pale/80">
            บัญชีจะเข้าใช้งานได้เมื่อคำขอได้รับอนุมัติ
          </p>
        </section>

        <section className="px-5 py-8 sm:px-10 sm:py-12 lg:flex lg:items-center lg:px-14 xl:px-20">
          <div className="mx-auto w-full max-w-2xl">
            <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2">
              <div>
                <h2 className="text-3xl font-semibold tracking-[-0.03em]">ขอใช้งาน DEMI สำหรับโรงพยาบาล</h2>
                <p className="mt-3 max-w-xl text-base leading-7 text-muted">
                  กรอกข้อมูลผู้สมัครและตั้งรหัสผ่านของคุณเอง
                </p>
              </div>
              <Link
                className="text-sm font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
                href="/login"
              >
                มีบัญชีแล้ว? เข้าสู่ระบบ
              </Link>
            </div>

            <div className="mt-8 rounded-[16px] border border-line bg-white p-5 sm:p-7">
              <HospitalOnboardingForm hospitals={hospitals} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
