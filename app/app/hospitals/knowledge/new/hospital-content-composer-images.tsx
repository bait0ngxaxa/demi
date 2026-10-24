"use client";

import { useRef, useState, type ChangeEvent } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { HOSPITAL_CONTENT_IMAGE_LIMIT } from "@/modules/hospital-content/domain/hospital-content";
import { getEvidenceImageOptimizationErrorMessage, optimizeEvidenceImage } from "@/modules/patient-evidence/client/patient-evidence-image-optimizer";

import { HospitalContentImageOrderList } from "../hospital-content-image-order-list";

/** An optimized image waiting to be stored; `nonce` stays with the file through reordering so an upload replay is exact. */
export type ComposerImage = { key: string; nonce: string; file: File; previewUrl: string };

export function HospitalContentComposerImages({
  disabled,
  images,
  onAdd,
  onMove,
  onRemove,
}: {
  disabled: boolean;
  images: readonly ComposerImage[];
  onAdd: (added: ComposerImage[]) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
}): React.JSX.Element {
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const remaining = HOSPITAL_CONTENT_IMAGE_LIMIT - images.length;

  async function handleFiles(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    setError(null);
    if (files.length === 0 || busyRef.current) return;
    if (files.length > remaining) {
      setError(`เพิ่มได้อีกไม่เกิน ${remaining} รูป`);
      return;
    }
    busyRef.current = true;
    setOptimizing(true);
    const added: ComposerImage[] = [];
    try {
      for (const file of files) {
        const optimized = await optimizeEvidenceImage(file);
        added.push({ key: crypto.randomUUID(), nonce: crypto.randomUUID(), file: optimized, previewUrl: URL.createObjectURL(optimized) });
      }
      onAdd(added);
    } catch (caught: unknown) {
      for (const image of added) URL.revokeObjectURL(image.previewUrl);
      setError(getEvidenceImageOptimizationErrorMessage(caught));
    } finally {
      busyRef.current = false;
      setOptimizing(false);
    }
  }

  return (
    <section aria-labelledby="hospital-content-composer-images-heading" className="border-t border-border pt-5">
      <h3 className="text-base font-semibold text-text" id="hospital-content-composer-images-heading">ภาพประกอบ (ไม่บังคับ)</h3>
      <p className="mt-1 text-sm leading-6 text-text-muted">เพิ่มรูป JPEG, PNG หรือ WEBP ได้ไม่เกิน {HOSPITAL_CONTENT_IMAGE_LIMIT} รูป ระบบจะปรับขนาดก่อนอัปโหลด ลำดับที่เห็นคือลำดับที่ผู้อ่านจะเห็น</p>
      {images.length > 0 ? (
        <HospitalContentImageOrderList
          disabled={disabled}
          items={images.map((image) => ({ key: image.key, src: image.previewUrl }))}
          onMove={onMove}
          onRemove={onRemove}
        />
      ) : null}
      {remaining > 0 ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="text-sm font-medium text-text" htmlFor="hospital-content-composer-image-files">เลือกรูปภาพ</label>
          <input
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            className="min-h-11 min-w-0 max-w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring"
            disabled={disabled || optimizing}
            id="hospital-content-composer-image-files"
            multiple
            onChange={(event) => void handleFiles(event)}
            type="file"
          />
          {optimizing ? <Button disabled loading type="button" variant="secondary">กำลังปรับขนาดรูป...</Button> : null}
        </div>
      ) : (
        <p className="mt-4 text-sm text-text-muted">เพิ่มรูปครบ {HOSPITAL_CONTENT_IMAGE_LIMIT} รูปแล้ว</p>
      )}
      {error ? <Alert className="mt-3" variant="warning">{error}</Alert> : null}
    </section>
  );
}
