import type { RoundActivityRow } from "../services/round-query-service";

export const ROUND_AWAITING_FORM_LABEL = "รอแบบฟอร์มจากหน่วยงาน";

export function formatRoundDate(value: Date | null): string {
  return value
    ? new Intl.DateTimeFormat("th-TH", { dateStyle: "long", timeZone: "Asia/Bangkok" }).format(value)
    : "ไม่ระบุวันที่";
}

export function formatRoundNumber(value: number | null, fractionDigits = 1): string {
  return value === null
    ? "ไม่ได้บันทึก"
    : new Intl.NumberFormat("th-TH", { maximumFractionDigits: fractionDigits }).format(value);
}

export function roundActivityStatusLabel(row: RoundActivityRow): string {
  if (row.status === "AWAITING_FORM") {
    return ROUND_AWAITING_FORM_LABEL;
  }

  if (row.status === "NOT_DONE") {
    return "ยังไม่ได้บันทึก";
  }

  return row.mode === "REVIEWED" ? "ทบทวนแล้ว" : "บันทึกแล้ว";
}

export function roundActivitySourceLabel(row: RoundActivityRow): string | null {
  return row.source === "EXTRA" ? "การจัดบริการเพิ่ม" : null;
}

export function buildPatientRoundsPath(relationshipId: string, programId: string): string {
  return `/app/patients/${encodeURIComponent(relationshipId)}/programs/${encodeURIComponent(programId)}/rounds`;
}

export function buildPatientRoundPath(
  relationshipId: string,
  programId: string,
  roundNumber: number,
): string {
  return `${buildPatientRoundsPath(relationshipId, programId)}/${roundNumber}`;
}

/**
 * Staff link to the existing tool page for a round row (the navigator is a layer on top of the
 * existing routes). Returns null when the tool has no page to open from this row.
 */
export function buildRoundToolHref(input: {
  row: RoundActivityRow;
  relationshipId: string;
  programId: string;
  roundNumber: number;
}): string | null {
  const relationship = encodeURIComponent(input.relationshipId);
  const program = encodeURIComponent(input.programId);
  const programPath = `/app/patients/${relationship}/programs/${program}`;
  const { row } = input;

  switch (row.kind) {
    case "SCREENING":
      return row.linkedRecord
        ? `/app/patients/${relationship}/screenings/${encodeURIComponent(row.linkedRecord.id)}`
        : `/app/patients/${relationship}/screenings/new?programId=${program}`;
    case "SERVICE_ONE":
      return `${programPath}#program-service-one`;
    case "GOAL_PLAN":
      if (row.linkedRecord) {
        return `${programPath}/goals/${encodeURIComponent(row.linkedRecord.id)}`;
      }

      // The first Goal Plan is round 2 (WB-DF-01); other rounds only read an existing plan.
      return input.roundNumber === 2 ? `${programPath}/goals/new` : null;
    case "FOLLOWUP_REVIEW":
      return row.linkedRecord
        ? `${programPath}/followups/${encodeURIComponent(row.linkedRecord.id)}`
        : null;
    default:
      return null;
  }
}
