import { PageHeaderSkeleton, PanelSkeleton } from "@/components/ui/loading-skeletons";

export default function DelegatedAppointmentLoading(): React.JSX.Element {
  return <div className="max-w-4xl space-y-6" aria-busy="true"><PageHeaderSkeleton /><PanelSkeleton /></div>;
}
