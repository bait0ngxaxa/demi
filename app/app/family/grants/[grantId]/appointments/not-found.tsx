import { Alert } from "@/components/ui/alert";

export default function DelegatedAppointmentNotFound(): React.JSX.Element {
  return <Alert variant="info">ไม่พบรายการที่พร้อมใช้งาน กรุณากลับไปตรวจสอบสิทธิ์ในพื้นที่ผู้ดูแล</Alert>;
}
