# Patient Import → Patient Detail reconciliation

Decision date: 2026-10-13. Base: main `ed69973` (Patient Import v2 merge).
Authority: [ADR-0011](../adr/0011-patient-import-profile-persistence.md).

## Field mapping

Every template field is accounted for. “Saved” applies to a successful NEW hospital relationship; established patients are never overwritten. Blank optional fields persist as null. Clinical writes retain their existing conditions.

| Excel field | Authoritative persistence | Status | Display |
| --- | --- | --- | --- |
| nationalId | Person identityKeyHash through identity service | Saved as existing HMAC identity reference | Masked import preview; no full ID in detail/audit |
| givenName | Person.givenName | Saved/safely reused | Detail identity, self identity, preview |
| familyName | Person.familyName | Saved/safely reused | Detail identity, self identity, preview |
| dateOfBirth | PatientProfile.dateOfBirth (@db.Date) | Saved when provided; conflicting established date rejected | Detail general information |
| hospitalNumber | PatientHospitalRelationship.hospitalNumber | Saved | Detail identity, self hospital list, preview |
| gender | PatientHospitalProfile.gender | Saved | Detail general information, self hospital profile |
| phoneNumber | PatientHospitalProfile.phoneNumber | Saved | Detail contact, self hospital profile |
| houseNumber | PatientHospitalProfile.houseNumber | Saved separately | Complete derived address in detail/self profile |
| villageNumber | PatientHospitalProfile.villageNumber | Saved separately | Complete derived address in detail/self profile |
| villageName | PatientHospitalProfile.villageName | Saved separately | Complete derived address in detail/self profile |
| soi | PatientHospitalProfile.soi | Saved separately | Complete derived address in detail/self profile |
| road | PatientHospitalProfile.road | Saved separately | Complete derived address in detail/self profile |
| province | PatientHospitalProfile.province | Saved separately | Complete derived address in detail/self profile |
| district | PatientHospitalProfile.district | Saved separately | Complete derived address in detail/self profile |
| subdistrict | PatientHospitalProfile.subdistrict | Saved separately | Complete derived address in detail/self profile |
| postalCode | PatientHospitalProfile.postalCode (text, 5 digits) | Saved with leading zeros | Complete derived address in detail/self profile |
| emergencyContactName | PatientHospitalProfile.emergencyContactName | Saved | Detail emergency contact, self hospital profile |
| emergencyContactPhone | PatientHospitalProfile.emergencyContactPhone | Saved | Detail emergency contact, self hospital profile |
| emergencyContactRelationship | PatientHospitalProfile.emergencyContactRelationship | Saved | Detail emergency contact, read-only self hospital profile |
| diabetesClassification | PatientClassification.classification | Saved only if absent, through classification service | Detail classification section |
| weight | PatientBaseline.weight | Saved when supplied with effective date | Existing baseline detail section |
| height | PatientBaseline.heightCm | Saved when supplied with effective date | Existing baseline detail section |
| waistCircumference | PatientBaseline.waistCircumference | Saved when supplied with effective date | Existing baseline detail section |
| bloodSugarDtx | PatientBaseline.bloodSugarDtx | Saved when supplied with effective date | Existing baseline detail section |
| hba1c | PatientBaseline.hba1c | Saved when supplied with effective date | Existing baseline detail section |
| sourceSequenceNumber | Canonical row provenance, not patient data | Metadata only: Excel sequence/source traceability | Preview/result source sequence and original worksheet row number |

## Implementation

The parser previously parsed profile columns without writing them. The roster service now validates the profile in preview and confirmation, writes global DOB and exact-relationship hospital profile inside the provisioning/clinical transaction, and checks DOB conflicts both in preview and again inside the transaction. Manual provisioning still uses the shared provisioning transaction without requiring Excel fields.

Migration `20261013150000_patient_import_hospital_profile` adds nine nullable structured address strings and emergencyContactRelationship; it widens hospital addressText to 2,000 and adds a CHECK prohibiting simultaneous free-text and structured addresses. No new profile table or historical backfill.

Numeric phone/HN/postal cells with potentially lost leading zeros are rejected with diagnostics; use Excel text cells. Thai text, Buddhist Era/Excel dates, blanks, formulas, errors and source worksheet row numbers follow the strict parser. Limits: address components and emergency relationship 200 characters, gender 64, phone 32, emergency name 200, postal code exactly five digits.

