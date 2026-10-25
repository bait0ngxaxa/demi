import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";

import { isRecoveryLineEnabled, getLineLiffId } from "@/lib/env/server";
import { LinePasswordRecoveryClient } from "./line-password-recovery-client";

export const metadata: Metadata = {
  title: "ตั้งรหัสผ่านใหม่",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function LinePasswordRecoveryPage(): Promise<React.JSX.Element> {
  await connection();
  if (!isRecoveryLineEnabled()) redirect("/recover");
  return <LinePasswordRecoveryClient liffId={getLineLiffId()} />;
}
