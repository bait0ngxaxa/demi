import { Panel } from "@/components/ui/panel";

export default function HospitalPatientAccessRequestsLoading(): React.JSX.Element {
  return (
    <div aria-busy="true" className="max-w-5xl animate-pulse space-y-4" role="status">
      <div className="h-8 w-72 rounded-control bg-surface-muted" />
      <div className="h-5 w-full max-w-xl rounded-control bg-surface-muted" />
      <Panel>
        <div className="h-20 rounded-control bg-surface-muted" />
      </Panel>
      <span className="sr-only">กำลังโหลดคำขอเปิดใช้งานผู้ป่วย</span>
    </div>
  );
}
