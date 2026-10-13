import { FormSkeleton } from "@/components/ui/loading-skeletons";

export default function PatientOsmBulkAssignmentLoading(): React.JSX.Element {
  return <FormSkeleton label="กำลังโหลดรายชื่อผู้ป่วยที่ยังไม่มี อสม...." sections={2} />;
}
