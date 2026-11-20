import Link from "next/link";

import { Panel } from "@/components/ui/panel";
import { RoundStateIcon } from "@/modules/patient-program-rounds/presentation/round-state-icon";
import type { ServiceProgress, ServiceProgressItem } from "../services/patient-service-progress-query-service";

export type ServicesHubTab = "rounds" | "followups";

/** The patient's services hub on one tab and Hospital; recording returns land here. */
export function serviceProgressHref(relationshipId: string, tab: ServicesHubTab = "rounds"): string {
  return `/app/personal/care?tab=${tab}&relationshipId=${encodeURIComponent(relationshipId)}`;
}

/** Patient-only destinations; the read-only caregiver card passes none and renders plain text. */
export type ServiceProgressLinks = {
  roundHref: (roundNumber: number) => string;
  followupsHref: string;
};

const linkClassName = "font-semibold text-brand-strong underline decoration-brand-soft underline-offset-4 hover:text-brand focus-visible:rounded-control focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";

function formatCompletedDate(value: Date): string {
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" }).format(value);
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
export function ServiceProgressCard({ progress, renderRecording, links }: {
  progress: ServiceProgress;
  renderRecording?: (item: ServiceProgressItem) => React.ReactNode;
  links?: ServiceProgressLinks;
}): React.JSX.Element {
  const round = progress.currentRound;
  const pastRounds = progress.rounds.filter((item) => item.state === "COMPLETED");
  const patientView = renderRecording !== undefined;
  return <article className="min-w-0 scroll-mt-6" id={`service-${progress.relationshipId}`} aria-labelledby={`service-heading-${progress.relationshipId}`}>
    <Panel>
      <h3 className="break-words text-lg font-semibold text-text" id={`service-heading-${progress.relationshipId}`}>{progress.hospitalName}</h3>
      <p className="mt-1 text-sm text-text-muted">{progress.stageLabel}</p>
      {progress.programId ? <>
        {round ? <ServiceRoundLine progress={progress} /> : null}
        <ol aria-label="ความคืบหน้ารายครั้ง" className="mt-4 flex flex-wrap gap-2">
          {progress.rounds.map((item) => {
            const content = <>
              <span aria-hidden="true" className="inline-flex items-center gap-1">
                <RoundStateIcon status={item.state === "COMPLETED" ? "DONE" : item.state === "CURRENT" ? "TODO" : "LOCKED"} />
                {item.number}
              </span>
              <span className="sr-only">ครั้งที่ {item.number} · {item.state === "COMPLETED" ? "เสร็จแล้ว" : item.state === "CURRENT" ? "ครั้งปัจจุบัน" : "ยังไม่เปิดให้บันทึก"}</span>
            </>;
            const current = item.state === "CURRENT" ? "step" : undefined;
            return <li key={item.number} aria-current={current}>
              {links && item.state !== "LOCKED" ? (
                <Link className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control border border-border-strong px-3 text-sm font-semibold text-text hover:border-action-primary hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" href={links.roundHref(item.number)}>
                  {content}
                </Link>
              ) : (
                <span className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-control border border-border px-3 text-sm text-text">{content}</span>
              )}
            </li>;
          })}
        </ol>
        {round ? <>
          <ItemList title={patientView ? "บันทึกด้วยตนเอง" : "ผู้ป่วยบันทึกเองได้"} items={round.selfRecordable} empty="ไม่มีรายการที่บันทึกเองได้ในขณะนี้" renderRecording={renderRecording} patientView={patientView} />
          <ItemList title="เจ้าหน้าที่/อสม. จะทำให้" items={round.staffWillDo} empty="ไม่มีรายการที่รอเจ้าหน้าที่/อสม." patientView={patientView} />
          <ItemList title="ทำแล้ว" items={round.done} empty="ยังไม่มีรายการที่ทำแล้วในครั้งนี้" patientView={patientView} />
          {round.plannedItems === 0 ? <p className="mt-4 text-sm text-text-muted">ยังไม่มีรายการในแผน เจ้าหน้าที่/อสม. จะเพิ่มรายการให้</p> : null}
          {links && round.number >= 3 && round.followupRecorded ? <p className="mt-4 text-sm text-text">
            ครั้งนี้บันทึกการติดตามแล้ว · <Link className={linkClassName} href={links.followupsHref}>ดูในแท็บการติดตาม</Link>
          </p> : null}
        </> : null}
        {links && pastRounds.length > 0 ? <section className="mt-6 min-w-0 border-t border-border pt-4">
          <h4 className="font-semibold text-text">ครั้งที่ผ่านมา</h4>
          <ul className="mt-1">
            {pastRounds.map((item) => <li key={item.number}>
              <Link className={`${linkClassName} inline-flex min-h-11 items-center`} href={links.roundHref(item.number)}>
                ครั้งที่ {item.number}{item.completedAt ? ` · เสร็จ ${formatCompletedDate(item.completedAt)}` : ""}
              </Link>
            </li>)}
          </ul>
        </section> : null}
      </> : <p className="mt-3 text-text">{progress.stage === "PROGRAM_COMPLETED" ? "โปรแกรมล่าสุดจบแล้ว" : "ยังไม่เริ่มโปรแกรม เจ้าหน้าที่/อสม. จะนัดหมายครั้งแรก"}</p>}
      {progress.nextAppointment !== undefined ? <p className="mt-6 border-t border-border pt-4 text-sm text-text-muted">
        {progress.nextAppointment ? <>นัดถัดไป · <time dateTime={progress.nextAppointment.scheduledAt.toISOString()}>{new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(progress.nextAppointment.scheduledAt)}</time></> : "ยังไม่มีนัด"}
      </p> : null}
    </Panel>
  </article>;
}
