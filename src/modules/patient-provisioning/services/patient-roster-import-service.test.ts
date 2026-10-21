import {
  HospitalStatus,
  MembershipStatus,
  MembershipType,
  Role,
  UserStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActorContext } from "@/modules/auth/types/actor-context";
import { THAI_NATIONAL_IDENTITY_NAMESPACE } from "@/modules/identity/schemas/identity-schemas";
import { hashIdentityReference } from "@/modules/identity/services/identity-service";
import type { PatientClassificationType } from "@/modules/patient-classification/schemas/patient-classification-schemas";
import {
  PATIENT_IMPORT_CONTRACT_VERSION,
  PATIENT_IMPORT_FIELD_KEYS,
  type PatientImportFieldAssessment,
  type PatientImportFieldAssessmentMap,
  type PatientProvisioningImportCandidate,
} from "../import/patient-import-contract";
import type { ProvisionPatientInput } from "../schemas/patient-provisioning-schemas";

const provisionPatientInTransaction = vi.hoisted(() => vi.fn());
const createPatientBaselineInTransaction = vi.hoisted(() => vi.fn());
const setPatientClassificationInTransaction = vi.hoisted(() => vi.fn());

vi.mock("./patient-provisioning-transaction", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./patient-provisioning-transaction")>()),
  provisionPatientInTransaction,
}));
vi.mock("@/modules/patient-baseline/services/patient-baseline-transaction", () => ({
  createPatientBaselineInTransaction,
}));
vi.mock("@/modules/patient-classification/services/patient-classification-transaction", () => ({
  setPatientClassificationInTransaction,
}));

import {
  importPatientRoster,
  patientRosterImportInternals,
  previewPatientRosterImport,
} from "./patient-roster-import-service";
import { PATIENT_IMPORT_ENDED_RELATIONSHIP_REASON } from "./patient-roster-import-preview";
import {
  isPatientImportAttentionResult,
  type PatientImportPreviewRow,
  type PatientImportRowResult,
  type PatientRosterImportDatabase,
} from "./patient-roster-import-types";

const targetHospitalId = "11111111-1111-4111-8111-111111111111";
const otherHospitalId = "22222222-2222-4222-8222-222222222222";
const actorUserId = "33333333-3333-4333-8333-333333333333";

const actor = {
  userId: actorUserId,
  personId: "44444444-4444-4444-8444-444444444444",
  roles: [Role.HOSPITAL],
  hospitalMemberships: [{
    hospitalId: targetHospitalId,
    membershipType: MembershipType.OWNER,
    profession: null,
    status: MembershipStatus.ACTIVE,
    hospitalStatus: HospitalStatus.ACTIVE,
  }],
  osmHospitalRelationships: [],
} satisfies ActorContext;

function inputFor(nationalId: string, overrides: Partial<ProvisionPatientInput> = {}): ProvisionPatientInput {
  return {
    identity: { namespace: THAI_NATIONAL_IDENTITY_NAMESPACE, value: nationalId },
    givenName: "สมชาย",
    familyName: "ผู้ป่วย",
    targetHospitalId,
    hospitalNumber: "HN-001",
    ...overrides,
  };
}

const defaultInput = inputFor("1000000000009");
const newRelationshipId = "99999999-9999-4999-8999-999999999999";

/** A syntactically valid Thai national ID (13th digit is the mod-11 check digit). */
function thaiNationalId(seed: number): string {
  const digits = String(100000000000 + seed).slice(-12).split("").map(Number);
  const sum = digits.reduce((total, digit, index) => total + digit * (13 - index), 0);
  return `${digits.join("")}${(11 - (sum % 11)) % 10}`;
}

const emptyAssessment: PatientImportFieldAssessment = {
  status: "NOT_PRESENT",
  present: false,
  sourceHeaders: [],
  diagnostics: [],
};

function createAssessments(
  overrides: Partial<PatientImportFieldAssessmentMap> = {},
): PatientImportFieldAssessmentMap {
  return Object.fromEntries(
    PATIENT_IMPORT_FIELD_KEYS.map((field) => [field, overrides[field] ?? emptyAssessment]),
  ) as PatientImportFieldAssessmentMap;
}

