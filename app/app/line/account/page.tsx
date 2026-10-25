import type { Metadata } from "next";
import Link from "next/link";
import { Role } from "@prisma/client";
import { connection } from "next/server";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { isRecoveryLineEnabled } from "@/lib/env/server";
import { getProtectedApplicationActor } from "@/modules/auth/services/application-access-service";
import { getLineAccountSummary } from "@/modules/line/services/line-account-service";

import { LinePasswordRecoveryNudge } from "../../../line/account/line-password-recovery-nudge";

export const metadata: Metadata = { title: "บัญชี LINE" };

export default async function ApplicationLineAccountPage(): Promise<React.JSX.Element> {
  await connection();
  const actor = await getProtectedApplicationActor();
  const recoveryLineEnabled = isRecoveryLineEnabled();
  const summary = await getLineAccountSummary().catch(() => null);
  const unlinked = summary?.status === "UNLINKED";
  const linked = summary?.status === "LINKED";
  const showRecoveryNudge = recoveryLineEnabled && unlinked && !actor.roles.includes(Role.ADMIN);

  return (
    <div className="min-w-0 max-w-3xl space-y-6">
      <PageHeader title="บัญชี LINE" description="ตรวจสอบและจัดการการเชื่อมต่อ LINE กับบัญชี DEMI ของคุณ" />
      <Panel>
        <h2 className="text-xl font-semibold text-text">สถานะการเชื่อมต่อ</h2>
        <p className="mt-2 text-sm leading-6 text-text-muted" role="status">
          {linked
            ? "บัญชี DEMI นี้ผูกกับ LINE แล้ว"
            : unlinked
              ? "บัญชี DEMI นี้ยังไม่ได้ผูกกับ LINE"
              : "ขณะนี้ตรวจสอบสถานะการเชื่อมต่อ LINE ไม่ได้"}
        </p>
        <Link
          className="mt-4 inline-flex min-h-11 items-center rounded-control bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring"
          href="/line/account"
        >
          จัดการการเชื่อมต่อ LINE
        </Link>
        {showRecoveryNudge ? <LinePasswordRecoveryNudge key={actor.userId} userId={actor.userId} href="/line/account" /> : null}
      </Panel>
    </div>
  );
}
