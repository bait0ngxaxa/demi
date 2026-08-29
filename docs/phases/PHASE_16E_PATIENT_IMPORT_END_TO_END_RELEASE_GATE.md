# DEMI Phase 16E — Patient Import End-to-End Release Gate

วันที่ตรวจ: 2026-08-28
ขอบเขต: current demo/MVP Patient roster import
ผลการตรวจนี้เป็น audit ของ implementation ปัจจุบัน ไม่ใช่ feature phase และไม่มีการแก้ business behavior

## Gate result — original audit (2026-08-28)

# FIX REQUIRED

Patient Import ยังไม่ควรถูก freeze เป็น release-gated/stable baseline เนื่องจากมี
blocker ด้าน availability/security ของ XLSX parser และยังไม่มีหลักฐานยืนยันการ
ล้าง cached/unreachable historical sensitive object บน GitHub ครบถ้วน

ข้อสรุปนี้ไม่ใช่ผลจาก test failure: implementation semantics ของ Patient import
ที่ตรวจพบว่าสอดคล้องกับ Phase 16 decisions ส่วนใหญ่ผ่านการตรวจ แต่ blocker สอง
รายการข้างต้นเพียงพอให้ gate ไม่ผ่าน

สถานะ `FIX REQUIRED` ข้างต้นเป็นผลของ original Phase 16E audit และคงไว้เพื่อ
รักษา audit chronology; disposition และ release-governance decision ที่เกิดขึ้น
ภายหลังบันทึกไว้ใน append-only sections ด้านล่าง

## Audited baseline

- Starting HEAD: `41260bb47f1fc7b26396d7f66bba7556e179536a`
- `origin/main` at audit start: `41260bb47f1fc7b26396d7f66bba7556e179536a`
- Branch: `demidemo`
- Audit deliverable commit SHA: บันทึกใน completion report หลัง commit; audited implementation baseline คือ starting HEAD ข้างต้น
- ก่อนตรวจ `git fetch origin --prune` สำเร็จด้วย safe-directory override; ไม่มี uncommitted change ที่มีอยู่ก่อน audit

การตรวจอ่าน source, schema, accepted Phase 16 documents, focused tests และ full
test suites โดยไม่เปิด/พิมพ์/กู้คืน/copy sensitive historical workbook/blob
ตามข้อจำกัดของ Phase 16E

## Confirmed scope

ระบบรองรับ Patient roster import แบบ bounded demo/MVP สำหรับ:

- National ID identity, given name, family name และ HN / `PatientHospitalRelationship`
- Initial Baseline: weight, height, waist circumference, DTX mg/dL และ HbA1c
- Patient-global Classification: `RISK` / `DIABETES`, current state และ history
- OSM caregiver assignment/reassignment ภายใต้ target-Hospital และ OWNER rules
- Preview/confirm แบบ server-authoritative, per-row Serializable transaction และ
  row-independent partial success

## Explicitly unsupported/gated scope

Canonical workbook อาจมี DOB, gender, phone, address, postal code, emergency
contact และ field อื่นที่อยู่ระหว่าง requirement gate แต่การมี column เหล่านี้
ไม่ใช่ authorization ให้ persist ระบบสื่อสาร field ที่ยังไม่ persist อย่าง
ตรงไปตรงมา และไม่ตีความว่าเป็น “นำเข้าข้อมูลทั้งหมด”

`IMP-REQ-03` (Hospital / รพ.สต. hierarchy และ authority semantics) และ
`P16C-PROFILE-01` (profile/contact/address persistence ownership) ยังคงเป็น
OPEN REQUIREMENTS ไม่ได้ถูก resolve โดย implementation นี้

## Canonical contract

แหล่งอ้างอิงหลักคือ:

- `src/modules/patient-provisioning/import/patient-import-template-contract.ts`
- `src/modules/patient-provisioning/import/patient-import-template.ts`
- `scripts/generate-patient-import-template.ts`
- `public/templates/demi-patient-import-template-v1.xlsx`

