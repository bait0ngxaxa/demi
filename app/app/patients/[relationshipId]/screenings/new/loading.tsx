import { FormSkeleton } from "@/components/ui/loading-skeletons";

export default function NewScreeningLoading(): React.JSX.Element {
  return <FormSkeleton label="กำลังโหลดแบบประเมิน..." sections={3} />;
}
