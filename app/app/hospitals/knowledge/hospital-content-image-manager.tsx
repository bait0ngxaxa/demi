"use client";

import { useState, type ChangeEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { optimizeEvidenceImage, getEvidenceImageOptimizationErrorMessage } from "@/modules/patient-evidence/client/patient-evidence-image-optimizer";
import { HOSPITAL_CONTENT_IMAGE_LIMIT } from "@/modules/hospital-content/domain/hospital-content";

function isImageIdResult(value: unknown): value is { imageId: string } {
  return typeof value === "object" && value !== null && "imageId" in value && typeof value.imageId === "string";
}

export function HospitalContentImageManager({ contentId, imageIds }: { contentId: string; imageIds: readonly string[] }): React.JSX.Element {
  const [images, setImages] = useState<string[]>([...imageIds]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    setError(null);
    setMessage(null);
    if (files.length === 0) return;
    if (files.length > HOSPITAL_CONTENT_IMAGE_LIMIT - images.length) {
      setError(`เพิ่มได้อีกไม่เกิน ${HOSPITAL_CONTENT_IMAGE_LIMIT - images.length} รูป`);
      return;
    }
    setBusy(true);
    const added: string[] = [];
    try {
      for (const file of files) {
        const optimized = await optimizeEvidenceImage(file);
        const body = new FormData();
        body.append("file", optimized, optimized.name);
        body.append("caption", crypto.randomUUID());
        const response = await fetch(`/api/hospital-content/${contentId}/images`, { method: "POST", body, cache: "no-store" });
        const result: unknown = await response.json().catch(() => null);
        if (!response.ok || !isImageIdResult(result)) throw new Error("อัปโหลดไม่สำเร็จ กรุณาตรวจสอบสิทธิ์หรือโหลดหน้าใหม่");
        added.push(result.imageId);
        setImages((current) => current.includes(result.imageId) ? current : [...current, result.imageId]);
      }
      setMessage(`เพิ่มรูปแล้ว ${added.length} รูป`);
    } catch (caught: unknown) {
      setError(caught instanceof Error && caught.message.startsWith("อัปโหลด") ? caught.message : getEvidenceImageOptimizationErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return <section aria-labelledby="hospital-content-images-heading" className="mt-6 border-t border-border pt-5">
    <h2 className="text-lg font-semibold text-text" id="hospital-content-images-heading">ภาพประกอบ</h2>
    <p className="mt-2 text-sm leading-6 text-text-muted">เพิ่มรูป JPEG, PNG หรือ WEBP ได้ไม่เกิน 5 รูป ระบบจะปรับขนาดก่อนจัดเก็บแบบส่วนตัว</p>
    {images.length > 0 ? <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
      {images.map((imageId, index) => <img alt={`ภาพประกอบเนื้อหา ภาพที่ ${index + 1}`} className="max-h-[28rem] w-full rounded-panel border border-border object-contain" decoding="async" key={imageId} loading="lazy" src={`/api/hospital-content/images/${imageId}`} />)}
    </div> : <p className="mt-3 text-sm text-text-muted">ยังไม่มีภาพประกอบ</p>}
    {images.length < HOSPITAL_CONTENT_IMAGE_LIMIT ? <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      <label className="text-sm font-medium text-text" htmlFor="hospital-content-image-files">เลือกรูปภาพ</label>
      <input accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" className="min-h-11 min-w-0 max-w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" disabled={busy} id="hospital-content-image-files" multiple onChange={(event) => void handleFiles(event)} type="file" />
      {busy ? <Button disabled loading type="button" variant="secondary">กำลังปรับขนาดและอัปโหลด...</Button> : null}
    </div> : <p className="mt-4 text-sm text-text-muted">เพิ่มรูปครบ 5 รูปแล้ว</p>}
    <div aria-live="polite" className="mt-3">
      {error ? <Alert variant="warning">{error}</Alert> : null}
      {message ? <Alert variant="success">{message}</Alert> : null}
    </div>
  </section>;
}
