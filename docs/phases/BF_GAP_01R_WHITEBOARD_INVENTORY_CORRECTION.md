# BF-GAP-01R — Customer Whiteboard Inventory Correction

**Program:** Business Flow Closure Program  
**Date:** 2026-10-12 (Asia/Bangkok)  
**Disposition:** BF-GAP-01R — PASS / CUSTOMER WHITEBOARD INVENTORY CANONICALIZED  
**Canonical register:** [Business Flow Gap Canonical](../requirements/BUSINESS_FLOW_GAP_CANONICAL.md)

## Review trigger

Independent review found material BF-GAP-01 inventory defects: customer Settings/account and consent concepts were omitted or grouped; Patient provisioning was incorrectly described as OWNER-only; Hospital content/contact consumer coverage exceeded current runtime evidence; Hospital Admin-as-Patient context was incomplete; notification time slots were tied to Medication without conclusive layout evidence; and historical Phase 17A RPT-02 lineage was too narrow. The prior disposition did not satisfy the inventory's own definition of done.

## Baseline

| Field | Value |
| --- | --- |
| Expected correction baseline | `f2d2222f6f4f4b5c02af9709092cafadbb850aa3` |
| Analyzed branch | `main` |
| Analyzed HEAD | `f2d2222f6f4f4b5c02af9709092cafadbb850aa3` |
| HEAD match | Yes; no checkout, reset, or history change. |
| Working tree before correction | Clean. |
| Runtime/schema changes | None. |

The actual analyzed HEAD matches the task-supplied expected commit exactly.

## Small-correction review addendum

Subsequent review of commit `e41f8d464e96878c528e578c057e807201eb57d9` identified three remaining row corrections. This follow-up analyzed `main` at that HEAD with a clean working tree on 2026-10-12. OWNER publisher list/detail and contact-management read operations were inspected directly; reviewer-supplied Canva evidence confirms NOTIF-01 appears in multiple role flows. Only CONTENT-08, CONTENT-11, NOTIF-01 and corresponding summaries were corrected. No IDs were added or removed. The 145-row total remains; PARTIAL increases 61 → 63, MISSING decreases 21 → 19, and O/S/H actor counts each increase by one. BF-GAP-00 remains PASS and BF-GAP-02 remains NOT STARTED. This corrected inventory is ready for review acceptance.

## Source evidence

- **W1 — original customer evidence:** the whiteboard extract supplied in the original BF-GAP-00/01 task.
- **W2 — reviewer-verified customer evidence:** the correction facts in the BF-GAP-01R task, based on independent review of Canva design `DAHSvdQ3gvU`. These facts include “การตั้งค่าการแจ้งเตือน”, “การเชื่อมบัญชี”, “เบอร์โทรศัพท์”, “อีเมล”, “เปลี่ยนรหัสผ่าน”, “นโยบายคุ้มครองข้อมูลส่วนบุคคล”, “หนังสือยินยอมเปิดเผยข้อมูลสุขภาพส่วนบุคคล”, “ยินยอมเปิดเผยข้อมูลเพื่อวัตถุประสงค์ทางการตลาด”, and the “สื่อ(ภาพ)จาก รพ.” concept; broader OSM/Staff/Hospital Admin knowledge/contact flow presence; and the possibility that an operational actor is also a Patient.
- **Direct Canva access by this audit:** attempted for design `DAHSvdQ3gvU`; Canva denied access. This handoff does not claim direct inspection.
- **E — current runtime evidence:** targeted policy, service, module, route and contract inspection at analyzed HEAD, as linked in the canonical register.
- **Historical evidence:** Phase 17A and later phase contracts retain their historical status and are not rewritten or treated as current runtime proof.

Customer wording is kept distinct from runtime facts and engineering interpretation. No technical semantics are inferred from visual proximity.

## Corrections made

