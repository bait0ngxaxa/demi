# Phase 17G.0B — Medication Owner Decision Closeout

**17G.0 CLOSED; Q30–Q53 CLOSED / OWNER APPROVED**

## Authority and baseline

Repository: bait0ngxaxa/demi. Actual starting HEAD: `9e00f065ca61d669b721d41b8df41d3050c386fb` — `docs(phase-17g0): tighten medication recommendations`. Expected HEAD matches; initial working tree clean. Current source and AGENTS.md were read before editing. No reset, revert, amend or overwrite of newer work.

The owner explicitly accepted the entire corrected recommended package in the [17G.0 decision pack](./PHASE_17G0_MEDICATION_DECISION_PACK.md), Q30–Q53, through this task instruction. All 24 decisions are **CLOSED / OWNER APPROVED** exactly within bounded MED-01 and the explicitly recorded future boundaries. This approval does not approve MED-02 clinical/prescription behavior. No decision is reopened or reinterpreted.

Earlier OPEN / NOT OWNER APPROVED statements record the historical recommendation state. This later closeout supersedes that state; historical options/evidence remain preserved. The [17G.1 implementation contract](./PHASE_17G1_PERSONAL_MEDICATION_IMPLEMENTATION_CONTRACT.md) supplies the implementation handoff without runtime changes.

## Closed decisions

Every row below has status **CLOSED / OWNER APPROVED**.

| ID | Exact approved semantics |
| --- | --- |
| Q30 | Patient-maintained personal medication item; not prescription, clinically reconciled, Hospital verified, physician approved or clinical source of truth. |
| Q31 | Patient SELF only may create/update/stop. |
| Q32 | Patient SELF only may read. |
| Q33 | Bounded free-text medication name; Thai/Unicode supported; human-entered script/case preserved; whitespace normalization permitted; duplicate names allowed; no catalog identity; future drug-catalog mapping deferred. |
| Q34 | Optional bounded free-text instruction only; no structured dose in 17G.1. |
| Q35 | No structured dose unit in 17G.1; structured dose/unit semantics deferred. |
| Q36 | Future 17G.2: 0..N daily local clock times; no schedule persistence in 17G.1. |
| Q37 | Future 17G.2 bounded current convention: Asia/Bangkok local time-of-day; not global configurable timezone or Patient-specific timezone policy; multi-timezone semantics deferred. |
| Q38 | No structured meal/timing ontology in 17G.1; user-entered instruction text only. |
| Q39 | ACTIVE / STOPPED; STOPPED terminal; no STOPPED→ACTIVE; tracking again creates a new item/lifecycle. |
| Q40 | Normal removal is ACTIVE→STOPPED; no routine hard-delete UI; governance/legal deletion separate. |
| Q41 | Patient may correct current values on own ACTIVE item; updatedAt retained; Q52 mutation audit; STOPPED immutable in normal workflow; no user-visible revision history in 17G.1. |
| Q42 | Provenance implicit from authenticated Patient SELF; no one-value source enum; never trust client creator/source/owner. |
| Q43 | Duplicates allowed; no medication-name uniqueness, auto-merge or auto-replacement. |
| Q44 | Adherence deferred to future 17G.3 decision; no adherence events in 17G.1 or 17G.2. |
| Q45 | 17G owns approved medication schedule/reminder source; 17J owns notification delivery. |
| Q46 | Family medication access requires future explicit medication-specific sharing contract/grant; existing Family authority grants ZERO medication access. |
| Q47 | No Hospital/OSM MED-01 access; Platform ADMIN has no routine access. |
| Q48 | All MED-02 semantics excluded from 17G.1. |
| Q49 | Medication and Goal Plan independent; no automatic synchronization. |
| Q50 | Patient Personal context; route /app/personal/medications; Thai label ยาของฉัน. |
| Q51 | 17G.1: PersonalMedication concept only; future 17G.2: PersonalMedication 1→N MedicationSchedule. |
| Q52 | AuditEvent for create/update/stop; minimal metadata only; no per-read audit. |
| Q53 | Export/sharing deferred; no PDF/CSV/print/public link/QR/external sharing in 17G.1. |

## Canonical domain boundary and evolution

**MED-01: Patient-maintained personal medication tracking.** Patient/Profile-level personal data, exact SELF only. Work/delegated roles do not widen ownership. STOPPED means **หยุดติดตามรายการนี้ใน DEMI**, not an instruction to stop taking medication.

**MED-02: clinical / provider medication domain; REQUIREMENT-GATED.** Prescription, medication order, reconciliation, prescriber, clinician verification, dispensing, pharmacy workflow, administration, external prescription import, authoritative clinical medication list and drug master integration remain outside this contract. Never reinterpret MED-01 rows as clinical records later. Future MED-02 may coexist through explicit provenance/source semantics and its own clinical authority contract.

17G.1 deliberately supports stable bounded semantics now, clean domain boundaries and future additive expansion. PersonalMedication may later gain a separate MedicationSchedule, approved reminder source or catalog mapping. Do not prebuild unused abstractions, schedule columns, generic ACL, workflow, terminology or notification frameworks.

- 17G.2: future 0..N daily local clock times, Asia/Bangkok bounded local time-of-day convention; no complex recurrence; no global/Patient-specific timezone policy. NOT IMPLEMENTED.
- 17G.3: future reminder occurrence source and separately approved adherence semantics. NOT IMPLEMENTED; no adherence events in 17G.1/17G.2.
- 17J: future delivery recipient, opt-in/preference, consent, quiet hours, channel, retry and delivery status. Zero delivery integration in 17G.1.
- Medication and Goal Plan remain independent; STOPPED is not goal completion or medication reduction success.

## Exact final status

- **17G.0 CLOSED**
- **Q30–Q53 CLOSED / OWNER APPROVED**
- **MED-01 contract approved for bounded 17G.1**
- **17G.1 CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED**
- **MED-02 REQUIREMENT-GATED**
- **17G.2 future schedule implementation / NOT IMPLEMENTED**
- **17G.3 future reminder/adherence decision/implementation / NOT IMPLEMENTED**
- **17J notification delivery future**
- **P17F-L04 OPEN / deferred; no device-UAT PASS inferred**
- **Q5 unchanged: real Patient delegated-data use GOVERNANCE BLOCKED**
- **Documentation only: no runtime/schema/migration/routes/modules/tests/env/packages/roles/capabilities changed.**
