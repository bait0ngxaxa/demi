import { FormSkeleton } from "@/components/ui/loading-skeletons";

export default function RescheduleAppointmentLoading(): React.JSX.Element {
  return <FormSkeleton label="กำลังโหลดแบบฟอร์มเปลี่ยนเวลานัดหมาย..." sections={2} />;
}
