import { Button } from "@/components/ui/button";

export type HospitalContentImageOrderItem = { key: string; src: string };

/** Ordered image thumbnails with move and remove controls; shared by the composer and the draft image manager. */
export function HospitalContentImageOrderList({
  disabled,
  items,
  onMove,
  onRemove,
}: {
  disabled: boolean;
  items: readonly HospitalContentImageOrderItem[];
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
}): React.JSX.Element {
  return (
    <ol className="mt-4 space-y-3">
      {items.map((item, index) => (
        <li className="flex min-w-0 flex-col gap-3 rounded-panel border border-border p-3 sm:flex-row sm:items-center" key={item.key}>
          {/* eslint-disable-next-line @next/next/no-img-element -- blob: preview or authorized per-user image route; the shared Next optimizer cache must not serve either */}
          <img alt={`ภาพประกอบ ภาพที่ ${index + 1}`} className="aspect-[4/3] w-full rounded-control bg-surface-muted object-contain sm:w-36" decoding="async" loading="lazy" src={item.src} />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <p className="mr-auto text-sm font-medium text-text">ภาพที่ {index + 1}</p>
            <Button aria-label={`เลื่อนภาพที่ ${index + 1} ขึ้น`} disabled={disabled || index === 0} onClick={() => onMove(index, -1)} size="compact" type="button" variant="secondary">ขึ้น</Button>
            <Button aria-label={`เลื่อนภาพที่ ${index + 1} ลง`} disabled={disabled || index === items.length - 1} onClick={() => onMove(index, 1)} size="compact" type="button" variant="secondary">ลง</Button>
            <Button aria-label={`ลบภาพที่ ${index + 1}`} disabled={disabled} onClick={() => onRemove(index)} size="compact" type="button" variant="ghost">ลบ</Button>
          </div>
        </li>
      ))}
    </ol>
  );
}
