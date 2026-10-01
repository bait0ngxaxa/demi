import { Panel } from "@/components/ui/panel";

export default function PatientAccessRequestDetailLoading(): React.JSX.Element {
  return (
    <div aria-busy="true" className="max-w-4xl animate-pulse space-y-4" role="status">
      <div className="h-8 w-72 rounded-control bg-surface-muted" />
      <div className="h-5 w-full max-w-xl rounded-control bg-surface-muted" />
      <Panel>
        <div className="h-52 rounded-control bg-surface-muted" />
      </Panel>
      <span className="sr-only">กำลังโหลดรายละเอียดคำขอ</span>
    </div>
  );
}
