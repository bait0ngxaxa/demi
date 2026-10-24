"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { notify } from "@/components/ui/notify";
import { optimizeEvidenceImage, getEvidenceImageOptimizationErrorMessage } from "@/modules/patient-evidence/client/patient-evidence-image-optimizer";
import { HOSPITAL_CONTENT_IMAGE_LIMIT } from "@/modules/hospital-content/domain/hospital-content";
import type { HospitalContentImagesActionState } from "@/modules/hospital-content/transport/action-state";
import {
  readHospitalContentCurrentAction,
  removeHospitalContentImageAction,
  reorderHospitalContentImagesAction,
} from "@/modules/hospital-content/transport/server-actions";
import { HospitalContentImageOrderList } from "./hospital-content-image-order-list";

function isImageIdResult(value: unknown): value is { imageId: string } {
  return typeof value === "object" && value !== null && "imageId" in value && typeof value.imageId === "string";
}

/** The request may have been stored even though no usable answer arrived (lost connection, server error). */
class UploadOutcomeUnknownError extends Error {}

const changeOutcomeUnknownMessage = "ระบบยังยืนยันผลการเปลี่ยนรูปไม่ได้ แสดงรายการรูปล่าสุดจากระบบให้แล้ว กรุณาตรวจสอบก่อนทำรายการต่อ";

const uploadOutcomeUnknownMessage =
  "ระบบยังยืนยันผลการอัปโหลดรูปไม่ได้ รูปที่ยืนยันแล้วยังอยู่ในรายการ กรุณาตรวจสอบรายการภาพก่อนอัปโหลดซ้ำ";

