import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { resolveCurrentActorAccess } from "@/modules/auth/services/actor-context-service";
import { Alert } from "@/components/ui/alert";
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
  const completionHint = query.reset === "1"
    ? {
        title: "ตั้งรหัสผ่านใหม่สำเร็จแล้ว",
        message: "กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่ของคุณ",
      }
    : query.activated === "1"
      ? {
          title: "เปิดใช้งานบัญชีแล้ว",
          message: "กรุณาเข้าสู่ระบบด้วยเลขบัตรประชาชนและรหัสผ่านที่ตั้งไว้",
        }
      : null;
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

          {completionHint ? (
            <Alert className="mt-5" variant="success">
              <p className="font-semibold">{completionHint.title}</p>
              <p className="mt-1">{completionHint.message}</p>
            </Alert>
          ) : null}

          <LoginForm applicationAccessDenied={access.status === "APPLICATION_ACCESS_DENIED"} safeReturnTo={safeReturnTo} />

          <section aria-labelledby="login-entry-options-title" className="mt-8 border-t border-line pt-6">
            <h3 className="text-lg font-semibold leading-7 text-ink" id="login-entry-options-title">
              ยังไม่มีบัญชีหรือเริ่มใช้งานครั้งแรก?
            </h3>
            <div className="mt-4 grid gap-3">
              <Link
                className="group block rounded-panel border border-border bg-surface p-4 transition-colors hover:border-action-primary hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                href="/register"
              >
                <h4 className="font-semibold text-text group-hover:text-brand-strong">ลงทะเบียนครั้งแรก</h4>
                <p className="mt-1 text-sm leading-6 text-text-muted">
                  สำหรับบุคลากร อสม. และผู้ป่วยที่โรงพยาบาลเพิ่มข้อมูลไว้แล้ว
                </p>
                <span className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-brand-strong underline underline-offset-4">
                  เริ่มลงทะเบียน
                </span>
              </Link>
              <Link
                className="group block rounded-panel border border-border bg-surface p-4 transition-colors hover:border-action-primary hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                href="/hospital/onboarding"
              >
                <h4 className="font-semibold text-text group-hover:text-brand-strong">
                  ขอใช้งาน DEMI สำหรับโรงพยาบาล
                </h4>
                <p className="mt-1 text-sm leading-6 text-text-muted">
                  สำหรับผู้แทนโรงพยาบาลแม่ข่ายที่ต้องการส่งคำขอใช้งานระบบ
                </p>
                <span className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-brand-strong underline underline-offset-4">
                  ส่งคำขอโรงพยาบาล
                </span>
              </Link>
            </div>
          </section>

          <p className="mt-5 text-sm leading-6 text-muted">
            ลืมรหัสผ่าน? ติดต่อโรงพยาบาลที่ดูแลเพื่อยืนยันตัวตนและขอรีเซ็ตรหัสผ่าน{" "}
            <Link
              className="font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-soft"
              href="/recover"
            >
              ดูแนวทาง
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