function createCandidate(options: {
  rowNumber?: number;
  input?: ProvisionPatientInput | null;
  weight?: number | null;
  height?: number | null;
  waistCircumference?: number | null;
  bloodSugarDtx?: number | null;
  hba1c?: number | null;
  classification?: PatientClassificationType | null;
  assessments?: Partial<PatientImportFieldAssessmentMap>;
} = {}): PatientProvisioningImportCandidate {
  const input = options.input === undefined ? defaultInput : options.input;

  return {
    rowNumber: options.rowNumber ?? 3,
    identityDisplay: "••••••0009",
    givenName: input?.givenName ?? "สมชาย",
    familyName: input?.familyName ?? "ผู้ป่วย",
    hospitalNumber: input?.hospitalNumber ?? null,
    validationMessage: input ? null : "ข้อมูลแถวนี้ไม่ถูกต้อง",
    input,
    canonicalRow: {
      provenance: {
        sourceSheetName: "รายชื่อผู้ป่วย",
        sourceRowNumber: options.rowNumber ?? 3,
        sourceSequenceNumber: null,
      },
      identity: {
        nationalId: input?.identity.value ?? null,
        givenName: input?.givenName ?? "สมชาย",
        familyName: input?.familyName ?? "ผู้ป่วย",
      },
      demographics: { dateOfBirth: null, gender: null },
      contact: {
        phoneNumber: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        emergencyContactRelationship: null,
      },
      address: {
        houseNumber: null,
        villageNumber: null,
        villageName: null,
        soi: null,
        road: null,
        province: null,
        district: null,
        subdistrict: null,
        postalCode: null,
      },
      clinicalCandidates: {
        weight: options.weight ?? null,
        height: options.height ?? null,
        waistCircumference: options.waistCircumference ?? null,
        diabetesClassification: options.classification ?? null,
        bloodSugarDtx: options.bloodSugarDtx ?? null,
        hba1c: options.hba1c ?? null,
      },
      organizationCandidates: { hospitalNumber: input?.hospitalNumber ?? null },
      fieldAssessments: createAssessments(options.assessments),
      diagnostics: [],
    },
  };
}

type ExistingPerson = Parameters<typeof patientRosterImportInternals.classifyExistingPatient>[0];

function existingPerson(overrides: {
  nationalId?: string;
  givenName?: string | null;
  familyName?: string | null;
  relationship?: { hospitalNumber: string | null; endedAt?: Date | null } | null;
  roles?: readonly Role[];
  userStatus?: UserStatus;
  authSubject?: string | null;
  classification?: PatientClassificationType | null;
  noUser?: boolean;
} = {}): ExistingPerson & { identityKeyHash: string } {
  return {
    id: "person-1",
    identityKeyHash: hashIdentityReference({
      namespace: THAI_NATIONAL_IDENTITY_NAMESPACE,
      value: overrides.nationalId ?? defaultInput.identity.value,
    }),
    givenName: overrides.givenName === undefined ? "สมชาย" : overrides.givenName,
    familyName: overrides.familyName === undefined ? "ผู้ป่วย" : overrides.familyName,
    user: overrides.noUser
      ? null
      : {
          id: "user-1",
          status: overrides.userStatus ?? UserStatus.PROVISIONED,
          authSubject: overrides.authSubject ?? null,
          roles: (overrides.roles ?? [Role.PATIENT]).map((role) => ({ role })),
        },
    patientProfile: {
      id: "profile-1",
      dateOfBirth: null,
      patientClassification: overrides.classification
        ? { classification: overrides.classification }
        : null,
      hospitalRelationships:
        overrides.relationship === null
          ? []
          : [{
              id: "relationship-1",
              hospitalNumber: overrides.relationship?.hospitalNumber ?? null,
              endedAt: overrides.relationship?.endedAt ?? null,
            }],
    },
  };
}

function compose(
  candidate: PatientProvisioningImportCandidate,
  existing: ExistingPerson | undefined,
  options: { duplicateCount?: number; effectiveDate?: string | null } = {},
): PatientImportPreviewRow {
  return patientRosterImportInternals.composePatientRosterPreviewRow({
    candidate,
    hash: "identity-hash",
    duplicateCount: options.duplicateCount ?? 1,
    existing,
    effectiveDate: options.effectiveDate === undefined ? "2026-08-01" : options.effectiveDate,
  });
}

