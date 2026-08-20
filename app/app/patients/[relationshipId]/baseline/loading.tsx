import { FormSkeleton } from "@/components/ui/loading-skeletons";

export default function PatientBaselineLoading(): React.JSX.Element {
  return <FormSkeleton label="กำลังโหลดข้อมูลพื้นฐานผู้ป่วย..." sections={3} />;
}
