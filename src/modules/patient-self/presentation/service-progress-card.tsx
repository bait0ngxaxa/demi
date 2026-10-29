import { Panel } from "@/components/ui/panel";
import type { ServiceProgress, ServiceProgressItem } from "../services/patient-service-progress-query-service";

export function serviceProgressHref(relationshipId: string): string {
  return `/app/personal/care#service-${encodeURIComponent(relationshipId)}`;
}

export function ServiceRoundLine({ progress }: { progress: ServiceProgress }): React.JSX.Element {
  const round = progress.currentRound;
  return <p className="mt-2 text-text">{round
    ? `ครั้งที่ ${round.number} · ทำแล้ว ${round.doneItems}/${round.plannedItems} รายการ`
    : progress.stageLabel}</p>;
}

function ItemList({ title, items, empty, renderRecording, patientView }: {
  title: string;
  items: ServiceProgressItem[];
  empty: string;
  renderRecording?: (item: ServiceProgressItem) => React.ReactNode;
  patientView: boolean;
}): React.JSX.Element {
  return <section className="mt-6 min-w-0">
    <h4 className="font-semibold text-text">{title}</h4>
    {items.length === 0 ? <p className="mt-2 text-sm text-text-muted">{empty}</p> : (
      <ul className="mt-2 divide-y divide-border">
        {items.map((item, index) => <li className="min-w-0 break-words py-3" key={item.planItemId ?? index}>
          <p className="text-text">{item.label}</p>
          {item.byPatient ? <p className="mt-1 text-sm text-text-muted">{patientView ? "คุณบันทึกแล้ว" : "ผู้ป่วยบันทึกเอง"}</p> : null}
          {renderRecording?.(item)}
        </li>)}
      </ul>
    )}
  </section>;
}

/** Read-only by default. Only the SELF server view can supply existing FR-4 forms. */
export function ServiceProgressCard({ progress, renderRecording }: {
  progress: ServiceProgress;
  renderRecording?: (item: ServiceProgressItem) => React.ReactNode;
}): React.JSX.Element {
  const round = progress.currentRound;
  const patientView = renderRecording !== undefined;
  return <article className="min-w-0 scroll-mt-6" id={`service-${progress.relationshipId}`} aria-labelledby={`service-heading-${progress.relationshipId}`}>
    <Panel>
      <h3 className="break-words text-lg font-semibold text-text" id={`service-heading-${progress.relationshipId}`}>{progress.hospitalName}</h3>
      <p className="mt-1 text-sm text-text-muted">{progress.stageLabel}</p>
      {progress.programId ? <>
        {round ? <ServiceRoundLine progress={progress} /> : null}
        <ol aria-label="ความคืบหน้ารายครั้ง" className="mt-4 flex flex-wrap gap-2">
          {progress.rounds.map((item) => <li key={item.number} className="rounded-control border border-border px-3 py-2 text-sm text-text" aria-current={item.state === "CURRENT" ? "step" : undefined}>
            <span aria-hidden="true">{item.state === "COMPLETED" ? "✓" : item.state === "CURRENT" ? "◐" : "🔒"} {item.number}</span>
            <span className="sr-only">ครั้งที่ {item.number} · {item.state === "COMPLETED" ? "เสร็จแล้ว" : item.state === "CURRENT" ? "ครั้งปัจจุบัน" : "ยังไม่เปิดให้บันทึก"}</span>
          </li>)}
        </ol>
        {round ? <>
          <ItemList title={patientView ? "บันทึกด้วยตนเอง" : "ผู้ป่วยบันทึกเองได้"} items={round.selfRecordable} empty="ไม่มีรายการที่บันทึกเองได้ในขณะนี้" renderRecording={renderRecording} patientView={patientView} />
          <ItemList title="เจ้าหน้าที่/อสม. จะทำให้" items={round.staffWillDo} empty="ไม่มีรายการที่รอเจ้าหน้าที่/อสม." patientView={patientView} />
          <ItemList title="ทำแล้ว" items={round.done} empty="ยังไม่มีรายการที่ทำแล้วในครั้งนี้" patientView={patientView} />
          {round.plannedItems === 0 ? <p className="mt-4 text-sm text-text-muted">ยังไม่มีรายการในแผน เจ้าหน้าที่/อสม. จะเพิ่มรายการให้</p> : null}
        </> : null}
      </> : <p className="mt-3 text-text">{progress.stage === "PROGRAM_COMPLETED" ? "โปรแกรมล่าสุดจบแล้ว" : "ยังไม่เริ่มโปรแกรม เจ้าหน้าที่/อสม. จะนัดหมายครั้งแรก"}</p>}
      {progress.nextAppointment !== undefined ? <p className="mt-6 border-t border-border pt-4 text-sm text-text-muted">
        {progress.nextAppointment ? <>นัดถัดไป · <time dateTime={progress.nextAppointment.scheduledAt.toISOString()}>{new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(progress.nextAppointment.scheduledAt)}</time></> : "ยังไม่มีนัด"}
      </p> : null}
    </Panel>
  </article>;
}
