import { Alert } from "@/components/ui/alert";

export default function FamilyHealthSummaryNotFound(): React.JSX.Element {
  return <Alert variant="info">ไม่พบข้อมูลที่พร้อมใช้งาน กรุณากลับไปตรวจสอบความสัมพันธ์ในพื้นที่ผู้ดูแล</Alert>;
}
