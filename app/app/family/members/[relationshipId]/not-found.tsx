import { Alert } from "@/components/ui/alert";

export default function FamilyHealthSummaryNotFound(): React.JSX.Element {
  return <Alert variant="info">ไม่พบข้อมูลนี้หรือไม่มีสิทธิ์ดู กรุณากลับไปตรวจสอบข้อมูลที่แชร์ไว้ในพื้นที่ผู้ดูแล</Alert>;
}
