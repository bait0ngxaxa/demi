import "server-only";

import { Prisma } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import {
  DEFAULT_SERIALIZABLE_TRANSACTION_RETRIES,
  runSerializableTransaction,
} from "@/lib/db/serializable-transaction";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import {
  PatientOsmRosterReconciliationRequiredError,
  PatientOsmRosterResolutionConflictError,
  reconcileRosterOsmAssignmentInTransaction,
} from "@/modules/patient-assignment/services/patient-osm-roster-resolver";
import { PATIENT_BASELINE_CREATE_CAPABILITY } from "@/modules/patient-baseline/policies/patient-baseline-policy";
import { resolvePatientBaselineAccessContext } from "@/modules/patient-baseline/services/patient-baseline-access-service";
import { createPatientBaselineInTransaction } from "@/modules/patient-baseline/services/patient-baseline-transaction";
import { patientClassificationTypeSchema } from "@/modules/patient-classification/schemas/patient-classification-schemas";
import {
  setPatientClassificationInTransaction,
  type PatientClassificationMutationResult,
} from "@/modules/patient-classification/services/patient-classification-transaction";
import type { PatientOsmAssignmentMutationResult } from "@/modules/patient-assignment/services/patient-osm-assignment-transaction";
import {
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  ValidationError,
  ApplicationError,
} from "@/shared/errors/application-error";

import type { PatientProvisioningImportCandidate } from "../import/patient-import-contract";
import {
  PatientProvisioningConflictError,
  provisionPatientInTransaction,
  type PatientProvisioningResult,
} from "./patient-provisioning-transaction";
import {
  baselineImportMatchesExisting,
  baselineImportReason,
  buildBaselineCreateInput,
  getImportNow,
  normalizeImportCandidates,
  normalizeImportOptions,
  patientRosterImportPreviewInternals,
  preparePatientRosterImportPreview,
  projectPatientRosterImportPreview,
  readBaselineImportState,
  toPublicPatientOsmAssignmentPreview,
  validateRosterImportTarget,
} from "./patient-roster-import-preview";
import type {
  PatientImportBaselineStatus,
  PatientImportClassificationReconciliationChoice,
  PatientImportOptions,
  PatientImportOsmAssignmentChoice,
  PatientImportPreview,
  PatientImportPreviewInternal,
  PatientImportPreviewRowInternal,
  PatientImportResultSummary,
  PatientImportRowResult,
  PatientRosterImportDatabase,
  PatientRosterImportServiceDependencies,
} from "./patient-roster-import-types";

export type {
  PatientImportBaselineStatus,
  PatientImportClassification,
  PatientImportClassificationPreview,
  PatientImportClassificationReconciliation,
  PatientImportClassificationReconciliationChoice,
  PatientImportClassificationStatus,
  PatientImportOptions,
  PatientImportOsmAssignmentChoice,
  PatientImportOsmAssignmentPreview,
  PatientImportOsmCandidatePreview,
  PatientImportPreview,
  PatientImportPreviewInternal,
  PatientImportPreviewRow,
  PatientImportPreviewRowInternal,
  PatientImportResultSummary,
  PatientImportRowResult,
  PatientRosterImportDatabase,
  PatientRosterImportServiceDependencies,
} from "./patient-roster-import-types";
export type { PatientProvisioningImportCandidate } from "../import/patient-import-contract";
export { projectPatientRosterImportPreview };

function getDatabase(
  dependencies: PatientRosterImportServiceDependencies,
): PatientRosterImportDatabase {
  return dependencies.database ?? getPrisma();
}

function isKnownRequestError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function normalizeDatabaseError(error: unknown): ApplicationError {
  if (error instanceof ApplicationError) {
    return error;
  }

  if (isKnownRequestError(error, "P2002") || isKnownRequestError(error, "P2034")) {
    return new PatientProvisioningConflictError(
      "RECONCILIATION_REQUIRED",
      "Patient provisioning conflicted with another request",
    );
  }

  return new InfrastructureError("Patient provisioning could not be completed");
}