describe("Relationship-aware profile validation", () => {
  it.each(["phoneNumber", "postalCode", "emergencyContactPhone", "houseNumber", "dateOfBirth", "diabetesClassification", "weight"] as const)("ignores invalid %s only for an existing relationship", (field) => {
    const candidate = createCandidate({ assessments: { [field]: { ...emptyAssessment, status: "INVALID", diagnostics: ["INVALID_VALUE"] } } });
    const [normalized] = patientRosterImportInternals.normalizeImportCandidates([candidate], targetHospitalId);
    expect(normalized?.input).toEqual(defaultInput);
    if (!normalized) throw new Error("Missing normalized row");
    expect(compose(normalized, existingPerson()).classification).toBe("ALREADY_EXISTS");
    expect(compose(normalized, undefined).classification).toBe("INVALID");
  });
});

describe("Patient roster import: option and candidate normalization", () => {
  it("normalizes options once and accepts nothing but the effective date and contract version", () => {
    expect(patientRosterImportInternals.normalizeImportOptions({})).toEqual({
      effectiveDate: null,
      importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
    });
    expect(patientRosterImportInternals.normalizeImportOptions({ effectiveDate: "2026-08-01" })).toEqual({
      effectiveDate: "2026-08-01",
      importContractVersion: PATIENT_IMPORT_CONTRACT_VERSION,
    });
    expect(() =>
      patientRosterImportInternals.normalizeImportOptions({ effectiveDate: "01/08/2026" }),
    ).toThrow("วันที่ข้อมูลตั้งต้นไม่ถูกต้อง");
    expect(() =>
      patientRosterImportInternals.normalizeImportOptions({
        importContractVersion: "phase-16d4-osm-assignment-v2",
      }),
    ).toThrow("เวอร์ชันการนำเข้าไม่ถูกต้อง");
  });

  it("normalizes candidates against the server-selected Hospital", () => {
    const [normalized] = patientRosterImportInternals.normalizeImportCandidates(
      [createCandidate({ input: { ...defaultInput, targetHospitalId: otherHospitalId } })],
      targetHospitalId,
    );

    expect(normalized).toMatchObject({
      input: null,
      validationMessage: "แถวนี้อยู่นอกขอบเขตโรงพยาบาลที่เลือก",
    });
  });
});

describe("Patient roster import: new patients only", () => {
  it("marks an unknown person READY and carries baseline and classification states", () => {
    const row = compose(createCandidate({ weight: 72.5, classification: "DIABETES" }), undefined);

    expect(row).toMatchObject({
      classification: "READY",
      baselineStatus: "BASELINE_READY",
      patientClassification: { status: "CLASSIFICATION_READY", sourceClassification: "DIABETES" },
    });
  });

  it("requires the effective date only for new patients that carry baseline values", () => {
    const withBaseline = compose(createCandidate({ weight: 72.5 }), undefined, { effectiveDate: null });
    const withoutBaseline = compose(createCandidate(), undefined, { effectiveDate: null });

    expect(withBaseline).toMatchObject({ classification: "INVALID", baselineStatus: "BASELINE_DATE_REQUIRED" });
    expect(withoutBaseline).toMatchObject({ classification: "READY", baselineStatus: "NOT_APPLICABLE" });
  });

  it("flags invalid baseline and classification values on a new patient", () => {
    const invalidBaseline = compose(
      createCandidate({
        assessments: { weight: { ...emptyAssessment, present: true, status: "INVALID", diagnostics: ["INVALID_VALUE"] } },
      }),
      undefined,
    );
    const invalidClassification = compose(
      createCandidate({
        assessments: {
          diabetesClassification: {
            ...emptyAssessment,
            present: true,
            status: "INVALID",
            diagnostics: ["CLASSIFICATION_DATA_INVALID"],
          },
        },
      }),
      undefined,
    );

    expect(invalidBaseline).toMatchObject({ classification: "INVALID", baselineStatus: "BASELINE_DATA_INVALID" });
    expect(invalidClassification).toMatchObject({
      classification: "INVALID",
      patientClassification: { status: "CLASSIFICATION_DATA_INVALID" },
    });
  });

  it("keeps invalid and duplicate precedence before anything else", () => {
    expect(compose(createCandidate({ input: null }), undefined).classification).toBe("INVALID");
    expect(compose(createCandidate(), undefined, { duplicateCount: 2 }).classification).toBe(
      "DUPLICATE_IN_FILE",
    );
    expect(
      compose(createCandidate(), existingPerson({ relationship: { hospitalNumber: null } }), {
        duplicateCount: 2,
      }).classification,
    ).toBe("DUPLICATE_IN_FILE");
  });

  it("treats a person known only at another Hospital as a new patient for this Hospital", () => {
    const row = compose(createCandidate({ weight: 70 }), existingPerson({ relationship: null }));

    expect(row.classification).toBe("READY");
    expect(row.baselineStatus).toBe("BASELINE_READY");
  });

  it("records a classification only when the patient profile has none", () => {
    const candidate = createCandidate({ classification: "DIABETES" });

    expect(
      compose(candidate, existingPerson({ relationship: null, classification: null })).patientClassification,
    ).toMatchObject({ status: "CLASSIFICATION_READY" });
    expect(
      compose(candidate, existingPerson({ relationship: null, classification: "RISK" })).patientClassification,
    ).toMatchObject({
      status: "CLASSIFICATION_ALREADY_EXISTS",
      sourceClassification: "DIABETES",
    });
    expect(
      patientRosterImportInternals.readPatientClassificationImportState(candidate, "RISK"),
    ).not.toHaveProperty("currentClassification");
  });
});

