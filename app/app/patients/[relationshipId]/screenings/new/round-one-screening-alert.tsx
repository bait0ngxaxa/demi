import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";

/**
 * OSM-SCREENING-IN-ROUND1 (owner, 2026-11-20): an unlinked screening never counts for round 1, so while round 1
 * is open the round-1 entry is the primary action. The unlinked form stays below for history.
 */
export function RoundOneScreeningAlert({ href }: { href: string }): React.JSX.Element {
  return (
    <Alert data-round-one-screening="" variant="warning">
      <p className="font-semibold">ผู้ป่วยอยู่ในครั้งที่ 1 ของโปรแกรม บันทึกจากครั้งที่ 1 เพื่อให้นับในโปรแกรม</p>
      <Link className={buttonClassName({ className: "mt-3" })} href={href}>บันทึกในครั้งที่ 1</Link>
    </Alert>
  );
}