export class PatientBaselineImportConflictError extends ConflictError {
  constructor() {
    super("ข้อมูลตั้งต้นจากไฟล์ขัดแย้งกับข้อมูลที่บันทึกไว้แล้ว");
    this.name = "PatientBaselineImportConflictError";
  }
}

function toImportResultRow(
  row: PatientImportPreviewRowInternal,
  result: PatientImportRowResult["result"],
  reason = row.reason,
  baselineStatus = row.baselineStatus,
): PatientImportRowResult {
  return {
    ...row,
    patientOsmAssignment: toPublicPatientOsmAssignmentPreview(row.patientOsmAssignment),
    result,
    reason,
    baselineStatus,
  };
}

function getResultStatusForPreview(
  row: PatientImportPreviewRowInternal,
  classificationChoice: PatientImportClassificationReconciliationChoice | null = null,
  osmChoice: PatientImportOsmAssignmentChoice | null = null,
): PatientImportRowResult["result"] | null {
  if (row.classification === "INVALID") {
    return "INVALID";
  }

  if (row.classification === "DUPLICATE_IN_FILE") {
    return "DUPLICATE_IN_FILE";
  }

  if (row.classification === "CONFLICT") {
    return "CONFLICT";
  }

  if (row.classification === "HOSPITAL_MISMATCH") {
    return "HOSPITAL_MISMATCH";
  }

  if (row.classification === "UNSUPPORTED_REQUIREMENT") {
    return "UNSUPPORTED_REQUIREMENT";
  }

  const classification = row.patientClassification;
  const classificationReconciled =
    classification.status !== "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION" ||
    (classificationChoice?.rowNumber === row.rowNumber &&
      classificationChoice.currentClassification === classification.currentClassification &&
      classificationChoice.sourceClassification === classification.sourceClassification);

  const osm = row.patientOsmAssignment;
  const osmReconciled = (() => {
    if (
      osm.resolutionStatus === "OSM_NOT_APPLICABLE" ||
      osm.assignmentStatus === "OSM_ASSIGNMENT_ALREADY_EXISTS"
    ) {
      return true;
    }

    if (
      osm.resolutionStatus === "OSM_NOT_FOUND" ||
      osm.resolutionStatus === "OSM_AMBIGUOUS" ||
      osm.resolutionStatus === "OSM_SELF_ASSIGNMENT_FORBIDDEN" ||
      osm.resolutionStatus === "OSM_DATA_INVALID" ||
      osm.assignmentStatus === "OSM_OWNER_REQUIRED"
    ) {
      return false;
    }

    if (!osmChoice || osmChoice.rowNumber !== row.rowNumber) {
      return false;
    }

    if (
      osmChoice.resolutionStatus !== osm.resolutionStatus ||
      osmChoice.sourceCaregiverName !== osm.normalizedSourceCaregiverName ||
      osmChoice.normalizedSourceCaregiverName !== osm.normalizedSourceCaregiverName
    ) {
      return false;
    }

    const selectedCandidate = osm.candidates.find(
      ({ osmUserId }) => osmUserId === osmChoice.candidateOsmUserId,
    );

    if (!selectedCandidate) {
      return false;
    }

    if (osm.currentOsmUserId === selectedCandidate.osmUserId) {
      return true;
    }

    return (
      osmChoice.currentOsmUserId === osm.currentOsmUserId &&
      osmChoice.explicitReassignment === (osm.currentOsmUserId !== null)
    );
  })();

  if (!classificationReconciled || !osmReconciled) {
    return "NEEDS_REVIEW";
  }

  const hasClassificationReconciliation =
    row.patientClassification.status === "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION";
  const hasOsmReconciliation =
    row.patientOsmAssignment.resolutionStatus !== "OSM_NOT_APPLICABLE" &&
    row.patientOsmAssignment.assignmentStatus !== "OSM_ASSIGNMENT_ALREADY_EXISTS";

  if (
    row.classification === "NEEDS_REVIEW" &&
    !hasClassificationReconciliation &&
    !hasOsmReconciliation
  ) {
    return "NEEDS_REVIEW";
  }

  return null;
}