export function HospitalContentImageManager({ contentId, imageIds }: { contentId: string; imageIds: readonly string[] }): React.JSX.Element {
  const [images, setImages] = useState<string[]>([...imageIds]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removeIndex, setRemoveIndex] = useState<number | null>(null);
  const mountedRef = useRef(false);
  const uploadingRef = useRef(false);
  const contentIdRef = useRef(contentId);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    contentIdRef.current = contentId;
  }, [contentId]);

  /** Remove/reorder are one request each; whatever the answer, the shown list ends up matching the stored one. */
  async function changeImages(request: () => Promise<HospitalContentImagesActionState>): Promise<void> {
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    const submittedContentId = contentId;
    try {
      let result: HospitalContentImagesActionState | null = null;
      try { result = await request(); } catch { result = null; }
      if (!mountedRef.current || contentIdRef.current !== submittedContentId) return;
      if (result?.status === "SUCCESS") {
        setImages(result.imageIds);
        return;
      }
      if (result?.status === "ERROR" && result.code === "VALIDATION") setError(result.message);
      else if (result?.status === "ERROR" && (result.code === "FORBIDDEN" || result.code === "NOT_FOUND")) setError("ไม่สามารถจัดการรูปของรายการนี้ได้ สิทธิ์หรือสถานะอาจเปลี่ยนแปลงแล้ว");
      else setError(changeOutcomeUnknownMessage);
      const current = await readHospitalContentCurrentAction(submittedContentId).catch(() => null);
      if (current?.status === "SUCCESS" && mountedRef.current && contentIdRef.current === submittedContentId) setImages([...current.content.imageIds]);
    } finally {
      uploadingRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }

  function moveImage(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target] as string, next[index] as string];
    void changeImages(() => reorderHospitalContentImagesAction({ contentId, imageIds: next }));
  }

  function confirmRemove(): void {
    const imageId = removeIndex === null ? undefined : images[removeIndex];
    setRemoveIndex(null);
    if (imageId) void changeImages(() => removeHospitalContentImageAction({ contentId, imageId }));
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    setError(null);
    setMessage(null);
    if (files.length === 0 || uploadingRef.current) return;
    if (files.length > HOSPITAL_CONTENT_IMAGE_LIMIT - images.length) {
      setError(`เพิ่มได้อีกไม่เกิน ${HOSPITAL_CONTENT_IMAGE_LIMIT - images.length} รูป`);
      return;
    }
    uploadingRef.current = true;
    setBusy(true);
    const submittedContentId = contentId;
    const added: string[] = [];
    // Images are stored one request at a time, so a failure part-way leaves the earlier ones saved.
    const announce = (notice: () => void): void => {
      if (mountedRef.current && contentIdRef.current === submittedContentId) notice();
    };
    try {
      for (const file of files) {
        const optimized = await optimizeEvidenceImage(file);
        const body = new FormData();
        body.append("file", optimized, optimized.name);
        body.append("caption", crypto.randomUUID());
        let response: Response;
        try {
          response = await fetch(`/api/hospital-content/${submittedContentId}/images`, { method: "POST", body, cache: "no-store" });
        } catch {
          throw new UploadOutcomeUnknownError();
        }
        const result: unknown = await response.json().catch(() => null);
        if (response.ok && isImageIdResult(result)) {
          added.push(result.imageId);
          setImages((current) => current.includes(result.imageId) ? current : [...current, result.imageId]);
          continue;
        }
        if (response.ok || response.status >= 500) throw new UploadOutcomeUnknownError();
        throw new Error("อัปโหลดไม่สำเร็จ กรุณาตรวจสอบสิทธิ์หรือโหลดหน้าใหม่");
      }
      setMessage(`เพิ่มรูปแล้ว ${added.length} รูป`);
      announce(() => notify.success("เพิ่มภาพประกอบแล้ว"));
    } catch (caught: unknown) {
      setError(
        caught instanceof UploadOutcomeUnknownError
          ? uploadOutcomeUnknownMessage
          : caught instanceof Error && caught.message.startsWith("อัปโหลด")
            ? caught.message
            : getEvidenceImageOptimizationErrorMessage(caught),
      );
      if (added.length > 0) {
        setMessage(`เพิ่มรูปแล้ว ${added.length} รูป`);
        announce(() => notify.warning("อัปโหลดได้บางรูป กรุณาตรวจสอบรายการภาพ"));
      }
    } finally {
      uploadingRef.current = false;
      setBusy(false);
    }
  }

  return <section aria-labelledby="hospital-content-images-heading" className="mt-6 border-t border-border pt-5">
    <h2 className="text-lg font-semibold text-text" id="hospital-content-images-heading">ภาพประกอบ</h2>
    <p className="mt-2 text-sm leading-6 text-text-muted">เพิ่มรูป JPEG, PNG หรือ WEBP ได้ไม่เกิน {HOSPITAL_CONTENT_IMAGE_LIMIT} รูป ระบบจะปรับขนาดก่อนจัดเก็บแบบส่วนตัว ลำดับที่เห็นคือลำดับที่ผู้อ่านจะเห็น</p>
    {images.length > HOSPITAL_CONTENT_IMAGE_LIMIT ? <Alert className="mt-3" variant="warning">ฉบับร่างนี้มี {images.length} รูป เกินกำหนด {HOSPITAL_CONTENT_IMAGE_LIMIT} รูป กรุณาลบรูปที่เกินก่อนเผยแพร่หรือจัดเรียง</Alert> : null}
    {images.length > 0 ? <HospitalContentImageOrderList
      disabled={busy}
      items={images.map((imageId) => ({ key: imageId, src: `/api/hospital-content/images/${imageId}` }))}
      onMove={(index, direction) => { if (images.length <= HOSPITAL_CONTENT_IMAGE_LIMIT) moveImage(index, direction); }}
      onRemove={setRemoveIndex}
    /> : <p className="mt-3 text-sm text-text-muted">ยังไม่มีภาพประกอบ</p>}
    {images.length < HOSPITAL_CONTENT_IMAGE_LIMIT ? <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      <label className="text-sm font-medium text-text" htmlFor="hospital-content-image-files">เลือกรูปภาพ</label>
      <input accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" className="min-h-11 min-w-0 max-w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-sm text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring" disabled={busy} id="hospital-content-image-files" multiple onChange={(event) => void handleFiles(event)} type="file" />
      {busy ? <Button disabled loading type="button" variant="secondary">กำลังปรับขนาดและอัปโหลด...</Button> : null}
    </div> : <p className="mt-4 text-sm text-text-muted">เพิ่มรูปครบ {HOSPITAL_CONTENT_IMAGE_LIMIT} รูปแล้ว</p>}
    {/* Each Alert carries its own live role; the count is set only together with a Toast, which announces it. */}
    <div className="mt-3">
      {error ? <Alert variant="warning">{error}</Alert> : null}
      {message ? <Alert role="none" variant="success">{message}</Alert> : null}
    </div>
    <ConfirmDialog
      confirmLabel="ลบรูป"
      confirmVariant="destructive"
      description="รูปนี้จะถูกลบออกจากฉบับร่างและไม่สามารถกู้คืนได้ ต้องอัปโหลดใหม่หากต้องการใช้อีก"
      onCancel={() => setRemoveIndex(null)}
      onConfirm={confirmRemove}
      open={removeIndex !== null}
      title={`ลบภาพที่ ${(removeIndex ?? 0) + 1} หรือไม่`}
    />
  </section>;
}