Detail and self-profile share address formatting and preserve whole-row hospital-local-over-legacy precedence. Self edits use existing server ownership checks and optimistic versions. Address changes replace the representation; unrelated edits and unchanged full-form submissions retain imported components. New address/relationship fields cannot be submitted through the self update schema.

Import guidance lists 25 saved patient fields and source sequence as traceability metadata. The obsolete requirement-validation prototype sentence is removed. Missing data uses the existing Thai absence labels; no invented occupation/education or clinical data.

## Verification

See the final verification record below for executed commands, results, acceptance and delivery identifiers. No production or shared database is an integration target.

## Verification record

- `git fetch origin main`, `git status --short`, `git switch -c fix/patient-import-profile-persistence origin/main`: clean main baseline; dedicated feature branch.
- `npm run test:db:up`: passed. Inspected integration runner and compose configuration: committed disposable PostgreSQL 17 on 127.0.0.1:55432/demi_test, container tmpfs; no inherited database URL override.
- Initial `npm run test:integration:focused -- tests/integration/patient-roster-baseline-import.integration.test.ts`: 12 passed / 1 expected regression failure, imported DOB persisted as null. This reproduced the reported missing-data path before the persistence fix.
- `npm run prisma:generate`: passed (Prisma Client 6.19.3).
- `npm run test:db:reset`: passed, only the repository-created disposable tmpfs integration container. Needed to validate the complete migration after the addressText-capacity refinement; no application, production, shared or Supabase database reset.
- `npm run test:integration:focused -- tests/integration/patient-roster-baseline-import.integration.test.ts`: final 15/15 passed. Applies migrations via the established runner; all 46 migrations applied successfully from an empty database, including the new migration. Tests use real PostgreSQL and actual preview/confirm actions; only the authenticated request actor and Next cache callback are supplied by test adapters, with database authorization and persistence real.
- `npm run test -- src/modules/patient-provisioning src/modules/patient-hospital-profile src/modules/patient-directory src/modules/patient-self src/modules/account-security/transport/account-security-forms.test.tsx`: 388/388 passed at that focused checkpoint; the subsequent narrowed command `npm run test -- src/modules/patient-provisioning src/modules/patient-hospital-profile src/modules/patient-directory` passed 314/314 after final traceability and self-profile tests.
- `npm run lint -- --max-warnings=0`: passed for the final runtime implementation.
- `npm run typecheck`: passed for the final runtime implementation.
- `git diff --check`: passed. Changed tracked files were decoded as UTF-8 and compared with main for BOM/line-ending changes; no replacement character or unintended encoding change found.
- `C:/Users/Yingyot/.agents/skills/impeccable/scripts/impeccable.cmd detect --json app/app/patients/[relationshipId]/patient-profile-view.tsx app/app/patients/provision/patient-provisioning-workspace.tsx app/app/personal/profile/[relationshipId]/profile-editor.tsx`: no findings. The later metadata-only sequence preview copy is covered by lint/typechecking and import tests.
- Initial `npm run test`: 323 files / 2,909 tests passed; one reporting workbook suite failed during import with Prisma.TransactionIsolationLevel unavailable. It ran concurrently with the integration runner's Prisma generation. `npm run test -- src/modules/reporting/services/hospital-report-workbook-service.test.ts` then passed 1/1 without a code change. Generation overlap is the likely environmental cause; final sequential `npm run test` confirmation passed all 324 files / 2,910 tests, with no further code change.
- `npm run test:integration`: 40 files, 680 passed / 2 failed. Both failures were obsolete assertions for the former persistence/read-model contract, not failed database writes. Updated them to assert saved DOB, hospital-local demographic/contact values and absent legacy emergency relationship.
- `npm run test:integration:focused -- tests/integration/patient-directory.integration.test.ts`: 3/3 passed after the read-model assertion update.
- `npm run test:integration:focused -- tests/integration/patient-provisioning.integration.test.ts`: 15/15 passed after the persistence assertion update. Production code did not change after the broad integration run; the full integration suite was not repeated for assertion-only changes.

There are no `architecture:check` or `lint:strict` scripts in package.json. Existing service/domain direction was preserved and strict warning-free lint used. No production build or dev server was started; browser/device manual UAT was not performed. No production migration/deployment or data modification is claimed.

