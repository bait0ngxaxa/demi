import { Alert } from "@/components/ui/alert";

export default function DelegatedAppointmentNotFound(): React.JSX.Element {
  return <Alert variant="info">ไม่พบนัดหมายนี้หรือไม่มีสิทธิ์ดู กรุณากลับไปตรวจสอบนัดหมายที่แชร์ไว้ในพื้นที่ผู้ดูแล</Alert>;
}