ผลตรวจ canonical contract:

- มี contract source เดียวที่ใช้ร่วมกับ generator/parser; official workbook เป็น
  blank distributed artifact ไม่มี Patient rows และไม่พบ PII จาก semantic inspection
- มี 28 canonical columns A:AB ตามลำดับที่กำหนด, one Patient worksheet,
  two-row header, Patient rows Excel 3–502 และ maximum 500 records
- row 1/2 ใช้ merge เป็น presentation; parser อ่าน master cell ครั้งเดียวและไม่
  ใช้ merge formatting เป็น semantic authority
- column `ประเภทเบาหวาน` รับเฉพาะ `กลุ่มเสี่ยง` และ `เบาหวาน`; ไม่รับ historical
  Type 1/Type 2 wording โดยปริยาย
- critical identity/relationship/contact text columns ใช้ text format เพื่อไม่ให้
  leading zero สูญหาย และ generator กำหนด validation vocabulary เดียวกับ contract
- official Template ดาวน์โหลดจาก Patient import UI และ generated workbook parse
  ผ่าน canonical adapter ด้วย synthetic data
- production preview และ confirm ส่ง `mode: "CANONICAL"` เสมอ; `COMPATIBILITY`
  ใช้ได้เฉพาะ explicit compatibility tooling/tests ไม่มี canonical-to-compatibility
  fallback

การรัน generator ทำให้เกิดการเปลี่ยนแปลงระดับ ZIP metadata ชั่วคราวตามธรรมชาติ
ของ XLSX แต่ semantic shape ของ generated artifact ตรงกับ committed artifact
(sheet, 28 columns, header/merge/data-area semantics) จึงไม่ commit binary drift

## Authorization matrix

| Actor | Core import | Baseline | Classification | OSM roster mutation |
|---|---|---|---|---|
| Hospital `OWNER` | อนุญาตใน direct active Hospital scope | อนุญาตตาม current policy | อนุญาต | อนุญาต assign/reassign |
| Hospital `MEMBER` | อนุญาต | อนุญาตตาม current policy | อนุญาต | ปฏิเสธ; `OWNER_REQUIRED` |
| `OSM` | ไม่มี bulk roster authority | ไม่มี bulk roster authority | ไม่มี bulk roster authority | ห้ามใช้ roster เพื่อ mutate และห้าม self-assign |
| `ADMIN` | ไม่มี routine Hospital-scoped roster authority | ไม่มี routine authority | ไม่มี routine authority | governance/recovery แยกจาก routine assignment |

Policy ถูกตรวจซ้ำใน server transaction ไม่ได้อาศัย role หรือ target ID จาก
browser และไม่ resolve Hospital hierarchy ที่ยังเป็น open requirement

## Domain audit

| Domain | Verdict | Evidence / semantics ที่ตรวจพบ |
|---|---|---|
| Core | ผ่านการตรวจ | identity ใช้ HMAC hash เป็น DB key, reuse Person/User/Profile/relationship ได้, additive `PATIENT` role ไม่ลบ role เดิม, HN conflict/fill semantics ชัดเจน, ไม่มี Patient credential generation ให้ Hospital operator |
| Baseline | ผ่านการตรวจ | blank source = no assertion, one effective date, create/idempotent/conflict, existing value immutable และไม่ใช้ last-write-wins |
| Classification | ผ่านการตรวจ | exact confirmed vocabulary, create/no-op/explicit change, stale state recheck, current + history append atomic, idempotent import ไม่เพิ่ม history ซ้ำ และเป็น Patient-global |
| OSM | ผ่านการตรวจ | exact normalized name, active eligible OSM ใน target Hospital เท่านั้น, no fuzzy/cross-Hospital/self, ambiguous/not-found/self-only fail closed, OWNER-only mutation และ same assignment เป็น NOOP |

## Security and authority audit

- Target Hospital มาจาก server-derived allowed scope; workbook Hospital text มีได้
  เพียง reconciliation/mismatch information ไม่สามารถเลือกหรือ grant scope ได้
