"use client";

import Link from "next/link";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ reset }: ErrorPageProps) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-canvas px-6 py-12 text-ink">
      <div className="w-full max-w-lg text-center">
        <p className="text-2xl font-bold tracking-[-0.03em] text-brand-strong">DEMI</p>
        <h1 className="mt-8 text-3xl font-semibold tracking-[-0.03em]">
          ระบบไม่พร้อมใช้งานชั่วคราว
        </h1>
        <p className="mt-4 text-base leading-7 text-muted">
          ไม่สามารถตรวจสอบการเข้าใช้งานได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            className="inline-flex h-11 items-center justify-center rounded-[12px] bg-brand px-5 text-sm font-semibold text-white shadow-[0_8px_22px_rgba(18,103,89,0.22)] hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft focus-visible:ring-offset-2"
            onClick={reset}
            type="button"
          >
            ลองอีกครั้ง
          </button>
          <Link
            className="inline-flex h-11 items-center justify-center rounded-[12px] border border-line bg-white px-5 text-sm font-semibold text-ink hover:border-brand hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft focus-visible:ring-offset-2"
            href="/login"
          >
            กลับไปหน้าเข้าสู่ระบบ
          </Link>
        </div>
      </div>
    </main>
  );
}