describe("Patient roster import: existing patients are an identity check only", () => {
  const relationship = { hospitalNumber: "HN-001" };

  it("reports ALREADY_EXISTS when the identity is consistent", () => {
    expect(compose(createCandidate(), existingPerson({ relationship }))).toMatchObject({
      classification: "ALREADY_EXISTS",
      baselineStatus: "NOT_APPLICABLE",
      patientClassification: { status: "NOT_APPLICABLE" },
      requirementGatedFields: [],
    });
  });

  it("ignores changed baseline, classification and even invalid values in the file", () => {
    const changed = createCandidate({
      weight: 99,
      height: 190,
      classification: "DIABETES",
      assessments: {
        waistCircumference: { ...emptyAssessment, present: true, status: "INVALID", diagnostics: ["INVALID_VALUE"] },
      },
    });
    const row = compose(changed, existingPerson({ relationship, classification: "RISK" }), {
      effectiveDate: null,
    });

    expect(row).toMatchObject({
      classification: "ALREADY_EXISTS",
      baselineStatus: "NOT_APPLICABLE",
      patientClassification: { status: "NOT_APPLICABLE", sourceClassification: null },
    });
  });

  it("does not need the baseline date for rows that already exist", () => {
    const row = compose(createCandidate({ weight: 72.5 }), existingPerson({ relationship }), {
      effectiveDate: null,
    });

    expect(row.classification).toBe("ALREADY_EXISTS");
    expect(row.baselineStatus).not.toBe("BASELINE_DATE_REQUIRED");
  });

  it("does not fill in a missing HN: an HN in the file is ignored for an existing patient", () => {
    expect(
      compose(createCandidate(), existingPerson({ relationship: { hospitalNumber: null } })).classification,
    ).toBe("ALREADY_EXISTS");
  });

  it("classifies a national ID whose care with this Hospital ended (ENDED_RELATIONSHIP) instead of reactivating it", () => {
    const row = compose(
      createCandidate(),
      existingPerson({ relationship: { hospitalNumber: null, endedAt: new Date("2026-10-01T00:00:00.000Z") } }),
    );

    expect(row.classification).toBe("CONFLICT");
    expect(row.reason).toBe(PATIENT_IMPORT_ENDED_RELATIONSHIP_REASON);
  });

  it.each([
    ["a different given name", { givenName: "สมหญิง" }],
    ["a different family name", { familyName: "คนอื่น" }],
    ["a different HN", { relationship: { hospitalNumber: "HN-999" } }],
    ["an account that needs reconciliation", { userStatus: UserStatus.SUSPENDED }],
    ["an ACTIVE account without a valid auth subject", { userStatus: UserStatus.ACTIVE, authSubject: null }],
    ["a person without the patient role", { roles: [Role.OSM] }],
    ["a person without any account", { noUser: true }],
  ] as const)("reports CONFLICT for %s", (_label, overrides) => {
    const row = compose(createCandidate(), existingPerson({ relationship, ...overrides }));

    expect(row.classification).toBe("CONFLICT");
    expect(row.reason).toBeTruthy();
  });

  it("reports CONFLICT for a name mismatch even before the Hospital relationship exists", () => {
    expect(
      compose(createCandidate(), existingPerson({ relationship: null, givenName: "สมหญิง" })).classification,
    ).toBe("CONFLICT");
  });
});