- Preview เป็น advisory; confirm re-authenticates actor, ตรวจ active actor,
  active Hospital, active membership และ capability ใหม่ใน fresh preview และ row
  transaction
- File fingerprint, actor, target Hospital, effective date และ runtime contract
  ถูกผูกด้วย HMAC; classification binding ผูก source/current state; OSM binding
  เป็น opaque token ที่ server recompute candidate/current assignment
- browser ไม่สามารถ submit arbitrary OSM User UUID, Person UUID หรือใช้ browser
  token เป็น authority; forged row/candidate/stale file/Hospital/date/contract ถูก
  reject ก่อน mutation
- public preview projection ไม่มี raw National ID, identity hash, User/Person/
  Profile/OSM UUID, authSubject หรือ raw Prisma record; identity แสดงแบบ masked
- audit payload อยู่ใน transaction, bounded และไม่เก็บ raw National ID, workbook row
  dump, clinical payload หรือ caregiver personal data ที่ไม่จำเป็น
- ไม่พบ production-path `console.log`, raw candidate/workbook-row logging หรือ
  `JSON.stringify(candidate)` ที่เปิด Patient identity จากการตรวจ import modules

## Transactionality, independence and concurrency

- executable logical Patient row ใช้หนึ่ง caller-owned Serializable transaction
  ครอบคลุม Core + Baseline + Classification + OSM + audit; public service ไม่เปิด
  nested independent transaction
- unresolved required domain (เช่น OSM not found, classification confirmation
  หาย, reassignment ไม่ได้รับ consent หรือ baseline conflict) block ทุก supported
  mutation ของ row นั้น
- workbook ไม่ใช่ global transaction: row สำเร็จ, row conflict และ row สำเร็จ
  ที่ไม่เกี่ยวกันยัง commit ได้อย่างอิสระ
- rollback coverage ครอบคลุม failure หลัง core/Baseline, later classification และ
  OSM assignment/audit; newly created Person/User/role/Profile/relationship/
  Baseline/Classification/history/assignment/audit ไม่เหลือ orphan จาก row ที่
  rollback
- serializable retry จำกัดเฉพาะ Prisma `P2002`/`P2034` และจำนวนครั้ง bounded;
  application validation/conflict ไม่ถูก retry เป็น mutation ซ้ำ
- integration coverage ตรวจ concurrent new identity, classification state และ
  OSM active assignment ให้ deterministic/idempotent ตาม unique constraints
- duplicate logical Patient ในไฟล์เดียวกันเป็น `DUPLICATE_IN_FILE`; ไม่มี first-wins,
  last-wins หรือ double mutation

## Preview, confirm, result and recovery UX

ตรวจ UI หลัง Phase 16D.6 แล้วพบว่า:

- Template action, 500-row limit, file name/size, loading state และ effective-date
  meaning แสดงชัดเจน
- ตารางแสดง actual Excel row, masked National ID, HN และ grouped domain reasons;
  ไม่ expose raw enum names เป็นข้อความ operator
- `NEEDS_REVIEW` จะ presentation เป็น `ต้องตรวจสอบ` จนกว่าจะเลือกทุก required
  confirmation; เลือกครบจึงเป็น `พร้อมนำเข้า`; uncheck กลับเป็น `ต้องตรวจสอบ`
- presentation helper ไม่ mutate server `row.classification`
- all blocked ปิด confirm, partial executable เปิด confirm, all idempotent ไม่ถูก
  รายงานเป็น error และไม่ใช้ wording ว่ามี new records saved เมื่อไม่มี
- `ALREADY_EXISTS` เป็น successful idempotence และไม่ถูกนับเป็น attention
- result primary buckets มี invariant ผลรวมเท่ากับจำนวน rows และ domain counters
  overlap ได้ตาม design
- recovery แยก `DATA_REVIEW`, `CONFIRMATION_REQUIRED`, `OWNER_REQUIRED` และ
  `RETRY_FAILED`; mixed result แสดงหลาย recovery action ได้
