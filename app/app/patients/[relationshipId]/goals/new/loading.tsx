import { FormSkeleton } from "@/components/ui/loading-skeletons";

export default function NewGoalPlanLoading(): React.JSX.Element {
  return <FormSkeleton label="กำลังโหลดแบบฟอร์มแผนเป้าหมายและกิจกรรม..." sections={3} />;
}
