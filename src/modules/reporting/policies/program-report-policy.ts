import "server-only";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  PATIENT_PROGRAM_READ_CAPABILITY,
  decidePatientProgramPolicy,
  type PatientProgramPolicyDecision,
  type PatientProgramPolicyTarget,
} from "@/modules/patient-program/policies/patient-program-policy";
import { ForbiddenError } from "@/shared/errors/application-error";

export const PROGRAM_REPORT_READ_CAPABILITY = "report:program:read" as const;

export type ProgramReportCapability = typeof PROGRAM_REPORT_READ_CAPABILITY;
export type ProgramReportPolicyTarget = PatientProgramPolicyTarget;
export type ProgramReportPolicyDecision = PatientProgramPolicyDecision;

export function decideProgramReportPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: unknown;
  target: ProgramReportPolicyTarget;
}): ProgramReportPolicyDecision {
  if (input.capability !== PROGRAM_REPORT_READ_CAPABILITY) {
    return { allowed: false, reason: "invalid_capability" };
  }

  // Reporting intentionally has its own capability while reusing the accepted
  // exact Program read scope. This keeps future report/cohort/export policy
  // changes from silently widening ordinary Program access.
  return decidePatientProgramPolicy({
    actor: input.actor,
    capability: PATIENT_PROGRAM_READ_CAPABILITY,
    target: input.target,
  });
}

export function assertProgramReportPolicy(input: {
  actor: ActorContext | null | undefined;
  capability: ProgramReportCapability;
  target: ProgramReportPolicyTarget;
}): void {
  const decision = decideProgramReportPolicy(input);

  if (!decision.allowed) {
    throw new ForbiddenError();
  }
}