- canonical mismatch แจ้งวิธีแก้และยังแสดง Download Template; ไม่มี technical
  parser/stack detail และไม่มี compatibility fallback
- gated fields ถูกสื่อสารว่าไม่ persist; valid core ไม่ถูกทำให้ fail เพียงเพราะ
  workbook มี field ที่ยังอยู่ใน requirement gate

## Boundary and journey audit

| Journey / gate | Verdict | Evidence |
|---|---|---|
| Canonical Template self-consistency | ผ่านการตรวจ | generator → synthetic valid row → canonical parse/preview/confirm path; no real data |
| 500-row boundary | ผ่านการตรวจ | 500 canonical records accepted; final Patient source row is `502`; 501 rejected |
| Reconciliation at rows 501/502 | ผ่านการตรวจ | classification binding/confirmation and OSM assignment/reassignment tests use actual source rows |
| New Patient happy path | ผ่านการตรวจ | synthetic OWNER flow persists core + HN + Baseline + Classification + exact OSM and repeats idempotently |
| Existing Patient enrichment | ผ่านการตรวจ | existing core reused while missing supported domains are created without duplicate identity graph |
| Classification + OSM reconciliation | ผ่านการตรวจ | no confirmation/one confirmation blocks; both confirmations commit atomically; repeat is idempotent |
| MEMBER import | ผ่านการตรวจ | core/Baseline/Classification allowed by policy; new/different OSM mutation is `OWNER_REQUIRED` with no partial row mutation |
| Baseline conflict | ผ่านการตรวจ | source-present differing measurement yields `CONFLICT` and blocks core/classification/OSM row mutation |
| OSM not-found/ambiguous/self | ผ่านการตรวจ | correct preview reason, non-executable, no partial Patient-row mutation |
| Forged source row/token | ผ่านการตรวจ | authoritative preview/binding required; nonexistent row and forged OSM token rejected |

## Performance review

Normal preview loads unique Person identity state in bounded batched queries and
eligible OSM candidates in target-Hospital scope; no one-full-workforce-query-per-row
or obvious N+1 pattern was found. A full 500-row database write was not run because
the requirement explicitly permits adapter-boundary coverage when the stress write
would be unnecessarily expensive; focused final-row integration tests exist.

This does not remove the parser resource finding below: semantic row/worksheet limits
are applied after ExcelJS has materialized the uploaded workbook and are not parser
resource limits.

## Privacy and sensitive-data gate

### Current tree

Safe tracked-tree filename/metadata inspection found no real Patient roster filename,
CSV export, attachment, temporary debug dump, or Patient import fixture. The tracked
XLSX files are:

- `public/templates/demi-patient-import-template-v1.xlsx`: official sanitized blank
  Template; semantic inspection confirmed no Patient rows/PII.
- `docs/Dashboard App Demi.xlsx`: documented dashboard/design reference artifact.
- `docs/demi_hospital_master_v2.xlsx`: documented Hospital master seed/reference.

The latter two were classified from safe metadata and repository documentation only;
their contents were not opened because this gate must avoid unnecessary inspection of
potentially sensitive spreadsheets. Tests use synthetic data.

`.gitignore` protection for Patient-roster-like `docs/**/รายชื่อคนไข้*.xlsx` remains.

### Historical remediation status (at original audit)

`docs/phases/PHASE_16B0_PATIENT_IMPORT_ADAPTER_V2_COMPATIBILITY_FOUNDATION.md`
states that the real workbook was removed from the corrected tree/history, but also
states that public GitHub history rewrite does not guarantee removal from cached or
unreachable objects and recommends coordinating GitHub Support. No confirmation of
that external purge/cleanup was present in the reviewed repository.

Therefore this remains an **EXTERNAL PRIVACY RELEASE BLOCKER**. Local path/object
metadata checks do not prove GitHub-side object/cache cleanup, and this audit makes
no claim that the privacy incident is fully resolved.

## Findings

### BLOCKERS (original audit result)

