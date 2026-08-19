import { HospitalOnboardingApplicationStatus } from "@prisma/client";
import Link from "next/link";

import { Alert } from "@/components/ui/alert";

export function ApprovalContinuation({
  status,
}: {
  status: HospitalOnboardingApplicationStatus;
}): React.JSX.Element | null {
  if (status !== HospitalOnboardingApplicationStatus.APPROVED) {
    return null;
  }

  return (
    <Alert className="mt-6" variant="success">
      <p className="font-semibold">โรงพยาบาลได้รับการอนุมัติแล้ว</p>
      <p className="mt-1">
        ผู้สมัครได้รับบทบาทเจ้าของโรงพยาบาลแล้ว และสามารถเข้าสู่ระบบด้วยบัญชีของตนเอง
      </p>
      <Link
        className="mt-3 inline-flex min-h-10 items-center font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
        href="/login"
      >
        ไปหน้าเข้าสู่ระบบ
      </Link>
    </Alert>
  );
}