describe("Patient roster import: baseline and classification state readers", () => {
  it("does not turn blanks into assertions", () => {
    expect(
      patientRosterImportInternals.readBaselineImportState(createCandidate(), "2026-08-01").status,
    ).toBe("NOT_APPLICABLE");

    const baselineCandidate = createCandidate({ weight: 72.5, height: 170 });
    expect(
      patientRosterImportInternals.readBaselineImportState(baselineCandidate, "2026-08-01"),
    ).toMatchObject({ status: "BASELINE_READY", presentFields: ["weight", "heightCm"] });
    expect(
      patientRosterImportInternals.readBaselineImportState(baselineCandidate, null).status,
    ).toBe("BASELINE_DATE_REQUIRED");
  });

  it("builds a baseline create request only from a ready state", () => {
    const state = patientRosterImportInternals.readBaselineImportState(
      createCandidate({ weight: 72.5 }),
      "2026-08-01",
    );
    const noDate = patientRosterImportInternals.readBaselineImportState(
      createCandidate({ weight: 72.5 }),
      null,
    );

    expect(
      patientRosterImportInternals.buildBaselineCreateInput("55555555-5555-4555-8555-555555555555", state),
    ).toMatchObject({ weight: 72.5, recordedOn: "2026-08-01" });
    expect(() =>
      patientRosterImportInternals.buildBaselineCreateInput("55555555-5555-4555-8555-555555555555", noDate),
    ).toThrow("ข้อมูลตั้งต้นของแถวนี้ไม่พร้อมบันทึก");
  });
});

describe("Patient roster import: result summary", () => {
  function createResult(
    result: PatientImportRowResult["result"],
    overrides: Partial<PatientImportPreviewRow> = {},
  ): PatientImportRowResult {
    return {
      rowNumber: 3,
      sourceSequenceNumber: null,
      identityDisplay: "••••••0009",
      givenName: "สมชาย",
      familyName: "ผู้ป่วย",
      hospitalNumber: null,
      classification: result === "IMPORTED" || result === "FAILED" ? "READY" : result,
      reason: null,
      baselineStatus: "NOT_APPLICABLE",
      requirementGatedFields: [],
      diagnosticCodes: [],
      patientClassification: { status: "NOT_APPLICABLE", sourceClassification: null },
      ...overrides,
      result,
    };
  }

  it("centralizes primary buckets and keeps domain counters separate", () => {
    const rows = [
      createResult("IMPORTED"),
      createResult("ALREADY_EXISTS"),
      createResult("CONFLICT"),
      createResult("INVALID"),
      createResult("DUPLICATE_IN_FILE"),
      createResult("FAILED"),
    ];
    const summary = patientRosterImportInternals.summarizePatientRosterImportRows({
      targetHospitalId,
      rows,
      domainOutcomesByIndex: new Map([[0, { baselineStatus: "BASELINE_CREATED", classificationCreated: true }]]),
      file: null,
    });

    expect(summary).toMatchObject({
      imported: 1,
      alreadyExists: 1,
      conflict: 1,
      invalid: 1,
      duplicateInFile: 1,
      failed: 1,
      baselineCreated: 1,
      classificationCreated: 1,
    });
    expect(summary).not.toHaveProperty("osmAssigned");
    expect(summary).not.toHaveProperty("hospitalMismatch");
  });

  it("does not classify ALREADY_EXISTS as an attention result", () => {
    expect(isPatientImportAttentionResult("ALREADY_EXISTS")).toBe(false);
    expect(isPatientImportAttentionResult("IMPORTED")).toBe(false);
    expect(isPatientImportAttentionResult("CONFLICT")).toBe(true);
    expect(isPatientImportAttentionResult("FAILED")).toBe(true);
  });
});