1. **Patient XLSX parser resource boundary — Medium / CWE-409**

   In `readPatientImportCandidates()` at
   `src/modules/patient-provisioning/adapters/excel-patient-import-adapter.ts:895–899`,
   the complete attacker-controlled buffer reaches `workbook.xlsx.load(buffer)`
   after only the 5 MiB request/buffer check. The 64-column, 12-worksheet, 8-header
   row and 500-record checks run after parsing (`:909–914`). No repository-level
   ZIP uncompressed-size, compression-ratio, entry-count, XML dimension, parser
   timeout or memory guard bounds decompression/materialization. A crafted XLSX
   within the compressed request limit can therefore consume disproportionate CPU or
   memory during preview/confirm.

   Required follow-up is a separate focused security remediation: bounded ZIP
   preflight, decompressed/entry/XML/dimension limits, parser isolation/timeout and
   appropriate import abuse/rate controls. Do not treat canonical row limits as a
   substitute for parser resource limits. No remediation was implemented in Phase
   16E.

2. **EXTERNAL PRIVACY RELEASE BLOCKER — GitHub historical object/cache cleanup not
   confirmed**

   The repository documents the prior sensitive workbook incident and corrected
   local/history state, but not confirmed GitHub-side purge of cached/unreachable
   copies. Required action is external owner/GitHub Support confirmation; do not
   fetch or inspect the sensitive object and do not mark the incident resolved from
   local metadata alone.

### NON-BLOCKING DEBT

- `serializable-transaction.ts` has bounded retry and correct retryable Prisma codes,
  but no exponential backoff/jitter; this is reliability hardening for a later
  focused change, not a reason to alter Phase 16E semantics.
- The preview/orchestration and workspace presentation files are large but have
  coherent boundaries and test coverage; extraction is optional maintenance work.
- No full 500-row DB stress import was run; adapter boundary plus focused row-502 and
  domain integration coverage is the proportionate evidence for this gate.
- Public Hospital onboarding has a separate source-backed no-throttling/CWE-770
  finding from the security scan. It is outside the Patient Import gate and should be
  tracked separately; it does not excuse or resolve the Patient parser blocker.

### OPEN REQUIREMENTS

- `IMP-REQ-03`: Hospital / รพ.สต. hierarchy and authority semantics.
- `P16C-PROFILE-01`: profile/contact/address persistence ownership.

The current implementation uses direct Hospital scope as confirmed for this bounded
Patient workflow and does not guess either unresolved requirement.

## Test evidence

Required commands were run against the audited revision:

| Command | Result |
|---|---|
| `npm run generate:patient-import-template` | ผ่าน; official artifact semantic shape matches generator/contract; no semantic drift committed |
| `npx prisma validate` | ผ่าน |
| `npx prisma generate` | ผ่าน; Prisma Client generated, no tracked generated diff |
| `npm run lint` | ผ่าน |
| `npm run typecheck` | ผ่าน |
| `npm test` | ผ่าน: 137 test files, 929 tests |
| `npm run test:integration` | ผ่าน: 23 test files, 204 tests; test DB had no pending migrations |
| Focused Patient import suite | ผ่าน: 10 files, 85 tests |
| `git diff --check` | ผ่าน; no whitespace errors |

Focused coverage includes canonical self-parse/500-row/wrong structure/merged header,
file/Hospital/date/contract/token bindings, core role preservation, Baseline
immutability/date/conflict, Classification create/no-op/change/stale/history,
OSM exact resolution/OWNER/MEMBER/not-found/ambiguous/self/concurrency, row
atomicity/rollback/independence, and dynamic ready/recovery presentation.

The repository-wide Codex Security Standard scan completed for 616 files at the
audited revision. It recorded the source-backed CWE-409 parser finding and the
out-of-scope CWE-770 onboarding finding. Advisory TAC status was unavailable after
the single permitted status attempt; this did not prevent the local source scan from
completing.

## Schema, migration and hygiene confirmation