| Review finding | Prior statement | Corrected statement | Affected IDs and resulting status |
| --- | --- | --- | --- |
| Missing Settings/account concepts | Generic ACCOUNT-01 and broad ACCOUNT-05 did not separately trace settings items. | Added distinct account linking, phone, email, Privacy Policy view and marketing consent rows; retained ACCOUNT-03 for password change and NOTIF-05 for notification settings. LINE binding is only an account-link candidate. | ACCOUNT-01 PARTIAL; ACCOUNT-03 VERIFIED_COMPLETE; ACCOUNT-05 health consent REQUIREMENT_GATED; ACCOUNT-06 REQUIREMENT_GATED; ACCOUNT-07 PARTIAL; ACCOUNT-08/09 MISSING; ACCOUNT-10 REQUIREMENT_GATED; NOTIF-05 PARTIAL. |
| Consent intent understated | The register said health/marketing consent intent was not specified. | W2 explicitly names Privacy Policy, personal health-data disclosure consent and marketing-purpose disclosure consent. Terms, Privacy Policy and the two consent purposes remain distinct. Governance/lifecycle semantics are open. | ACCOUNT-02 MISSING (Terms only); ACCOUNT-05 REQUIREMENT_GATED (health disclosure); ACCOUNT-09 MISSING (Privacy Policy view); ACCOUNT-10 REQUIREMENT_GATED (marketing disclosure). |
| Hospital content/media overbroad | CONTENT-01 could read as all media/actors being complete. | CONTENT-01 is bounded to plain-text Hospital publishing and Patient SELF consumption. Image/media publishing and Patient media consumption are separate and missing. OSM/Staff work-context consumers are separate missing rows; OWNER list/detail read exists in the publisher workspace, while consumer-experience equivalence remains unproven. | CONTENT-01 remains VERIFIED_COMPLETE only for the bounded text/Patient capability; CONTENT-04/05/06/07 MISSING; CONTENT-08 PARTIAL. |
| Hospital contact consumer coverage | CONTENT-02 could imply consumer parity beyond Patient. | CONTENT-02 is bounded to direct Hospital OWNER management and Patient SELF read. OSM/Staff work-context consumers remain missing; Hospital Admin/OWNER can read contact in the management workspace, with consumer-menu equivalence unproven. | CONTENT-02 remains VERIFIED_COMPLETE only for bounded Owner/Patient behavior; CONTENT-09/10 MISSING; CONTENT-11 PARTIAL. |
| Patient provisioning authority fact | STAFF-03 described direct Hospital provisioning as OWNER-only and marked an authority conflict. | Direct Hospital scope accepts active exact OWNER or MEMBER plus ACTIVE Hospital. OSM separately can perform bounded single-Patient provisioning with an active exact OsmHospitalRelationship and ACTIVE Hospital. Bulk accepts direct Hospital OWNER or MEMBER only; OSM has no bulk adapter. | AUTH-02 remains VERIFIED_COMPLETE for this bounded policy; STAFF-03 changes INTENT_CONFLICT → PARTIAL; OWNER-03 PARTIAL reason corrected. STAFF-07 remains INTENT_CONFLICT because workforce OSM provisioning is direct OWNER-only. |
| Hospital Admin/Owner may also be Patient | Personal actor wording omitted H or lacked an explicit same-person boundary. | Personal/Self actor fields now identify O/S/H Patient SELF access only for the same User/Person with persisted PATIENT role and exact own Patient relationship. Work authority remains separate; no arbitrary Patient access is implied. | NAV-03 and relevant Personal profile, appointment, care/history, Family, medication, wellness and account/security rows updated; OSM-02 and STAFF-02 clarify same-identity Patient context. |
| Reminder-slot domain binding | NOTIF-01 bound morning/noon/evening/before-bed to Medication. | The intent is now a generic scheduled reminder/time-slot capability because direct layout evidence was unavailable to this audit. Medication schedule persistence (MED-03), occurrence (NOTIF-03), preference (NOTIF-05), recipient, transport and delivery remain separate. | NOTIF-01 changes PARTIAL → REQUIREMENT_GATED; MED-03 remains PARTIAL; NOTIF-05 changes REQUIREMENT_GATED → PARTIAL. |
| Historical RPT-02 lineage | Current RPT-02 wording could imply Phase 17A meant Direct OWNER only. | Phase 17A RPT-02 was broad Hospital Dashboard/download-export intent. Current RPT-02 preserves its direct-Hospital portion; RPT-33/RPT-34 and existing reporting canonical IDs represent separately bounded paths. | RPT-02 remains VERIFIED_COMPLETE for the bounded direct Hospital OWNER Dashboard/XLSX path. Reporting runtime and canonical policy are unchanged. |

## Added capabilities

Thirteen distinct whiteboard capabilities were added because each had an independent actor, domain, privacy, audience or implementation disposition:

- `ACCOUNT-06` account linking — REQUIREMENT_GATED; LINE binding is only a candidate.
- `ACCOUNT-07` phone/contact setting — PARTIAL; current phone edit is PatientHospitalProfile-scoped.
- `ACCOUNT-08` email setting — MISSING.
- `ACCOUNT-09` Privacy Policy view — MISSING.
- `ACCOUNT-10` marketing-purpose disclosure consent — REQUIREMENT_GATED.
- `CONTENT-04` Hospital image/media publishing — MISSING.
- `CONTENT-05` Patient Hospital image/media consumption — MISSING.
- `CONTENT-06` OSM work-context knowledge/content consumption — MISSING.
- `CONTENT-07` Hospital Staff work-context knowledge/content consumption — MISSING.
- `CONTENT-08` Hospital Admin work-context knowledge/content consumption — PARTIAL; OWNER publisher workspace supports list/detail read, but customer consumer UX equivalence remains unproven.
- `CONTENT-09` OSM work-context Hospital contact consumption — MISSING.
- `CONTENT-10` Hospital Staff work-context Hospital contact consumption — MISSING.
- `CONTENT-11` Hospital Admin work-context Hospital contact consumption — PARTIAL; OWNER management workspace supports read, but customer consumer-menu equivalence remains unproven.

