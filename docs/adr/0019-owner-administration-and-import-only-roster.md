# ADR-0019: Owner-only administration and Excel-only patient onboarding

- Status: Accepted — latest confirmed Product Owner decision, 2026-10-21
- Supersedes administrative authority in ADR-0004, ADR-0008 (including 2026-10-14 D1), ADR-0011 and the E1 MEMBER delegated Hospital export decision.

OWNER is the Hospital administrative control plane. MEMBER and OSM are the patient care operational plane. Care relationships must not independently confer roster, workforce, invitation, approval or administrative reporting authority. Historical decision text is retained under visible superseding notices.

Only an ACTIVE direct OWNER of the exact ACTIVE Hospital may import patients, manage workforce/OSM and caregiver assignments, issue patient activation invitations, review account-access/service requests, manage Hospital settings/catalogs/areas and use Hospital administrative reports/exports. The persisted actor User must be ACTIVE. Holding OSM or PATIENT alongside HOSPITAL does not remove direct OWNER authority. Another Hospital, Parent or Child membership does not imply direct authority. Existing separately authorized Platform ADMIN recovery/governance and explicit network policies remain separate boundaries.

Strict Excel Import Template v2 is the only user-facing roster creation workflow, including a file with exactly one patient. The manual form/tab is retired; the legacy action and service reject creation. Import retains identity resolution, duplicate/conflict checks, profile/classification/baseline persistence, audits and row transactions. Authorization is re-read for template/preview/confirmation and each row transaction. Scope revocation may stop a partial import; committed rows are preserved and must be re-previewed.

Historical reportExportGranted data and audits are retained but never authorize MEMBER exports. Delegation management is retired. Existing OSM accounts, relationships, assignments and activation state are preserved. Previously issued legitimate OSM invitation claims retain the former active direct issuer trust check solely for target-user activation; issuance, regeneration, slips and directory management require OWNER. Expiry, revocation, target eligibility and authentication fences remain.

Every OSM Rich Menu has four primary actions: ผู้ป่วยที่ดูแล, คัดกรองผู้ป่วย, บันทึกติดตาม and งานทั้งหมด. Account management, aliases and native role switching are preserved. Generic HOSPITAL menus contain no OWNER-only action. No new LIFF application, live Provider mutation or deployment is needed.

See [capability classification](../requirements/OWNER_ADMINISTRATION_AND_CARE.md) and [verification evidence](../phases/OWNER_ADMINISTRATION_IMPLEMENTATION.md).
