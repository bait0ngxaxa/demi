/**
 * Degraded indicator state: navigation stays usable, and the absence of dots is not presented as a verified empty
 * queue. Deliberately quiet; destination pages still load and authorize their own queues.
 */
export function PendingActionsUnavailableNotice(): React.JSX.Element {
  return (
    <p className="mb-6 flex items-start gap-2 text-sm leading-6 text-text-muted" role="status">
      <svg
        aria-hidden="true"
        className="mt-1 size-4 shrink-0 text-text-subtle"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        viewBox="0 0 24 24"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4.5M12 16h.01" />
      </svg>
      <span>ไม่สามารถตรวจสอบงานที่รอดำเนินการได้ในขณะนี้ เมนูจึงไม่แสดงจุดแจ้งงาน แต่ยังเปิดใช้งานได้ตามปกติ</span>
    </p>
  );
}
