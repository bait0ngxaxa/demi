import type { Metadata } from "next";
import { connection } from "next/server";

import { PublicAccountRecoveryForm } from "./public-account-recovery-form";
import { isRecoveryLineEnabled } from "@/lib/env/server";

export const metadata: Metadata = {
  title: "การกู้คืนรหัสผ่าน",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function RecoverAccountPage(): Promise<React.JSX.Element> {
  await connection();
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      <PublicAccountRecoveryForm lineRecoveryEnabled={isRecoveryLineEnabled()} />
    </main>
  );
}
