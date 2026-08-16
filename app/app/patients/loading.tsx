export default function PatientDirectoryLoading(): React.JSX.Element {
  return (
    <div aria-busy="true" aria-live="polite" className="max-w-6xl">
      <div className="border-b border-border pb-7">
        <div className="h-10 w-56 animate-pulse rounded-control bg-border" />
        <p className="mt-4 text-sm text-text-muted">กำลังโหลดรายชื่อผู้ป่วย...</p>
      </div>
      <div className="space-y-6 pt-8">
        <div className="h-28 animate-pulse rounded-panel border border-border bg-surface" />
        <div className="h-48 animate-pulse rounded-panel border border-border bg-surface" />
        <div className="h-64 animate-pulse rounded-panel border border-border bg-surface" />
      </div>
    </div>
  );
}
