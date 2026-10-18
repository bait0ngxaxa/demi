import type { Metadata } from "next";

import { LineWorkflowScopedGuard } from "./line-workflow-scoped-guard";

export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

/** Mobile-first shell for the read-only scoped Appointment workflow. */
export default function LineWorkflowAppointmentsLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <main className="min-h-dvh bg-canvas px-4 py-6 text-ink sm:py-10">
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-sm font-semibold text-brand">DEMI · นัดหมายใน LINE</p>
        <LineWorkflowScopedGuard>{children}</LineWorkflowScopedGuard>
        <footer className="mt-10 border-t border-line pt-5">
          <p className="type-readable text-sm text-muted">
            เมนูอื่นของ DEMI เปิดเป็นการใช้งานบนเว็บตามปกติ ไม่ได้อยู่ในหน้านัดหมายของ LINE
          </p>
          {/* Full-document exit: no workflow authority or cookie travels to ordinary /app. */}
          <a
            className="mt-3 inline-flex min-h-11 items-center font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
            href="/app/personal"
          >
            ออกจากหน้านัดหมายใน LINE ไปยัง DEMI
          </a>
        </footer>
      </div>
    </main>
  );
}
