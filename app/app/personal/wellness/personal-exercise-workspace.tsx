"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import type { PersonalExerciseDto, PersonalExercisePage } from "@/modules/exercises/domain/personal-exercise";
import type { ExerciseActionState } from "@/modules/exercises/transport/action-state";
import { listPersonalExercisesAction } from "@/modules/exercises/transport/server-actions";
import { ExerciseEditor, ExerciseDeleteForm } from "./personal-exercise-controls";
import type { WellnessPrivateAuthority } from "./wellness-private-authority";

export function ExerciseReadback({ item }: { item: PersonalExerciseDto }): React.JSX.Element {
  // Display the civil truth directly; never format a carrier instant in browser TZ.
  return <div className="min-w-0 space-y-2"><p className="whitespace-pre-wrap break-words font-semibold">{item.activityName} · <time dateTime={item.occurredOn}>{item.occurredOn}</time></p>
    <p className="text-text-muted">{item.durationMinutes === null ? "ไม่ได้บันทึกระยะเวลา" : `${item.durationMinutes.toLocaleString("th-TH")} นาที`}</p>
    <p className="whitespace-pre-wrap break-words text-text-muted">{item.note ?? "ไม่ได้บันทึกเพิ่มเติม"}</p></div>;
}
export function PersonalExerciseWorkspace({ initialPage, today, initialNonce, authority }: { initialPage: PersonalExercisePage; today: string; initialNonce: string; authority: WellnessPrivateAuthority }): React.JSX.Element {
  const [page, setPage] = useState(initialPage);
  const [selected, setSelected] = useState<PersonalExerciseDto | undefined>();
  const [nonce, setNonce] = useState(initialNonce);
  const [feedback, setFeedback] = useState<ExerciseActionState>({ status: "IDLE" });
  const [blocked, setBlocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, startTransition] = useTransition();
  const generation = useRef(0);
  const active = useRef(true);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { editorHeading.current?.focus(); }, [selected]);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; generation.current += 1; };
  }, []);
  function clearPrivateState(): void {
    active.current = false;
    generation.current += 1;
    setPage({ items: [], nextCursor: null });
    setSelected(undefined);
    setNonce("");
    setFeedback({ status: "IDLE" });
    setBlocked(true);
  }
  function refresh(append = false): void {
    const captured = generation.current;
    const authorityGeneration = authority.captureGeneration();
    startTransition(async () => {
      const form = new FormData();
      if (append && page.nextCursor) form.set("cursor", page.nextCursor);
      let result: ExerciseActionState;
      try { result = await listPersonalExercisesAction(form); }
      catch { result = { status: "UNCONFIRMED", message: "ยังโหลดรายการไม่ได้ กรุณาลองใหม่" }; }
      if (!active.current || captured !== generation.current || !authority.isCurrent(authorityGeneration)) return;
      if (result.status === "DENIED") { authority.invalidate(); clearPrivateState(); return; }
      if (result.page) {
        const next = result.page;
        setPage((current) => ({ items: append ? [...new Map([...current.items, ...next.items].map((item) => [item.id, item])).values()] : next.items, nextCursor: next.nextCursor }));
        if (!append) { setSelected(undefined); setBlocked(false); setFeedback({ status: "IDLE" }); if (feedback.status === "SUCCESS") setNonce(crypto.randomUUID()); }
      } else {
        setFeedback(result);
      }
    });
  }
  function onResult(state: ExerciseActionState): void {
    if (!active.current || !authority.isActive()) return;
    if (state.status === "DENIED") { authority.invalidate(); clearPrivateState(); return; }
    setFeedback(state);
    if (state.result) {
      setBlocked(true);
      const result = state.result;
      if (result.outcome === "DELETED") { setPage((current) => ({ ...current, items: current.items.filter((item) => item.id !== result.entryId) })); setSelected(undefined); }
      else setPage((current) => ({ ...current, items: [result.item, ...current.items.filter((item) => item.id !== result.item.id)]
        .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)) }));
    } else if (selected && (state.status === "CONFLICT" || state.status === "UNCONFIRMED")) setBlocked(true);
  }
  const coordination = { authority, isActive: () => active.current && authority.isActive(), blocked: blocked || saving || pending, onResult, onPending: (value: boolean) => { if (active.current && authority.isActive()) setSaving(value); } };
  return <div className="space-y-6">
    <h2 className="text-2xl font-semibold">การออกกำลังกาย</h2>
    <p className="max-w-prose text-text-muted">บันทึกกิจกรรมที่คุณทำจริง เพื่อดูรายการส่วนตัวของคุณ</p>
    {feedback.message ? <div role="status"><Alert variant={feedback.status === "SUCCESS" ? "success" : "danger"}>{feedback.message}</Alert></div> : null}
    {feedback.result && "item" in feedback.result ? <section aria-label="ข้อมูลที่บันทึกแล้ว"><ExerciseReadback item={feedback.result.item} /></section> : null}
    <Panel><div className="space-y-4"><h3 ref={editorHeading} tabIndex={-1} className="text-xl font-semibold">{selected ? "แก้ไขบันทึกการออกกำลังกาย" : "บันทึกการออกกำลังกาย"}</h3>
      <ExerciseEditor key={selected ? `${selected.id}:${selected.updatedAt}` : nonce} item={selected} today={today} nonce={nonce} coordination={coordination} />
      {selected ? <ExerciseDeleteForm key={`${selected.id}:${selected.updatedAt}:delete`} item={selected} coordination={coordination} /> : null}
      <div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={saving || pending} onClick={() => refresh()}>โหลดรายการล่าสุด</Button>
        <Button variant="ghost" disabled={saving || pending} onClick={() => { setSelected(undefined); setBlocked(false); setFeedback({ status: "IDLE" }); setNonce(crypto.randomUUID()); }}>เริ่มบันทึกใหม่</Button></div>
    </div></Panel>
    <section aria-label="ประวัติการออกกำลังกาย" className="space-y-4"><h3 className="text-xl font-semibold">บันทึกการออกกำลังกายของฉัน</h3>
      {!page.items.length ? <p className="text-text-muted">ยังไม่มีบันทึกการออกกำลังกาย</p> : <ul className="divide-y divide-border">{page.items.map((item) => <li key={item.id} className="flex min-w-0 flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"><ExerciseReadback item={item} />
        <Button variant="secondary" disabled={saving || pending} onClick={() => { setSelected(item); setBlocked(false); setFeedback({ status: "IDLE" }); }}>แก้ไข / ลบ</Button></li>)}</ul>}
      {page.nextCursor ? <Button variant="secondary" loading={pending} disabled={saving} onClick={() => refresh(true)}>ดูรายการก่อนหน้า</Button> : null}
      {pending ? <p role="status">กำลังโหลดรายการ...</p> : null}
    </section>
  </div>;
}