No capability was removed or merged. Fifty existing Phase 17A IDs remain reused for the same product-intent lineage; current rows may bound or split that lineage, and historical dispositions are not carried forward as current status. The corrected register has 95 cumulative new IDs versus Phase 17A: 93 customer whiteboard rows plus RPT-33/RPT-34 reporting-preservation records.

## Reclassified capabilities

- Follow-up review: `CONTENT-08` and `CONTENT-11` change MISSING → PARTIAL because existing exact OWNER list/detail and contact read operations are meaningful implementation evidence.
- Follow-up review: `NOTIF-01` remains REQUIREMENT_GATED; its actor field now includes P and O/S/H under applicable Personal/user contexts, with exact notification authority/domain unresolved.

- `STAFF-03`: INTENT_CONFLICT → PARTIAL after correcting the direct-Hospital OWNER/MEMBER policy fact; the meaning of “general user” remains unresolved.
- `NOTIF-01`: PARTIAL → REQUIREMENT_GATED because time-slot intent exists but the exact domain binding is not established.
- `NOTIF-05`: REQUIREMENT_GATED → PARTIAL because a bounded appointment LINE preference implementation exists while general Settings UI/preferences do not.

`CONTENT-01` and `CONTENT-02` remain VERIFIED_COMPLETE only after narrowing their stated intent to the directly evidenced behavior. `ACCOUNT-05` remains REQUIREMENT_GATED, but now explicitly records customer health-data disclosure-consent intent.

## Count reconciliation

The original BF-GAP-00/01 handoff recorded 132 total capability rows. BF-GAP-01R adds 13 distinct rows for a corrected total of 145. The original handoff remains historical; this register is the current count.

| Current status | Corrected count |
| --- | ---: |
| VERIFIED_COMPLETE | 16 |
| PARTIAL | 63 |
| MISSING | 19 |
| REQUIREMENT_GATED | 24 |
| INTENT_CONFLICT | 13 |
| SUPERSEDED | 2 |
| AUDIT_PENDING | 8 |
| **Total** | **145** |

| Customer actor group | Corrected rows naming actor |
| --- | ---: |
| คนทั่วไป / ผู้ป่วย (P) | 86 |
| อสม. (O) | 104 |
| เจ้าหน้าที่สาธารณสุข (รพ./รพ.สต.) (S) | 106 |
| แอดมิน รพ. (H) | 119 |

Actor counts are non-additive. Patient SELF rows retain the persisted PATIENT role and exact own Patient relationship boundary. NOTIF-01 captures the reviewer-verified multi-role reminder intent under applicable Personal/user contexts, with exact authority/domain unresolved; it does not grant runtime access.

## Runtime authorization corrections

`src/modules/patient-provisioning/policies/patient-provisioning-policy.ts` was inspected directly. Current direct Hospital provisioning requires `Role.HOSPITAL`, exact active HospitalMembership of type OWNER or MEMBER, and active Hospital. The separate OSM route requires `Role.OSM`, an active exact OsmHospitalRelationship and active Hospital, and allows one Patient. Bulk provisioning calls the direct Hospital policy and accepts OWNER or MEMBER; OSM has no bulk adapter. No policy was changed.

`src/modules/workforce/policies/workforce-policy.ts` and `workforce-service.ts` were inspected separately: OSM workforce provisioning remains direct OWNER-only. This supports retaining STAFF-07 as a distinct intent-conflict question. Patient-provisioning evidence does not change OSM workforce authority.

## Content/media corrections

Phase 17I.2/17I.3 contracts and current runtime were inspected. HospitalContent has title, body, category and optional source/reference, with plain-text rendering; its contract excludes images, PDFs, attachments, embeds and rich text. Current Patient consumption is limited to the approved Patient audience, not generic Staff, OSM or Family/Caregiver. CONTENT-01 now describes only that bounded behavior. CONTENT-04/05 record image/media publishing and Patient consumption; CONTENT-06/07 record missing OSM/Staff work-context consumers. CONTENT-08 is PARTIAL: `listHospitalContentForOwner()` and `readHospitalContentForOwner()` support OWNER list/detail reads through `/app/hospitals/knowledge`; equivalence to the customer “สื่อความรู้” consumer experience remains unproven.

