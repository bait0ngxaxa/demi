import { Alert } from "@/components/ui/alert";
import { Panel } from "@/components/ui/panel";

export function WorkforcePasswordResetControl({ subjectLabel }: {
  userId: string;
  targetHospitalId: string;
  subjectLabel: string;
}): React.JSX.Element {
  return (
    <Panel className="mt-6">
      <h2 className="text-xl font-semibold">การกู้คืนรหัสผ่าน</h2>
      <Alert className="mt-4" variant="warning">
        ยังไม่เปิดให้ผู้ดูแลรีเซ็ตรหัสผ่านของ{subjectLabel} เพราะรหัสผ่านใช้กับทั้งบัญชี
        รวมถึงบทบาทและโรงพยาบาลอื่น ต้องมีวิธียืนยันเจ้าของบัญชีที่เป็นอิสระจากผู้ดูแลก่อน
        เลขบัตรประชาชน ลิงก์ที่ผู้ดูแลออก และการยืนยันต่อหน้าไม่เพียงพอสำหรับการกู้คืนนี้
      </Alert>
      <p className="mt-3 text-sm leading-6 text-muted">
        หากยังเข้าสู่ระบบได้ เจ้าของบัญชีเปลี่ยนรหัสผ่านได้ในหน้าความปลอดภัยโดยยืนยันรหัสผ่านปัจจุบัน
        หากเข้าสู่ระบบไม่ได้ กรุณาติดต่อผู้ดูแลระบบเพื่อรับแนวทางดำเนินการ โดยยังไม่มีช่องทางกู้คืนที่อนุมัติแล้ว
      </p>
    </Panel>
  );
}
