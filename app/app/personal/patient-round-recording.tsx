import { randomUUID } from "node:crypto";

import { CURRENT_INSTRUMENT_QUESTION_SETS } from "@/modules/screening/domain/question-sets";
import { ROUND_ITEM_CATALOG, type RoundStepState } from "@/modules/patient-program-rounds/domain/round-steps";
import type { ProgramRoundDetail } from "@/modules/patient-program-rounds/services/round-query-service";
import type { PatientSelfRelationshipContext } from "@/modules/patient-self/services/patient-self-query-service";
import { toServiceDateOnly } from "@/shared/time/service-date";
import { ScreeningForm } from "../patients/[relationshipId]/screenings/new/screening-form";
import { ServiceOneToolStep, type ServiceOneToolKey } from "../patients/[relationshipId]/programs/[programId]/service-one-workspace";
import { RoundVitalsForm } from "../patients/[relationshipId]/programs/[programId]/rounds/[roundNumber]/round-vitals-form";
import { RoundProfileForm } from "../patients/[relationshipId]/programs/[programId]/rounds/[roundNumber]/round-step-controls";
import { CustomItemDoneForm } from "../patients/[relationshipId]/programs/[programId]/rounds/[roundNumber]/round-plan-editor";

const TOOL_KEYS: Partial<Record<RoundStepState["code"], ServiceOneToolKey>> = { CONFIDENCE_RULER: "confidence", ROUTINE: "routine", FLOATING_CHART: "floatingChart", DREAM_CARD: "dreamCard" };

/** Only record forms are composed here; every service independently proves SELF scope. */
export function PatientRoundRecording({ round, step, relationship }: { round: ProgramRoundDetail; step: RoundStepState; relationship: PatientSelfRelationshipContext }): React.JSX.Element | null {
  if (!round.canSelfRecord || !step.planItemId || step.status === "DONE" || !ROUND_ITEM_CATALOG[step.code].patientRecordable) return null;
  const nonce = randomUUID();
  const target = { patientHospitalRelationshipId: round.patientHospitalRelationshipId, patientProgramId: round.patientProgramId, roundNumber: round.roundNumber };
  const nextHref = `/app/personal/care/${encodeURIComponent(target.patientHospitalRelationshipId)}/programs/${encodeURIComponent(target.patientProgramId)}/rounds#round-${round.roundNumber}`;
  const tool = TOOL_KEYS[step.code];
  let form: React.JSX.Element;
  if (tool) {
    form = <ServiceOneToolStep canManage patientMode submissionNonce={nonce} nextHref={nextHref} programId={target.patientProgramId} relationshipId={target.patientHospitalRelationshipId} roundNumber={round.roundNumber} serviceOne={round.serviceOne} tool={tool} />;
  } else if (step.code === "VITALS") {
    form = <RoundVitalsForm patientMode heightEditable={round.vitalsForm.heightEditable} latestHeightCm={round.vitalsForm.latestHeightCm} nextHref={nextHref} occupation={round.patient.occupation} patientDisplayName="คุณ" patientHospitalRelationshipId={target.patientHospitalRelationshipId} patientProgramId={target.patientProgramId} profile={null} roundNumber={round.roundNumber} submissionNonce={nonce} todayServiceDate={toServiceDateOnly(new Date())} />;
  } else if (step.code === "KNOW_SELF") {
    form = <RoundProfileForm patientMode nextHref={nextHref} occupation={round.patient.occupation} preferredName={round.patient.preferredName} profileVersion={round.patient.profileVersion} submissionNonce={nonce} target={target} />;
  } else if (step.code === "PAM" || step.code === "PROMS") {
    form = <ScreeningForm embedded patientMode nextHref={nextHref} relationshipId={target.patientHospitalRelationshipId} programId={target.patientProgramId} programRoundNumber={round.roundNumber} submissionNonce={nonce} questionSet={{ ...CURRENT_INSTRUMENT_QUESTION_SETS[step.code], intro: ["เลือกคำตอบที่ตรงกับความรู้สึกและประสบการณ์ของคุณในตอนนี้"], questions: CURRENT_INSTRUMENT_QUESTION_SETS[step.code].questions.map((question) => ({ ...question, guidance: undefined })) }} patient={{ displayName: "คุณ", hospitalNumber: relationship.hospitalNumber, hospital: { name: relationship.hospitalName } }} />;
  } else if (step.code === "CUSTOM") {
    form = <CustomItemDoneForm target={target} submissionNonce={nonce} planItemId={step.planItemId} />;
  } else return null;
  return (
    <details className="mt-3">
      <summary className="min-h-11 cursor-pointer rounded-control py-3 text-sm font-semibold text-brand-strong focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus-ring focus-visible:ring-offset-2">บันทึกด้วยตนเอง · {step.label}</summary>
      <div className="pt-3" key={nonce}>{form}</div>
    </details>
  );
}
