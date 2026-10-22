import { Alert } from "@/components/ui/alert";
import Link from "next/link";
import { Panel } from "@/components/ui/panel";

export function WorkforcePasswordResetControl({ subjectLabel, relationshipId, targetKind }: {
  relationshipId: string;
  targetKind: "staff" | "osm";
  subjectLabel: string;
}): React.JSX.Element {
  return (
    <Panel className="mt-6">
      <h2 className="text-xl font-semibold">การกู้คืนรหัสผ่าน</h2>
      <Alert className="mt-4" variant="warning">
        รีเซ็ตรหัสผ่านของ{subjectLabel}ได้จากหน้ารายละเอียดผู้ใช้ หลังเลือกวิธียืนยันตัวตนและรูปแบบส่งมอบ
      </Alert>
      <p className="mt-3 text-sm leading-6 text-muted">
        หากยังเข้าสู่ระบบได้ เจ้าของบัญชีเปลี่ยนรหัสผ่านได้ในหน้าความปลอดภัยโดยยืนยันรหัสผ่านปัจจุบัน
        หากบัญชีนี้อยู่หลายโรงพยาบาล เป็นเจ้าของโรงพยาบาล หรือเป็นบัญชีผู้ดูแลระบบ ให้ผู้ดูแลระบบดำเนินการ
      </p>
      <Link className="mt-3 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4" href={`/app/users/${targetKind}/${relationshipId}`}>
        เปิดหน้ารายละเอียดผู้ใช้
      </Link>
    </Panel>
  );
}
