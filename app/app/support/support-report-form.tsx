"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { notify } from "@/components/ui/notify";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { createSupportReportAction } from "@/modules/support/transport/server-actions";

type HospitalOption = { id: string; name: string; hospitalCode: string };
const useCommittedLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function SupportReportForm({ hospitals }: { hospitals: readonly HospitalOption[] }): React.JSX.Element {
  const [hospitalId, setHospitalId] = useState(hospitals[0]?.id ?? "");
  const [category, setCategory] = useState("BUG");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ variant: "success" | "warning"; text: string } | null>(null);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const draftRef = useRef({ category, message });
  const selectedHospitalId = hospitals.some((hospital) => hospital.id === hospitalId)
    ? hospitalId
    : hospitals[0]?.id ?? "";
  const selectedHospitalIdRef = useRef(selectedHospitalId);

  useCommittedLayoutEffect(() => {
    selectedHospitalIdRef.current = selectedHospitalId;
  }, [selectedHospitalId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (inFlightRef.current || unknownOutcome || selectedHospitalId === "") return;
    inFlightRef.current = true;
    const submittedHospitalId = selectedHospitalId;
    selectedHospitalIdRef.current = submittedHospitalId;
    const submittedDraft = { ...draftRef.current };
    setFeedback(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof createSupportReportAction>>;
      try {
        result = await createSupportReportAction({
          hospitalId: submittedHospitalId,
          category: submittedDraft.category,
          message: submittedDraft.message,
        });
      } catch {
        if (mountedRef.current) {
          if (selectedHospitalIdRef.current !== submittedHospitalId) {
            setFeedback({ variant: "warning", text: "คำขอที่ส่งก่อนเปลี่ยนโรงพยาบาลยังยืนยันผลไม่ได้" });
          }
          setUnknownOutcome(true);
        }
        return;
      }
      if (!mountedRef.current) return;

      if (selectedHospitalIdRef.current !== submittedHospitalId) {
        if (result.status === "IDLE" || (result.status === "ERROR" && result.code === "UNAVAILABLE")) {
          setFeedback({ variant: "warning", text: "คำขอที่ส่งก่อนเปลี่ยนโรงพยาบาลยังยืนยันผลไม่ได้" });
          setUnknownOutcome(true);
        } else {
          inFlightRef.current = false;
        }
        return;
      }

      if (result.status === "SUCCESS") {
        inFlightRef.current = false;
        if (draftRef.current.category === submittedDraft.category && draftRef.current.message === submittedDraft.message) {
          draftRef.current = { ...draftRef.current, message: "" };
          setMessage("");
        }
        setFeedback({ variant: "success", text: "ส่งรายงานแล้ว เจ้าของโรงพยาบาลจะตรวจสอบ" });
        notify.success("ส่งรายงานแล้ว");
      } else if (result.status === "ERROR") {
        if (result.code === "UNAVAILABLE") {
          setUnknownOutcome(true);
          return;
        }
        inFlightRef.current = false;
        setFeedback({ variant: "warning", text: result.message });
        if (result.code === "RATE_LIMIT") notify.warning("วันนี้ส่งรายงานครบจำนวนแล้ว");
        else if (result.code === "CONFLICT") notify.warning("ข้อมูลเปลี่ยนแปลงแล้ว โปรดตรวจสอบก่อนดำเนินการต่อ");
        else if (result.code === "FORBIDDEN") notify.error("ไม่มีสิทธิ์ส่งรายงานไปยังโรงพยาบาลนี้");
      } else {
        setUnknownOutcome(true);
      }
    });
  }

  function changeHospital(value: string): void {
    if (inFlightRef.current || unknownOutcome) return;
    selectedHospitalIdRef.current = value;
    setHospitalId(value);
    setFeedback(null);
  }

  function changeCategory(value: string): void {
    draftRef.current = { ...draftRef.current, category: value };
    setCategory(value);
  }

  function changeMessage(value: string): void {
    draftRef.current = { ...draftRef.current, message: value };
    setMessage(value);
  }

  return <form className="max-w-2xl space-y-5" onSubmit={submit}>
    {hospitals.length > 1 ? <div><label className="mb-2 block text-sm font-medium text-text" htmlFor="support-hospital">โรงพยาบาล</label><select className="min-h-12 w-full rounded-control border border-border-strong bg-surface px-4 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" disabled={pending || unknownOutcome} id="support-hospital" onChange={(event) => changeHospital(event.currentTarget.value)} value={selectedHospitalId}>{hospitals.map((hospital) => <option key={hospital.id} value={hospital.id}>{hospital.name}</option>)}</select></div> : <input name="hospitalId" type="hidden" value={selectedHospitalId} />}
    <div><label className="mb-2 block text-sm font-medium text-text" htmlFor="support-category">หมวดหมู่</label><select className="min-h-12 w-full rounded-control border border-border-strong bg-surface px-4 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" id="support-category" onChange={(event) => changeCategory(event.currentTarget.value)} value={category}><option value="BUG">พบข้อผิดพลาด</option><option value="ACCESS">เข้าใช้งานไม่ได้</option><option value="CONTENT">เนื้อหาหรือข้อมูล</option><option value="OTHER">อื่น ๆ</option></select></div>
    <div><label className="mb-2 block text-sm font-medium text-text" htmlFor="support-message">รายละเอียดปัญหา</label><textarea className="min-h-40 w-full rounded-control border border-border-strong bg-surface px-4 py-3 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" id="support-message" maxLength={1_000} onChange={(event) => changeMessage(event.currentTarget.value)} required value={message} /><p className="mt-1 text-right text-sm text-text-muted">{message.length}/1,000</p></div>
    <Alert variant="warning">โปรดอย่าระบุข้อมูลสุขภาพ ชื่อผู้ป่วย เลขประจำตัว หรือข้อมูลส่วนบุคคลที่ละเอียดอ่อนในรายงานนี้</Alert>
    {feedback ? <Alert variant={feedback.variant}>{feedback.text}</Alert> : null}
    <UnknownOutcomeAlert active={unknownOutcome} recovery={{ kind: "note", message: "ระบบยังยืนยันผลการส่งรายงานในโรงพยาบาลที่เลือกขณะส่งไม่ได้", note: "รายงานปัญหาไม่มีรหัสป้องกันการส่งซ้ำ โปรดตรวจสอบกับเจ้าของโรงพยาบาลก่อนส่งคำขออีกครั้ง" }} />
    <Button disabled={pending || unknownOutcome || hospitals.length === 0} loading={pending} type="submit">ส่งรายงานปัญหา</Button>
  </form>;
}
