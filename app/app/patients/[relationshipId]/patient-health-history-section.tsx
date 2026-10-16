import type { ActorContext } from "@/modules/auth/types/actor-context";
import { getPatientHealthHistory, getPatientHealthInformation } from "@/modules/patient-hospital-profile/services/patient-health-history-service";
import { HEALTH_HISTORY_FIELDS } from "@/modules/patient-hospital-profile/schemas/patient-health-history-schemas";
import { ageInFullYears } from "@/shared/time/age";

/** `showAge` is false where the page already shows the age elsewhere (round vitals header, D10). */
export async function PatientHealthHistorySection({ actor, relationshipId, showAge = true }: { actor: ActorContext; relationshipId: string; showAge?: boolean }): Promise<React.JSX.Element> {
  const { history, dateOfBirth } = showAge
    ? await getPatientHealthInformation(actor, relationshipId)
    : { history: await getPatientHealthHistory(actor, relationshipId), dateOfBirth: null };
  const age = dateOfBirth ? ageInFullYears(dateOfBirth, new Date()) : null;
  const labels = { YES: "มี", NO: "ไม่มี", UNKNOWN: "ไม่ทราบ" };
  return <section className="mt-6 border-t border-border pt-5" aria-label="ประวัติสุขภาพ">
    <h2 className="text-lg font-semibold text-text">ข้อมูลสุขภาพ</h2>
    {age !== null ? <p className="mt-2 text-text"><span className="text-sm text-text-muted">อายุ</span> {age} ปี</p> : null}
    {!history ? <p className="mt-2 text-text-muted">โรงพยาบาลยังไม่ได้บันทึกประวัติสุขภาพ</p> : <>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {Object.entries(HEALTH_HISTORY_FIELDS).map(([key, label]) => <div key={key}><dt className="text-sm text-text-muted">{label}</dt><dd className="text-text">{labels[history[key as keyof typeof HEALTH_HISTORY_FIELDS]]}</dd></div>)}
        <div><dt className="text-sm text-text-muted">โรคอื่น ๆ</dt><dd className="break-words text-text">{history.otherConditions || "ไม่ได้ระบุ"}</dd></div>
        <div><dt className="text-sm text-text-muted">ปี พ.ศ. ที่ได้รับการวินิจฉัย</dt><dd className="text-text">{history.diagnosisYear ?? "ไม่ทราบ"}</dd></div>
      </dl>
      <p className="mt-3 text-sm text-text-muted">ข้อมูลของโรงพยาบาลนี้ · บันทึกล่าสุด {history.updatedAt.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" })}</p>
    </>}
  </section>;
}
