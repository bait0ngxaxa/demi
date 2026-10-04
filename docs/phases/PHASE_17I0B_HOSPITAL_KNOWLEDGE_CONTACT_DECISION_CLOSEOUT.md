# Phase 17I.0B — Hospital Knowledge / Contact Owner Decision Closeout

Date: 2026-10-04 (Asia/Bangkok). Repository: `bait0ngxaxa/demi`, branch `main`.

## 1. Current disposition

**Phase 17I.0 — CLOSED / OWNER DECISIONS CLOSED. Q84–Q111 — CLOSED / OWNER APPROVED. Phase 17I.0B — CLOSED / DOCUMENTATION CONTRACT COMPLETE.**

**CONTENT-02 — OWNER DECISIONS CLOSED; 17I.1 CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED**, through the [Hospital Contact technical contract](./PHASE_17I1_HOSPITAL_CONTACT_IMPLEMENTATION_CONTRACT.md). **CONTENT-01 — OWNER DECISIONS CLOSED; 17I.2 TECHNICAL CONTRACT PENDING / NOT IMPLEMENTED.** Only Hospital Contact is implementation-cleared. No content runtime is cleared and no runtime or manual UAT is delivered by this task.

## 2. Approval source and baseline

- Binding source: the product owner's explicit instruction in this task approving the previously reviewed recommendation set **WITHOUT CHANGES**, including every sub-axis and the separately specified source/governance boundaries and exclusions. This records a decision, not a recommendation or inferred approval.
- Starting expected and actual HEAD: `64215f74f120a383a893d2e51016182a8bc138bd`, `docs(phase-17i0): clarify feed ordering history scope and authoring baseline`; branch `main`, clean starting working tree.
- The [Phase 17I.0 decision pack](./PHASE_17I0_HOSPITAL_KNOWLEDGE_CONTACT_DECISION_PACK.md) remains historical evidence. This closeout supersedes its OPEN/recommendation status; its original authoring baseline and options remain intact.
- [17H.0B](./PHASE_17H0B_WELLNESS_DECISION_CLOSEOUT.md) supplies closeout conventions only. No Wellness ownership, physical-delete, receipt or lifecycle semantics are imported.
- [Phase 17A](./PHASE_17A_CUSTOMER_FLOW_CANONICALIZATION_UAT_CONTRACT.md), [architecture baseline](../architecture/DEMI_ARCHITECTURE_BASELINE.md), accepted [ADRs](../adr/README.md), current source and tests constrain the implementation contract. Legacy `raviut-max/demi-plus-web-v2` is behavioral evidence only, never target architecture or a contact-value source.

## 3. Final owner decision matrix

Each numbered decision appears once in this final matrix. Every disposition includes all approved sub-axes.

