import Form from "next/form";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import type { HospitalReportTargetSelection } from "@/modules/reporting/schemas/hospital-report-schemas";
import type { HospitalReportingHospital } from "@/modules/reporting/services/hospital-report-access-service";
import type { ParentChildHospitalReportTargetGroup } from "@/modules/reporting/services/parent-child-hospital-report-access-service";

function selectionValue(selection: HospitalReportTargetSelection): string {
  return selection.kind === "DIRECT_OWNER"
    ? `DIRECT_OWNER:${selection.hospitalId}`
    : `PARENT_CHILD:${selection.parentHospitalId}:${selection.hospitalId}`;
}

export function HospitalReportTargetSelector({
  hospitals,
  parentGroups,
  selection,
  routeBase,
  view,
}: {
  hospitals: readonly HospitalReportingHospital[];
  parentGroups: readonly ParentChildHospitalReportTargetGroup[];
  selection: HospitalReportTargetSelection;
  routeBase: string;
  view?: "overview" | "service";
}): React.JSX.Element | null {
  if (hospitals.length < 2 && parentGroups.length === 0) return null;

  const directlyOwnedIds = new Set(hospitals.map(({ id }) => id));

  return (
    <Form action={routeBase} className="mt-6 flex min-w-0 flex-col gap-3 sm:max-w-2xl sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <label className="type-label mb-2 block text-text" htmlFor="hospital-report-target">
          เลือกโรงพยาบาลสำหรับรายงาน
        </label>
        <select
          className="type-control min-h-12 w-full rounded-control border border-border-strong bg-surface px-4 py-2 text-text focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          defaultValue={selectionValue(selection)}
          key={selectionValue(selection)}
          aria-describedby="hospital-report-target-help"
          id="hospital-report-target"
          name="target"
        >
          <optgroup label="โรงพยาบาลของฉัน">
            {hospitals.map((hospital) => (
              <option key={hospital.id} value={`DIRECT_OWNER:${hospital.id}`}>
                {hospital.name} · รายงานโรงพยาบาลของฉัน
              </option>
            ))}
          </optgroup>
          {parentGroups.map((group) => (
            <optgroup key={group.parent.id} label={`Child Hospital · ${group.parent.name}`}>
              {group.children.length === 0 ? (
                <option disabled value="">
                  ยังไม่มี Child Hospital ที่พร้อมให้เลือกรายงาน
                </option>
              ) : group.children.map((child) => (
                <option key={`${group.parent.id}:${child.id}`} value={`PARENT_CHILD:${group.parent.id}:${child.id}`}>
                  {child.name} · {directlyOwnedIds.has(child.id) ? "คุณเป็นเจ้าของโดยตรง" : "ผ่านสิทธิ์โรงพยาบาลแม่ข่าย"}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {view ? <input name="view" type="hidden" value={view} /> : null}
        <p className="mt-2 text-sm leading-6 text-text-muted" id="hospital-report-target-help">
          รายงานจะแสดงเฉพาะโรงพยาบาลที่เลือก การเลือกโรงพยาบาลอื่นจะเริ่มมุมมองรายงานของแห่งนั้น
        </p>
      </div>
      <PendingSubmitButton variant="secondary" pendingLabel="กำลังเปิดรายงาน...">เปิดรายงาน</PendingSubmitButton>
    </Form>
  );
}