const patientRosterBaselineSelect = {
  recordedOn: true,
  weight: true,
  heightCm: true,
  waistCircumference: true,
  bloodSugarDtx: true,
  hba1c: true,
} satisfies Prisma.PatientBaselineSelect;

type PatientRosterImportRowResult = {
  patient: PatientProvisioningResult;
  baselineStatus: PatientImportBaselineStatus;
  classificationResult: PatientClassificationMutationResult | null;
  osmResult: PatientOsmAssignmentMutationResult | null;
};

async function importPatientRosterRow(
  actor: ActorContext,
  candidate: PatientProvisioningImportCandidate,
  effectiveDate: string | null,
  dependencies: PatientRosterImportServiceDependencies,
  classificationChoice: PatientImportClassificationReconciliationChoice | null,
  osmChoice: PatientImportOsmAssignmentChoice | null,
): Promise<PatientRosterImportRowResult> {
  if (!candidate.input) {
    throw new ValidationError("ข้อมูลแถวนี้ไม่ถูกต้อง");
  }

  const patientInput = candidate.input;
  const baselineState = readBaselineImportState(candidate, effectiveDate);

  if (baselineState.status === "BASELINE_DATA_INVALID") {
    throw new ValidationError("ข้อมูลตั้งต้นของแถวนี้ไม่ถูกต้อง");
  }

  if (baselineState.status === "BASELINE_DATE_REQUIRED") {
    throw new ValidationError("ต้องระบุวันที่ข้อมูลตั้งต้นก่อนยืนยันนำเข้า");
  }

  const rawSourceClassification = candidate.canonicalRow.clinicalCandidates.diabetesClassification;
  const parsedSourceClassification = patientClassificationTypeSchema.safeParse(rawSourceClassification);
  const sourceClassification = parsedSourceClassification.success
    ? parsedSourceClassification.data
    : null;
  const hasValidClassificationSource =
    sourceClassification !== null &&
    candidate.canonicalRow.fieldAssessments.diabetesClassification.diagnostics.length === 0;
  const sourceOsmCaregiverName = candidate.canonicalRow.caregiverCandidates.osmCaregiverName;
  const osmCaregiverDiagnostics = candidate.canonicalRow.fieldAssessments.osmCaregiverName.diagnostics;
  const hasOsmSourceAssertion =
    sourceOsmCaregiverName !== null || osmCaregiverDiagnostics.length > 0;

  try {
    return await runSerializableTransaction(
      getDatabase(dependencies),
      async (transaction): Promise<PatientRosterImportRowResult> => {
        const now =
          baselineState.status === "BASELINE_READY" ||
          hasValidClassificationSource ||
          (sourceOsmCaregiverName !== null && osmCaregiverDiagnostics.length === 0)
            ? getImportNow(dependencies)
            : null;
        const patient = await provisionPatientInTransaction(
          transaction,
          actor,
          patientInput,
          "BULK",
        );

        let baselineStatus: PatientImportBaselineStatus = "NOT_APPLICABLE";

        if (baselineState.status !== "NOT_APPLICABLE") {
          if (now === null) {
            throw new ValidationError("ข้อมูลตั้งต้นของแถวนี้ไม่พร้อมบันทึก");
          }

          const access = await resolvePatientBaselineAccessContext(
            actor,
            patient.relationshipId,
            PATIENT_BASELINE_CREATE_CAPABILITY,
            transaction,
          );
          const existing = await transaction.patientBaseline.findUnique({
            where: {
              patientHospitalRelationshipId: access.patient.patientHospitalRelationshipId,
            },
            select: patientRosterBaselineSelect,
          });

          if (!existing) {
            await createPatientBaselineInTransaction(
              transaction,
              actor,
              buildBaselineCreateInput(patient.relationshipId, baselineState),
              now,
              "ROSTER_IMPORT",
            );
            baselineStatus = "BASELINE_CREATED";
          } else if (baselineImportMatchesExisting(baselineState, existing)) {
            baselineStatus = "BASELINE_ALREADY_EXISTS";
          } else {
            throw new PatientBaselineImportConflictError();
          }
        }

        const classificationResult =
          sourceClassification && now
            ? await setPatientClassificationInTransaction(
                transaction,
                actor,
                {
                  patientProfileId: patient.patientProfileId,
                  patientHospitalRelationshipId: patient.relationshipId,
                  targetHospitalId: patient.hospitalId,
                  classification: sourceClassification,
                  source: "ROSTER_IMPORT",
                  ...(classificationChoice
                    ? {
                        expectedCurrentClassification: classificationChoice.currentClassification,
                        explicitChangeConfirmation: true,
                      }
                    : {}),
                },
                now,
              )
            : null;

        const osmResult =
          hasOsmSourceAssertion && sourceOsmCaregiverName !== null && now
            ? await reconcileRosterOsmAssignmentInTransaction(
                transaction,
                actor,
                {
                  patientHospitalRelationshipId: patient.relationshipId,
                  sourceCaregiverName: sourceOsmCaregiverName,
                  sourceDiagnostics: osmCaregiverDiagnostics,
                  choice: osmChoice,
                },
                now,
              )
            : null;

        return { patient, baselineStatus, classificationResult, osmResult };
      },
      dependencies.transactionRetries ?? DEFAULT_SERIALIZABLE_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

function importResultReason(
  patientOutcome: PatientProvisioningResult["outcome"],
  baselineStatus: PatientImportBaselineStatus,
  classificationResult: PatientClassificationMutationResult | null,
  osmResult: PatientOsmAssignmentMutationResult | null,
): string {
  const classificationMessage = classificationResult
    ? classificationResult.operation === "CREATED"
      ? "บันทึกสถานะผู้ป่วยแล้ว"
      : classificationResult.operation === "CHANGED"
        ? "เปลี่ยนสถานะผู้ป่วยแล้ว"
        : "สถานะผู้ป่วยตรงกับข้อมูลปัจจุบัน"
    : null;
  const osmMessage = osmResult
    ? osmResult.operation === "ASSIGNED"
      ? "กำหนดผู้ดูแลแล้ว"
      : osmResult.operation === "REASSIGNED"
        ? "เปลี่ยนผู้ดูแลแล้ว"
        : "ผู้ดูแลตรงกับข้อมูลปัจจุบัน"
    : null;

  if (baselineStatus === "BASELINE_CREATED") {
    const message =
      patientOutcome === "CREATED"
        ? "บันทึกข้อมูลผู้ป่วยและข้อมูลตั้งต้นแล้ว"
        : "มีข้อมูลผู้ป่วยแล้ว และบันทึกข้อมูลตั้งต้นแล้ว";
    const details = [classificationMessage, osmMessage].filter(Boolean).join(" ");
    return details ? `${message} ${details}` : message;
  }

  if (baselineStatus === "BASELINE_ALREADY_EXISTS") {
    const message = "มีข้อมูลผู้ป่วยและข้อมูลตั้งต้นนี้แล้ว ระบบไม่สร้างซ้ำ";
    const details = [classificationMessage, osmMessage].filter(Boolean).join(" ");
    return details ? `${message} ${details}` : message;
  }

  const message =
    patientOutcome === "CREATED" ? "บันทึกข้อมูลผู้ป่วยแล้ว" : "มีข้อมูลผู้ป่วยนี้แล้ว";
  const details = [classificationMessage, osmMessage].filter(Boolean).join(" ");
  return details ? `${message} ${details}` : message;
}

type PatientRosterImportDomainOutcome = {
  baselineStatus: PatientImportBaselineStatus;
  classificationOperation: PatientClassificationMutationResult["operation"] | null;
  osmOperation: PatientOsmAssignmentMutationResult["operation"] | null;
};

function summarizePatientRosterImportRows(input: {
  targetHospitalId: string;
  rows: readonly PatientImportRowResult[];
  domainOutcomesByIndex: ReadonlyMap<number, PatientRosterImportDomainOutcome>;
  classificationNeedsReviewIndexes: ReadonlySet<number>;
  file: PatientImportResultSummary["file"];
}): PatientImportResultSummary {
  const summary = {
    targetHospitalId: input.targetHospitalId,
    imported: 0,
    alreadyExists: 0,
    duplicateInFile: 0,
    invalid: 0,
    conflict: 0,
    needsReview: 0,
    hospitalMismatch: 0,
    unsupportedRequirement: 0,
    failed: 0,
    baselineCreated: 0,
    baselineAlreadyExists: 0,
    baselineConflict: 0,
    baselineInvalid: 0,
    baselineDateRequired: 0,
    classificationCreated: 0,
    classificationAlreadyExists: 0,
    classificationChanged: 0,
    classificationNeedsReview: 0,
    classificationInvalid: 0,
    osmAssigned: 0,
    osmAlreadyAssigned: 0,
    osmReassigned: 0,
    osmNotFound: 0,
    osmAmbiguous: 0,
    osmAssignmentConflict: 0,
    osmOwnerRequired: 0,
    rows: [...input.rows],
    file: input.file,
  } satisfies PatientImportResultSummary;

  for (const [index, row] of input.rows.entries()) {
    switch (row.result) {
      case "IMPORTED":
        summary.imported += 1;
        break;
      case "ALREADY_EXISTS":
        summary.alreadyExists += 1;
        break;
      case "DUPLICATE_IN_FILE":
        summary.duplicateInFile += 1;
        break;
      case "INVALID":
        summary.invalid += 1;
        break;
      case "CONFLICT":
        summary.conflict += 1;
        break;
      case "NEEDS_REVIEW":
        summary.needsReview += 1;
        break;
      case "HOSPITAL_MISMATCH":
        summary.hospitalMismatch += 1;
        break;
      case "UNSUPPORTED_REQUIREMENT":
        summary.unsupportedRequirement += 1;
        break;
      case "FAILED":
        summary.failed += 1;
        break;
    }

    if (row.baselineStatus === "BASELINE_CONFLICT") {
      summary.baselineConflict += 1;
    }

    if (row.baselineStatus === "BASELINE_DATA_INVALID") {
      summary.baselineInvalid += 1;
    }

    if (row.baselineStatus === "BASELINE_DATE_REQUIRED") {
      summary.baselineDateRequired += 1;
    }

    if (input.classificationNeedsReviewIndexes.has(index)) {
      summary.classificationNeedsReview += 1;
    }

    if (row.patientClassification.status === "CLASSIFICATION_DATA_INVALID") {
      summary.classificationInvalid += 1;
    }

    if (row.patientOsmAssignment.resolutionStatus === "OSM_NOT_FOUND") {
      summary.osmNotFound += 1;
    }

    if (row.patientOsmAssignment.resolutionStatus === "OSM_AMBIGUOUS") {
      summary.osmAmbiguous += 1;
    }

    if (row.patientOsmAssignment.assignmentStatus === "OSM_ASSIGNMENT_CONFLICT") {
      summary.osmAssignmentConflict += 1;
    }

    if (row.patientOsmAssignment.assignmentStatus === "OSM_OWNER_REQUIRED") {
      summary.osmOwnerRequired += 1;
    }

    const domainOutcome = input.domainOutcomesByIndex.get(index);

    if (!domainOutcome) {
      continue;
    }

    switch (domainOutcome.baselineStatus) {
      case "BASELINE_CREATED":
        summary.baselineCreated += 1;
        break;
      case "BASELINE_ALREADY_EXISTS":
        summary.baselineAlreadyExists += 1;
        break;
      default:
        break;
    }

    switch (domainOutcome.classificationOperation) {
      case "CREATED":
        summary.classificationCreated += 1;
        break;
      case "NOOP":
        summary.classificationAlreadyExists += 1;
        break;
      case "CHANGED":
        summary.classificationChanged += 1;
        break;
      default:
        break;
    }

    switch (domainOutcome.osmOperation) {
      case "ASSIGNED":
        summary.osmAssigned += 1;
        break;
      case "NOOP":
        summary.osmAlreadyAssigned += 1;
        break;
      case "REASSIGNED":
        summary.osmReassigned += 1;
        break;
      default:
        break;
    }
  }

  const primaryResultCount =
    summary.imported +
    summary.alreadyExists +
    summary.duplicateInFile +
    summary.invalid +
    summary.conflict +
    summary.needsReview +
    summary.hospitalMismatch +
    summary.unsupportedRequirement +
    summary.failed;

  if (primaryResultCount !== input.rows.length) {
    throw new InfrastructureError("Patient import result summary is inconsistent");
  }

  return summary;
}

export async function previewPatientRosterImportInternal(
  actor: ActorContext | null | undefined,
  targetHospitalId: string,
  candidates: readonly PatientProvisioningImportCandidate[],
  database: PatientRosterImportDatabase = getPrisma(),
  options: PatientImportOptions = {},
): Promise<PatientImportPreviewInternal> {
  const validatedTargetHospitalId = validateRosterImportTarget(actor, targetHospitalId);
  const normalizedOptions = normalizeImportOptions(options);
  const normalizedCandidates = normalizeImportCandidates(
    candidates,
    validatedTargetHospitalId,
  );

  if (!actor) {
    throw new ForbiddenError();
  }

  return preparePatientRosterImportPreview(
    actor,
    validatedTargetHospitalId,
    normalizedCandidates,
    database ?? getPrisma(),
    normalizedOptions,
  );
}

export async function previewPatientRosterImport(
  actor: ActorContext | null | undefined,
  targetHospitalId: string,
  candidates: readonly PatientProvisioningImportCandidate[],
  database: PatientRosterImportDatabase = getPrisma(),
  options: PatientImportOptions = {},
): Promise<PatientImportPreview> {
  return projectPatientRosterImportPreview(
    await previewPatientRosterImportInternal(actor, targetHospitalId, candidates, database, options),
  );
}

export async function importPatientRoster(
  actor: ActorContext | null | undefined,
  targetHospitalId: string,
  candidates: readonly PatientProvisioningImportCandidate[],
  dependencies: PatientRosterImportServiceDependencies = {},
  options: PatientImportOptions = {},
): Promise<PatientImportResultSummary> {
  const validatedTargetHospitalId = validateRosterImportTarget(actor, targetHospitalId);
  const normalizedOptions = normalizeImportOptions(options);
  const normalizedCandidates = normalizeImportCandidates(
    candidates,
    validatedTargetHospitalId,
  );

  if (!actor) {
    throw new ForbiddenError();
  }

  const preview = await preparePatientRosterImportPreview(
    actor,
    validatedTargetHospitalId,
    normalizedCandidates,
    getDatabase(dependencies),
    normalizedOptions,
  );

  if (preview.baselineDateRequired) {
    throw new ValidationError("ต้องระบุวันที่ข้อมูลตั้งต้นก่อนยืนยันนำเข้า");
  }

  const classificationChoicesByRow = new Map(
    normalizedOptions.classificationReconciliationChoices.map((choice) => [
      choice.rowNumber,
      choice,
    ]),
  );
  const osmChoicesByRow = new Map(
    normalizedOptions.osmAssignmentChoices.map((choice) => [choice.rowNumber, choice]),
  );
  const rows: PatientImportRowResult[] = [];
  const domainOutcomesByIndex = new Map<number, PatientRosterImportDomainOutcome>();
  const classificationNeedsReviewIndexes = new Set<number>();

  for (const [index, candidate] of normalizedCandidates.entries()) {
    const previewRow = preview.rows[index];

    if (!previewRow) {
      throw new InfrastructureError("Patient import preview row is missing");
    }

    const classificationChoice = classificationChoicesByRow.get(previewRow.rowNumber) ?? null;
    const osmChoice = osmChoicesByRow.get(previewRow.rowNumber) ?? null;
    const previewResult = getResultStatusForPreview(
      previewRow,
      classificationChoice,
      osmChoice,
    );

    if (previewResult) {
      if (
        previewRow.patientClassification.status ===
        "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION"
      ) {
        classificationNeedsReviewIndexes.add(index);
      }

      rows.push(toImportResultRow(previewRow, previewResult));
      continue;
    }

    if (!candidate.input) {
      rows.push(toImportResultRow(previewRow, "INVALID", "ข้อมูลแถวนี้ไม่ครบถ้วน"));
      continue;
    }

    try {
      const result = await importPatientRosterRow(
        actor,
        candidate,
        normalizedOptions.effectiveDate,
        dependencies,
        classificationChoice,
        osmChoice,
      );

      domainOutcomesByIndex.set(index, {
        baselineStatus: result.baselineStatus,
        classificationOperation: result.classificationResult?.operation ?? null,
        osmOperation: result.osmResult?.operation ?? null,
      });
      rows.push(
        toImportResultRow(
          previewRow,
          result.patient.outcome === "CREATED" ? "IMPORTED" : "ALREADY_EXISTS",
          importResultReason(
            result.patient.outcome,
            result.baselineStatus,
            result.classificationResult,
            result.osmResult,
          ),
          result.baselineStatus,
        ),
      );
    } catch (error: unknown) {
      if (error instanceof ForbiddenError) {
        throw error;
      }

      if (error instanceof ValidationError) {
        rows.push(
          toImportResultRow(
            previewRow,
            "INVALID",
            previewRow.baselineStatus === "BASELINE_DATA_INVALID" ||
              previewRow.baselineStatus === "BASELINE_DATE_REQUIRED"
              ? baselineImportReason(previewRow.baselineStatus) ?? "ข้อมูลแถวนี้ไม่ถูกต้อง"
              : "ข้อมูลแถวนี้ไม่ถูกต้อง",
            previewRow.baselineStatus,
          ),
        );
        continue;
      }

      if (error instanceof PatientBaselineImportConflictError) {
        rows.push(
          toImportResultRow(
            previewRow,
            "CONFLICT",
            baselineImportReason("BASELINE_CONFLICT"),
            "BASELINE_CONFLICT",
          ),
        );
        continue;
      }

      if (
        error instanceof PatientOsmRosterResolutionConflictError ||
        error instanceof PatientOsmRosterReconciliationRequiredError
      ) {
        rows.push(
          toImportResultRow(
            previewRow,
            "NEEDS_REVIEW",
            "ข้อมูลผู้ดูแลเปลี่ยนแปลงระหว่างตรวจสอบและยืนยัน กรุณาตรวจสอบใหม่",
          ),
        );
        continue;
      }

      if (error instanceof ConflictError) {
        if (
          previewRow.patientClassification.status ===
          "CLASSIFICATION_CHANGE_REQUIRES_CONFIRMATION"
        ) {
          classificationNeedsReviewIndexes.add(index);
          rows.push(
            toImportResultRow(
              previewRow,
              "NEEDS_REVIEW",
              "สถานะผู้ป่วยเปลี่ยนแปลงระหว่างตรวจสอบและยืนยัน กรุณาตรวจสอบใหม่",
            ),
          );
        } else {
          rows.push(
            toImportResultRow(previewRow, "CONFLICT", "ข้อมูลขัดแย้ง ต้องตรวจสอบโดยผู้ดูแล"),
          );
        }
        continue;
      }

      rows.push(toImportResultRow(previewRow, "FAILED", "ระบบไม่สามารถบันทึกแถวนี้ได้"));
    }
  }

  return summarizePatientRosterImportRows({
    targetHospitalId: validatedTargetHospitalId,
    rows,
    domainOutcomesByIndex,
    classificationNeedsReviewIndexes,
    file: preview.file,
  });
}

export const patientRosterImportInternals = {
  ...patientRosterImportPreviewInternals,
  getResultStatusForPreview,
  summarizePatientRosterImportRows,
};
