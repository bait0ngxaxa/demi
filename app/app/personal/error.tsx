"use client";

import Link from "next/link";

type PatientSelfErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function PatientSelfError({ reset }: PatientSelfErrorProps): React.JSX.Element {
  return (
    <main className="flex min-h-96 items-center justify-center px-4 py-12 text-text">
      <div className="w-full max-w-lg text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.03em]">
          ยังไม่สามารถแสดงข้อมูลได้
        </h1>
        <p className="mt-3 text-sm leading-6 text-text-muted">
          ลองโหลดข้อมูลอีกครั้ง หรือกลับไปยังพื้นที่ส่วนตัว
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-control bg-action-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-primary-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            onClick={reset}
            type="button"
          >
            ลองอีกครั้ง
          </button>
          <Link
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-surface px-5 py-2 text-sm font-semibold text-text transition-colors hover:border-action-primary hover:bg-brand-soft hover:text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            href="/app/personal"
          >
            กลับพื้นที่ส่วนตัว
          </Link>
        </div>
      </div>
    </main>
  );
}
