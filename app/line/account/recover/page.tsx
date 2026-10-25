import type { Metadata } from "next";
import { connection } from "next/server";

import { getLineLiffId } from "@/lib/env/server";
import { LinePasswordRecoveryClient } from "./line-password-recovery-client";

export const metadata: Metadata = {
  title: "ตั้งรหัสผ่านใหม่",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function LinePasswordRecoveryPage(): Promise<React.JSX.Element> {
  await connection();
  return <LinePasswordRecoveryClient liffId={getLineLiffId()} />;
}