- Phase 16E made zero Prisma schema changes and zero migrations.
- No generated/vendor file was edited to hide an error.
- No unrelated source or test change was made.
- Final hygiene check must leave only this audit document, the concise CONTEXT handoff
  and the focused release-gate commit in the diff.

## Release recommendation — original audit (2026-08-28)

Keep Patient Import **open / FIX REQUIRED** for the current demo/MVP release gate.

The next work should be two separately reviewable actions: (1) resolve and document
external GitHub historical-object/cache cleanup, and (2) implement and test a
bounded XLSX parser resource boundary. After both are independently re-audited,
repeat this gate. Do not reopen confirmed Patient domain semantics or introduce
generic import architecture, hierarchy behavior, profile ownership, schema changes,
or new business features as part of the remediation by assumption.

## Phase 16E.1 remediation status (2026-08-28)

This append-only section records the focused Phase 16E.1 remediation and does not
rewrite the historical Phase 16E audit result above.

The Phase 16E Patient XLSX parser resource blocker is addressed and ready for
re-audit. `readPatientImportCandidates()` now runs a server-only `yauzl@3.4.0`
lazy ZIP preflight before constructing an ExcelJS workbook. The preflight enforces:

- 256 ZIP entries, 32 MiB cumulative declared uncompressed bytes and 16 MiB per
  entry;
- safe integer/offset metadata, local-header bounds, duplicate normalized-name
  rejection, suspicious-name rejection, encrypted-entry rejection and stored/deflate
  method allowlisting;
- 12 worksheet package parts, 65,536 worksheet cell elements, 2,048 row elements,
  row/column coordinate ceilings of 10,000/256, and bounded dimension/merge areas;
- the prior scan-first-12 behavior is hardened to reject packages with more than 12
  worksheet parts before ExcelJS; Canonical production input has one worksheet;
- actual streamed decompressed-byte counting for worksheet XML;
- bounded `saxes@6.0.0` streaming XML inspection with DTD rejection, no DOM and no
  external entity/network resolution.

The boundary is shared by CANONICAL and COMPATIBILITY adapter modes and therefore
protects both Preview and Confirm. Focused synthetic tests cover malformed and
resource-amplifying ZIP/XML inputs, official Template v1, exactly 500 canonical
rows/source row 502, compatibility shape, merged headers, and proof that an unsafe
resource envelope rejects before `workbook.xlsx.load()` is invoked. Existing semantic
501-record rejection and Patient domain regression suites remain unchanged.

Phase 16E.1 verification evidence: `npm run generate:patient-import-template`,
`npx prisma validate`, `npx prisma generate`, `npm run lint`, and
`npm run typecheck` passed; `npm test` passed with 138 files/958 tests;
`npm run test:integration` passed with 23 files/204 tests; the focused 7-file
Patient import parser/adapter suite passed with 104 tests. `git diff --check`
passed, and no Prisma schema, migration or generated Template artifact diff remains.

The parser blocker status is **REMEDIATED / READY FOR RE-AUDIT**. This does not make
the overall Phase 16E release gate pass: the separate **EXTERNAL PRIVACY RELEASE
BLOCKER** for GitHub historical sensitive-workbook cached/unreachable cleanup remains
unconfirmed and is intentionally not addressed by Phase 16E.1.

## Phase 16E.1 follow-up — actual bytes for every XLSX file entry (2026-08-29)

The follow-up remediation closes the remaining package-accounting gap: preflight now
opens and consumes every non-directory ZIP file entry before ExcelJS. It enforces
actual per-entry and package-wide decompressed bytes, keeps the declared central-
directory limits and `yauzl` size validation, drains non-worksheet/binary entries
without buffering them, and feeds each worksheet stream directly into the existing
SAX checks. The `actualTotalUncompressedBytes` summary metric is separate from the
worksheet-only `worksheetXmlBytes` metric. The same stream is used for counting and
worksheet inspection; no worksheet double-read occurs inside preflight.

