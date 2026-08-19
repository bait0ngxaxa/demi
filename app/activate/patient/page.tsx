import type { Metadata } from "next";
import { connection } from "next/server";

import { PatientActivationForm } from "./patient-activation-form";

export const metadata: Metadata = {
  title: "เปิดใช้งานบัญชีผู้ป่วย",
};

export default async function PatientActivationPage(): Promise<React.JSX.Element> {
  await connection();

  return (
    <main className="min-h-svh bg-canvas text-ink lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(28rem,0.8fr)]">
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
            เปิดใช้งานบัญชีผู้ป่วยครั้งแรก
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-brand-pale sm:text-lg sm:leading-8">
            ตั้งรหัสผ่านของคุณเองเพื่อเริ่มใช้บัญชี DEMI ที่โรงพยาบาลจัดเตรียมไว้ให้
          </p>
        </div>
        <p className="relative mt-12 max-w-md text-sm leading-6 text-brand-pale/80">
          รหัสผ่านเป็นข้อมูลส่วนตัว อย่าเปิดเผยให้บุคคลอื่นทราบ
        </p>
      </section>

      <section className="flex px-6 py-10 sm:px-10 lg:min-h-svh lg:items-center lg:px-14 xl:px-20">
        <div className="mx-auto w-full max-w-md">
          <h2 className="text-3xl font-semibold tracking-[-0.03em]">ตั้งรหัสผ่านของคุณ</h2>
          <p className="mt-3 text-base leading-7 text-muted">
            ใช้ลิงก์นี้ครั้งเดียวเพื่อสร้างรหัสผ่าน แล้วเข้าสู่ระบบผ่านหน้าเข้าสู่ระบบของ DEMI
          </p>
          <PatientActivationForm />
        </div>
      </section>
    </main>
  );
}
