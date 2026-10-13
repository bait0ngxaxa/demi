import { Panel } from "@/components/ui/panel";

export function PatientAccountRecoveryPanel(_props: { relationshipId: string }): React.JSX.Element {
  void _props;
  return (
    <section aria-labelledby="patient-account-recovery-heading" className="mt-6">
      <Panel>
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-text" id="patient-account-recovery-heading">กู้คืนบัญชีผู้ป่วย</h2>
        <p className="mt-2 break-words text-sm leading-6 text-text-muted">การกู้คืนรหัสผ่านยังไม่เปิดใช้งาน บัญชี DEMI เดียวใช้ร่วมกันทุกบทบาทและทุกโรงพยาบาล จึงต้องยืนยันเจ้าของบัญชีด้วยวิธีที่เป็นอิสระจากผู้ดูแล</p>
        <p className="mt-2 break-words text-sm leading-6 text-text-muted">เลขประจำตัวประชาชนและการรับรองโดยเจ้าหน้าที่ไม่เพียงพอ กรุณาติดต่อผู้ดูแลระบบเพื่อรับแนวทางดำเนินการ</p>
      </Panel>
    </section>
  );
}
