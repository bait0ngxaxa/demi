import type { ProgramRoundRecord } from "@/modules/patient-program-rounds/services/round-query-service";
import type { buildServiceProgress } from "@/modules/patient-self/services/patient-service-progress-query-service";
import { roundGuideline } from "@/modules/patient-program-rounds/domain/round-steps";

export const progressPatient = { id: "patient-user", person: { givenName: "ชื่อผู้ป่วย", familyName: null } };
export const progressStaff = { id: "staff-user", person: { givenName: "ชื่อเจ้าหน้าที่ลับ", familyName: null } };

export function progressProgram(): ProgramRoundRecord {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    patientHospitalRelationshipId: "11111111-1111-4111-8111-111111111111",
    status: "ACTIVE",
    patientHospitalRelationship: { hospitalProfile: null, patientProfile: { person: { user: { id: progressPatient.id } } } },
    initialBaseline: null,
    roundVitals: [], roundActivities: [], roundCompletions: [], roundStepSkips: [], screeningAssessments: [],
    serviceOneRoutines: [], serviceOneFloatingCharts: [], serviceOneDreamCards: [], serviceOneConfidences: [],
    goalPlans: [], followups: [], finalAssessment: null,
    rounds: [{ roundNumber: 1, planItems: roundGuideline(1).map((step, index) => ({
      id: `plan-${step.code}`, stepCode: step.code, customTitle: null, position: index + 1, origin: "GUIDELINE",
      removedAt: null, doneAt: null, doneByUser: null, doneNote: null,
    })) }],
  };
}

export function progressRelationship(): Parameters<typeof buildServiceProgress>[0] {
  const program = progressProgram();
  return {
    id: program.patientHospitalRelationshipId, hospitalNumber: null, endedAt: null,
    hospital: { name: "โรงพยาบาลทดสอบ", hospitalCode: "T", status: "ACTIVE" },
    baseline: null, _count: { programs: 0 }, programs: [program],
  };
}
