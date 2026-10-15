"use client";

import { Button } from "@/components/ui/button";
import { submitPreservingInput, useMutationActionState } from "@/components/ui/mutation-action-state";
import { UnknownOutcomeAlert } from "@/components/ui/unknown-outcome-alert";
import { HEALTH_HISTORY_FIELDS, currentBuddhistYear } from "@/modules/patient-hospital-profile/schemas/patient-health-history-schemas";
import { savePatientHealthHistoryAction, saveStaffPatientHospitalProfileAction, type HospitalPatientEditState } from "@/modules/patient-hospital-profile/transport/hospital-patient-edit-actions";

const control = "mt-2 min-h-11 w-full rounded-control border border-border-strong bg-surface px-3 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring";
const PROFILE_FIELDS = {
  phoneNumber: "เบอร์โทรศัพท์", addressText: "ที่อยู่แบบข้อความ", houseNumber: "บ้านเลขที่", villageNumber: "หมู่",
  villageName: "หมู่บ้าน", soi: "ซอย", road: "ถนน", province: "จังหวัด", district: "อำเภอ / เขต",
  subdistrict: "ตำบล / แขวง", postalCode: "รหัสไปรษณีย์", emergencyContactName: "ผู้ติดต่อฉุกเฉิน",
  emergencyContactPhone: "เบอร์ผู้ติดต่อฉุกเฉิน", emergencyContactRelationship: "ความสัมพันธ์กับผู้ป่วย",
  occupation: "อาชีพ", educationLevel: "การศึกษา",
} as const;

export function HospitalPatientEditForm({ relationshipId, version, health, values }: {
  relationshipId: string; version: number; health: boolean; values: Record<string, string | number | null>;
}): React.JSX.Element {
  const action = (health ? savePatientHealthHistoryAction : saveStaffPatientHospitalProfileAction).bind(null, relationshipId);
  const [state, formAction, pending, unknownOutcome] = useMutationActionState<HospitalPatientEditState, FormData>(action, { status: "IDLE", message: "" });
  return <form action={formAction} className="space-y-5" onSubmit={submitPreservingInput(formAction)}>
    <input type="hidden" name="expectedVersion" value={version} />
    <div className="grid gap-5 sm:grid-cols-2">
      {Object.entries(health ? HEALTH_HISTORY_FIELDS : PROFILE_FIELDS).map(([name, label]) => <div key={name}>
        <label htmlFor={name} className="text-sm font-semibold text-text">{label}</label>
        {health ? <select id={name} name={name} className={control} defaultValue={values[name] ?? "UNKNOWN"} disabled={pending || unknownOutcome}>
          <option value="UNKNOWN">ไม่ทราบ</option><option value="YES">มี</option><option value="NO">ไม่มี</option>
        </select> : <input id={name} name={name} className={control} defaultValue={values[name] ?? ""} disabled={pending || unknownOutcome}
          maxLength={name === "postalCode" ? 5 : name.includes("Phone") || name === "phoneNumber" ? 32 : name === "addressText" ? 2000 : 200} />}
        {name === "addressText" ? <p className="mt-2 text-sm text-text-muted">ใช้เมื่อไม่กรอกองค์ประกอบที่อยู่ หากกรอกบ้านเลขที่ ตำบล หรือองค์ประกอบอื่น ระบบจะแสดงที่อยู่จากช่องเหล่านั้น</p> : null}
      </div>)}
      {health ? <>
        <div><label htmlFor="otherConditions" className="text-sm font-semibold text-text">โรคอื่น ๆ ระบุ</label>
          <textarea id="otherConditions" name="otherConditions" className={control} maxLength={1000} defaultValue={values.otherConditions ?? ""} disabled={pending || unknownOutcome} /></div>
        <div><label htmlFor="diagnosisYear" className="text-sm font-semibold text-text">ปี พ.ศ. ที่ได้รับการวินิจฉัย</label>
          <input id="diagnosisYear" name="diagnosisYear" type="number" min={2400} max={currentBuddhistYear()} className={control} defaultValue={values.diagnosisYear ?? ""} disabled={pending || unknownOutcome} />
          <p className="mt-2 text-sm text-text-muted">เว้นว่างเมื่อไม่ทราบปี ญาติสายตรงหมายถึงบิดา มารดา พี่น้อง หรือบุตร</p></div>
      </> : null}
    </div>
    {state.message ? <p role={state.status === "ERROR" ? "alert" : "status"} className="text-sm text-text">{state.message}</p> : null}
    <UnknownOutcomeAlert active={unknownOutcome} />
    <Button disabled={unknownOutcome} loading={pending} type="submit">
      {pending ? "กำลังบันทึก…" : "บันทึกข้อมูล"}
    </Button>
  </form>;
}
