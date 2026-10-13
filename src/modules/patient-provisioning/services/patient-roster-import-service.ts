import "server-only";

import { Prisma } from "@prisma/client";

import { getPrisma } from "@/lib/db/prisma";
import {
  DEFAULT_SERIALIZABLE_TRANSACTION_RETRIES,
  runSerializableTransaction,
} from "@/lib/db/serializable-transaction";
import type { ActorContext } from "@/modules/auth/types/actor-context";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import { createPatientBaselineInTransaction } from "@/modules/patient-baseline/services/patient-baseline-transaction";
import { setPatientClassificationInTransaction } from "@/modules/patient-classification/services/patient-classification-transaction";
import {
  ForbiddenError,
  InfrastructureError,
  ValidationError,
  ApplicationError,
} from "@/shared/errors/application-error";

import type { PatientProvisioningImportCandidate } from "../import/patient-import-contract";
import {
  PatientProvisioningConflictError,
  provisionPatientInTransaction,
} from "./patient-provisioning-transaction";
import {
  baselineImportReason,
  buildBaselineCreateInput,
  buildPreviewPersonSelect,
  classifyExistingPatient,
  getImportNow,
  normalizeImportCandidates,
  normalizeImportOptions,
  patientRosterImportPreviewInternals,
  preparePatientRosterImportPreview,
  readBaselineImportState,
  readPatientClassificationImportState,
  validateRosterImportTarget,
} from "./patient-roster-import-preview";
import type {
  PatientImportBaselineStatus,
  PatientImportOptions,
  PatientImportPreview,
  PatientImportPreviewRow,
  PatientImportResultSummary,
  PatientImportRowResult,
  PatientRosterImportDatabase,
  PatientRosterImportServiceDependencies,
} from "./patient-roster-import-types";

export type {
  PatientImportBaselineStatus,
  PatientImportClassification,
  PatientImportClassificationPreview,
  PatientImportClassificationStatus,
  PatientImportOptions,
  PatientImportPreview,
  PatientImportPreviewRow,
  PatientImportResultSummary,
  PatientImportRowResult,
  PatientRosterImportDatabase,
  PatientRosterImportServiceDependencies,
} from "./patient-roster-import-types";
export type { PatientProvisioningImportCandidate } from "../import/patient-import-contract";

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

function toImportResultRow(
  row: PatientImportPreviewRow,
  result: PatientImportRowResult["result"],
  reason = row.reason,
  baselineStatus = row.baselineStatus,
): PatientImportRowResult {
  return { ...row, result, reason, baselineStatus };
}

/** Rows that are not importable never reach the database; `READY` rows return null. */
function getResultStatusForPreview(
  row: PatientImportPreviewRow,
): PatientImportRowResult["result"] | null {
  return row.classification === "READY" ? null : row.classification;
}

type PatientRosterImportRowResult = {
  baselineStatus: PatientImportBaselineStatus;
  classificationCreated: boolean;
};

/** The patient gained a relationship with this Hospital after the preview: nothing is written. */
type PatientRosterImportExistingRow = {
  existing: { classification: "ALREADY_EXISTS" | "CONFLICT"; reason: string | null };
};

async function importPatientRosterRow(
  actor: ActorContext,
  candidate: PatientProvisioningImportCandidate,
  effectiveDate: string | null,
  dependencies: PatientRosterImportServiceDependencies,
): Promise<PatientRosterImportRowResult | PatientRosterImportExistingRow> {
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

  const classificationSource = readPatientClassificationImportState(candidate, null);

  if (classificationSource.status === "CLASSIFICATION_DATA_INVALID") {
    throw new ValidationError("สถานะผู้ป่วยจากไฟล์ไม่ใช่ค่าที่รองรับ");
  }

  try {
    return await runSerializableTransaction(
      getDatabase(dependencies),
      async (transaction): Promise<PatientRosterImportRowResult | PatientRosterImportExistingRow> => {
        // Import creates new patients only. A relationship that appeared after the
        // preview (a double submit, another user) is only identity-checked, exactly
        // like an existing row in the preview: no HN fill-in, baseline or classification.
        const person = await transaction.person.findUnique({
          where: { identityKeyHash: hashIdentityReference(patientInput.identity) },
          select: buildPreviewPersonSelect(patientInput.targetHospitalId),
        });

        if (person?.patientProfile?.hospitalRelationships.length) {
          const { classification, reason } = classifyExistingPatient(person, patientInput);

          if (classification !== "READY") {
            return { existing: { classification, reason } };
          }
        }

        const patient = await provisionPatientInTransaction(
          transaction,
          actor,
          patientInput,
          "BULK",
        );

        if (patient.outcome !== "CREATED") {
          throw new PatientProvisioningConflictError(
            "RECONCILIATION_REQUIRED",
            "The patient was added after the import preview",
          );
        }

        const now = getImportNow(dependencies);
        let baselineStatus: PatientImportBaselineStatus = "NOT_APPLICABLE";

        if (baselineState.status === "BASELINE_READY") {
          await createPatientBaselineInTransaction(
            transaction,
            actor,
            buildBaselineCreateInput(patient.relationshipId, baselineState),
            now,
            "ROSTER_IMPORT",
          );
          baselineStatus = "BASELINE_CREATED";
        }

        let classificationCreated = false;

        if (classificationSource.sourceClassification) {
          const existingClassification = await transaction.patientClassification.findUnique({
            where: { patientProfileId: patient.patientProfileId },
            select: { id: true },
          });

          if (!existingClassification) {
            await setPatientClassificationInTransaction(
              transaction,
              actor,
              {
                patientProfileId: patient.patientProfileId,
                patientHospitalRelationshipId: patient.relationshipId,
                targetHospitalId: patient.hospitalId,
                classification: classificationSource.sourceClassification,
                source: "ROSTER_IMPORT",
              },
              now,
            );
            classificationCreated = true;
          }
        }

        return { baselineStatus, classificationCreated };
      },
      dependencies.transactionRetries ?? DEFAULT_SERIALIZABLE_TRANSACTION_RETRIES,
    );
  } catch (error: unknown) {
    throw normalizeDatabaseError(error);
  }
}