describe("Patient roster import orchestration (re-validates and commits READY rows only)", () => {
  const now = new Date("2026-08-01T00:00:00.000Z");

  function createDatabase(options: {
    people?: ReturnType<typeof existingPerson>[];
    concurrentPerson?: ReturnType<typeof existingPerson>;
    existingClassification?: boolean;
    actorRole?: MembershipType;
  } = {}) {
    const transaction = {
      patientProfile: { update: vi.fn() },
      patientHospitalProfile: { create: vi.fn() },
      person: {
        findUnique: vi.fn(async () => options.concurrentPerson ?? null),
      },
      patientClassification: {
        findUnique: vi.fn(async () => (options.existingClassification ? { id: "classification-1" } : null)),
      },
    };
    const database = {
      user: {
        findUnique: vi.fn(async () => ({ status: UserStatus.ACTIVE, roles: [{ role: Role.HOSPITAL }] })),
      },
      hospital: { findUnique: vi.fn(async () => ({ status: HospitalStatus.ACTIVE })) },
      hospitalMembership: {
        findFirst: vi.fn(async () => ({
          membershipType: options.actorRole ?? MembershipType.OWNER,
          status: MembershipStatus.ACTIVE,
        })),
      },
      person: { findMany: vi.fn(async () => options.people ?? []) },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    };

    return { database: database as unknown as PatientRosterImportDatabase, transaction, mocks: database };
  }

  const options = { effectiveDate: "2026-08-01" };

  beforeEach(() => {
    provisionPatientInTransaction.mockReset();
    createPatientBaselineInTransaction.mockReset();
    setPatientClassificationInTransaction.mockReset();
    provisionPatientInTransaction.mockImplementation(async (_tx: unknown, _actor: unknown, input: ProvisionPatientInput) => ({
      outcome: "CREATED",
      personId: "66666666-6666-4666-8666-666666666666",
      userId: "77777777-7777-4777-8777-777777777777",
      patientProfileId: "88888888-8888-4888-8888-888888888888",
      relationshipId: newRelationshipId,
      hospitalId: input.targetHospitalId,
      accountStatus: UserStatus.PROVISIONED,
      reusedExistingUser: false,
    }));
  });

  it("imports new patients with baseline and classification, in a transaction per row", async () => {
    const { database, mocks } = createDatabase();
    const summary = await importPatientRoster(
      actor,
      targetHospitalId,
      [
        createCandidate({ rowNumber: 3, weight: 72.5, classification: "DIABETES" }),
        createCandidate({ rowNumber: 4, input: inputFor("1000000000017") }),
      ],
      { database, now: () => now },
      options,
    );

    expect(summary).toMatchObject({ imported: 2, alreadyExists: 0, baselineCreated: 1, classificationCreated: 1 });
    expect(provisionPatientInTransaction).toHaveBeenCalledTimes(2);
    expect(mocks.$transaction).toHaveBeenCalledTimes(2);
    expect(createPatientBaselineInTransaction).toHaveBeenCalledTimes(1);
    expect(createPatientBaselineInTransaction.mock.calls[0]?.[2]).toMatchObject({
      patientHospitalRelationshipId: newRelationshipId,
      recordedOn: "2026-08-01",
      weight: 72.5,
    });
    expect(createPatientBaselineInTransaction.mock.calls[0]?.[4]).toBe("ROSTER_IMPORT");
    expect(setPatientClassificationInTransaction).toHaveBeenCalledTimes(1);
    expect(setPatientClassificationInTransaction.mock.calls[0]?.[2]).toMatchObject({
      classification: "DIABETES",
      source: "ROSTER_IMPORT",
    });
    expect(setPatientClassificationInTransaction.mock.calls[0]?.[2]).not.toHaveProperty(
      "explicitChangeConfirmation",
    );
  });

  it("re-import of 100 + 30: only the 30 new rows are written and no existing row is touched", async () => {
    const existingCandidates = Array.from({ length: 100 }, (_, index) =>
      createCandidate({
        rowNumber: index + 3,
        input: inputFor(thaiNationalId(index)),
        weight: 80 + index,
        classification: "DIABETES",
      }),
    );
    const newCandidates = Array.from({ length: 30 }, (_, index) =>
      createCandidate({
        rowNumber: index + 103,
        input: inputFor(thaiNationalId(1000 + index)),
        weight: 60,
      }),
    );
    const people = existingCandidates.map((candidate) =>
      existingPerson({
        nationalId: candidate.input?.identity.value,
        relationship: { hospitalNumber: "HN-001" },
        classification: "RISK",
      }),
    );
    const { database } = createDatabase({ people });

    const summary = await importPatientRoster(
      actor,
      targetHospitalId,
      [...existingCandidates, ...newCandidates],
      { database, now: () => now },
      options,
    );

    expect(summary).toMatchObject({ imported: 30, alreadyExists: 100, conflict: 0, failed: 0 });
    expect(provisionPatientInTransaction).toHaveBeenCalledTimes(30);
    expect(createPatientBaselineInTransaction).toHaveBeenCalledTimes(30);
    expect(setPatientClassificationInTransaction).not.toHaveBeenCalled();
    expect(summary.rows.filter(({ result }) => result === "ALREADY_EXISTS")).toHaveLength(100);
  });

  it("returns CONFLICT for an existing name/HN mismatch and writes nothing for it", async () => {
    const { database } = createDatabase({
      people: [existingPerson({ relationship: { hospitalNumber: "HN-999" } })],
    });
    const summary = await importPatientRoster(
      actor,
      targetHospitalId,
      [createCandidate()],
      { database, now: () => now },
      options,
    );

    expect(summary).toMatchObject({ conflict: 1, imported: 0 });
    expect(provisionPatientInTransaction).not.toHaveBeenCalled();
  });

  it("does not overwrite a classification the profile already has", async () => {
    const { database } = createDatabase({
      people: [existingPerson({ relationship: null, classification: "RISK" })],
      existingClassification: true,
    });
    const summary = await importPatientRoster(
      actor,
      targetHospitalId,
      [createCandidate({ classification: "DIABETES" })],
      { database, now: () => now },
      options,
    );

    expect(summary).toMatchObject({ imported: 1, classificationCreated: 0 });
    expect(setPatientClassificationInTransaction).not.toHaveBeenCalled();
  });

  it("only identity-checks a relationship that appeared after the preview: ALREADY_EXISTS, nothing written", async () => {
    const { database } = createDatabase({
      concurrentPerson: existingPerson({ relationship: { hospitalNumber: "HN-001" } }),
    });
    const summary = await importPatientRoster(
      actor,
      targetHospitalId,
      [createCandidate({ weight: 72.5, classification: "DIABETES" })],
      { database, now: () => now },
      options,
    );

    expect(summary).toMatchObject({ alreadyExists: 1, imported: 0, conflict: 0 });
    expect(provisionPatientInTransaction).not.toHaveBeenCalled();
    expect(createPatientBaselineInTransaction).not.toHaveBeenCalled();
    expect(setPatientClassificationInTransaction).not.toHaveBeenCalled();
  });

  it("preserves the valid DOB conflict check on a late relationship", async () => {
    const person = existingPerson({ relationship: { hospitalNumber: "HN-001" } });
    if (!person.patientProfile) throw new Error("Patient profile missing");
    person.patientProfile.dateOfBirth = new Date("1980-01-15T00:00:00.000Z");
    const candidate = createCandidate();
    candidate.canonicalRow.demographics.dateOfBirth = "1981-01-15";
    const { database, transaction } = createDatabase({ concurrentPerson: person });
    expect(await importPatientRoster(actor, targetHospitalId, [candidate], { database })).toMatchObject({ conflict: 1, imported: 0 });
    expect(provisionPatientInTransaction).not.toHaveBeenCalled();
    expect(transaction.patientProfile.update).not.toHaveBeenCalled();
    expect(transaction.patientHospitalProfile.create).not.toHaveBeenCalled();
  });

  it("reports CONFLICT when the late relationship does not match the file's identity", async () => {
    const { database } = createDatabase({
      concurrentPerson: existingPerson({ relationship: { hospitalNumber: "HN-999" } }),
    });
    const summary = await importPatientRoster(
      actor,
      targetHospitalId,
      [createCandidate({ weight: 72.5 })],
      { database, now: () => now },
      options,
    );

    expect(summary).toMatchObject({ conflict: 1, imported: 0 });
    expect(provisionPatientInTransaction).not.toHaveBeenCalled();
    expect(createPatientBaselineInTransaction).not.toHaveBeenCalled();
  });

  it("records a row whose commit throws as FAILED and keeps going", async () => {
    const { database } = createDatabase();
    provisionPatientInTransaction.mockRejectedValueOnce(new Error("database down"));

    const summary = await importPatientRoster(
      actor,
      targetHospitalId,
      [createCandidate({ rowNumber: 3 }), createCandidate({ rowNumber: 4, input: inputFor("1000000000017") })],
      { database, now: () => now },
      options,
    );

    expect(summary).toMatchObject({ failed: 1, imported: 1 });
    expect(summary.rows.map(({ result }) => result)).toEqual(["FAILED", "IMPORTED"]);
  });

  it("rejects the whole confirm while a new patient still needs the baseline date", async () => {
    const { database } = createDatabase();

    await expect(
      importPatientRoster(
        actor,
        targetHospitalId,
        [createCandidate({ weight: 72.5 })],
        { database, now: () => now },
        {},
      ),
    ).rejects.toThrow("ต้องระบุวันที่ข้อมูลตั้งต้นก่อนยืนยันนำเข้า");
    expect(provisionPatientInTransaction).not.toHaveBeenCalled();
  });

  it("never writes INVALID or DUPLICATE_IN_FILE rows", async () => {
    const { database } = createDatabase();
    const summary = await importPatientRoster(
      actor,
      targetHospitalId,
      [
        createCandidate({ rowNumber: 3, input: null }),
        createCandidate({ rowNumber: 4 }),
        createCandidate({ rowNumber: 5 }),
      ],
      { database, now: () => now },
      options,
    );

    expect(summary).toMatchObject({ invalid: 1, duplicateInFile: 2, imported: 0 });
    expect(provisionPatientInTransaction).not.toHaveBeenCalled();
  });

  it("denies a MEMBER-less or out-of-scope actor before reading anything", async () => {
    const { database, mocks } = createDatabase();
    const outsider = { ...actor, hospitalMemberships: [] } satisfies ActorContext;

    await expect(
      importPatientRoster(outsider, targetHospitalId, [createCandidate()], { database }, options),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      previewPatientRosterImport(null, targetHospitalId, [createCandidate()], database, options),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.person.findMany).not.toHaveBeenCalled();
    expect(provisionPatientInTransaction).not.toHaveBeenCalled();
  });

  it("denies MEMBER import before provisioning", async () => {
    const member = { ...actor, hospitalMemberships: actor.hospitalMemberships.map((membership) => ({ ...membership, membershipType: MembershipType.MEMBER })) };
    await expect(importPatientRoster(member, targetHospitalId, [createCandidate()], { database: createDatabase().database })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(provisionPatientInTransaction).not.toHaveBeenCalled();
  });

  it("previews without writing", async () => {
    const { database, mocks } = createDatabase({
      people: [existingPerson({ relationship: { hospitalNumber: "HN-001" } })],
    });
    const preview = await previewPatientRosterImport(
      actor,
      targetHospitalId,
      [
        createCandidate({ rowNumber: 3 }),
        createCandidate({ rowNumber: 4, input: inputFor("1000000000017") }),
      ],
      database,
      options,
    );

    expect(preview.rows.map(({ classification }) => classification)).toEqual(["ALREADY_EXISTS", "READY"]);
    expect(preview.baselineDateRequired).toBe(false);
    expect(mocks.$transaction).not.toHaveBeenCalled();
    expect(provisionPatientInTransaction).not.toHaveBeenCalled();
  });
});
