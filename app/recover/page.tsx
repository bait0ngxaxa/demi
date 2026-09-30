import type { Metadata } from "next";

import { PublicAccountRecoveryForm } from "./public-account-recovery-form";

export const metadata: Metadata = {
  title: "ตั้งรหัสผ่านใหม่",
};

export default function RecoverAccountPage(): React.JSX.Element {
  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      <PublicAccountRecoveryForm />
    </main>
  );
}
