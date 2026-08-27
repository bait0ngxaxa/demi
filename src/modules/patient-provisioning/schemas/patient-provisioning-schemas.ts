import { z } from "zod";

import { patientBaselineDateOnlySchema } from "@/modules/patient-baseline/schemas/patient-baseline-schemas";
import {
  identityReferenceSchema,
  thaiNationalIdSchema,
} from "@/modules/identity/schemas/identity-schemas";
import { patientClassificationTypeSchema } from "@/modules/patient-classification/schemas/patient-classification-schemas";

import { PATIENT_IMPORT_CONTRACT_VERSION } from "../import/patient-import-contract";

const personNameSchema = z.string().trim().min(1).max(120);

const optionalHospitalNumberSchema = z.preprocess(
  (value: unknown) => {
    if (typeof value !== "string") {
      return value;
    }

    const normalized = value.trim();
    return normalized || undefined;
  },
  z.string().max(64).optional(),
);

export const patientProvisionInputSchema = z
  .object({
    identity: identityReferenceSchema,
    givenName: personNameSchema,
    familyName: personNameSchema,
    targetHospitalId: z.uuid(),
    hospitalNumber: optionalHospitalNumberSchema,
  })
  .strict();

export const patientProvisionFormSchema = z
  .object({
    nationalId: thaiNationalIdSchema,
    givenName: personNameSchema,
    familyName: personNameSchema,
    targetHospitalId: z.uuid(),
    hospitalNumber: optionalHospitalNumberSchema,
  })
  .strict();

export const patientProvisionScopeSchema = z
  .object({ targetHospitalId: z.uuid() })
  .strict();

export const patientImportFileSchema = z
  .object({ targetHospitalId: z.uuid() })
  .strict();

export const patientImportEffectiveDateSchema = patientBaselineDateOnlySchema;

const sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/u);

export const patientImportClassificationReconciliationSchema = z
  .object({
    rowNumber: z.number().int().min(1).max(500),
    currentClassification: patientClassificationTypeSchema,
    sourceClassification: patientClassificationTypeSchema,
  })
  .strict();

export const patientImportClassificationReconciliationChoiceSchema =
  patientImportClassificationReconciliationSchema.extend({
    confirmationToken: sha256HexSchema,
  });

export const patientImportClassificationReconciliationChoicesSchema = z
  .array(patientImportClassificationReconciliationChoiceSchema)
  .max(500)
  .superRefine((choices, context) => {
    const rowNumbers = new Set<number>();

    for (const [index, choice] of choices.entries()) {
      if (rowNumbers.has(choice.rowNumber)) {
        context.addIssue({
          code: "custom",
          path: [index, "rowNumber"],
          message: "ไม่สามารถยืนยันแถวซ้ำได้",
        });
      }

      if (choice.currentClassification === choice.sourceClassification) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: "สถานะเดิมและสถานะใหม่ต้องแตกต่างกัน",
        });
      }

      rowNumbers.add(choice.rowNumber);
    }
  });

export const patientImportConfirmSchema = z
  .object({
    targetHospitalId: z.uuid(),
    previewTargetHospitalId: z.uuid(),
    fileFingerprint: sha256HexSchema,
    previewBinding: sha256HexSchema,
    effectiveDate: patientBaselineDateOnlySchema.optional(),
    importContractVersion: z.literal(PATIENT_IMPORT_CONTRACT_VERSION),
    classificationReconciliationChoices: z.string().max(100_000).optional(),
  })
  .strict();

export type ProvisionPatientInput = z.infer<typeof patientProvisionInputSchema>;
export type PatientProvisionFormInput = z.infer<typeof patientProvisionFormSchema>;
export type PatientProvisionScopeInput = z.infer<typeof patientProvisionScopeSchema>;
export type PatientImportConfirmInput = z.infer<typeof patientImportConfirmSchema>;
