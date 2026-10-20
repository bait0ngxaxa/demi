import Link from "next/link";

import { Alert } from "@/components/ui/alert";
import { buttonClassName } from "@/components/ui/button";

/** Programs are opened from a Patient's page, reached through the Patient directory. */
export const PROGRAM_ENTRY_HREF = "/app/patients";

/**
 * P1 Part D: what the Excel file will contain, from the same cohort and summary query the export uses, so an
 * empty workbook is never a surprise. Display only; export authorization and fields are unchanged.
 */
export function ExportPreview({
  hospitalName,
  programRows,
  relationshipsWithoutProgram,
  programEntryHref,
}: {
  hospitalName: string;
  programRows: number;
  relationshipsWithoutProgram: number;
  /** Where staff open a Program; omitted for audiences that cannot open one. */
  programEntryHref?: string;
}): React.JSX.Element {
  return (
    <div className="min-w-0 rounded-panel border border-border bg-surface p-4 sm:p-5">
      <h2 className="font-semibold text-text">ไฟล์ Excel ที่จะส่งออก</h2>
      <p className="mt-1 break-words text-sm text-text-muted">โรงพยาบาล: {hospitalName}</p>
      <dl className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-sm text-text-muted">แถวข้อมูลในไฟล์ (หนึ่งแถวต่อหนึ่ง Program)</dt>
          <dd className="mt-1 text-xl font-semibold text-text">{programRows.toLocaleString("th-TH")} Program</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-sm text-text-muted">ผู้ป่วยที่ยังไม่มี Program (นับในหัวรายงาน ไม่มีแถวในไฟล์)</dt>
          <dd className="mt-1 text-xl font-semibold text-text">{relationshipsWithoutProgram.toLocaleString("th-TH")} ราย</dd>
        </div>
      </dl>
      {programRows === 0 ? (
        <Alert className="mt-4" variant="warning">
          <p>
            ไฟล์นี้จะมีเฉพาะหัวรายงานและยังไม่มีแถวข้อมูล เพราะรายงานแสดงหนึ่งแถวต่อหนึ่ง Program
            และโรงพยาบาลนี้ยังไม่มี Program ที่กำลังดำเนินหรือสิ้นสุดแล้ว แบบประเมินหรือการติดตามผลที่บันทึกนอก Program
            จะไม่อยู่ในรายงานจนกว่าจะบันทึกในครั้งที่ของ Program
          </p>
          {programEntryHref ? (
            <Link className={buttonClassName({ variant: "secondary", size: "compact", className: "mt-3" })} href={programEntryHref} prefetch={false}>
              เปิด Program จากหน้าข้อมูลผู้ป่วย
            </Link>
          ) : null}
        </Alert>
      ) : null}
    </div>
  );
}
