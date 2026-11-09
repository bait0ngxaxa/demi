/** Compact, read-only presentation for the fields exposed by personal and shared medication summaries. */
export function MedicationSummaryItem({ medicationName, times, instructionText }: {
  medicationName: string;
  times: readonly string[];
  /** Omit when the summary projection does not expose patient-entered supporting text. */
  instructionText?: string | null;
}): React.JSX.Element {
  return <li className="min-w-0 py-3 first:pt-0 last:pb-0">
    <p className="break-words font-semibold text-text">{medicationName}</p>
    {instructionText !== undefined ? <div className="mt-2 min-w-0">
      <p className="text-sm text-text-muted">ข้อความประกอบที่คุณบันทึก</p>
      <p className={`mt-1 break-words whitespace-pre-wrap leading-relaxed ${instructionText ? "text-text" : "text-text-muted"}`}>
        {instructionText || "ยังไม่ได้บันทึกข้อความประกอบ"}
      </p>
    </div> : null}
    <div className="mt-3 min-w-0">
      <p className="text-sm text-text-muted">เวลาที่ต้องการติดตามใน DEMI</p>
      {times.length > 0 ? <ul aria-label={`เวลาที่ต้องการติดตามใน DEMI สำหรับ ${medicationName}`} className="mt-1.5 flex min-w-0 flex-wrap gap-2">
        {times.map((time) => <li className="rounded-control border border-border bg-surface-muted px-3 py-1.5 text-sm font-semibold tabular-nums text-text" key={time}>
          <time dateTime={time}>{time}</time>
        </li>)}
      </ul> : <p className="mt-1 text-sm text-text-muted">ยังไม่ได้บันทึกเวลา</p>}
    </div>
  </li>;
}
