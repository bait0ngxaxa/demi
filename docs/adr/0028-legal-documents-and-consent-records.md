# ADR-0028: Legal documents and consent records

- Status: Accepted (Product Owner, 2026-11-03; follows the Canva flow "โปรไฟล์ → การตั้งค่า → เงื่อนไขและการใช้งาน")
- Date: 2026-11-03
- Closes (product side): [RELEASE_GATE](../operations/RELEASE_GATE.md) F-02; business-flow rows ACCOUNT-01/02/05/09/10 ([canonical register](../requirements/BUSINESS_FLOW_GAP_CANONICAL.md)); WB-PD-06 product part ([WB alignment](../requirements/WB_ALIGNMENT_DECISIONS.md)).
- Does not close: RELEASE_GATE G-01 (ก-25 PDPA): the real texts, the data controller and the legal basis stay with the partner agency and its DPO/legal counsel.
- Builds on: [ADR-0020](./0020-self-registration-by-national-id.md) (self-registration), [ADR-0021](./0021-caregiver-accounts-by-invitation.md) (caregiver accounts).

## Context

Nothing in DEMI showed Terms and Conditions or a Privacy Policy, and nothing recorded which version a person accepted. The customer whiteboard lists four documents under Profile → Settings: Terms, the Privacy Policy, a health-data disclosure consent and a marketing consent. The texts belong to the partner agency (G-01), so the product has to ship with clearly marked placeholders and let the agency's text replace them later without a deployment.

PDPA ม.19 requires a consent to be explicit, separate from other terms, and withdrawable as easily as it was given, and it may not be a condition of a service that does not need it. ม.26 sets a stricter bar for health data. Terms acceptance and Privacy acknowledgement are a different thing: they are the conditions of using the service.

## Decision

- **LG-D1 — No login gate.** Acceptance is part of the existing account-creation and activation steps. Login shows links only. The documents and consents live at `/app/settings/legal` ("เงื่อนไขและการใช้งาน"), linked from Settings and the Profile hub.
- **LG-D2 — Four versioned documents.** `LegalDocumentVersion` of kind TERMS, PRIVACY_POLICY, HEALTH_DATA_DISCLOSURE_CONSENT and MARKETING_CONSENT, with `versionLabel` unique per kind and a Markdown-subset body that is rendered as text only (`#` headings, paragraphs, lists, `**bold**`; never HTML). The migration seeds one PUBLISHED placeholder per kind (`isPlaceholder`, label `placeholder-1`, body starting "ร่าง — รอข้อความจากหน่วยงาน"); public pages show a placeholder notice.
- **LG-D3 — ADMIN publishing.** The Platform ADMIN creates a draft, edits it, previews the saved text and publishes it after a confirmation dialog at `/app/admin/legal`. A published version cannot change or be deleted (database trigger). The current version of a kind is the PUBLISHED row with the latest `publishedAt` (a query, not a flag; one `publishedAt` per kind is unique). Publishing confirms the exact revision previewed (`expectedUpdatedAt`).
- **LG-D4 — One required checkbox, two optional consents.** Every account-creation step has one required checkbox "ข้าพเจ้ายอมรับข้อกำหนดและเงื่อนไขการใช้บริการ และรับทราบนโยบายการคุ้มครองข้อมูลส่วนบุคคล" carrying the exact versions shown. The completion service requires them to be the current versions inside its transaction and writes `LegalAcceptance` there with its `source`; missing → validation error, stale → conflict "มีเวอร์ชันใหม่"; in either case nothing is created and the one-time link stays usable. The consents are separate, optional, unchecked by default, never a precondition, and can be given or withdrawn at any time in settings.
- **LG-D5 — Recorded only.** No feature reads a consent in this phase. Using a consent as an access or processing condition needs its own decision.
- **LG-D6 — Consents for Patients only.** The consents are offered to a User holding a PATIENT role: the patient activation screen and settings. Staff, อสม., OWNER, caregiver-only and ADMIN accounts see Terms and Privacy only; a consent submitted for such an account is refused, not ignored. `/register` offers no consents, because showing them would reveal before login that the person is a Patient (NCD programme participation is health data, ม.26, ADR-0020).
- **LG-D7 — New versions do not block.** A newer TERMS or PRIVACY_POLICY version shows a non-blocking banner in the app shell and "ยอมรับเวอร์ชันใหม่" in settings; the earlier acceptance is kept. A newer consent version keeps the consent given on its version and shows "มีเวอร์ชันใหม่"; the person may give it again on the new version or withdraw it.

### Records

- `LegalAcceptance(userId, termsVersionId, privacyVersionId, acceptedAt, channel, source)`: append-only, one row per User and version pair (re-accepting the same pair is a no-op), versions checked by trigger to be PUBLISHED and of the right kind. `source` ∈ SELF_REGISTRATION, PATIENT_ACTIVATION, WORKFORCE_ACTIVATION (staff, อสม., Child and Parent OWNER), HOSPITAL_ONBOARDING, CAREGIVER_ACCOUNT, SETTINGS, ADMIN_BOOTSTRAP.
- `ConsentEvent(userId, kind, documentVersionId, decision GIVEN|WITHDRAWN, decidedAt, channel, submissionNonce)`: append-only; current state = latest event per User and kind. A retry with the same nonce returns the same event; a decision that changes nothing (giving the same version again, withdrawing what is not given) is refused. Only the current version may be decided on.
- `channel` (WEB or LIFF) comes from the request User-Agent on the server and is informational; it is never read from the request body and grants nothing. It is NULL only for ADMIN_BOOTSTRAP, which runs on the operator CLI.
- Only the disposable demo/test reset (`demi.service_area_purge = 'demo-reset'`, transaction-local) may delete these rows or a published version. User hard deletion (UM-1) never reaches them: an account with an acceptance has been activated.
- Audit events `legal.terms_accepted`, `legal.consent_given`, `legal.consent_withdrawn`, `legal.draft_created`, `legal.draft_updated`, `legal.version_published` and `legal.user_history_read` carry ids, labels, source and channel, never document bodies or national IDs.

### Operator and DPO

- `npm run admin:bootstrap -- --accept-legal`: the CLI shows the current Terms and Privacy versions; without the flag it refuses before any side effect. The acceptance commits with the ADMIN role.
- The ADMIN page looks up one User's acceptance and consent history by exact Thai National ID for a data-subject or DPO request; every lookup is audited, found or not.

## Consequences

- A person cannot finish any account-creation step without the current Terms and Privacy versions; publishing a version while someone is filling a form makes their submit fail with "มีเวอร์ชันใหม่", the screen reloads the versions and the person accepts again.
- Agency text replaces a placeholder by publishing a new version; earlier acceptances keep pointing at the version actually accepted.
- Integration tests restore the placeholder seed after their global truncate.

## Open questions (G-01)

- The agency's Terms, Privacy Policy and consent texts, the data controller and the legal basis of each processing purpose.
- Whether a consent will gate any processing (for example the D9 exercise average in reports, WB-DF-16 / จ-6) and what happens on withdrawal.
- Consent recorded by staff on a patient's behalf (paper or assisted), minors and guardian consent, and email notification of new versions (not in scope).
- Whether a former Patient who no longer holds the PATIENT role may still withdraw a consent in settings (today: PATIENT role required).