- Final assertion-only checks: `npx eslint tests/integration/patient-directory.integration.test.ts tests/integration/patient-provisioning.integration.test.ts --max-warnings=0`, `npm run typecheck`, and `git diff --check` passed.

Merge readiness: **READY FOR REVIEW**. This is verification evidence, not merge approval.

## Acceptance

- [x] All 25 meaningful patient template fields have an authoritative persistence outcome; sequence is traceability metadata.
- [x] Patient Detail renders persisted imported values and genuine absence labels.
- [x] Distinct address fields and all emergency-contact fields are preserved.
- [x] Baseline and classification remain in established clinical domains.
- [x] Duplicate imports do not overwrite patient records.
- [x] Hospital-local profiles remain isolated and local nulls authoritative.
- [x] Self-profile read/edit, unchanged full forms, explicit address replacement and optimistic versions are consistent.
- [x] Preview/result guidance reflects complete NEW-patient profile persistence; sequence reaches preview.
- [x] No fake or prototype-only values.
- [x] Relevant real-PostgreSQL suites pass (15 import + 3 directory + 15 provisioning tests); broad-run legacy assertions were resolved with focused checks.
- [x] No production/shared database or production Supabase data was reset or modified.

Branch: `fix/patient-import-profile-persistence`. No merge into main is authorized or performed.

## Files changed

- `app/app/patients/[relationshipId]/patient-profile-view.tsx`
- `app/app/patients/provision/patient-provisioning-workspace.tsx`
- `app/app/personal/profile/[relationshipId]/profile-editor.tsx`
- `docs/CONTEXT.md`
- `docs/adr/0011-patient-import-profile-persistence.md`
- `docs/adr/README.md`
- `docs/architecture/DEMI_ARCHITECTURE_BASELINE.md`
- `docs/phases/PATIENT_IMPORT_PROFILE_PERSISTENCE_HANDOFF.md`
- `prisma/migrations/20261013150000_patient_import_hospital_profile/migration.sql`
- `prisma/schema.prisma`
- `src/modules/account-security/transport/account-security-forms.test.tsx`
- `src/modules/patient-directory/services/patient-directory-query-service.test.ts`
- `src/modules/patient-directory/services/patient-directory-query-service.ts`
- `src/modules/patient-directory/transport/patient-detail-page.test.ts`
- `src/modules/patient-hospital-profile/domain/patient-hospital-address.test.ts`
- `src/modules/patient-hospital-profile/domain/patient-hospital-address.ts`
- `src/modules/patient-hospital-profile/domain/patient-hospital-profile-values.test.ts`
- `src/modules/patient-hospital-profile/domain/patient-hospital-profile-values.ts`
- `src/modules/patient-hospital-profile/schemas/patient-hospital-profile-schemas.test.ts`
- `src/modules/patient-hospital-profile/services/patient-hospital-profile-service.test.ts`
- `src/modules/patient-hospital-profile/services/patient-hospital-profile-service.ts`
- `src/modules/patient-provisioning/adapters/canonical-patient-import-adapter.test.ts`
- `src/modules/patient-provisioning/adapters/excel-patient-import-adapter.ts`
- `src/modules/patient-provisioning/import/patient-import-contract.ts`
- `src/modules/patient-provisioning/import/patient-import-normalization.ts`
- `src/modules/patient-provisioning/import/patient-import-profile.ts`
- `src/modules/patient-provisioning/presentation/patient-import-presentation.test.ts`
- `src/modules/patient-provisioning/services/patient-roster-import-preview.ts`
- `src/modules/patient-provisioning/services/patient-roster-import-service.test.ts`
- `src/modules/patient-provisioning/services/patient-roster-import-service.ts`
- `src/modules/patient-provisioning/services/patient-roster-import-types.ts`
- `src/modules/patient-provisioning/transport/patient-import-downloads.test.ts`
- `src/modules/patient-provisioning/transport/patient-import-result-ui.test.ts`
- `src/modules/patient-provisioning/transport/patient-provisioning-workspace.test.ts`
- `src/modules/patient-self/transport/patient-self-page-context.test.ts`
- `tests/integration/patient-directory.integration.test.ts`
- `tests/integration/patient-provisioning.integration.test.ts`
- `tests/integration/patient-roster-baseline-import.integration.test.ts`


