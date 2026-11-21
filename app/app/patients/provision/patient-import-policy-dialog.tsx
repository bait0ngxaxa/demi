import Link from "next/link";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button, buttonClassName } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/modal-dialog";
import {
  PATIENT_IMPORT_FAILED_ROWS_REASON_HEADER,
  PATIENT_IMPORT_TEMPLATE_DATA_START_ROW,
  PATIENT_IMPORT_TEMPLATE_MAX_DATA_ROWS,
} from "@/modules/patient-provisioning/import/patient-import-template-contract";

type PatientImportPolicyDialogProps = {
  acknowledgement?: {
    exitHref: string;
    restoreFocus: () => void;
  };
  onClose: () => void;
};

export function PatientImportPolicyDialog({
  acknowledgement,
  onClose,
}: PatientImportPolicyDialogProps): React.JSX.Element {
  const [checked, setChecked] = useState(false);

  return (
    <ModalDialog
      className="sm:max-w-2xl"
      description="กรุณาอ่านข้อกำหนดก่อนเริ่มนำเข้าข้อมูล"
      dismissible={!acknowledgement}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {acknowledgement ? (
            <>
              <Link className={buttonClassName({ size: "compact", variant: "secondary" })} href={acknowledgement.exitHref}>
                กลับไปหน้าก่อนหน้า
              </Link>
              <Button disabled={!checked} onClick={onClose} size="compact">
                รับทราบและเริ่มนำเข้า
              </Button>
            </>
          ) : (
            <Button onClick={onClose} size="compact" variant="secondary">
              ปิดคำแนะนำ
            </Button>
          )}
        </div>
      }
      onClosed={acknowledgement?.restoreFocus}
      onRequestClose={onClose}
      size="fullscreen"
      title="ข้อควรรู้ก่อนนำเข้าผู้ป่วย"
    >
      <div className="space-y-4 text-base leading-6">
        <Alert className="flex items-start gap-2 font-semibold" role="note" variant="warning">
          <svg
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
            viewBox="0 0 24 24"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4.5M12 16h.01" />
          </svg>
          <p>ใช้ไฟล์ Excel ที่ดาวน์โหลดจากระบบ DEMI สำหรับโรงพยาบาลที่เลือกเท่านั้น</p>
        </Alert>

        <div className="space-y-1">
          <h3 className="font-semibold text-ink">สิ่งที่ห้ามแก้ไข</h3>
          <p>ห้ามเพิ่ม ลบ ย้าย หรือเปลี่ยนชื่อคอลัมน์ หัวตาราง ชื่อชีต หรือข้อมูลกำกับไฟล์ หากโครงสร้างไม่ถูกต้อง ระบบจะปฏิเสธไฟล์</p>
        </div>

        <div className="space-y-1">
          <h3 className="font-semibold text-ink">สิ่งที่ทำได้</h3>
          <p>กรอกและแก้ไขข้อมูลผู้ป่วยในแถวข้อมูล เริ่มตั้งแต่แถวที่ {PATIENT_IMPORT_TEMPLATE_DATA_START_ROW} โดยรักษารูปแบบไฟล์เดิม</p>
          <p>ไฟล์รายการที่นำเข้าไม่สำเร็จจากระบบ DEMI ใช้นำเข้าใหม่ได้ โดยคงคอลัมน์ “{PATIENT_IMPORT_FAILED_ROWS_REASON_HEADER}” ท้ายไฟล์ไว้</p>
        </div>

        <div className="space-y-1">
          <h3 className="font-semibold text-ink">วิธีนำเข้า 4 ขั้นตอน</h3>
          <ol className="list-decimal space-y-1 ps-5">
            <li>ดาวน์โหลดไฟล์ตัวอย่างล่าสุดสำหรับโรงพยาบาลที่เลือก</li>
            <li>กรอกข้อมูลผู้ป่วยในไฟล์ Excel โดยไม่แก้ไขโครงสร้าง</li>
            <li>อัปโหลดไฟล์และระบุวันที่ข้อมูลสุขภาพตั้งต้น (เมื่อมีข้อมูลดังกล่าว)</li>
            <li>ตรวจสอบรายการก่อนกดยืนยันนำเข้า</li>
          </ol>
        </div>

        <p className="text-sm text-muted">
          รองรับสูงสุด {PATIENT_IMPORT_TEMPLATE_MAX_DATA_ROWS} รายการต่อไฟล์ ขนาดไม่เกิน 5 MB ผู้ป่วยที่มีอยู่แล้วจะไม่ถูกแก้ไขข้อมูลผ่านการนำเข้าซ้ำ
        </p>

        {acknowledgement ? (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-border bg-surface-muted p-3 text-sm font-medium">
            <input
              checked={checked}
              className="size-5 shrink-0 accent-action-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              onChange={(event) => setChecked(event.currentTarget.checked)}
              type="checkbox"
            />
            <span>ฉันอ่านและเข้าใจข้อกำหนดการนำเข้าไฟล์ของระบบแล้ว</span>
          </label>
        ) : null}
      </div>
    </ModalDialog>
  );
}