The Phase 16E.1 parser blocker remains **REMEDIATED / READY FOR RE-AUDIT**. Overall
Phase 16E remains **FIX REQUIRED** because the separate Phase 16E.2 external privacy
evidence blocker is still open. This follow-up does not access historical Patient
workbooks/blobs or change any domain, schema, authorization or contract semantics.

## Historical blockers and disposition (2026-08-29)

ส่วนนี้สรุป disposition ของ blocker จาก original audit โดยไม่เปลี่ยน chronology
ของผล `FIX REQUIRED` ที่บันทึกไว้ข้างต้น

### XLSX parser resource boundary

Phase 16E.1 status: **PASS / CLOSED**

XLSX parser resource boundary: **REMEDIATED**

Status: **RESOLVED BY PHASE 16E.1 / RE-AUDITED PASS**

Phase 16E.1 remediated the application parser resource boundary, and the follow-up
re-audit passed against the current reviewed implementation baseline. The parser
resource blocker is closed; the technical evidence and regressions remain recorded
ในเอกสาร Phase 16E.1

### Phase 16E.2 — Historical GitHub object/cache cleanup evidence

Status:
**EXTERNAL OWNER-MANAGED FOLLOW-UP**
**NOT RELEASE-BLOCKING**
**NOT RESOLVED**

The project/repository owner will coordinate GitHub Support and any other external
cleanup confirmation separately. This is an external privacy follow-up, not an
application implementation blocker for the current DEMI Patient Import release
decision. No historical sensitive workbook/blob was fetched or inspected here, and
no GitHub purge or cleanup completion is asserted.

## Final closure decision (2026-08-29)

Current reviewed implementation baseline: `95a19086cccfd451d22d64977e480704206c2ae9`

Phase 16E final status: **PASS / CLOSED**

The original Phase 16E audit identified two blockers: the XLSX parser
resource-boundary blocker and the external historical sensitive-object cleanup
evidence blocker. Phase 16E.1 remediated the application parser blocker, and the
follow-up re-audit passed Phase 16E.1. The owner then made an explicit
release-governance decision that the remaining historical GitHub cached/unreachable
sensitive-object cleanup evidence will be handled separately and is not an
application release blocker for this case.

The external privacy follow-up remains **NOT RESOLVED** until external GitHub
confirmation exists. This decision is not evidence that GitHub purge/cleanup has
completed and is not a general policy for future incidents.

The Patient Import application release gate evaluates the correctness,
authorization, data integrity, privacy boundaries of current reachable application
artifacts, transactionality, parser safety and operational workflow. The unresolved
historical GitHub cached/unreachable object cleanup is a separate
incident-remediation governance item managed outside the application runtime. The
project owner explicitly accepts that separation for this current demo/MVP release
decision.

The current reachable repository tree remains safe for the reviewed Patient Import
scope based on the existing audit evidence. Historical GitHub cached/unreachable
sensitive-object cleanup remains pending external confirmation. These are separate
positions and must not be conflated.

Patient Import status: **STABLE / RELEASE-GATED FOR CURRENT CONFIRMED DEMO/MVP SCOPE**

This freezes the currently confirmed architecture and semantics as the bounded
demo/MVP baseline; it does not mean every future customer requirement is complete.
`IMP-REQ-03` Hospital / รพ.สต. hierarchy and authority semantics and
`P16C-PROFILE-01` profile/contact/address persistence ownership remain **OPEN
REQUIREMENTS** and were not guessed or resolved.

The existing technical debt remains explicitly **NON-BLOCKING**: serializable
transaction retry has bounded retry but no backoff/jitter; some
preview/orchestration/UI files remain large; a full 500-row database stress import
is not part of the current release evidence; and the separate public Hospital
onboarding throttling/security finding remains outside this Patient Import release
gate.

## Final release recommendation

Patient Import: **APPROVED AS CURRENT DEMO/MVP BASELINE**

Phase 16E: **CLOSED**

Future changes to confirmed Patient Import semantics should occur only when customer
requirements change, an actual defect is found, or a separately scoped hardening
requirement is approved. Do not casually reopen the completed Phase 16
implementation.