## Final P2 regression: relationship-aware import validation (2026-10-13)

**READY FOR REVIEW** on `fix/patient-import-profile-persistence`.

The adapter and candidate normalizer previously discarded valid identity input when unrelated profile fields were malformed. Such rows never reached relationship resolution and incorrectly became INVALID, including patients whose profiles would never be updated.

The adapter still parses and validates profile fields and retains their canonical values/diagnostics. Identity eligibility now depends only on national identity, given/family names, HN and authorized hospital scope. Preview resolves the relationship before blocking on profile diagnostics. Existing relationships retain identity/name/HN/account-state checks, ignore unused profile/clinical errors and need no baseline date. A valid populated DOB mismatch remains CONFLICT; malformed DOB is ignored only for existing relationships. New relationships still require the complete approved profile/clinical validation. The same ordering is enforced inside the existing Serializable transaction before any provisioning writes, including late relationships. HMAC, confirmation re-parsing, retries, export, ownership and schema remain unchanged.

### Files modified for the regression

- `src/modules/patient-provisioning/adapters/excel-patient-import-adapter.ts`
- `src/modules/patient-provisioning/services/patient-roster-import-preview.ts`
- `src/modules/patient-provisioning/services/patient-roster-import-service.ts`
- `src/modules/patient-provisioning/adapters/canonical-patient-import-adapter.test.ts`
- `src/modules/patient-provisioning/services/patient-roster-import-service.test.ts`
- `tests/integration/patient-roster-baseline-import.integration.test.ts`
- This handoff addendum.

### Regression coverage and executed verification

Eight new unit cases cover independent identity eligibility for seven malformed profile/clinical fields and the valid-DOB conflict check on a late relationship. Parser assertions now require identity retention plus diagnostics, while malformed core HN still has no eligible input.

Sixteen new real-PostgreSQL cases cover fourteen existing-row variants (ignored malformed data, valid DOB/name/HN conflicts, malformed identity), mixed append-only import plus invalid new rows and failed-row source preservation, and relationship creation both between HMAC preview/confirmation and after the server's re-preview but before its Serializable transaction. Snapshots include identity, accounts/roles, global/local profiles, relationships, baseline, classification/history and audits to detect writes on existing rows. Existing integration cases still verify complete persistence, hospital isolation and rollback.

| Command | Actual result |
| --- | --- |
| `npm run test -- src/modules/patient-provisioning/services/patient-roster-import-service.test.ts` | Initial reproduction: 38 passed, 5 failed because profile diagnostics erased identity input. Final: 44/44 passed. |
| `npm run test -- src/modules/patient-provisioning` | After aligning parser assertions with the new validation boundary: 16 files, 219/219 passed. The subsequently added DOB transaction case is included in the final 44/44 run above. |
| `npm run test:db:status` | Existing repository-owned tmpfs PostgreSQL 17 container healthy, bound to 127.0.0.1:55432/demi_test; inherited DATABASE_URL absent. |
| `npm run test:integration:focused -- tests/integration/patient-roster-baseline-import.integration.test.ts` | Final: 31/31 passed. First run: 30 passed and one export assertion incorrectly checked normalized instead of original source-cell data; corrected to inspect sourceRows. All 46 existing migrations applied already, no pending migration. |
| `npm run lint -- --max-warnings=0` | Final passed; earlier test-only unused-variable warnings resolved. |
| `npm run typecheck` | Final passed; earlier new test fixture type errors resolved. |
| `git diff --check` | Passed. |

No migration, database reset, production/shared data changes, dependencies, UI redesign or history rewrite. Integration fixture cleanup ran only against the verified disposable repository PostgreSQL target. The full repository suite/build/browser UAT were not run for this isolated validation-order change; affected import unit and real database workflows were executed.

### Final acceptance

- [x] Existing patients with malformed ignored fields return ALREADY_EXISTS.
- [x] Core identity conflicts are not bypassed.
- [x] Valid global DOB conflicts remain enforced.
- [x] New patients still require complete profile validation.
- [x] Mixed append-only imports work correctly.
- [x] Existing records remain unchanged.
- [x] New records persist the complete approved profile.
- [x] Failed-rows behavior remains correct.
- [x] Relevant PostgreSQL integration tests pass.
- [x] No unrelated changes were introduced.

Merge approval remains with the reviewer; this branch is not merged into main.
