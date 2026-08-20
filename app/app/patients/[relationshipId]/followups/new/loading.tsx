import { FormSkeleton } from "@/components/ui/loading-skeletons";

export default function NewFollowupLoading(): React.JSX.Element {
  return <FormSkeleton label="กำลังโหลดแบบฟอร์มติดตามผล..." sections={3} />;
}