function isExistingRow(
  result: PatientRosterImportRowResult | PatientRosterImportExistingRow,
): result is PatientRosterImportExistingRow {
  return "existing" in result;
}

function importResultReason(result: PatientRosterImportRowResult): string {
  const parts = ["บันทึกข้อมูลผู้ป่วยแล้ว"];

  if (result.baselineStatus === "BASELINE_CREATED") {
    parts.push("บันทึกข้อมูลตั้งต้นแล้ว");
  }

  if (result.classificationCreated) {
    parts.push("บันทึกสถานะผู้ป่วยแล้ว");
  }

  return parts.join(" ");
}

function summarizePatientRosterImportRows(input: {
  targetHospitalId: string;
  rows: readonly PatientImportRowResult[];
  domainOutcomesByIndex: ReadonlyMap<number, PatientRosterImportRowResult>;
  file: PatientImportResultSummary["file"];
}): PatientImportResultSummary {
  const summary = {
    targetHospitalId: input.targetHospitalId,
    imported: 0,
    alreadyExists: 0,
    duplicateInFile: 0,
    invalid: 0,
    conflict: 0,
    failed: 0,
    baselineCreated: 0,
    classificationCreated: 0,
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
      case "FAILED":
        summary.failed += 1;
        break;
    }

    const domainOutcome = input.domainOutcomesByIndex.get(index);

    if (domainOutcome?.baselineStatus === "BASELINE_CREATED") {
      summary.baselineCreated += 1;
    }

    if (domainOutcome?.classificationCreated) {
      summary.classificationCreated += 1;
    }
  }

  const primaryResultCount =
    summary.imported +
    summary.alreadyExists +
    summary.duplicateInFile +
    summary.invalid +
    summary.conflict +
    summary.failed;

  if (primaryResultCount !== input.rows.length) {
    throw new InfrastructureError("Patient import result summary is inconsistent");
  }

  return summary;
}

export async function previewPatientRosterImport(
  actor: ActorContext | null | undefined,
  targetHospitalId: string,
  candidates: readonly PatientProvisioningImportCandidate[],
  database: PatientRosterImportDatabase = getPrisma(),
  options: PatientImportOptions = {},
): Promise<PatientImportPreview> {
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

  // The server never trusts the client preview: everything is re-validated here.
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

  const rows: PatientImportRowResult[] = [];
  const domainOutcomesByIndex = new Map<number, PatientRosterImportRowResult>();

  for (const [index, candidate] of normalizedCandidates.entries()) {
    const previewRow = preview.rows[index];

    if (!previewRow) {
      throw new InfrastructureError("Patient import preview row is missing");
    }

    const previewResult = getResultStatusForPreview(previewRow);

    if (previewResult) {
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
      );

      if (isExistingRow(result)) {
        rows.push(
          toImportResultRow(previewRow, result.existing.classification, result.existing.reason),
        );
        continue;
      }

      domainOutcomesByIndex.set(index, result);
      rows.push(
        toImportResultRow(previewRow, "IMPORTED", importResultReason(result), result.baselineStatus),
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

      if (error instanceof ApplicationError && error.code === "CONFLICT") {
        rows.push(
          toImportResultRow(previewRow, "CONFLICT", "ข้อมูลขัดแย้ง ต้องตรวจสอบโดยผู้ดูแล"),
        );
        continue;
      }

      rows.push(toImportResultRow(previewRow, "FAILED", "ระบบไม่สามารถบันทึกแถวนี้ได้"));
    }
  }

  return summarizePatientRosterImportRows({
    targetHospitalId: validatedTargetHospitalId,
    rows,
    domainOutcomesByIndex,
    file: preview.file,
  });
}

export const patientRosterImportInternals = {
  ...patientRosterImportPreviewInternals,
  getResultStatusForPreview,
  summarizePatientRosterImportRows,
};