Phase 17I.1/17I.4A and current Hospital-contact policy/runtime were inspected. CONTENT-02 now describes only direct Hospital OWNER management and Patient SELF consumption. CONTENT-09/10 record OSM/Staff work-context contact consumption as MISSING. CONTENT-11 is PARTIAL: `readHospitalContactForOwner()` supports exact OWNER read through `/app/hospitals/contact`; equivalence to the customer consumer-facing menu remains unproven. No access is inferred from Hospital membership, hierarchy or OSM relationship.

## Consent corrections

Customer intent for Privacy Policy, health-data disclosure and marketing-purpose disclosure is explicit in W2. The register records separate Privacy Policy view and separate consent-purpose rows. Terms and Conditions remains its own capability. No runtime consent model/route was found. Controller/legal owner, purpose, document version, affirmative evidence, actor/time/scope, withdrawal/re-consent, processing effects, retention/audit and any guardian/minor rules remain requirement gates; no generic boolean consent design is proposed.

## Multi-role corrections

One Person/User may hold Hospital Work roles and a Patient role. The same human can use Personal/Self capabilities only when a persisted PATIENT role and exact own PatientHospitalRelationship establish Patient SELF scope. Hospital OWNER or Platform ADMIN authority does not grant access to arbitrary Patient data. Patient profile, appointments, care/history, Family, medication, wellness and account/security actor descriptions were reviewed for this boundary. No duplicate identity or runtime authority change was introduced.

## Reporting lineage correction

The broad historical Phase 17A `RPT-02` meant Hospital dashboard and download/export. The current register keeps `RPT-02` for the existing direct Hospital OWNER Dashboard/XLSX portion. `RPT-33` records Global Platform ADMIN selected-Hospital reporting, `RPT-34` records Parent OWNER exact direct-Child summary, and existing reporting canonical IDs retain their separately bounded meanings. RPT-CLOSE-01 remains intact historical evidence for its bounded automated scope. Direct OWNER, Platform ADMIN selected-Hospital, Parent exact direct-Child, and exact-Program runtime remain preserved. The reporting feature freeze is unchanged.

## Files changed

- Updated `docs/requirements/BUSINESS_FLOW_GAP_CANONICAL.md` as the current corrected inventory.
- Added this BF-GAP-01R correction handoff.
- Added a review-status addendum to the historical BF-GAP-00/01 handoff; its original evidence and 132-row count remain intact as historical evidence.
- Updated `PRODUCT.md` and `docs/CONTEXT.md` only to identify BF-GAP-01R as current and BF-GAP-02 as not started.
- No runtime, source, test, schema, migration, policy, route, service, UI, generated, or reporting behavior file changed.

## Verification performed

Follow-up verification: targeted OWNER content/contact service and workspace inspection; complete two-document diff review; `git diff --check`; strict UTF-8/Thai review; local Markdown-link validation; programmatic unique-ID, status and actor recount; documentation-only scope check. No application tests, build or typecheck were run. The entries below preserve verification of the original five-file correction.

- Preflight confirmed branch `main`, clean initial working tree, and expected/analyzed HEAD `f2d2222f6f4f4b5c02af9709092cafadbb850aa3`.
- Targeted current runtime/policy/contract inspections described above; these were read-only.
- `git diff --check` passed with no whitespace errors.
- UTF-8/Thai scan passed for all five changed Markdown files; no replacement or mojibake markers were found. Markdown local-link/path validation passed.
- Capability recount passed: 145 unique IDs, no duplicates; the actor and status summaries in the register and this handoff match the actual table rows.
- Repository-wide search (excluding the corrected register and this handoff) found no prior references/collisions for correction IDs `ACCOUNT-06..10` and `CONTENT-04..11`. Tracked diff and working-tree status contain only the five requested Markdown documents; `src` and `prisma` have no diff.
- Final diff was inspected. No application tests, build, typecheck, or integration suite was run because no runtime implementation changed.

## Final disposition

**BF-GAP-01R — PASS / CUSTOMER WHITEBOARD INVENTORY CANONICALIZED.**

This means the corrected whiteboard inventory is ready for Product Owner review as input to later crosswalk work. It does not mean the business flows are complete.

## Next step

BF-GAP-02 has **NOT STARTED**. After review accepts this correction, proceed to **BF-GAP-02 Runtime Crosswalk & Evidence Verification**, then **BF-GAP-03 Core Care Journey**. Do not implement a discovered gap under this handoff.
