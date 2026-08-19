"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { inputClassName } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";

type PatientEvidenceFormProps = {
  relationshipId: string;
};

type UploadFeedback =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

type UploadPayload = {
  error?: {
    message?: unknown;
  };
};

function isUploadPayload(value: unknown): value is UploadPayload {
  return typeof value === "object" && value !== null;
}

async function readUploadPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getUploadErrorMessage(payload: unknown): string {
  if (
    isUploadPayload(payload) &&
    payload.error &&
    typeof payload.error.message === "string" &&
    payload.error.message.trim()
  ) {
    return payload.error.message;
  }

  return "บันทึกหลักฐานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
}

export function PatientEvidenceForm({ relationshipId }: PatientEvidenceFormProps): React.JSX.Element {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<UploadFeedback>({ status: "idle" });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (pending) {
      return;
    }

    const form = formRef.current;
    if (!form) {
      setFeedback({ status: "error", message: "ไม่พบแบบฟอร์มอัปโหลด กรุณาลองใหม่อีกครั้ง" });
      return;
    }

    const fileInput = form.elements.namedItem("file");

    if (!(fileInput instanceof HTMLInputElement) || !fileInput.files?.[0]) {
      setFeedback({ status: "error", message: "กรุณาเลือกรูปหลักฐานก่อนบันทึก" });
      return;
    }

    setPending(true);
    setFeedback({ status: "idle" });

    try {
      const response = await fetch(
        `/app/patients/${encodeURIComponent(relationshipId)}/evidence/upload`,
        {
          body: new FormData(form),
          method: "POST",
        },
      );
      const payload = await readUploadPayload(response);

      if (!response.ok) {
        setFeedback({ status: "error", message: getUploadErrorMessage(payload) });
        return;
      }

      form.reset();
      setFeedback({ status: "success", message: "บันทึกหลักฐานเรียบร้อยแล้ว" });
      router.refresh();
    } catch {
      setFeedback({
        status: "error",
        message: "ไม่สามารถเชื่อมต่อเพื่อบันทึกหลักฐานได้ กรุณาลองใหม่",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel>
      <div id="new-evidence">
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-text">เพิ่มรูปหลักฐาน</h2>
        <p className="mt-2 text-sm leading-6 text-text-muted">
          รูปจะถูกเก็บเป็นหลักฐานภายใต้ความสัมพันธ์ผู้ป่วย–โรงพยาบาลนี้เท่านั้น
        </p>
      </div>

      <form className="mt-6 space-y-5" ref={formRef} onSubmit={handleSubmit}>
        <label className="block space-y-2 text-sm font-semibold text-text" htmlFor="patient-evidence-file">
          <span>รูปหลักฐาน</span>
          <input
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            capture="environment"
            className={inputClassName}
            disabled={pending}
            id="patient-evidence-file"
            name="file"
            required
            type="file"
          />
          <span className="text-xs font-normal leading-5 text-text-muted">
            JPEG, PNG หรือ WEBP · ไม่เกิน 5 MB
          </span>
        </label>

        <label className="block space-y-2 text-sm font-semibold text-text" htmlFor="patient-evidence-caption">
          <span>คำอธิบาย (ไม่บังคับ)</span>
          <textarea
            className={`${inputClassName} min-h-28 py-3`}
            disabled={pending}
            id="patient-evidence-caption"
            maxLength={500}
            name="caption"
            placeholder="เพิ่มคำอธิบายสั้น ๆ ได้ถ้าจำเป็น"
            rows={4}
          />
          <span className="text-xs font-normal leading-5 text-text-muted">ไม่เกิน 500 ตัวอักษร</span>
        </label>

        {feedback.status === "error" ? (
          <Alert variant="danger">{feedback.message}</Alert>
        ) : null}
        {feedback.status === "success" ? (
          <Alert variant="success">{feedback.message}</Alert>
        ) : null}
        {pending ? <Alert variant="info">กำลังอัปโหลดและบันทึกหลักฐาน…</Alert> : null}

        <Button disabled={pending} loading={pending} type="submit">
          {pending ? "กำลังบันทึก…" : "บันทึกหลักฐาน"}
        </Button>
      </form>
    </Panel>
  );
}