| Decision | Final disposition / option | Final approved semantics |
| --- | --- | --- |
| Q84 | CLOSED / OWNER APPROVED — A | Exactly one owning Hospital per content record. No global content or parent inheritance in first slice. |
| Q85 | CLOSED / OWNER APPROVED — A | Only ACTIVE HOSPITAL OWNER with direct ACTIVE membership of the exact ACTIVE owning Hospital may create/edit content. |
| Q86 | CLOSED / OWNER APPROVED — A | Authorized Hospital OWNER publishes directly; no separate approval/reviewer workflow. |
| Q87 | CLOSED / OWNER APPROVED — A | DRAFT / PUBLISHED / ARCHIVED. PUBLISHED may be withdrawn to DRAFT for correction. ARCHIVED is terminal in first slice. |
| Q88 | CLOSED / OWNER APPROVED — A | One fixed category per record: NCD, อาหาร, การออกกำลังกาย, อื่น ๆ. |
| Q89 | CLOSED / OWNER APPROVED — core A; summary A; references A | Required title/body/category; no separate summary; optional plain-text source/reference. Publication time is server authority. Persistence representation remains technical. |
| Q90 | CLOSED / OWNER APPROVED — A | Plain text only; no CMS rich-media system, WYSIWYG, arbitrary HTML or first-slice uploads/images/PDF framework. |
| Q91 | CLOSED / OWNER APPROVED — A | Exact authenticated persisted ACTIVE PATIENT, own persisted PatientHospitalRelationship to the exact ACTIVE owning Hospital. PatientHospitalRelationship has no ACTIVE status; none is invented. |
| Q92 | CLOSED / OWNER APPROVED — A | Patient consumption plus authorized publisher preview only. No staff/OSM feed; multi-role consumption remains own Patient scope. |
| Q93 | CLOSED / OWNER APPROVED — schedule A; expiry A | Immediate publishing; no future schedule or automatic expiry. |
| Q94 | CLOSED / OWNER APPROVED — B | Withdraw PUBLISHED to DRAFT before editing, then republish. No full revision history. Feed ranking is decided independently below. |
| Q95 | CLOSED / OWNER APPROVED — A | Archive content instead of physical-delete workflow. |
| Q96 | CLOSED / OWNER APPROVED — identity A; timestamp A; source A | Patient sees Hospital identity, latest successful publication/republication time displayed in Asia/Bangkok, and optional source/reference. No human staff identity by default. Displayed timestamp does not determine feed ordering. |
| Q97 | CLOSED / OWNER APPROVED — A | Hospital informational content; correctness belongs to publishing Hospital. Not DEMI clinical truth, diagnosis, prescription or AI medical advice. |
| Q98 | CLOSED / OWNER APPROVED — category A; ordering A; search A; pinning A | Category filter; original/first successful publication chronology determines feed order. Editing/republishing old content does not auto-promote it. No text search or pinning. |
| Q99 | CLOSED / OWNER APPROVED — B | DEMI-managed operational Hospital contact extension owned by Hospital. Hospital Master remains identity source, not operational contact source. |
| Q100 | CLOSED / OWNER APPROVED — field set A; completeness A | Only optional free-text address and optional single organizational phone. No email/website/hours/maps/geography expansion. |
| Q101 | CLOSED / OWNER APPROVED — A | Only direct ACTIVE HOSPITAL OWNER of exact ACTIVE Hospital edits contact. |
| Q102 | CLOSED / OWNER APPROVED — A | Authorized update becomes current after successful commit. Label as Hospital-provided operational information, never platform-verified information. |
| Q103 | CLOSED / OWNER APPROVED — A | Patient reads contact only through exact own persisted Hospital relationship to ACTIVE Hospital. Editor reads/manages only exact direct authorized Hospital. |
| Q104 | CLOSED / OWNER APPROVED — A | Each exact Hospital owns its contact; no parent/child inheritance, substitution or fallback. |
| Q105 | CLOSED / OWNER APPROVED — A | Omit missing fields. With no values show “ยังไม่มีข้อมูลติดต่อ”; never fabricate fallback data. |
| Q106 | CLOSED / OWNER APPROVED — A | Initial cross-domain consumer is Patient Hospital contact card only. No appointment/content/notification/report wiring in 17I.1. |
| Q107 | CLOSED / OWNER APPROVED — knowledge A; contact A | Knowledge later has a dedicated Personal destination. Contact appears in Hospital relationship context reachable from Personal Home. No global Hospital directory. |
| Q108 | CLOSED / OWNER APPROVED — A | Thai mobile-first accessible presentation, including long Thai names/text and distinct loading/error/empty/forbidden states. |
| Q109 | CLOSED / OWNER APPROVED — A | Successful state-changing mutations use atomic minimized audit; no contact values/content bodies in metadata; no duplicate success audit for NOOP/retry. |
| Q110 | CLOSED / OWNER APPROVED — publisher A; admin A; patient A | Publisher/editor sees current authorized state only; no publisher/admin history reader by default. Patient sees current allowed projection only. Audit evidence != revision history != user-facing history. |
| Q111 | CLOSED / OWNER APPROVED — A | Sequence: 17I.1 Hospital Contact → 17I.2 Content Publishing → 17I.3 Patient Content Consumption. |

## 4. Approved domain and source ownership

Canonical `Hospital` / existing Hospital Master governs Hospital identity. Current Master is not an operational address/phone provider. Hospital operational contact is maintained by the owning Hospital through DEMI as a separate responsibility. Hospital knowledge/content belongs to its publishing Hospital. Platform governance stays under existing DEMI governance; ADMIN has no automatic routine Hospital contact/content editing right. Medical/content correctness belongs to publishing Hospital, without DEMI diagnosis, prescription, clinical-truth or AI-advice claims.

## 5. Approved authorization boundaries

Editor: authenticated persisted ACTIVE User → persisted HOSPITAL role → exact direct ACTIVE OWNER HospitalMembership → exact ACTIVE Hospital. Patient: authenticated persisted ACTIVE User → persisted PATIENT role → exact User↔Person binding → own PatientProfile → exact own persisted Hospital relationship → ACTIVE Hospital. All locators are re-resolved server-side; selection is not authority. No hierarchy inheritance, profession-derived authority, new top-level role, MEMBER/OSM edit or routine ADMIN bypass. Doctor/Nurse remain classifications, not authorization roles. Multi-role Work grants do not expand Personal disclosure.

## 6. Approved disclosure and audience

No anonymous public contact/content or global directory. Patient content consumption is limited to PUBLISHED records meeting own exact relationship/ACTIVE Hospital authority; publisher preview is independently authorized. No staff/OSM feed. Contact read scope is independent of content and existing care reads. Non-ACTIVE Hospital contact is withheld without changing truthful identity/status displays in existing relationship experiences.

## 7. Approved content lifecycle

DRAFT → PUBLISHED; PUBLISHED → DRAFT before correction; nonterminal content may be archived under authorized publisher authority; ARCHIVED is terminal. Direct immediate publish; no approval, schedule or automatic expiry. Current-record correction and archive do not create full revisions. Display latest successful publication/republication in Asia/Bangkok while ordering by first successful publication chronology; correction never auto-promotes an old record. Detailed transitions, persistence, pagination and technical validation remain for the separate 17I.2/17I.3 contracts, without reopening owner semantics here.

## 8. Approved Hospital Contact boundary

Only optional `addressText` and `phoneNumber`, Hospital-provided and effective after commit. No completeness requirement, verification queue or Master synchronization. Missing values omitted; both absent means truthful empty state. Exact Hospital only; no values derived from Master workbook/JSON, parentHospitalId, PatientProfile, PatientHospitalProfile, appointment location or workforce profile. The [17I.1 contract](./PHASE_17I1_HOSPITAL_CONTACT_IMPLEMENTATION_CONTRACT.md) closes representation, validation, concurrency, audit and UX without implementing them.

## 9. Navigation and mobile intent

Contact card belongs in existing Hospital relationships on Personal Home; no contact-only top-level Personal entry. Eligible OWNER management belongs to Work with server-projected direct Hospital selection. Hospital code/name are read-only identity context. Later knowledge has a dedicated Personal destination, not delivered here. Reuse existing Thai UI primitives/tokens, keyboard/focus and semantic status patterns; wrap long Thai text on mobile. A load failure is never confirmed no-data.

## 10. Audit and history semantics

Atomic minimized success events are evidence of state changes, not old contact values or article bodies. No durable ordinary read audit, NOOP/retry duplicate, publisher/editor activity feed, ADMIN audit reader or full contact/content revision history is approved. Audit retrieval/retention governance is separate from current-state projections; no retention period is invented.

## 11. Deferred and excluded scope

No Hospital hierarchy authorization/contact inheritance or fallback; global first-slice content; anonymous public reads; WYSIWYG/arbitrary HTML; media/upload/image/PDF framework; approval workflow; scheduled publishing; automatic expiry; physical-delete content workflow; full revision history; publisher/admin audit-history UI; AI/clinical interpretation; notification integration; new top-level roles or profession authority; contact synchronization job/external Master contact provider; maps/geolocation; email/website/hours fields. Appointment, content, notification and reporting contact consumers are outside 17I.1. Exclusion approval is not clearance for future implementation.

## 12. Phase sequence and unchanged gates

17I.0 owner decisions closed → 17I.0B documentation closeout complete → 17I.1 Hospital Contact cleared → 17I.2 Content Publishing technical contract → 17I.3 Patient Content Consumption. Contact reader belongs to 17I.1 and does not wait for 17I.3.

Phase 17H.4A remains PASS / AUTOMATED RE-AUDIT COMPLETE; separate manual 17H UAT remains separately tracked, not executed by this task. 17G.4A, Family P17F-L04/L05, Q5 governance gate, parked 17E.2 consent, MED-02 and 17J delivery/system authority remain unchanged.

## 13. Implementation clearance matrix

| Item | Current status | Clearance |
| --- | --- | --- |
| Phase 17I.0 | CLOSED / OWNER DECISIONS CLOSED | Analysis/owner decisions complete |
| Phase 17I.0B | CLOSED / DOCUMENTATION CONTRACT COMPLETE | Documentation only |
| CONTENT-02 | OWNER DECISIONS CLOSED; 17I.1 CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED | Hospital Contact only, under 17I.1 contract |
| Phase 17I.1 | CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED | Hospital Contact manage + authorized Patient card |
| CONTENT-01 | OWNER DECISIONS CLOSED; PLANNED 17I.2; TECHNICAL CONTRACT PENDING / NOT IMPLEMENTED | No content runtime clearance |
| Phase 17I.2 | PLANNED / TECHNICAL CONTRACT PENDING / NOT IMPLEMENTED | Separate publishing contract required |
| Phase 17I.3 | PLANNED / NOT IMPLEMENTED | Separate Patient content consumption contract required |

Documentation validation covers final diff, whitespace, touched local links, strict UTF-8/Thai integrity, matrix completeness/options, scope and status consistency. The contract authoring task was documentation-only: no runtime/application source, Prisma schema, migration or config changes. Runtime/unit/PostgreSQL suites were not required or run; Prisma generation/validation, migrations, build and dev server were not run. No manual browser/mobile/device UAT or production deployment was performed.
