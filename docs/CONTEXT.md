# DEMI Project Context

## Current language — Owner administration and care (2026-10-21)

Current authority: [ADR-0019](./adr/0019-owner-administration-and-import-only-roster.md) for owner administration and care, [ADR-0020](./adr/0020-self-registration-by-national-id.md) for public self-registration, and [ADR-0021](./adr/0021-caregiver-accounts-by-invitation.md) for patient-invited caregiver accounts. Earlier status addenda are historical wherever they confer MEMBER/OSM administrative authority.

**Public self-registration (SR-1):** an eligible pre-provisioned staff, OSM or patient may create their first credential using national ID, subject to the 30-day eligibility window, the Hospital OWNER's audited setting and the server-side first-credential gates. The accepted identity-ownership and health-data disclosure risks, and the partner-agency acknowledgement required before production use with real data, are recorded as gate G-01 in [ADR-0020](./adr/0020-self-registration-by-national-id.md) and the [release gate](./operations/RELEASE_GATE.md).

**Invitation-only caregiver accounts (AF-2):** a relative without a DEMI identity may create a CAREGIVER-only account only by accepting a patient's pending invitation with the matching checksum-valid national ID. The invitation token and ID are both required; /register remains non-disclosing for pending invitees and CAREGIVER-only accounts. CAREGIVER does not imply Patient, workforce, or admin authority. Self-asserted names are marked for the Patient and are replaced by authoritative Patient roster names during later Patient provisioning. If that identity is later provisioned by a Hospital, FIX-1 suspends it until a verified REC-1 reset by platform ADMIN; caregiver relationships remain recorded. Caregiver-only LINE binding remains unavailable; see [ADR-0021](./adr/0021-caregiver-accounts-by-invitation.md).

**Hospital administrative control plane:** Hospital administration and patient roster onboarding owned by the active direct Hospital OWNER. MEMBER and OSM relationships confer no independent administrative authority.

**Patient care operational plane:** Resource-scoped clinical and field care performed by authorized Hospital staff and assigned OSM; care authority is independent of administrative ownership.

**Patient roster onboarding:** Introducing patient identities and their Hospital care relationships through the Hospital OWNER's Excel roster import, including a roster of one patient. Manual registration is retired.

**Historical delegated export grant:** A retained past delegation record that no longer grants MEMBER Hospital report access or export authority.


## Authoritative Project Delivery Contract

DEMI is one production-ready MVP codebase. Deployment and verification environments do not define separate runtime behavior or authorization modes; all approved features use normal server-side business rules and persistence. Synthetic fixtures belong in tests and controlled test databases. Production-ready code does not imply that unresolved clinical requirements, Security/Privacy/Data Controller approvals, or deployment acceptance are complete; keep unconfirmed capabilities bounded and explicitly out of scope.

Resolve apparent conflicts in this order: (1) latest confirmed Product Owner direction, (2) Accepted ADRs, (3) current `PRODUCT.md` and this project context, (4) actual implementation and verification evidence, then (5) relevant historical phase decisions. The dated `CURRENT-status addendum` sections below are snapshots recorded at their stated dates; they preserve historical evidence but do not by themselves set current runtime requirements. Later confirmed decisions and verified implementation supersede older status statements only within the affected scope. See [ADR-0010](./adr/0010-production-ready-mvp-and-deployment-neutral-runtime.md).

## Current domain vocabulary — operational service areas (2026-10-21)

- **Hospital registry:** every Hospital is registered by Platform ADMIN in `/app/admin/hospitals` with a network role, idempotently per form submission nonce; Hospital Master, its seed and `npm run db:seed` and the canonical parent link were retired ([ADR-0017](./adr/0017-retire-hospital-master.md), amended 2026-10-21). ADMIN registration is the only source of Hospitals, in production too. Since [ADR-0018](./adr/0018-parent-led-child-onboarding.md) (amended 2026-10-21) ADMIN registers Parent Hospitals only, one at a time or from a CSV template (one `name` column; preview, then all-or-nothing apply); Child facilities come only from their Parent OWNER. Hospital codes are always generated (`H-XXXXXX`); no form or file accepts one.
- **Parent-created Child (ADR-0018):** a รพ.สต./PCU/PCC that the active Parent OWNER registers into its own network at `/app/hospitals/network`. It is attached at creation and stays `PENDING_VERIFICATION` ("รอเปิดใช้งาน") until its first OWNER activates through the workforce activation link (purpose `CHILD_OWNER_ONBOARDING`, REMOTE 24 h / ASSISTED 15 min) or, for an existing ACTIVE account, accepts the invitation on their own work home. Until then the Parent has no Patient read and no report access to it. The Parent may rename it, manage its OWNER invitation and cancel it while pending; the Child's own OWNER manages its workforce. Public onboarding is for Parents only.
- **Retired Hospital (`RETIRED`, ถอนออกจากรายชื่อ):** an unclaimed `PENDING_VERIFICATION` Hospital that Platform ADMIN withdrew from the public onboarding list with a reason (one at a time or up to 100 at once). It is never deleted, its code stays reserved, and ADMIN can restore it to `PENDING_VERIFICATION`; while RETIRED it is outside onboarding, the network and reports. The retire/restore reasons are kept in append-only `HospitalRetirementEvent` (Phase N1).
- **Hospital service area:** an OWNER-managed operational Parent–Child association with at most one active Parent per Child and retained ended history. It is neither direct workforce membership nor Patient/report authority.
- **Network role (service-area eligibility):** an audited Platform ADMIN decision that a facility is a network PARENT or CHILD ([ADR-0015](./adr/0015-admin-governed-hospital-network.md)); hierarchy, names and codes alone do not establish it. PostgreSQL triggers require an area's Parent to have role PARENT and its Child role CHILD, and refuse changing or clearing a role that an active area uses (Phase N1).
- **Network Patient read:** read-only access by a Parent OWNER (or OWNER-granted Parent MEMBER) to the Patients of the Parent's active network Children, audited per read ([ADR-0016](./adr/0016-network-patient-read.md)).
- **Area transfer:** a Platform ADMIN operation that ends a Child's active association and records a new one under another Parent in one transaction.
- **Area termination:** ending only the operational association; it preserves official hierarchy, facility records and care history.

Current ownership decision: [ADR-0014](./adr/0014-operational-hospital-service-areas.md), partially superseding H1 of ADR-0013 while retaining H2–H5. The Phase A foundation does not complete network Patient reads or management UI. [Phase A handoff](./phases/PHASE_A_HOSPITAL_SERVICE_AREAS.md) records implementation and remaining decisions.

## CURRENT-status addendum — LINE scheduler code closure (2026-10-20)

Scheduler outcomes remain `COMPLETED`, `FAILED`, `DEFERRED` and legitimate `SKIPPED`. The fixed one-batch limit is replaced by repeated fair medication/appointment turns of up to 5 claims, at most 400 claims per queue, with one provider request in flight and a 180-second launch budget checked per claim and before dispatch. Medication first attempts precede retries; the inclusive 15-minute first-attempt boundary and all source/binding/preference/lease fences remain intact. Materialization is capped at 400 occurrences per tick. Empty queues leave the rotation; actual due-work counts distinguish backlog from a full final batch. The systemd timer now activates every minute; active units do not overlap and the existing 60-second successful-completion gate can legitimately skip an activation. Readiness allows brief deferral after a recent fully completed tick, but fails on internal failure, stale success, overdue work, recent delivery-window expiration or terminal delivery failures. All new metrics are aggregate-only. No new migration or infrastructure is introduced. The synthetic supported burst envelope and external capacity/UAT gates are recorded in [E1 §15](./phases/PHASE_LINE_QA_E1_NOTIFICATION_OPERATIONS.md#15-current-throughput-and-fairness-remediation-2026-10-20); code evidence does not establish production performance or business approval.

## CURRENT-status addendum — Phase LINE-QA.E2 production topology (2026-10-19)

Starting HEAD **69f69e5** (E1). Repository artifacts and Thai runbooks only; no VPS, Cloudflare, Supabase, LINE or DNS resource was created or changed. Decided production topology:

- **Production:** one VPS running `next start` under PM2 (fork mode, exactly one instance, `kill_timeout` 30 s so `after()` work drains), nginx with a Cloudflare Origin CA certificate behind the **Cloudflare proxy** (SSL Full (strict) + Authenticated Origin Pulls; real client IP from `CF-Connecting-IP`), domain `<PROD_ORIGIN>` still TBD. Secrets live in `/etc/demi/demi.env`, loaded by `node --env-file`. A systemd timer calls the scheduler tick on `127.0.0.1` every minute after the throughput remediation (original E2 cadence: 5 minutes); nginx returns 404 for `/api/internal/*`.
- **Database/Auth/Storage:** a new Supabase Cloud project on Pro, separate from `Demi-dev`; region pending the legal answer on cross-border transfer (ก-25).
- **LINE:** a new production provider with its own Account LINE Login/LIFF, Messaging API and optional MINI channels; demo bindings are not migrated.
- **Demo:** stays on Vercel Hobby with `Demi-dev`, no scheduler, medication reminders off.
- `GET /api/health` is now readiness (database, shipped migrations applied, core configuration; booleans only, 200/503) and `GET /api/health/live` is liveness; both bypass the session proxy. `npm run env:check` validates an env file with the runtime schemas. `getPrisma()` caches one client per process in every environment.
- Runbooks: [DEPLOY_VPS](./operations/DEPLOY_VPS.md), [SUPABASE_PRODUCTION](./operations/SUPABASE_PRODUCTION.md), [LINE_PRODUCTION_SETUP](./operations/LINE_PRODUCTION_SETUP.md), [RELEASE_GATE](./operations/RELEASE_GATE.md). Business gates (ก-25 incl. จ-6 and data residency, ACCOUNT-04, WB-PD-01/02/03) block real patient data independently of the technical gate.

## CURRENT-status addendum — Phase LINE-QA.E1 notification operations (2026-10-19)

[Phase LINE-QA.E1 handoff](./phases/PHASE_LINE_QA_E1_NOTIFICATION_OPERATIONS.md), starting HEAD **a8189bd7f18d3bc79b39dafc0319b03b0ead3837**. Code only; no scheduler is wired (Vercel Cron / pg_cron wiring is E2) and no environment was changed.

- `GET /api/internal/scheduler/tick` (Bearer `DEMI_SCHEDULER_SECRET`, else `CRON_SECRET`; wrong/missing → 404) runs medication drain, appointment drain and both terminal purges under a transaction-scoped advisory try-lock, at most once per 60 s. `GET /api/internal/scheduler/readiness` (same bearer) shows `lastTickCompletedAt` and pending depth/age per outbox. The HMAC drain routes are unchanged.
- The medication HMAC route reads `DEMI_LINE_MEDICATION_REMINDERS_WORKER_SECRET`; the shared appointment secret is accepted only while it is unset (one-time warning). `DEMI_LINE_MEDICATION_REMINDERS_DISABLED` stops materialization and sending (`REMINDERS_DISABLED` outcome).
- A workforce-only binding that sends a next-appointment keyword gets the role-aware HELP reply. All `public` functions now pin `search_path`.

## CURRENT-status addendum — Phase LINE-QA.C3 conversational replies (2026-10-19)

[Phase LINE-QA.C3 handoff](./phases/PHASE_LINE_QA_C3_CONVERSATIONAL_REPLIES.md), starting HEAD **f43ad31f402ab69872dd4fbd2e95e353dfac35cb**. 1:1 text messages to the DEMI OA now get a reply on the existing reactive pipeline (receipt → `after()` → Reply API).

- Exact keywords (NFKC, trimmed, Latin lower-cased; no fuzzy/NLU): “นัด/นัดหมาย/นัดถัดไป” run the unchanged next-appointment reply; “เมนู/ช่วยเหลือ/help” and any other text get HELP: short text + Quick Reply buttons from the binding's current eligible roles (fixed intent URLs only). Unbound, multiple-binding or inactive users get the generic INELIGIBLE copy with the account management link.
- HELP for unmatched text: one reply per LINE user per 10 minutes, stored as a SHA-256 hash in the new `LineConversationReplyThrottle` table. New receipt type `HELP`; message text is never stored or logged. Aggregate outcome log `line_reactive_reply_summary`.
- Default WB-DF-18 awaits customer confirmation. Required OA settings: webhook on, auto-response off. No Rich Menu, LIFF, MINI App or Console change.

## CURRENT-status addendum — Phase LINE-QA.D Patient workflow audit (2026-10-19)

[Phase LINE-QA.D handoff](./phases/PHASE_LINE_QA_D_PATIENT_WORKFLOW_INTEGRATION_AUDIT.md), starting HEAD **77ece3e1087498ea9811a6c4a1a6f56bd53815e1**. The five Patient Rich Menu actions (workspace, appointments, wellness, medications, care) were traced end to end on ordinary DEMI Web routes; login return, scope and policies passed unchanged.

- A signed-in account without usable Patient access that opens a Patient entry route now sees an explanatory state ("บัญชีนี้ยังเปิดข้อมูลผู้ป่วยไม่ได้") instead of a silent redirect to `/app`. The server's `ForbiddenError` decides; detail routes keep the redirect.
- Wellness links to self-measurements; Medications reads back the LINE reminder state and links to Settings; care history links meet 44 px.
- A guard test requires every `app/app/*` route folder to be classified as personal, work or shared.
- No schema, flag, Rich Menu, MINI App or provider change. Open owner questions in handoff section 10.

## CURRENT-status addendum — Phase LINE-QA.C2 unified mobile navigation (2026-10-19)

[Phase LINE-QA.C2 handoff](./phases/PHASE_LINE_QA_C2_UNIFIED_MOBILE_BOTTOM_NAVIGATION.md), starting HEAD **539022eb751857eaa6d6b427025b0babe8c2e088**. All operational roles use one shared mobile-first bottom-tab system below the existing 1024px desktop breakpoint; desktop keeps the existing collapsible Sidebar. The trusted server navigation projection remains the source of available destinations. Personal and Work remain separate navigation workspaces; explicit workspace routes select the matching context, while shared routes such as `/app/family`, `/app/settings`, and `/app/support` preserve the current shell selection. A direct shared-route URL defaults to Work when available, otherwise to the only available workspace. Selecting a workspace changes navigation only. Mobile primary tabs are capability-aware and stable; remaining authorized destinations stay in the shared “เพิ่มเติม” menu. OSM screening/follow-up task queries select tabs but do not grant authority. `/line/workflow/...` keeps its separate MINI App layout. No authorization policy, LINE Provider/Rich Menu behavior, schema, flag, or route hierarchy is changed by C2.

## CURRENT-status addendum — Phase LINE-QA.C1 OSM fieldwork workflow audit (2026-10-19)

[Phase LINE-QA.C1 handoff](./phases/PHASE_LINE_QA_C1_OSM_WORKFLOW_INTEGRATION_AUDIT.md), starting HEAD **b2e1823054486e929b0fb62d7f72f84038e87e8a**. The four OSM Rich Menu actions (assigned Patients, screening, follow-up, provisioning) were traced end to end on ordinary DEMI Web routes; login return, scope and policies passed unchanged.

- In follow-up task mode, a Patient with an ACTIVE Program now opens the Program follow-up round (same rule as the follow-up history CTA), so the round is recorded in the Program and BR-06 plan adjustment continues. Relationship follow-ups remain for Patients without an ACTIVE Program.
- Screening and follow-up detail pages offer a fixed link back to the assigned task list for actors with a current OSM scope. Success destinations are unchanged.
- No schema, flag, channel, Rich Menu or provider change. Open owner questions: Program round-1 screening from LINE, and OSM provisioning scope (handoff section 10).

## CURRENT-status addendum — Phase LINE-QA.B2.4 LINE configuration simplification (2026-10-19)

[Phase LINE-QA.B2.4 handoff](./phases/PHASE_LINE_QA_B2_4_CONFIGURATION_SIMPLIFICATION.md), starting HEAD **961bc1bfe3d3a3710fa5b855d0764c5fbe51bd75**. This entry supersedes the configuration statements in the B1–B2.3 and 17J.3D addenda below, including every "keep `DEMI_LINE_DISCONNECTION_ENABLED=false`" instruction.

- **Configuration is connection data only.** `DEMI_LINE_DISCONNECTION_ENABLED`, `DEMI_LINE_DISCONNECTION_MANIFEST`, `DEMI_LINE_PROVIDER_TOKEN_VERIFY_QUERY_ENABLED`, `DEMI_LINE_MINI_APP_WORKFLOW_ENABLED`, `DEMI_LINE_MINI_APP_ISSUANCE_ENABLED`, `DEMI_LINE_MINI_APP_ENDPOINT_URL` and `DEMI_LINE_MINI_APP_DEPLOYMENT_REFERENCE` are removed and no longer read. MINI uses `DEMI_LINE_MINI_APP_{ENVIRONMENT,CHANNEL_ID,LIFF_ID,CHANNEL_SECRET,CONTEXT_KEYRING}` plus one optional emergency kill switch `DEMI_LINE_MINI_APP_DISABLED`. The MINI endpoint is derived as `DEMI_LINE_PUBLIC_ORIGIN + /line/workflow`.
- **Full Disconnection is permanent policy.** The channel inventory is derived on the server from the Account Login channel and, when provisioned, the selected MINI channel; migration readiness is checked from `_prisma_migrations`. Relink with unavailable configuration fails closed (`LINE_CONFIGURATION_MISSING`); legacy revoked bindings without lifecycle rows require Recovery. Rows persisted under the pre-B2.4 tuple format stay distinct, enforceable history and are never remapped.
- **One MINI availability policy** (kill switch, then a complete valid channel) governs the gateway page, Verify/issuance and every scoped read/mutation. Partial MINI configuration never degrades to Account-only.
- Provider pairing is not configured: it is enforced by requiring the MINI-audience LINE subject to equal the Account binding subject. Deployed to `demi_demo` production by the owner; Account Unlink produced a real LINE `PROVIDER_204`, and in-LINE account switching was owner-tested and works. MINI device UAT remains **NOT VERIFIED**.
- **Follow-ups (`ecdefd9`, `5f25b8b`, `24c336d`):** LINE transfer after explicit Unlink, Recovery handoff kept across the LINE app LIFF reopen, and DEMI account switching on `/line/account`. See handoff section 14.
- **LINE transfer between DEMI Users (owner decision, same day):** after the current owner explicitly unlinks, another User may link the same LINE through the normal Link flow; the previous owner's binding and lifecycle obligations stay with the previous owner. See the ADR-0009 owner-decision section. Signing out does not unlink LINE; `/line/account` offers "ยกเลิกการเชื่อมต่อ LINE และใช้บัญชี DEMI อื่น" (Unlink, then sign out and return to `/login?returnTo=/line/account`) and "ออกจากระบบ DEMI" / "ใช้บัญชี DEMI อื่น" (sign out only), because the LINE webview otherwise keeps the previous DEMI session.

## CURRENT-status addendum — Phase LINE-QA.B2.2 scoped Appointment mutations (2026-10-18)

[Phase LINE-QA.B2.2 handoff](./phases/PHASE_LINE_QA_B2_2_SCOPED_APPOINTMENT_MUTATIONS.md), starting HEAD **0c0eafe3a9561b2f9edff11ed99645e9bc68d783**: **SCOPED MUTATIONS IMPLEMENTED / AUTOMATED + POSTGRESQL VERIFICATION COMPLETE / STAGED / DISABLED BY DEFAULT / NON-ISSUING.**

- **Routes:** fixed POST-only Route Handlers `/line/workflow/appointments/acknowledge` and `/cancellation-request`.
  - They require an exact Origin, JSON, a 2 KiB strict body (existing domain schemas, no duplicate or extra fields) and the HttpOnly workflow cookie.
  - They return finite, sanitized states. With the default gate they return 503 `NOT_ACTIVATED`.
- **Authorization:** `runLineWorkflowScopedInteraction` maps a finite key to the existing `acknowledgeOwnPatientAppointment` / `requestOwnPatientAppointmentCancellation`.
  - It always supplies the server-only `beforeInteractionInTransaction` precondition. That precondition is the first statement of every Serializable attempt: before access resolution, resource reads, idempotent returns and writes.
  - The precondition locks **User, then LineAccountBinding, FOR UPDATE**. It then revalidates expiry, binding generation and owner, the authSubject mapping, an ACTIVE non-quarantined actor and Patient SELF on the same transaction.
  - Ordinary calls and OSM paths are unchanged.
- **Retries:** the Appointment retry classifier reuses `isRetryableSerializableTransactionError`, which adds P2010 with 40001. The limit is unchanged.
- **Concurrency:** PostgreSQL tests using the real Unlink service prove three orderings.
  - Unlink first: the mutation denies with no write.
  - Mutation first: Unlink waits and the mutation completes.
  - Stale snapshot: the mutation aborts, retries with fresh locks and denies.
  - Relink invalidates old contexts, and replay after Unlink never succeeds.
- **UI:** scoped client controls post only to the fixed handlers, with no Server Actions.
  - Cancellation needs an explicit confirmation that it is a *request*.
  - An uncertain outcome is recovered only by resending the same payload and nonce.
- **Reschedule history:** now shown read-only in LINE, from the same snapshot. The B2.1 omission is re-recorded as "Deferred implementation deviation — pending product acceptance".
- **SSR headers:** a narrow `onResponseHeaders` collector merges Supabase SSR cache headers into handler responses.
- **Still not done:** nothing mints `__Secure-DEMI_LINE_WORKFLOW`. B1 verify still ends with `WORKFLOW_NOT_ACTIVATED`. No Rich Menu, provider, environment, schema or migration changed. Context issuance and the activation review (B2.3), MINI termination, and real LINE/device UAT remain **NOT IMPLEMENTED / NOT VERIFIED**. B2.3 must not start automatically.

## CURRENT-status addendum — Phase LINE-QA.B2.1 scoped Appointment read runtime (2026-10-18)

[Phase LINE-QA.B2.1 handoff](./phases/PHASE_LINE_QA_B2_1_SCOPED_APPOINTMENT_READ.md), starting HEAD **9caa7e1d2629c05519f2d56d960cea78163494e2**: **SCOPED READ RUNTIME IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE / DISABLED BY DEFAULT / NON-ISSUING.**

- **Routes:** read-only `/line/workflow/appointments`, `/[relationshipId]` and `/[relationshipId]/[appointmentId]` exist.
- **Authorization:** every read goes through the mandatory `runLineWorkflowScopedRead`. Context decryption and the Auth exact-session check run outside the database. One RepeatableRead transaction (2s/5s) then revalidates expiry, the authSubject mapping, the exact binding generation, the canonical actor and persisted Patient SELF. The existing Patient SELF queries run on that same TransactionClient.
- **Missing or invalid scope** renders a finite Thai denial. It never shows ordinary `/app` data or the empty state.
- **B1 remediation:** the reviewed inventory must pair the single MINI tuple with the sole expected Account tuple under one Provider reference.
- **Proxy:** `proxy.ts` admits only GET/HEAD to scoped rendering pages and rejects Server Action requests, encoded or ambiguous paths, and the reserved B2.2 handler paths before dispatch. A production smoke run confirmed that Next 16.3 otherwise dispatches action IDs from unrelated rendering routes.
- **UI:** shared, mutation-free Appointment content is reused. Ordinary views and controls render byte-identical markup.
- **Reschedule history** is intentionally not shown in the scoped view.
- **Still not done:** nothing mints `__Secure-DEMI_LINE_WORKFLOW`, `WORKFLOW_NOT_ACTIVATED` remains, and there is no Rich Menu, provider, environment, schema or migration change. Scoped mutations, context issuance, MINI termination and real LINE/device UAT remain **NOT IMPLEMENTED / NOT VERIFIED**. B2.2 must not start automatically. The MINI App is not production-ready.

## CURRENT-status addendum — Phase LINE-QA.B1 MINI App gateway foundation (2026-10-18)

[Phase LINE-QA.B1 handoff](./phases/PHASE_LINE_QA_B1_MINI_GATEWAY_FOUNDATION.md), starting HEAD **934d5a3b2475993532a8e789ba0c9960a5bd39a0**: **FOUNDATION IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE / DISABLED BY DEFAULT / NON-ISSUING.** Source adds the strict selected MINI tuple (`DEMI_LINE_MINI_APP_*`), a distinct MINI-audience ID-token verifier, the `/line/workflow` initialization shell, `POST /api/line/workflow/verify` transport, exact `/line/workflow?intent=OPEN_PATIENT_APPOINTMENTS` login return, binding/session/Patient SELF/lifecycle orchestration and AES-256-GCM scoped-context primitives. `DEMI_LINE_MINI_APP_WORKFLOW_ENABLED` defaults to disabled; even when enabled, B1 ends every eligible request with `WORKFLOW_NOT_ACTIVATED` and mints no `__Secure-DEMI_LINE_WORKFLOW` cookie. MINI eligibility additionally requires the active reviewed Full Disconnection inventory to list the selected MINI tuple. No Patient data is rendered, no Rich Menu action changed (`OPEN_PATIENT_APPOINTMENTS` remains `/app/personal/appointments`), no schema/migration, provider, environment or deployment change. Scoped Appointment routes/actions, context issuance, MINI termination transport and device/provider UAT remain **NOT IMPLEMENTED / NOT VERIFIED** and belong to B2, which must not start automatically. The MINI App is not production-ready.

## CURRENT-status addendum — Phase H responsibility areas (2026-10-17)

> **Superseded in part (ADR-0014/0015/0016/0017).** Areas are now operational service areas (`HospitalServiceArea`): Parent OWNERs attach and end their Children, Platform ADMIN sets network roles and transfers Children, and an OWNER-granted Parent MEMBER has read-only network Patient access. There is no canonical hierarchy and no Master reconciliation. The paragraph below is the 2026-10-17 record.

[ADR-0013](./adr/0013-responsibility-areas.md) is Accepted (customer decisions จ-1..จ-5; [WB_ALIGNMENT_DECISIONS.md](./requirements/WB_ALIGNMENT_DECISIONS.md) §ซ, WB-PD-04 closed). A responsibility area is an active direct Child Hospital of the canonical hierarchy; there is no Area model and no Parent attach/detach (master data + Platform ADMIN reconciliation stay authoritative). The Work home “เขตความรับผิดชอบ” selector (STAFF-04) lists only the actor's active direct memberships/OSM relationships grouped by parent network. The active Parent OWNER has `/app/hospitals/areas` and the RPT-32 export (`hospital-network:child-report:export`): one exact active direct Child's nine summary values per .xlsx, active cohort only, re-checked at export time and audited; no Parent MEMBER access, no patient-level area export, no Child roster view, and no former-Parent attribution. H5 decides present authorization from the current link; it does not establish when that link began or whether source records predate it. The schema/query cannot enforce a record-time disclosure boundary, and small aggregate counts may disclose sensitive information. Preserve aggregate-only demonstration with synthetic fixtures in a controlled test database; no runtime mode distinguishes synthetic from real data. Real-data release of the Parent summary view/export is requirement-gated pending the Owner questions in [Reporting Access Canonical](./requirements/REPORTING_ACCESS_CANONICAL.md) §5. No threshold, consent rule, or historical ownership is inferred. Canonical rows: [BUSINESS_FLOW_GAP_CANONICAL.md](./requirements/BUSINESS_FLOW_GAP_CANONICAL.md) STAFF-04, AREA-01..05, OWNER-13, RPT-32.

## CURRENT-status addendum — Patient import profile persistence (2026-10-13)

[ADR-0011](./adr/0011-patient-import-profile-persistence.md) records the newly approved profile persistence scope. PatientProfile owns global date of birth; PatientHospitalProfile owns each hospital's demographics, contact, structured address and emergency contact. Successful NEW-patient Template v2 import includes those supplied fields. Existing-patient imports remain non-overwriting, and conflicting global DOB is CONFLICT. Local profile nulls remain authoritative; free-text address editing explicitly replaces structured components. This supersedes the historical profile-persistence gate within this scope only; OSM and clinical ownership stay unchanged. See the [26-field mapping](./phases/PATIENT_IMPORT_PROFILE_PERSISTENCE_HANDOFF.md).

## CURRENT-status addendum — MEMBER report export restored (2026-10-21)

Product Owner decision amending [ADR-0019](./adr/0019-owner-administration-and-import-only-roster.md): every ACTIVE MEMBER exports its own ACTIVE Hospital's ACTIVE-cohort report workbook without an OWNER grant. Dashboard, row reads, `INCLUDE_ENDED`, network reports and the retired grant management remain OWNER-only.

## CURRENT-status addendum — Patient import template v3: complete initial health data (2026-10-21)

Patient import now accepts only `patient-import-template-v3` (contract `patient-import-v3-initial-health-data`): the v2 columns A–Z unchanged plus medical history (diabetes, hypertension, other conditions) and family history (hypertension, diabetes, heart disease, stroke) in AA–AG, persisted for NEW relationships to `PatientHospitalHealthHistory` inside the same per-row Serializable transaction. Answers are strictly มี/ไม่มี/ไม่ทราบ; blank means UNKNOWN, never NO. v2 files and v2-bound previews are rejected. Existing patients remain identity-check only. Medication, appointment, OSM assignment and health plan workflows are unchanged. See [Patient Import v3](./phases/PATIENT_IMPORT_V3_COMPLETE_INITIAL_HEALTH_DATA.md); the template-version and column statements in the Phase 16F addendum below are superseded.

## CURRENT-status addendum — Phase 16F strict per-hospital Patient import template v2 (2026-10-13)

> Template version/columns superseded by [Patient Import v3](./phases/PATIENT_IMPORT_V3_COMPLETE_INITIAL_HEALTH_DATA.md) (2026-10-21); the rest of this addendum still applies.

Patient import accepts only `patient-import-template-v2`, generated per Hospital and bound by `Hospital.hospitalCode` in a veryHidden metadata sheet; it creates new patients only (existing patients are an identity check: `ALREADY_EXISTS`/`CONFLICT`), has no OSM or hospital-name column, offers a failed-rows export, and OSM is assigned in the app (per patient and in bulk). The stateless-preview + HMAC-binding + re-validate + per-row-commit pipeline is unchanged. `IMP-REQ-03` stays OPEN. See [Phase 16F](./phases/PHASE_16F_PATIENT_IMPORT_STRICT_TEMPLATE_V2_DECISION.md); earlier statements about template v1, roster OSM assignment and roster classification reconciliation below are historical.

## Historical snapshot — CURRENT reporting requirements (2026-10-12)

Read [Reporting Access Canonical](./requirements/REPORTING_ACCESS_CANONICAL.md) before using historical reporting plans. Parent OWNER per-eligible-Child-Hospital report viewing is confirmed product scope; RPT-NET-01 authorization, RPT-NET-02 grouped selector/consumer, RPT-NET-02B exact-Child source-backed summaries/audit, and RPT-NET-02C Dashboard and Service Process summary rendering are implemented. The Parent need not own each Child. The browser receives only the nine exact-Child operational summary values and Parent/Child identity; Patient-level, clinical, Program-detail, and export fields remain outside this slice. Global ADMIN selected-Hospital viewing and XLSX export are implemented. Global merged aggregation is not an initial requirement, and N-only Network aggregation is no longer the primary next slice. This 2026-10-12 snapshot predates Phase H; its statement that HN-M07 does not block the exact-Child flow did not resolve record-time disclosure or small-count privacy for real-data use. Current Parent/Child authority is revalidated after hierarchy changes, while effective-dated historical Parent attribution remains unavailable. Parent export is limited to the nine-value RPT-32 summary (Phase H, ADR-0013); the separate real-data release gate is in the canonical requirements. Existing security architecture and exact operation scoping continue to apply.

RPT-CLOSE-01 ตรวจสอบระบบรายงาน MVP ปัจจุบันแบบอัตโนมัติผ่านเมื่อ 2026-10-12 ครอบคลุมเฉพาะขอบเขต Reporting MVP ที่ยืนยันแล้ว ไม่ได้หมายถึง manual browser/mobile UAT, production deployment หรือ external privacy/legal approval ดู [RPT-CLOSE-01 handoff](./phases/PHASE_RPT_CLOSE_01_REPORTING_INTEGRATED_REAUDIT_HANDOFF.md)

## CURRENT Business Flow Closure Program — BF-GAP-01R + Workbook DoD track (2026-10-12)

The Business Flow Closure Program is in BF-GAP-01R, the current correction phase for the [canonical business-flow register](./requirements/BUSINESS_FLOW_GAP_CANONICAL.md); see the [BF-GAP-01R correction handoff](./phases/BF_GAP_01R_WHITEBOARD_INVENTORY_CORRECTION.md). BF-GAP-02 has NOT STARTED. Dashboard/reporting feature expansion remains paused pending upstream business-flow and source-data audit; current direct OWNER, Global ADMIN selected-Hospital, Parent exact-Child summary and exact-Program runtime remains preserved. RPT-CLOSE-01 is historical evidence for its bounded automated scope, not proof that all customer reporting requirements are complete. After review, the next audit order is BF-GAP-02 Runtime Crosswalk → BF-GAP-03 Core Care Journey.

**Workbook DoD track (2026-10-12):** the Product Owner set the customer workbook `docs/Dashboard App Demi.xlsx` as the Definition of Done. [BF-GAP-WB-00](./phases/BF_GAP_WB_00_WORKBOOK_DOD_CLOSURE_PLAN.md) holds the column crosswalk, the Owner decisions (§5.1) and the pending register (§5.2); [BF-GAP-WB-01](./phases/BF_GAP_WB_01_WORKBOOK_S1_S2A_IMPLEMENTATION_HANDOFF.md) and [BF-GAP-WB-02](./phases/BF_GAP_WB_02_FINAL_DATE_PLAN_LINK_HANDOFF.md) record the implementation. Workbook coverage is 85 of 108 customer columns source-ready; reporting changes are limited to filling workbook columns under confirmed decisions, and export access is unchanged (direct Hospital OWNER, Global ADMIN selected Hospital). The Canva whiteboard was read directly and visually verified (WB-00 §3.1); the flow-gap summary against it is WB-00 §3.2. BF-GAP-02 runtime crosswalk has still not started.

## CURRENT-status addendum — Phase 19A Global / Hospital Network reporting readiness (2026-10-11)

[Phase 19A readiness review](./phases/PHASE_19A_GLOBAL_AGGREGATION_AND_HOSPITAL_NETWORK_REPORTING_READINESS.md) assessed aggregation readiness. Its HN-M07, historical attribution, M03 and aggregate consistency gates apply to Network aggregates; they do not block the separate confirmed Parent-to-Child exact-Hospital reporting flow. `resolveHospitalNetworkScope()` is structural scope infrastructure, not a report grant. See the canonical requirements for current priority and runtime gaps.

## CURRENT-status addendum — Hosting-agnostic Reporting MVP (2026-10-11)

[Phase 18D.2 implementation handoff](./phases/PHASE_18D2_GLOBAL_ADMIN_REPORTING_IMPLEMENTATION_HANDOFF.md): Global ADMIN workspace, eligible selected-Hospital Dashboard/Service Process read, and selected-Hospital XLSX export are implemented as separate server-authorized operations. They do not require Hospital OWNER membership and do not aggregate multiple Hospitals. Parent-to-Child exact report viewing is a separate confirmed requirement; RPT-NET-01/02/02B/02C have since implemented authorization, selection, exact-Child summary queries and rendering. No Patient mutation or general clinical access follows from hierarchy. Broader aggregate, Patient discovery/detail, and external-disclosure scopes remain separate.

## CURRENT-status addendum — Phase 18D.1 Hospital reporting runtime (2026-10-11)

[Phase 18D.1 implementation handoff](./phases/PHASE_18D1_HOSPITAL_REPORTING_IMPLEMENTATION_HANDOFF.md): `/app/hospitals/reporting` and `/api/v1/hospital/reporting/export` provide the exact-Hospital OWNER Dashboard, Service Process view and two-sheet XLSX. Availability is hosting-agnostic; server authorization and exact-Hospital predicates are rechecked for the operation. Phase 18D.1 did not include Parent-to-Child report authorization/selection; RPT-NET-01 later added the authorization foundation, and RPT-NET-02/02B/02C have since implemented the selector, source-backed summary read and Parent view.

## Historical-status addendum — Phase 18D.1 preflight Owner directions (2026-10-11)

[Owner Direction & Implementation Authorization Preparation](./phases/PHASE_18D1_OWNER_DIRECTION_AND_IMPLEMENTATION_AUTHORIZATION_PREP.md) records the pre-implementation state for the original direct-Hospital slice. Phase 18D.1 later implemented that bounded slice. This historical preparation record does not define current Parent-to-Child reporting scope; use the canonical requirements for current reporting priorities.

## Historical-status addendum — Phase 18D.0 Hospital Reporting preparation (2026-10-11)

[Hospital Reporting Implementation Preparation](./phases/PHASE_18D_HOSPITAL_REPORTING_IMPLEMENTATION_PREPARATION.md) records the earlier proposed exact-Hospital summary/list scope before the Phase 18D.1/18D.2 implementations. Its statement that hierarchy cannot supply Child reporting is superseded for current product intent by OR-RPT-01; field-specific disclosure remains open, and aggregate gates remain operation-specific.

## CURRENT-status addendum — Phase 18C.2 reporting architecture (2026-10-10)

[Architecture Blueprint](./phases/PHASE_18C2_REPORTING_ARCHITECTURE_BLUEPRINT.md), [Field Lineage and Metric Catalog](./phases/PHASE_18C2_FIELD_LINEAGE_AND_METRIC_CATALOG.md) และ [Implementation Readiness Roadmap](./phases/PHASE_18C2_IMPLEMENTATION_READINESS_ROADMAP.md) are historical architecture records. Global selected-Hospital reporting/export are implemented; merged Global aggregation is not required initially; Parent-to-Child per-Hospital summary reporting is now implemented for its confirmed initial fields. Patient/clinical detail remains a separate scope; Parent export is the nine-value RPT-32 summary only (Phase H, ADR-0013). HN-M08 is deferred for Network aggregate export and does not decide Parent selected-Child export.

## CURRENT-status addendum — Phase 18C.1B Global Reporting security contract (2026-10-10)

[Phase 18C.1B Global Reporting Security Contract](./phases/PHASE_18C1B_GLOBAL_REPORTING_SECURITY_CONTRACT.md), [Security Decision Register](./phases/PHASE_18C1B_SECURITY_DECISION_REGISTER.md) and [Synthetic Acceptance Matrix](./phases/PHASE_18C1B_SECURITY_ACCEPTANCE_MATRIX.md) are historical security review artifacts. Current selected-Hospital Global report/export are implemented. GR-SEC decisions retain force for their specified broader scopes; they do not make Global aggregation a prerequisite. HN-M07/history gates remain open for aggregate disclosure. Parent's initial exact-Child summary set is implemented; Patient/clinical detail and effective-dated historical attribution remain separate open scopes.

## CURRENT-status addendum — RPT-24 on-demand As-of Excel requirement (2026-10-10)

[RPT-24 contract](./phases/PHASE_17_RPT24_ON_DEMAND_ASOF_EXCEL_EXPORT_CONTRACT.md) and [RPT-24A customer decision pack](./phases/PHASE_17_RPT24A_CUSTOMER_WORKBOOK_DECISION_PACK.md): **RPT-24 AS-OF EXPORT REQUIREMENT RECORDED — FIELD / AUTHORIZATION CONTRACT PENDING — IMPLEMENTATION NOT AUTHORIZED; RPT-24A DECISION PACK PREPARED — REQUESTER / CUSTOMER ACCEPTANCE PENDING — EXPORT IMPLEMENTATION NOT AUTHORIZED.** The confirmed on-demand Patient Program progress requirement remains unchanged. `requestedAt`, coherent `dataAsOf`/snapshot boundary and `generatedAt` are distinct; a request timestamp does not prove the database state read. One approved snapshot must cover both sheets, cohort counts, pagination and source lookups; consistency/revocation design remains open. Workbook population, row grain, identity, fields, missing values, overflow and layout are proposed for customer review, not accepted. `report:program:read` remains exact-Program read only; no cohort/export authorization exists. HN-C1 and RPT-24 are reachable from `main` at the reviewed baseline, but Git merge does not grant approval. HN-M06-T01–T09 remain unchanged, HN-M07/history gates remain open, and HN-M08 Network Export remains DEFERRED / NOT AUTHORIZED.

## CURRENT-status addendum — Phase 18C.1A Global Reporting direction (2026-10-10)

[Phase 18C.1A reconciliation](./phases/PHASE_18C1A_GLOBAL_REPORTING_REQUIREMENT_RECONCILIATION.md): Product Owner direction for exact selected-Hospital Global reporting is now implemented under the Role.ADMIN contract. Cross-Hospital Patient discovery/drill-down, broad Global aggregates and per-Hospital comparisons remain separate and approval-gated. `report:program:read` remains exact-Program; HN Network is separate; HN-M08 stays DEFERRED / NOT AUTHORIZED. R24A-D01–D15 remain PROPOSED; RPT-24C gates remain open for any other export scope.

## CURRENT-status addendum — Phase 17K HN-C1 requester direction (2026-10-10)

[HN-C1 Security & Disclosure Contract](./phases/PHASE_17K_HNC1_SECURITY_DISCLOSURE_CONTRACT.md) and [Decision Direction Record](./phases/PHASE_17K_HNC1_DECISION_DIRECTION_RECORD.md) record historical engineering proposals for Network aggregation. D01–D13 are not security/privacy approvals. HN-M07, historical provenance and HN-M03 gates remain open for affected aggregate work. This 2026-10-11 snapshot predates Phase H and does not decide the current Parent exact-Child real-data gate for record-time provenance and small-count disclosure; see [Reporting Access Canonical](./requirements/REPORTING_ACCESS_CANONICAL.md) §5. HN-M08 remains deferred for Network aggregate export. Use the canonical requirements for current Parent-to-Child reporting scope and remaining detail/history questions.

## CURRENT-status addendum — Phase 17K.0B HN-C0 Hospital Network decision closeout (2026-10-10)

[HN-C0 decision closeout](./phases/PHASE_17K0B_HN_OWNER_DECISION_CLOSEOUT.md) records HN-A01–A06 and HN-M01–M06/time semantics for historical aggregate scope. Its lack of aggregate implementation authorization does not veto OR-RPT-01 per-Hospital Child reads. This 2026-10-10 snapshot records the then-current position; Phase H later confirmed H5 current-link authorization but left record-time provenance and small-count disclosure as a separate real-data gate in [Reporting Access Canonical](./requirements/REPORTING_ACCESS_CANONICAL.md) §5. HN-M08 remains deferred for Network aggregate export. OWNER-01, AREA-01 and unrelated K-Q statuses remain separate.

## Historical-status addendum — Phase 17K.0 Hospital Governance / Responsibility Area decision pack (2026-10-10; before HN-C0)

[Phase 17K.0 decision pack](./phases/PHASE_17K0_HOSPITAL_GOVERNANCE_RESPONSIBILITY_AREA_DECISION_PACK.md) records its status at that time: **DECISION PACK COMPLETE / OWNER DECISIONS OPEN**; K-Q01–K-Q25 were **OPEN / NOT OWNER APPROVED**. Starting baseline for the pack was HEAD acd6a29797de01c5ac1841fd1a3666809d4729a1 on main; the worktree was clean before its documentation changes. OWNER-01 and AREA-01 were requirement-gated at that 2026-10-10 snapshot; Phase H later resolved the AREA-01 hierarchy semantics under accepted ADR-0013, while OWNER-01 and the separate real-data disclosure gate remain open. HN-C0 records the separately accepted Hospital Network semantics but does not authorize 17K.1–17K.3. See the current Phase H and Reporting Access addenda above.

## CURRENT-status addendum — Phase 17J.5A LINE integration re-audit (2026-10-09)

[Phase 17J.5A](./phases/PHASE_17J5A_LINE_INTEGRATION_REAUDIT_UAT_READINESS.md): **PASS — AUTOMATED RE-AUDIT COMPLETE** at reviewed starting HEAD `1fcc038ea2bd9f0e10eba48d88671984cde49a2f`. The integrated LINE/appointment unit slice passed **37 files / 316 tests**; four focused disposable-PostgreSQL integration files passed **114 tests**; typecheck and targeted ESLint passed. The review corrected HTTP retry exhaustion to distinguish known retryable HTTP failures from permanent provider rejection and unresolved transport ambiguity. No schema/migration, environment, provider, or deployment change was made.

Synthetic automated readiness is established only for the approved bounded scope. Manual synthetic browser/device walkthrough, real LINE Push/provider/device UAT, production readiness, and user-visible delivery are **NOT VERIFIED**. Keep `DEMI_LINE_DISCONNECTION_ENABLED=false`; appointment notifications remain effectively OFF. S01 token-egress/privacy review remains an explicit separate real-provider UAT gate, with no controller sign-off asserted. Phase 17J.5B remains unexecuted and approval-gated. The next planned development phase is Phase 17K, whose OWNER-01 / AREA-01 requirements must be decided before implementation. The comprehensive customer requirement gap review has not started.

## Historical-status addendum — Phase 17J.4A decisions / 17J.4B implementation (2026-10-09)

[Owner Decision Closeout](./phases/PHASE_17J4A_OWNER_DECISION_CLOSEOUT.md) records J4A-OD01–OD10, Cutover Safety, and Honest Idempotency **APPROVED for isolated synthetic/demo implementation**. The earlier [Phase 17J.4A Decision Pack](./phases/PHASE_17J4A_PROACTIVE_NOTIFICATION_DECISION_PACK.md) remains historical proposal/source evidence. Phase 17J.4B appointment-only runtime is **IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE**: focused unit tests passed 7 files / 77 tests, and focused PostgreSQL integration passed 1 file / 19 tests. **Overall Phase 17J.4 is not marked complete or approved; P17D-NOTIF-01 remains open.** See the [implementation handoff](./phases/PHASE_17J4B_APPOINTMENT_NOTIFICATION_IMPLEMENTATION.md) for exact scope and limitations.

Only appointment create, actual date/time reschedule, and canonical cancellation are in scope, using Patient SELF opt-in (default OFF), current relationship/binding/friendship checks, generic approved Thai copy, a transactional outbox, and a bounded LINE Push worker. Real LINE Push, real-provider/device UAT, external privacy/governance approval, LINE provisioning/authorization mutation, scheduler activation, deployed flag/generation changes, environment mutation, production deployment, and release remain **NOT AUTHORIZED / NOT EXECUTED**. Supabase Auth remains the only DEMI identity authority; LINE identity never grants Patient authority. Keep **DEMI_LINE_APPOINTMENT_NOTIFICATIONS_ENABLED=false** and **DEMI_LINE_DISCONNECTION_ENABLED=false**; the gates are independent. Existing LINE Login/LIFF and legacy Link/Unlink remain the isolated demo/UAT baseline. No MINI App channel is created or activated. Continue the original Phase 17 roadmap; after 17J.4B verification, next is 17J.5A automated integrated re-audit/UAT-readiness, distinct from any separately authorized real-provider UAT.

Full LINE Disconnection/Recovery and lifecycle activation remain separately deferred. Automated Recovery tests and the reviewed UAT matrix remain prerequisites for future isolated UAT only; they do not complete real-provider UAT.

## Historical-status addendum — Phase 17J.4A pre-approval proposal (2026-10-09)

[Phase 17J.4A decision pack](./phases/PHASE_17J4A_PROACTIVE_NOTIFICATION_DECISION_PACK.md) records current appointment/LINE source evidence and a minimal appointment-only proactive Push proposal. **PROPOSAL READY FOR OWNER REVIEW; J4A-OD01–OD10 remain OPEN. Phase 17J.4 and P17D-NOTIF-01 are not complete or approved; no delivery implementation is authorized until the unresolved decisions are explicitly approved.** No application/schema/migration/environment/provider/deployment change was made.

Owner-provided boundaries for this continuation: existing LINE Login/LIFF and legacy Link/Unlink remain the isolated demo/UAT baseline; Full LINE deauthorization, lifecycle activation, and bounded Recovery hardening remain separately deferred; **DEMI_LINE_DISCONNECTION_ENABLED=false**; no MINI App channel is to be created or activated; automated Recovery tests and the reviewed UAT matrix are prerequisites only, not real-provider UAT completion; no deployment, environment mutation, provider authorization mutation, or production release is authorized. Continue the original Phase 17 roadmap. Next step is owner decision closeout, then Phase 17J.4B only after explicit approval.

## Historical-status addendum — Phase 17J.3D-UAT.1A (2026-10-09)

From preflight baseline `a08d4abdcdcc26852ebf996b3d62493fa02f1ea2`, UAT-S02 is **FIXED IN SOURCE / ACTIVATION STAGED** in the current working tree. Account Summary now loads independently of Full Disconnection readiness; readiness, lifecycle status and Rich Menu reconciliation fail independently. A loaded active binding retains local Unlink with truthful Thai copy when LINE removal cannot be confirmed. Relink stays hidden when durable lifecycle history exists or cannot be verified; the existing Unlink audit records a readiness-fallback marker, and Link guards retain that fence if the feature gate is later disabled. Never-activated legacy bindings with no lifecycle rows or marker retain their path. Recovery remains unavailable until reviewed configuration and migration readiness return. Focused verification: **12 files / 105 tests PASS**, typecheck/lint PASS. PostgreSQL integration, LINE/device UAT and activation were NOT RUN. S01 token-egress privacy and the preflight environment/operator gates remain outstanding, so real-provider UAT is still not ready or authorized. See the [S02 evidence and limitations](./phases/PHASE_17J3D_UAT1_ACTIVATION_READINESS_PREFLIGHT.md#17j3d-uat1a--s02-regression-evidence).

## Historical-status summary — Phase 17J.3D-UAT.1 preflight (2026-10-09)

[Activation readiness preflight](./phases/PHASE_17J3D_UAT1_ACTIVATION_READINESS_PREFLIGHT.md): **CONDITIONAL GO — OPERATOR ACTION REQUIRED; real-provider UAT not ready to begin.** Source HEAD **53e0d0fa36254b3181b5e077d59e177f957f3e6d**; 17J.3B contract complete, 17J.3C foundation implemented and 17J.3D Account orchestration activation staged remain unchanged. Local gates are false, manifest empty, Login secret present without credential verification. Configured HTTPS origin responds through Vercel; Demi-dev Auth reports v2.197.0. Deployed SHA/isolation, Console/MINI inventory, target migration, current Auth policies, token-egress privacy and permitted device/test population remain unverified. Existing friendship token-query egress is outside the new adapter gate; configuration loss can remove Recovery availability and hide the local unlink UI despite safe API fallback. See the [Thai operator guide](./phases/PHASE_17J3D_UAT_OPERATOR_SETUP_GUIDE.md) and [unexecuted UAT matrix](./phases/PHASE_17J3D_UAT_TEST_MATRIX.md). Focused source tests **36 files / 314 PASS**, typecheck/lint PASS; PostgreSQL tests, live LINE/device UAT, migration/deployment, env changes and activation NOT RUN. Next: operator inspection/attestation and entry-gate reassessment, then separately authorized UAT execution; no MINI runtime or Phase17J.4 starts here.

## Historical-status summary — Phase 17J.3D Account disconnection and Recovery (2026-10-09)

[Phase 17J.3D handoff](./phases/PHASE_17J3D_ACCOUNT_FULL_DISCONNECTION_RECOVERY_IMPLEMENTATION.md) records **FOUNDATION + ACCOUNT ORCHESTRATION IMPLEMENTED / ACTIVATION STAGED**, baseline HEAD **1dea19b09af8b7a9a02267be8b03d6de7d8ae9ec**. Source now composes atomic local unlink, independent Account provider termination, durable attempt outcomes, Auth-owned same-captured-JWT exact-session Recovery, five-minute reviewed intents, fresh server-verified Account identity, Thai self-service Recovery and transaction-safe Link/Relink guards. Recovery does not restore a binding or grant Patient access. MINI obligations remain channel-specific and unconfirmed unless independently satisfied; MINI transport/workflow is not implemented.

The default operational flag remains disabled. No reviewed real channel inventory, target-environment migration acceptance, LINE credential/UAT evidence, mobile/browser UAT or deployment is claimed. Enabling the flag alone is not readiness evidence. Already-persisted pending obligations remain fenced even if the flag is disabled; after activation, keep the Recovery configuration available rather than disabling it and stranding pending users. Ordinary DEMI credential login and never-activated legacy Account behavior remain independent. The narrowly scoped outbound LINE token-verification query exception was explicitly owner-approved in this implementation session; browser URLs, redirects and logs must never contain tokens. See the handoff for exact configuration, automated evidence, operator acceptance gates and residual late-provider availability risk.

Next: reviewed Account provisioning and disposable-user provider/device UAT. Do not start MINI Gateway, Appointment integration or Phase 17J.4 automatically. Phase 17J.3B/3C completion history below remains authoritative for its tested scope.

## Historical-status summary — Phase 17J.3C lifecycle foundation (2026-10-08)

[Phase 17J.3C handoff](./phases/PHASE_17J3C_FULL_LINE_DISCONNECTION_LIFECYCLE_FOUNDATION_IMPLEMENTATION.md) records **GO — FOUNDATION IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE / USER-FACING ACTIVATION STAGED**, baseline main/origin **9af86fb3ee0dcdabe62cade1a68545bf657cf054**. Narrow LINE-owned channel/generation lifecycle persistence, additive migration, atomic local-unlink composition seam, immutable attempt/history tracking, authorized recovery release/audit and transaction-compatible Relink evaluation are implemented. **Existing Account routes retain legacy local-only unlink and same-owner Relink; no pending restriction, provider dispatch or Recovery endpoint is activated.** Ordinary DEMI login/data and existing menu cleanup remain independent.

[17J.3B contract](./phases/PHASE_17J3B_MINI_APP_WORKFLOW_TECHNICAL_CONTRACT.md) remains **TECHNICAL CONTRACT COMPLETE / REVIEWED / CLEARED FOR IMPLEMENTATION**. [Owner clarifications](./phases/PHASE_17J3A_LIFF_WORKFLOW_SESSION_DECISION_CLOSEOUT.md) and [ADR-0009](./adr/0009-demi-line-oa-liff-identity-and-messaging.md#full-disconnection-amendment--2026-10-08) preserve **Unlink = Full LINE Integration Disconnection** and **Option 2 — Bounded Recovery Policy with Accepted Availability Risk**. **RECOVERY_RELEASED_UNVERIFIED** never means provider-confirmed removal; old ambiguous attempts remain auditable and cannot mutate newer local authority. Late provider removal remains accepted reconnection disruption only, without weakening Patient/authentication boundaries. Actual provider/inventory/live-session recovery orchestration must precede activation; users are not stranded behind unfinished recovery.

**B17J3-01/02 closed at design level; B17J3-03 VERIFIED / CLOSED** for the previously measured Demi-dev/Auth v2.197.0 configuration, without rerun. Dedicated **/line/workflow/appointments**, ordinary **/app/personal/appointments** independence, exact-session encrypted context, absolute min(15 minutes, proof expiry), SELF/domain/Family/J2/Rich Menu decisions remain unchanged. The scoped workflow, MINI verifier/gateway, complete Full Disconnection/Recovery UI, real LINE API/device UAT and production deployment are **NOT IMPLEMENTED / NOT EXECUTED** by 17J.3C.

Foundation evidence: focused unit/regression **25 files / 196 tests PASS**; new PostgreSQL lifecycle **30 tests PASS**, existing Account **26 tests PASS**; 41-migration populated compatibility, schema/client validation, typecheck/lint and documentation/diff checks PASS. 17J.3A remains **CLOSED / OWNER DECISION COMPLETE**, 17J.2 **CLOSED / IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE**, 17J.4 **NOT STARTED**, P17D-NOTIF-01 **OPEN**. Recommended next slice: **17J.3D — Account Full Disconnection orchestration, channel inventory/provider adapter, live exact-session Recovery and user-facing activation**, only on separate instruction. Historical status below is retained as phase-time evidence.

## Historical-status addendum — Phase 17J.3A owner decision closeout (2026-10-08)

[Phase 17J.3A owner closeout](./phases/PHASE_17J3A_LIFF_WORKFLOW_SESSION_DECISION_CLOSEOUT.md) records **CLOSED / OWNER DECISION COMPLETE**; the [decision pack](./phases/PHASE_17J3A_LIFF_WORKFLOW_SESSION_DECISION_PACK.md) retains historical alternatives and evidence. Q07=C: a new LINE MINI App channel under the existing DEMI Provider; the existing Account LIFF, LINE Login channel, /line/account endpoint, and account linking/unlinking behavior remain unchanged. First workflow is Patient Appointment list/detail, entered at /app/personal/appointments through the finite OPEN_PATIENT_APPOINTMENTS intent and root-only navigation; reuse the existing authorized Appointment UI and actions.

Existing DEMI credential authentication and session remain required. LINE identity/binding does not create a DEMI or Supabase session. A LINE binding/session mismatch fails closed with no Patient data. Current ACTIVE binding, matching DEMI session User, canonical ActorContext, and current PATIENT SELF/domain authority must remain enforced over the full LINE-scoped workflow lifecycle; the server-verifiable scoped mechanism, gateway, and login-return mechanics are deferred to 17J.3B. Ordinary DEMI web access remains independent of LINE.

Phase 17J.2 is **CLOSED / IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE**; Phase 17J.3A is **CLOSED / OWNER DECISION COMPLETE**; Phase 17J.3B is **NOT STARTED / TECHNICAL CONTRACT REQUIRED**; Phase 17J.3 runtime is **NOT IMPLEMENTED**; Phase 17J.4 is **NOT STARTED**. **P17D-NOTIF-01 remains OPEN**. Family gates remain unchanged: P17F-L04 OPEN, P17F-L05 OPEN / FUTURE, Q5 real-data governance BLOCKED, and Phase 17E.2 consent parked. This closeout makes no runtime, provider, schema, migration, environment, Rich Menu, asset, provisioning, or UAT change. Earlier dated addenda below retain their phase-time history. Next: **Draft Phase 17J.3B MINI App Workflow Technical Contract.**

## Historical-status addendum — Phase 17J.2 deterministic reactive messaging implementation (2026-10-07)

[17J.2A owner closeout](./phases/PHASE_17J2A_REACTIVE_MESSAGING_DECISION_CLOSEOUT.md) is **Phase 17J.2A — CLOSED / OWNER DECISION COMPLETE**. [17J.2B technical contract](./phases/PHASE_17J2B_DETERMINISTIC_REACTIVE_MESSAGING_TECHNICAL_CONTRACT.md) is **Phase 17J.2B — TECHNICAL CONTRACT COMPLETE / REVIEWED**; [the implementation handoff](./phases/PHASE_17J2_DETERMINISTIC_REACTIVE_MESSAGING_IMPLEMENTATION.md) records **Phase 17J.2 runtime — IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE**. The only reactive command is exact deterministic `PATIENT_NEXT_APPOINTMENT` from the Patient Rich Menu, with current ACTIVE LINE binding, auth-owned ActorContext, persisted PATIENT SELF authority, and one narrow nearest-future canonical SCHEDULED appointment read across the patient’s own relationships. Its receipt is transport deduplication only: `ACCEPTED` does not imply authorization, appointment presence, Reply attempt/provider acceptance, or visible delivery. Work is transient after `after()`; the callback uses one short RepeatableRead transaction and one local 45-second execution-age guard, then makes one Reply attempt after transaction close. Successful copy discloses only Thai date/time and Hospital display name. No text command, Push fallback, retry queue, conversation state, Family access, LIFF expansion, reminder, or notification preference/consent behavior was added. Static postbacks carry intent only; current DEMI authority is re-resolved for each execution and matching redelivery may perform a fresh read. The accepted residual race remains between transaction close and external Reply; exact receipt retention/purge remains an unresolved production-readiness gate. External LINE provider provisioning, real account/device UAT, and production deployment were not executed; P17D-NOTIF-01 remains unchanged and Phase 17J.3 has not started. Next: **Review Phase 17J.2 runtime implementation and automated verification**.

## Historical-status addendum — Phase 17J.1 runtime (2026-10-06)

Phase 17J.0 is **CLOSED / ARCHITECTURE CONTRACT COMPLETE**. Phase 17J.0B is **CLOSED / OWNER DECISION CLOSED**; multi-role Rich Menu is **CLOSED / OWNER APPROVED — OPTION C**. One operational role opens its role menu directly; multiple roles first see a neutral chooser, then switch with LINE-native aliases. Only currently eligible operational roles appear. Selection is presentation preference only; current DEMI server authorization remains authoritative.

Phase 17J.1 technical contract is **COMPLETE** and runtime is **IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE**. See [owner closeout](./phases/PHASE_17J0B_MULTI_ROLE_RICH_MENU_DECISION_CLOSEOUT.md), [implementation contract](./phases/PHASE_17J1_LINE_ACCOUNT_LINK_RICH_MENU_IMPLEMENTATION_CONTRACT.md), and [implementation handoff](./phases/PHASE_17J1_LINE_ACCOUNT_LINK_RICH_MENU_IMPLEMENTATION.md). The additive schema/migration, authenticated LIFF link/unlink foundation, server-only LINE adapters, signed webhook, reachability, Option C preference, 18 shared Rich Menu assets, reconciliation, and bounded operator repair are implemented. PostgreSQL uniqueness applies only to ACTIVE LINE bindings; cross-user rebind fails closed while retained evidence conflicts. Unlink is authoritative at local commit; raw LINE subject remains only as an unresolved provider cleanup locator and clears after confirmed read-back. Exact identity-history retention/erasure and future cross-account reconciliation remain OPEN, without permanent subject ownership, and do not block fail-closed v1.

External DEMI LINE provider/channel setup, real provisioning, real LINE account/mobile UAT, and production deployment are **NOT CLAIMED / NOT EXECUTED**. P17D-NOTIF-01 and other notification semantics remain independently gated; 17J.1 does not implement reminders or Push delivery.

## Historical-status addendum — Phase 17J.0 LINE / LIFF contract at initial closeout (2026-10-06)

[Phase 17J.0 contract](./phases/PHASE_17J0_LINE_OA_LIFF_ARCHITECTURE_IDENTITY_CONTRACT.md) and [ADR-0009](./adr/0009-demi-line-oa-liff-identity-and-messaging.md) are **CLOSED / ACCEPTED** for the architecture and identity boundary. Owner-approved direction is a dedicated DEMI LINE OA/Provider, Messaging API + LIFF under the same Provider, server-verified LIFF identity bound to an existing authenticated DEMI User, current DEMI authorization, role-aware menus for single operational roles, chat for bounded actions, LIFF for complex/sensitive workflows, and LINE Messaging API as the sole proactive notification channel. Multi-role Rich Menu UX remains OPEN / OWNER DECISION REQUIRED. **17J.1 may begin only as a bounded identity + single-role menu tranche; full 17J.1 completion for multi-role users is blocked.** No runtime implementation is included.

P17D-NOTIF-01 remains open for appointment event/timing/recipient/cancellation/stale/content/preferences/consent/retry semantics; Medication delivery timing and any Follow-up reminder source remain separately gated. P17F-L04/L05, Q5, Phase 17E.2 consent, MED-02, adherence, manual browser/device UAT and production deployment remain unchanged.

## Historical-status addendum — Phase 17I.4A security review correction (2026-10-06)

[Phase 17I.4A re-audit and correction evidence](./phases/PHASE_17I4A_HOSPITAL_KNOWLEDGE_CONTACT_REAUDIT_UAT_READINESS.md): post-audit review found and corrected a MAJOR Contact read authorization TOCTOU. Corrected-runtime focused service/UI tests, deterministic Contact and cross-slice PostgreSQL regressions, typecheck, and targeted ESLint passed. Final `npm test` passed **243 files / 2,090 tests**; the safe full PostgreSQL harness applied all **38 migrations** and passed **35 files / 558 tests**, then removed its disposable container/network. No unresolved BLOCKER/MAJOR finding remains in the bounded automated re-audit.

Phase 17I.0 — **CLOSED / OWNER DECISIONS CLOSED**; Phase 17I.0B — **CLOSED / DOCUMENTATION CONTRACT COMPLETE**; Q84–Q111 — **CLOSED / OWNER APPROVED**; CONTENT-02 — **IMPLEMENTED / AUTOMATED RE-AUDIT PASS**; Phase 17I.1 — **IMPLEMENTED / CLOSED**; CONTENT-01 — **IMPLEMENTED / AUTOMATED RE-AUDIT PASS**; Phase 17I.2 — **IMPLEMENTED / CLOSED**; Phase 17I.3 — **IMPLEMENTED / CLOSED**; Phase 17I.4A — **PASS / AUTOMATED RE-AUDIT COMPLETE**; Phase 17I — **IMPLEMENTED / AUTOMATED RE-AUDIT COMPLETE**. No owner decision is reopened and Phase 17J has not started.

Manual browser/mobile/device/BFCache UAT — **NOT EXECUTED / TRACK SEPARATELY**. Production deployment — **NOT EXECUTED**. Phase 17H.4A, 17G.4A, Family P17F-L04/L05, Q5, parked 17E.2 consent, MED-02, and 17J gates remain unchanged.

## Historical-status addendum — Phase 17I.3 Patient Content Consumption implementation (2026-10-05)

[Patient Content Consumption implementation handoff](./phases/PHASE_17I3_PATIENT_CONTENT_CONSUMPTION_IMPLEMENTATION.md): **CONTENT-01 — IMPLEMENTED; Phase 17I.3 — IMPLEMENTED / CLOSED.** Delivered request-time Personal feed/detail, exact persisted Patient SELF authorization inside every Content SELECT, own multi-Hospital union, category-only filter, signed live-view keyset cursor, minimal current-content projections and private history/BFCache safeguards. No schema/migration or Patient write/read audit; Publisher and Contact runtime unchanged.

Automated evidence: focused unit/UI/navigation/Publisher regressions **11 files / 106 tests PASS**, final isolated UI **8 tests PASS**, real PostgreSQL Patient **47 tests PASS** and Publisher **18 tests PASS**, typecheck and targeted ESLint PASS, one stable Next.js build PASS. Full evidence and the unavailable architecture:check script are recorded in the handoff. Prior contract-clearance blocks below are historical evidence.

**Phase 17I.0 — CLOSED / OWNER DECISIONS CLOSED; Phase 17I.0B — CLOSED / DOCUMENTATION CONTRACT COMPLETE; Q84–Q111 — CLOSED / OWNER APPROVED; CONTENT-02 — IMPLEMENTED; Phase 17I.1 — IMPLEMENTED / CLOSED; CONTENT-01 — IMPLEMENTED; Phase 17I.2 — IMPLEMENTED / CLOSED; Phase 17I.3 — IMPLEMENTED / CLOSED; Phase 17I.4A — PLANNED / NOT STARTED. Whole Phase 17I — NOT COMPLETE.**

Manual browser/mobile/device/BFCache UAT — **NOT EXECUTED**. Production migration/deployment — **NOT EXECUTED**. 17I.4A is the next integrated re-audit/UAT-readiness phase and was not started. Phase 17H.4A automated PASS/separate manual UAT, 17G.4A, Family P17F-L04/L05, Q5, parked 17E.2 consent, MED-02 and 17J gates remain unchanged.

## Historical-status addendum — Phase 17I.3 Patient Content Consumption contract (2026-10-05)

[Patient Content Consumption implementation contract](./phases/PHASE_17I3_PATIENT_CONTENT_CONSUMPTION_IMPLEMENTATION_CONTRACT.md): **CONTENT-01 — IMPLEMENTED PUBLISHER / 17I.3 CLEARED FOR PATIENT CONSUMPTION IMPLEMENTATION; Phase 17I.2 — IMPLEMENTED / CLOSED; Phase 17I.3 — CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED.** The 17I.2 HospitalContent persistence, indexes, and Publisher runtime remain implemented. The 17I.3 contract closes the Patient read-only routes, current persisted SELF authorization, multi-Hospital union, projections, category filter, signed cursor, request/cache/BFCache behavior, and verification/UAT boundary. No Patient query service, cursor, route, navigation item, or runtime has been implemented.

17I.2 automated evidence remains recorded in the [Publisher implementation handoff](./phases/PHASE_17I2_HOSPITAL_CONTENT_PUBLISHING_IMPLEMENTATION.md). This 17I.3 task is documentation-only: no tests, Prisma commands, build, or dev server were run. Markdown/UTF-8/diff validation is recorded in the contract. Browser interaction/manual mobile-device UAT is **NOT EXECUTED**; no production migration/deployment or customer acceptance is claimed.

**Phase 17I.0 — CLOSED / OWNER DECISIONS CLOSED; Phase 17I.0B — CLOSED / DOCUMENTATION CONTRACT COMPLETE; Q84–Q111 — CLOSED / OWNER APPROVED; CONTENT-02 — IMPLEMENTED; Phase 17I.1 — IMPLEMENTED / CLOSED; Phase 17I.2 — IMPLEMENTED / CLOSED; Phase 17I.3 — CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED; Phase 17I.4A — PLANNED / NOT STARTED.** Whole Phase 17I is **NOT COMPLETE**. Owner decisions are unchanged.

Phase 17H.4A automated PASS/separate manual UAT, 17G.4A, Family P17F-L04/L05, Q5 governance gate, parked 17E.2 consent, MED-02 and 17J notification delivery/system authority remain unchanged.

## Historical-status addendum — Phase 17I.2 Hospital Content implementation (2026-10-05)

[Hospital Content Publishing implementation](./phases/PHASE_17I2_HOSPITAL_CONTENT_PUBLISHING_IMPLEMENTATION.md): **CONTENT-01 — IMPLEMENTED. Phase 17I.2 — IMPLEMENTED / CLOSED. Phase 17I.3 — PLANNED / TECHNICAL CONTRACT PENDING / NOT IMPLEMENTED.** Dedicated HospitalContent persistence, additive migration, exact direct ACTIVE OWNER publisher, strict normalized plain text, nonce-based CREATE/REPLAY, versioned lifecycle and real publication event timestamps are implemented. No Patient consumption, Patient navigation, or whole Phase 17I completion is claimed.

Automated evidence: full unit baseline **234 files / 2,003 tests PASS**; final focused domain/schema/cursor/UI/login/recovery tests **6 files / 50 tests PASS**; real PostgreSQL integration **1 file / 16 tests PASS** after the final REPLAY row lock. Clean disposable PostgreSQL applied all **38 migrations**; populated migration preserved 78 seeded Hospitals and a real HospitalContact with no Content backfill; Prisma generate/validate and typecheck PASS; full lint and final targeted ESLint PASS. Browser interaction/manual mobile-device UAT is **NOT EXECUTED**; no production migration/deployment or customer acceptance is claimed.

**Phase 17I.0 — CLOSED / OWNER DECISIONS CLOSED; Phase 17I.0B — CLOSED / DOCUMENTATION CONTRACT COMPLETE; Q84–Q111 — CLOSED / OWNER APPROVED; CONTENT-02 — IMPLEMENTED; Phase 17I.1 — IMPLEMENTED / CLOSED.** Owner decisions are unchanged; whole Phase 17I is not complete.

Phase 17H.4A automated PASS/separate manual UAT, 17G.4A, Family P17F-L04/L05, Q5 governance gate, parked 17E.2 consent, MED-02 and 17J notification delivery/system authority remain unchanged.

## Historical-status addendum — Phase 17I.2 publishing technical contract (2026-10-05)

The following records the earlier contract-clearance status and is superseded for current implementation status by the implementation handoff above. The binding contract itself remains authoritative for semantics.

## Historical-status addendum — Phase 17I.1 Hospital Contact implementation (2026-10-05)

[Implementation handoff](./phases/PHASE_17I1_HOSPITAL_CONTACT_IMPLEMENTATION.md): **Phase 17I.0 — CLOSED / OWNER DECISIONS CLOSED; Phase 17I.0B — CLOSED / DOCUMENTATION CONTRACT COMPLETE; Q84–Q111 — CLOSED / OWNER APPROVED; CONTENT-02 — IMPLEMENTED; Phase 17I.1 — IMPLEMENTED / CLOSED.** HospitalContact runtime, exact direct Owner editing, Patient SELF relationship contact projection, guarded ReadCommitted mutation/audit, Owner Work route and bounded Personal Home card are implemented under the binding contract.

**CONTENT-01 — OWNER DECISIONS CLOSED / 17I.2 TECHNICAL CONTRACT PENDING / NOT IMPLEMENTED. Phase 17I.2 — PLANNED / TECHNICAL CONTRACT PENDING / NOT IMPLEMENTED. Phase 17I.3 — PLANNED / NOT IMPLEMENTED.** Do not infer 17I.2, 17I.3, or whole Phase 17I completion from 17I.1. Automated verification is recorded in the handoff. Manual browser/mobile/device UAT is **NOT EXECUTED**; no production migration/deployment or customer acceptance is claimed. The 2026-10-04 17I.1 clearance-only addendum below remains phase-time evidence and is superseded for current implementation status.

Phase 17H.4A automated PASS and separate manual UAT tracking, 17G.4A, Family P17F-L04/L05, Q5 governance gate, parked 17E.2 consent, MED-02, and 17J delivery/system authority remain unchanged.

## Historical-status addendum — Phase 17I.0B closeout / 17I.1 Contact contract (2026-10-04)

[Owner decision closeout](./phases/PHASE_17I0B_HOSPITAL_KNOWLEDGE_CONTACT_DECISION_CLOSEOUT.md): **Phase 17I.0 — CLOSED / OWNER DECISIONS CLOSED; Q84–Q111 — CLOSED / OWNER APPROVED; Phase 17I.0B — CLOSED / DOCUMENTATION CONTRACT COMPLETE.** เจ้าของผลิตภัณฑ์อนุมัติชุดคำแนะนำเดิมทุกข้อและทุกแกน WITHOUT CHANGES; เอกสาร decision pack เดิมคงเป็นหลักฐานประวัติ ไม่ใช่สถานะปัจจุบัน

[Hospital Contact technical contract](./phases/PHASE_17I1_HOSPITAL_CONTACT_IMPLEMENTATION_CONTRACT.md): **CONTENT-02 — OWNER DECISIONS CLOSED; 17I.1 CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED. Phase 17I.1 — CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED.** Contact เป็น operational extension แยกจาก Hospital Master identity; 0..1 HospitalContact ต่อ Hospital; optional addressText/phoneNumber เท่านั้น; exact direct ACTIVE OWNER edit และ exact own Patient relationship read ต่อ ACTIVE Hospital; ไม่มี parent fallback/ADMIN routine edit; guarded desired-state update + atomic minimized audit

**CONTENT-01 — OWNER DECISIONS CLOSED; 17I.2 TECHNICAL CONTRACT PENDING / NOT IMPLEMENTED. Phase 17I.2 — PLANNED / TECHNICAL CONTRACT PENDING / NOT IMPLEMENTED. Phase 17I.3 — PLANNED / NOT IMPLEMENTED.** ลำดับที่อนุมัติคือ Contact → Content Publishing → Patient Content Consumption; clearance นี้ครอบคลุมเฉพาะ 17I.1 ไม่ได้ clear content runtime ทั้ง Phase 17I

Documentation/contract only; ไม่มี runtime/application source/Prisma schema/migration/config เปลี่ยน งาน contract นี้ไม่จำเป็นต้องรัน runtime/unit/PostgreSQL suites และไม่ได้รัน ไม่มี manual browser/mobile/device UAT หรือ production deployment. **Phase 17H.4A remains PASS / AUTOMATED RE-AUDIT COMPLETE**; separate manual 17H UAT, 17G.4A, Family P17F-L04/L05, Q5 governance gate, parked 17E.2 consent, MED-02 และ 17J delivery/system authority ไม่เปลี่ยน

## Historical-status addendum — Phase 17I.0 decision-pack authoring (2026-10-04)

Historical pre-approval analysis only; superseded by the current 17I.0B closeout and 17I.1 contract above. OPEN/recommendation/requirement-gated statements in this block do not describe current status.

[Phase 17I.0 decision pack](./phases/PHASE_17I0_HOSPITAL_KNOWLEDGE_CONTACT_DECISION_PACK.md): **DECISION PACK COMPLETE / OWNER DECISIONS OPEN** สำหรับ requirement analysis/documentation เท่านั้น **Q84–Q111 — OPEN / NOT OWNER APPROVED; CONTENT-01 — REQUIREMENT-GATED; CONTENT-02 — REQUIREMENT-GATED; Phase 17I runtime — NOT CLEARED FOR IMPLEMENTATION** รวม 17I.1 ทุก recommendation ยังไม่ใช่ owner decision ไม่มี runtime/schema/migration เปลี่ยน

Current evidence (17I.0 snapshot; superseded — ADR-0017 retired Hospital Master and dropped `parentHospitalId`, and the onboarding projection is now `OnboardingHospitalOption`): Hospital Master ใช้ model `Hospital` และ service projection `HospitalMasterRecord` ไม่ใช่ Prisma model แยก; Hospital scalar inventory มี id/hospitalCode/name/status/parentHospitalId/createdAt/updatedAt ส่วน approved Master workbook/seed ไม่มี contact fields Legacy address/phone เป็น requirement evidence เท่านั้น ไม่ใช่ verified canonical values รายละเอียด source/ownership/audience/fields/publishing/contact disclosure และคำตอบแยกแกนอยู่ใน pack

**Phase 17H.4A remains PASS / AUTOMATED RE-AUDIT COMPLETE** สำหรับ approved bounded automated scope; manual browser/mobile/device/BFCache UAT คง separate tracking stream และไม่ block 17I.0 Historical statuses/approved decisions และ 17G.4A, Family P17F-L04/L05, Q5, parked 17E.2 consent, MED-02, 17J ไม่เปลี่ยน ข้อเสนอ contact → publishing → Patient content consumption ยัง NOT OWNER APPROVED; ต้อง close owner decisions และ technical contract ก่อน implementation

## CURRENT-status addendum — Phase 17H.4A Wellness automated re-audit (2026-10-04)

[Phase 17H.4A Wellness re-audit](./phases/PHASE_17H4A_WELLNESS_REAUDIT_UAT_READINESS.md): **PASS / AUTOMATED RE-AUDIT COMPLETE.** WELL-01 and WELL-02 remain IMPLEMENTED; WELL-03 remains IMPLEMENTED / TARGET-ONLY. The approved bounded automated scope is complete and ready for separate manual UAT tracking. Manual browser/mobile/device/BFCache UAT is **NOT EXECUTED**. Personal Weight Observation remains **DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE**. No production certification, deployment, or customer acceptance is claimed.

Automated evidence: focused Wellness unit/UI/domain/transport/page/privacy/cursor 21 files / 244 tests PASS; a direct 12-case lifecycle matrix covers delayed reads and mutation responses for all six ordered sibling-denial directions; full unit 216 files / 1,801 tests PASS before those follow-up test-only cases; targeted PostgreSQL Meal/Exercise/Weight 3 files / 81 tests PASS; full PostgreSQL integration 31 files / 447 tests PASS after all 36 migrations on an empty local disposable database; timezone suites pass under UTC, Asia/Bangkok, and America/Los_Angeles. Prisma generate/validate and full typecheck/lint passed in the initial audit; after the lifecycle matrix, typecheck and targeted ESLint also passed. The full unit suite was not repeated for this isolated test-only addition. No runtime/schema/migration correction was required.

17G.4A, Family P17F-L04/L05, Q5 governance, parked 17E.2 consent, MED-02, and 17J delivery/system authority remain unchanged.

## Historical-status addendum — Phase 17H.3 implementation (2026-10-04)

[Weight Goal implementation handoff](./phases/PHASE_17H3_WEIGHT_GOAL_IMPLEMENTATION.md): **Phase 17H.3 — IMPLEMENTED / CLOSED; WELL-03 — IMPLEMENTED / TARGET-ONLY.** Target-only Patient SELF capability is implemented at /app/personal/wellness; Personal Weight Observation remains DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE.

**Verification:** Full unit 214 files / 1,794 tests PASS; full PostgreSQL integration 31 files / 445 tests PASS after recreating the local disposable database and applying all 36 migrations; Prisma generate/validate, typecheck, lint, and Impeccable detector PASS. Manual browser/mobile/device/BFCache UAT and production deployment were not performed.

**17H.1 IMPLEMENTED / CLOSED; WELL-01 IMPLEMENTED. 17H.2 IMPLEMENTED / CLOSED; WELL-02 IMPLEMENTED.** Q69–Q74 remain preserved: one personal kg target, optional civil date, no target history, no current-weight source/progress, and no Personal Weight Observation. 17H.4A automated re-audit/UAT readiness remains next. 17G.4A, Family P17F-L04/L05, Q5 governance, parked 17E.2 consent, MED-02, and 17J remain unchanged.

## Historical-status addendum — Phase 17H.3 contract clearance (2026-10-04)

[Weight Goal technical contract](./phases/PHASE_17H3_WEIGHT_GOAL_IMPLEMENTATION_CONTRACT.md): **Phase 17H.3 - CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED; WELL-03 - CLEARED FOR IMPLEMENTATION / TARGET-ONLY.** Patient-selected kg target only; 0..1 unique PatientProfile owner; canonical decimal string, scale 3, 0.001..1,000,000 structural bounds, Decimal/NUMERIC(10,3). Corrected Q71 permits unchanged naturally passed targetDate during weight edits; create/changed date >= Bangkok today, explicit clear allowed, no date lifecycle. Dedicated payload-free terminal create receipt consumes both created and occupied-goal rejected intents; intendedWeightGoalId survives removal, and ReadCommitted owner-row FOR UPDATE serialization prevents loser-receipt rollback races. Definitive create rejection requires receipt commit; aborted/ambiguous transactions stay UNCONFIRMED. expectedUpdatedAt and minimized atomic mutation audit (none for rejected create); exact persisted ACTIVE Patient SELF. Future Weight joins the existing shared Wellness private-authority generation and three anchored sections at `/app/personal/wellness`. No Weight runtime delivered.

**17H.1 IMPLEMENTED / CLOSED; WELL-01 IMPLEMENTED. 17H.2 IMPLEMENTED / CLOSED; WELL-02 IMPLEMENTED. Personal Weight Observation DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE.** Q69-Q74 and all approved exclusions preserved; no current-weight source/progress/BMI/advice/history. 17H.4A re-audit/UAT readiness remains future. 17G.4A, Family P17F-L04/L05, Q5 governance, parked 17E.2 consent, MED-02 and 17J remain unchanged. Earlier dated planned/precision-pending statements are historical and superseded by this contract; prior runtime/test evidence is not rerun or extended here.

## Historical-status addendum — Phase 17H.2 (2026-10-04)

**Phase 17H.2 — IMPLEMENTED / CLOSED; WELL-02 — IMPLEMENTED.** See [Exercise implementation handoff](./phases/PHASE_17H2_EXERCISE_JOURNAL_IMPLEMENTATION.md) for runtime, migration, and automated evidence. Exercise is a dedicated Patient-reported actually performed session with required free-text activity/date; optional duration 1..1,000,000 minutes (DEMI structural bound only) and optional note; Asia/Bangkok civil date past/today; exact persisted ACTIVE Patient SELF. Owner-bound payload-free receipt prevents retry duplicates and survives physical deletion; stale writes use expectedUpdatedAt; success audit is minimized and atomic; private history uses Exercise-bound signed cursor. Meal + Exercise occupy the existing `/app/personal/wellness` route as independent sections. No Goal Plan/care linkage or future measurements were added.

**Evidence:** full unit **208 files / 1,725 tests PASS**; full PostgreSQL integration **30 files / 421 tests PASS**, including real Exercise create/replay/delete, authorization, idempotency, edit/delete races, audit rollback and history/cursor. Focused Meal + Exercise/UI regression **13 files / 171 tests PASS**; Exercise+Meal PostgreSQL focused **2 files / 55 tests PASS**. Prisma client generation, schema validation, existing disposable DB migration, a new empty disposable database through all **35 migrations**, typecheck, lint and UI detector PASS. No production migration/deployment. After the final duration-string parser refinement, focused schema/action tests passed (2 files / 79 tests) and Exercise PostgreSQL integration passed (28 tests); broad suites were not repeated for this isolated boundary change. Manual browser/mobile/device/BFCache UAT is **NOT EXECUTED**.

**Phase 17H.1 IMPLEMENTED / CLOSED; WELL-01 IMPLEMENTED** remains intact. **17H.3 PLANNED / NOT IMPLEMENTED; WELL-03 OWNER DECISIONS CLOSED / TARGET-ONLY**; its separate technical contract is required before runtime. **Personal Weight Observation DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE.** 17H.4A Wellness re-audit/UAT readiness remains future. 17G.4A PASS, Family P17F-L04/L05, Q5 governance gate, parked 17E.2 consent, MED-02 and 17J statuses remain unchanged. Earlier clearance-only Phase17H.2 addenda are historical.

## Historical-status addendum — Phase 17H.1 (2026-10-03)

[Meal implementation handoff](./phases/PHASE_17H1_MEAL_JOURNAL_IMPLEMENTATION.md): **Phase 17H.1 IMPLEMENTED / CLOSED; WELL-01 IMPLEMENTED**. Exact persisted ACTIVE Patient SELF only; category/date required, description OPTIONAL, four categories, duplicate date/category allowed, Bangkok civil date past/today allowed and future denied. Dedicated Meal + payload-free surviving owner/nonce receipt, physical delete, expectedUpdatedAt concurrency, transactional minimized audit and private paginated current history. No clinical/Goal Plan/reporting/reminder authority.

Automated evidence: focused unit/UI/action/navigation **7 files / 67 tests**, real PostgreSQL Meal **26 tests**, full unit **202 files / 1,621 tests**, full PostgreSQL integration **29 files / 392 tests** PASS; lint/typecheck PASS. Forward migration `20261003140000_personal_meal_journal` applied only to local disposable integration DB; clean separate empty DB passed all **34 migrations**. No production deployment/migration or manual browser/mobile/device/BFCache UAT claimed. Operational backup/account-erasure/receipt/audit-retention/privacy follow-ups remain.

17H.0 CLOSED / DECISIONS CLOSED; Q54–Q83 CLOSED / OWNER APPROVED — Option A; 17H.0B CLOSED / DOCUMENTATION CONTRACT COMPLETE. **WELL-02 DECISIONS CLOSED / PLANNED 17H.2 / NOT IMPLEMENTED** (duration OPTIONAL); **WELL-03 DECISIONS CLOSED / TARGET-ONLY PLANNED 17H.3 / NOT IMPLEMENTED**; corrected Q71 unchanged naturally passed targetDate may remain on edit. **Personal Weight Observation DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE**. No Exercise/Weight runtime, nutrition/photos/BMI/scoring/advice/share/export/reporting/reminders or generic Wellness framework. Next approved sequence remains 17H.2 → 17H.3 → 17H.4A re-audit/UAT readiness.

**17G.4A PASS / AUTOMATED RE-AUDIT COMPLETE** unchanged; Family P17F-L04 OPEN/device UAT pending, P17F-L05 OPEN/FUTURE, Q5 real-data delegated use GOVERNANCE BLOCKED, parked 17E.2 consent, MED-02 REQUIREMENT-GATED and 17J delivery/system authority REQUIREMENT-GATED unchanged. Prior addenda retain historical phase-time evidence.

## Historical-status addendum — Phase 17H.0B (2026-10-03)

[Wellness owner closeout](./phases/PHASE_17H0B_WELLNESS_DECISION_CLOSEOUT.md): **Phase 17H.0 CLOSED / DECISIONS CLOSED; Q54–Q83 CLOSED / OWNER APPROVED — Option A; Phase 17H.0B CLOSED / DOCUMENTATION CONTRACT COMPLETE.** Owner อนุมัติ recommendation A ทั้งหมดใน corrected pack โดยไม่มีการแก้ไข หลังแก้ Q71 targetDate semantics; ไม่อนุมัติตัวเลือกอื่นหรือการ implement สิ่งที่ deferred/excluded.

[Meal Journal implementation contract](./phases/PHASE_17H1_MEAL_JOURNAL_IMPLEMENTATION_CONTRACT.md): **WELL-01 CLEARED FOR IMPLEMENTATION; Phase 17H.1 CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED.** category/civil occurrence date เป็น required; plain-text description OPTIONAL ≤1,000; Patient เลือกจาก 4 หมวด บันทึกหลายครั้งในวัน/หมวดเดียวกันได้; ย้อนหลัง/วันนี้ได้ ไม่อนาคต; exact persisted ACTIVE Patient SELF เท่านั้น ใช้ dedicated Meal record, physical delete, minimized atomic audit, owner-bound opaque create nonce/receipt และ expectedUpdatedAt กัน stale write; ไม่เพิ่ม Goal Plan/clinical/reporting authority.

**WELL-02 OWNER DECISIONS CLOSED / PLANNED 17H.2 / NOT IMPLEMENTED** (duration OPTIONAL). **WELL-03 OWNER DECISIONS CLOSED / TARGET-ONLY PLANNED 17H.3 / NOT IMPLEMENTED**; corrected Q71 allows retaining an unchanged naturally passed targetDate on edit, create/new date >= Bangkok today; no automatic date-driven state/progress. **Personal Weight Observation DEFERRED / NOT APPROVED FOR FIRST 17H SCOPE** and requires separate explicit contract. Approved sequence: 17H.0 analysis COMPLETE / decisions CLOSED → 17H.0B CLOSED → 17H.1 Meal → 17H.2 Exercise → 17H.3 target-only Weight Goal → 17H.4A automated re-audit/UAT readiness. Exercise/Weight technical implementation contracts still required before those runtimes.

Photos/storage, richer food/exercise measurements, nutrition/macros/calories, BMI/scoring/advice, sharing/export/API, reporting/analytics and Wellness reminders/delivery remain deferred or excluded. Backup retention/restore/account-erasure/audit-retention are operational/privacy follow-ups, not invented legal durations or automatic synthetic/demo blockers. ไม่มี Wellness runtime หรือผล manual/mobile/browser/device UAT PASS จากงานนี้; เปลี่ยนเฉพาะเอกสาร ไม่มี runtime/schema/migration/test/env/config เปลี่ยน.

**17G.4A remains PASS / AUTOMATED RE-AUDIT COMPLETE**; 17G.0 CLOSED, Q30–Q53 OWNER APPROVED, 17G.1/17G.2 IMPLEMENTED / CLOSED, 17G.3C IMPLEMENTED / CLOSED only for occurrence source; adherence DEFERRED. Family P17F-L04 OPEN/device UAT pending, P17F-L05 OPEN/FUTURE, Q5 real-data delegated use GOVERNANCE BLOCKED, parked 17E.2 consent, MED-02 REQUIREMENT-GATED and 17J delivery/system authority REQUIREMENT-GATED unchanged. Prior phase evidence below remains historical; latest CURRENT status is this addendum.

## Current-status addendum — Phase 17G.4A (2026-10-03)

**Phase 17G.4A — PASS / AUTOMATED RE-AUDIT COMPLETE** for bounded MED-01. Current full unit 196 files / 1,569 tests and PostgreSQL integration 28 files / 366 tests passed; targeted medication unit 13 files / 255 tests and fresh PostgreSQL medication 53/53 passed. Lint/typecheck and process-TZ checks passed. No unresolved MED-01 BLOCKER/MAJOR finding. A test-only query-plan assertion correction and unrelated Family/Work Prisma diff are documented in the [17G.4A report](./phases/PHASE_17G4A_MEDICATION_REAUDIT_UAT_READINESS.md). **MED-01 automated scope is ready for manual/UAT tracking**; browser/device UAT remains unexecuted. 17G.0 CLOSED; Q30–Q53 CLOSED / OWNER APPROVED; 17G.1/17G.2/17G.3C remain IMPLEMENTED / CLOSED within bounded scopes. Adherence remains DEFERRED; 17J delivery/system authority and MED-02 remain REQUIREMENT-GATED.

## Current-status addendum — Phase 17G.3C (2026-10-03)

**Phase 17G.3C — IMPLEMENTED / CLOSED** สำหรับ bounded Reminder Occurrence Source only ตาม [implementation handoff](./phases/PHASE_17G3_REMINDER_OCCURRENCE_SOURCE_IMPLEMENTATION_HANDOFF.md): full unit 196 files / 1,569 tests และ PostgreSQL integration 28 files / 366 tests PASS; targeted/timezone/lint/typecheck ผ่าน. Server-only exact persisted Patient SELF read/pagination/revalidation; derived current ACTIVE schedules, strict future [from,to), deterministic child/date key และ actor-bound HMAC cursor. ไม่มี occurrence persistence/schema/migration/UI/route/audit read/cache. Adherence deferred; 17J DELIVERY และ system authority ยัง requirement-gated; MED-02 gated. ไม่มี browser/device UAT หรือ production/deployment PASS inference. 17G.3B contract ยังเป็น implementation semantics; สถานะเดิมด้านล่างเป็น historical evidence. Next: 17G.4A automated security/DB/privacy re-audit โดยยังไม่เริ่มในงานนี้.

## Historical-status addendum — Phase 17G.3B (2026-10-03)

[Reminder Occurrence Source implementation contract 17G.3B](./phases/PHASE_17G3_REMINDER_OCCURRENCE_SOURCE_IMPLEMENTATION_CONTRACT.md): **CLEARED FOR IMPLEMENTATION / NOT IMPLEMENTED**. 17G.3A DECISIONS CLOSED / OWNER APPROVED; bounded source-only contract พร้อมสำหรับ 17G.3C แต่ **17G.3 runtime NOT IMPLEMENTED**. Reminder Occurrence Source คือ scheduled personal tracking point จาก current ACTIVE schedule กับวันที่ Asia/Bangkok; ไม่ใช่ notification หรือ intake evidence. Exact persisted Patient SELF เท่านั้น; ไม่มี 17J system-processing authority. **Adherence remains deferred and is not part of the cleared runtime slice.** 17G.1/17G.2 IMPLEMENTED / CLOSED; MED-02 REQUIREMENT-GATED; 17G owns SOURCE, 17J owns DELIVERY และยัง future / requirement-gated; P17D-NOTIF-01 OPEN; NOTIF-01 REQUIREMENT-GATED. Next: 17G.3C — Reminder Occurrence Source Implementation; หลัง approved runtime slices จึง 17G.4A re-audit. Earlier addenda below retain their phase-time evidence.

Application of `20261003120000_daily_medication_schedules` was confirmed externally by owner: **Migration application was confirmed externally by the owner; no deployment command output is attributed to this agent.** ไม่แต่ง environment/production PASS หรือ browser/device UAT evidence; P17F-L04/Q5 unchanged. งาน 17G.3B แก้เฉพาะเอกสาร ไม่มี runtime/schema/migration/tests/env changes.

## Historical-status addendum — Phase 17G.3A (2026-10-03)

[Reminder Occurrence / Adherence decision pack 17G.3A](./phases/PHASE_17G3_REMINDER_ADHERENCE_DECISION_PACK.md) จัดทำแล้วในฐานะ analysis/documentation: **CLEARED FOR IMPLEMENTATION — occurrence source only; 17G.3 runtime NOT IMPLEMENTED**. Approved source semantics คือ derived occurrence source จาก scheduleId + Asia/Bangkok local date, current ACTIVE/current committed schedules, no retroactive backfill และ defer adherence; Owner อนุมัติ OD01–OD08 (OD08 exclusion only) และ OD12–OD14 แล้วผ่าน interactive answers; OD09–OD11 defer/out of source slice. Strict future dueAt > evaluationAsOf + [from,to), no elapsed/catch-up lookup หรือ historical occurrence ledger. **Adherence remains deferred and is not part of the cleared runtime slice.** ขั้นตอนถัดไป 17G.3B source-only implementation contract; 17J system authority ยังไม่อนุมัติ. 17G owns SOURCE; 17J owns DELIVERY และยัง future / requirement-gated; P17D-NOTIF-01 OPEN, NOTIF-01 REQUIREMENT-GATED. ไม่เพิ่ม runtime/schema/migration/jobs/UI/adherence/delivery และไม่เปลี่ยน exact SELF authority; MED-02 ยัง REQUIREMENT-GATED.

**17G.1 / 17G.2 IMPLEMENTED / CLOSED**. Owner ยืนยันจากภายนอกหลัง implementation review ว่า migration `20261003120000_daily_medication_schedules` apply สำเร็จแล้ว: **Migration application was confirmed externally by the owner; no deployment command output is attributed to this agent.** ไม่ระบุ environment หรือ production PASS และไม่อ้างว่า agent รัน deployed migration. Browser/device UAT ยังไม่มี PASS evidence; P17F-L04/Q5 ไม่เปลี่ยน. Addendum/hand-off เดิมด้านล่างบันทึกสถานะ ณ งานเดิมและคงไว้เป็นประวัติ.

## Historical-status addendum — Phase 17G.2B (2026-10-03)

**Phase 17G.2 IMPLEMENTED / CLOSED** สำหรับ bounded Daily Medication Schedule: exact Patient SELF, 0..1,440 เวลารายวัน HH:mm ตาม Asia/Bangkok บน ACTIVE medication; replace-all แบบ atomic ใช้ parent.updatedAt ร่วมกับ text edit/stop; เก็บเวลาเดิมเป็นประวัติอ่านอย่างเดียวเมื่อ STOPPED. ดู [implementation handoff และหลักฐานอัตโนมัติ](./phases/PHASE_17G2_DAILY_MEDICATION_SCHEDULE_IMPLEMENTATION_HANDOFF.md): unit 192 files / 1,447 tests, PostgreSQL integration 28 files / 352 tests, migration upgrade/clean history, lint/typecheck/build ผ่าน. ยังไม่ได้ทำ browser/device UAT หรือ production deployment. ไม่มี reminder/adherence/delivery. 17G.1 IMPLEMENTED / CLOSED; MED-02 REQUIREMENT-GATED; 17G.3 NOT IMPLEMENTED; 17J future; P17F-L04 และ Q5 ไม่เปลี่ยน. สถานะสัญญาและ phase เดิมด้านล่างเป็นประวัติ.

## Historical contract-status addendum — Phase 17G.2A (2026-10-03)

[สัญญา Daily Medication Schedule 17G.2A](./phases/PHASE_17G2_DAILY_MEDICATION_SCHEDULE_CONTRACT.md) **CLEARED FOR IMPLEMENTATION**; owner อนุมัติระดับนาที HH:mm และห้ามเวลาซ้ำต่อรายการยาใน session นี้แล้ว. ขอบเขต: exact Patient SELF, 0..N เวลารายวัน Asia/Bangkok บน ACTIVE medication และเก็บเวลาเดิมเป็นประวัติอ่านอย่างเดียวเมื่อ STOPPED. **17G.2 runtime NOT IMPLEMENTED**; งานนี้เฉพาะเอกสาร ไม่มี schema/migration/UI/service/tests ใหม่. 17G.1 IMPLEMENTED / CLOSED; Q30–Q53 ไม่เปลี่ยน; 17G.3/17J/MED-02 และ UAT/governance gates คงเดิม. รายละเอียดทางเทคนิคและ acceptance อยู่ในสัญญา; สถานะย้อนหลังด้านล่างคงไว้.

## Historical foundation-status addendum — Phase 17G.1 (2026-10-02)

**17G.1 IMPLEMENTED / CLOSED** สำหรับ MED-01: รายการยาที่ Patient บันทึกเองใน Personal **ยาของฉัน**; exact SELF เท่านั้น, แก้ไขได้ขณะกำลังติดตาม และหยุดติดตามใน DEMI เป็นสถานะปลายทาง ไม่ใช่การสั่งหรือหยุดใช้ยาทางการแพทย์. ดู [implementation handoff และหลักฐานการตรวจจริง](./phases/PHASE_17G1_PERSONAL_MEDICATION_IMPLEMENTATION_HANDOFF.md). 17G.0 / Q30–Q53 CLOSED / OWNER APPROVED; MED-02 REQUIREMENT-GATED; 17G.2/17G.3 NOT IMPLEMENTED; 17J future; P17F-L04 OPEN / deferred; Q5 GOVERNANCE BLOCKED. ไม่อ้างผล browser/device UAT; สถานะย้อนหลังด้านล่างคงไว้เป็นประวัติ.

## Current-status addendum — Phase 17F.4A (2026-10-02)

[17F.4A re-audit](./phases/PHASE_17F4A_FAMILY_REAUDIT_UAT_READINESS.md) records the complete implemented Family source/security review and PostgreSQL regression evidence; [17F.4B manual device UAT sheet](./phases/PHASE_17F4B_FAMILY_DEVICE_UAT_CHECKLIST.md) contains unexecuted evidence fields. **17F.1 IMPLEMENTED / CLOSED; 17F.2 IMPLEMENTED (synthetic/demo only); 17F.3 IMPLEMENTED; 17F.4A automated/security/PostgreSQL re-audit = PASS. P17F-L04 OPEN — AUTOMATED/INTEGRATION RE-AUDIT COMPLETE; REAL-DEVICE UAT PENDING. P17F-L05 OPEN / FUTURE; Q5 real-data delegated use GOVERNANCE BLOCKED; Phase 17F overall NOT CLOSED.** L01/L02/L03/L06 remain CLOSED / OWNER APPROVED. No real-device/browser evidence or controller/privacy approval is supplied by automated tests. Historical phase sections below remain unchanged.

เอกสารนี้เป็นจุดเริ่มต้นแบบกระชับสำหรับ developer และ AI coding agent ก่อนลงมือเปลี่ยนระบบ อ่านรายละเอียดที่ [Architecture Baseline](./architecture/DEMI_ARCHITECTURE_BASELINE.md) และเหตุผลของแต่ละ decision ที่ [ADR Index](./adr/README.md)

## Project Purpose

DEMI กำลังถูก redesign/rewrite ใหม่เพื่อแยก identity, account, role, membership, authorization และ operational responsibility ออกจากกันอย่างชัดเจน

Legacy DEMI repository ใช้ศึกษา behavior, terminology และ domain knowledge เดิมได้เท่านั้น ไม่ใช่ target architecture และไม่ใช่ source of truth สำหรับ authentication, authorization, role model หรือ data-access pattern ของระบบใหม่

## Current Phase

ขณะนี้ **Phase 10B.0–10D.0 prototype slices implement แล้ว** ต่อจาก **Phase 10A Patient Profile / Baseline / Status Tracking analysis** โดย 10C.0 เพิ่ม dedicated, immutable, relationship-scoped Baseline และ 10D.0 เพิ่ม relationship-level image evidence แบบ append-only สำหรับ requirement validation ทั้งหมดนี้ยังไม่ใช่ customer-approved behavior รายละเอียดอยู่ที่ [Phase 10D.0 handoff](./phases/PHASE_10D0_PATIENT_STATUS_ARTIFACTS_WORKING_PROTOTYPE.md)

**Phase 11A Workforce Lifecycle & Hospital Governance requirements/domain-boundary analysis เสร็จแล้ว** และ **Phase 11B.0 Staff Membership Lifecycle working prototype implement แล้ว** แบบ narrowly scoped MVP สำหรับ validation โดยใช้ direct active Hospital Owner boundary, bounded Staff detail, profession update, membership suspend/restore และ atomic audit ตาม [Phase 11B.0 handoff](./phases/PHASE_11B0_STAFF_MEMBERSHIP_LIFECYCLE_WORKING_PROTOTYPE.md) ส่วน User account recovery, Hospital/Owner governance และ workforce lifecycle อื่น ๆ ยังไม่เริ่มและยังเป็น open requirements ตาม [Phase 11A requirements](./phases/PHASE_11A_WORKFORCE_LIFECYCLE_HOSPITAL_GOVERNANCE_REQUIREMENTS.md)

**Phase 11C OSM Relationship Lifecycle & Patient Assignment Consequence Analysis เสร็จแล้ว** ตาม [Phase 11C analysis](./phases/PHASE_11C_OSM_RELATIONSHIP_LIFECYCLE_ASSIGNMENT_CONSEQUENCES.md) และ **Phase 11D.0 OSM Relationship Suspend / Restore working prototype implement แล้ว** ตาม [Phase 11D.0 handoff](./phases/PHASE_11D0_OSM_RELATIONSHIP_LIFECYCLE_WORKING_PROTOTYPE.md) โดยยังคงเป็น narrowly scoped prototype: exact active Hospital Owner เท่านั้น, ต้องไม่มี current Patient assignment ใน Hospital เดียวกัน, และ restore มี defensive reconciliation guard. Emergency suspension, transfer, deletion, geography, governance, account recovery และ customer requirements อื่น ๆ ยังเป็น open requirements

**Phase 12A Hospital Governance & Account Recovery analysis เสร็จแล้ว** ตาม [Phase 12A analysis](./phases/PHASE_12A_HOSPITAL_GOVERNANCE_ACCOUNT_RECOVERY_REQUIREMENTS.md) และ **Phase 12B.0 Hospital Lifecycle Working Prototype implement แล้ว** ตาม [Phase 12B.0 handoff](./phases/PHASE_12B0_HOSPITAL_LIFECYCLE_WORKING_PROTOTYPE.md) โดยมี bounded Platform Admin Hospital governance directory/detail และการเปลี่ยน `ACTIVE <-> SUSPENDED` แบบ status-only, no-cascade prototype. **Phase 12C Hospital Owner Governance + Account Recovery detailed analysis/contract เสร็จแล้ว** ตาม [Phase 12C contract](./phases/PHASE_12C_OWNER_GOVERNANCE_ACCOUNT_RECOVERY_CONTRACT.md) โดยกำหนด provisional Owner Governance direction สำหรับ Phase 12D.0 และยืนยันว่า active-account recovery ต้อง defer หาก trusted identity/control proof, delivery channel และ session semantics ยังไม่ถูกกำหนดอย่างปลอดภัย. Semantics สุดท้ายของการ suspend/restore และ final customer requirements ยังคงเป็น provisional/open requirements

**Phase 12D.0 Hospital Owner Governance working prototype implement แล้ว** ตาม [Phase 12D.0 handoff](./phases/PHASE_12D0_HOSPITAL_OWNER_GOVERNANCE_WORKING_PROTOTYPE.md) โดยจำกัดการเปลี่ยนแปลงไว้ที่ `HospitalMembership.membershipType` ระหว่าง `MEMBER <-> OWNER` ภายใน exact ACTIVE Hospital, บังคับให้มี eligible Owner อย่างน้อยหนึ่งรายด้วย serializable transaction และ atomic audit. Active-account recovery, final-Owner recovery และ User account governance ยังอยู่นอกขอบเขตและยังเป็น open requirements

**Phase 13A Demo Flow Gap Analysis เสร็จแล้ว** ตาม [Phase 13A analysis](./phases/PHASE_13A_DEMO_FLOW_GAP_ANALYSIS.md) และ **Phase 13B.0 End-to-End Demo Continuity working prototype implement แล้ว** ตาม [Phase 13B.0 handoff](./phases/PHASE_13B0_DEMO_CONTINUITY_WORKING_PROTOTYPE.md) โดยเพิ่ม actor-aware `/app` workspace, Hospital lifecycle visibility, authoritative Patient Detail continuation, selected Hospital context handoff และ Screening → Goals → Follow-up navigation บน service/policy เดิม. ไม่เพิ่ม schema/migration และยังไม่เริ่ม Patient self-service, account recovery หรือ Admin reconciliation `P13-D7`

**Phase 13C Post-Integration Business Flow Re-Audit เสร็จแล้ว** ตาม [Phase 13C audit](./phases/PHASE_13C_POST_INTEGRATION_BUSINESS_FLOW_REAUDIT.md) โดย re-audit golden journeys A–E หลัง Phase 13B.0 และสรุปว่าไม่มี current `DEMO_BLOCKER`; rewrite มี breadth เพียงพอสำหรับ customer requirement workshop ภายใต้ demo dataset/handoff prerequisites ที่ระบุไว้. Recommendation คือ Requirements First เพื่อเก็บ customer decisions ของ recovery, reconciliation, Patient self-service, OSM scope, clinical semantics และ reporting ก่อนเริ่ม implementation slice ใหม่
**Phase 14A Requirement Workshop Preparation เสร็จแล้ว** ตาม [Phase 14A decision pack](./phases/PHASE_14A_REQUIREMENT_WORKSHOP_PREPARATION.md) โดยทำเฉพาะ analysis/documentation และไม่มี product implementation. Current prototype ยังคง demo-ready สำหรับ requirement discovery; ขั้นตอนถัดไปคือจัด customer workshop และบันทึก decisions ก่อน Phase 14B consolidation หรือการวางแผน implementation slice ใหม่
**Phase 14B Demo Productization & UX Polish ปิดแล้วหลัง Phase 14B.1 post-review fixes และ integration sign-off** ตาม [Phase 14B handoff](./phases/PHASE_14B_DEMO_PRODUCTIZATION_UX_POLISH.md) โดยเพิ่ม National ID checksum bypass แบบ opt-in เฉพาะ `development`/`test`, patient activation search ด้วยชื่อและข้อความ ambiguity ตาม lookup type, shared interaction feedback และ wording ภาษาไทยเชิง business พร้อมลบ prototype warning จากหน้าผู้ใช้. งานนี้ไม่เปลี่ยน authorization, business flow หรือ unresolved requirements จาก Phase 14A; ข้อกำหนดที่ยังเปิดอยู่ยังต้องรอ customer workshop เช่นเดิม
**Phase 14B.2 Loading UI System & Route Coverage ปิดแล้ว รวม Phase 14B.2.1 protected layout boundary correction** ตาม [Phase 14B.2 handoff](./phases/PHASE_14B2_LOADING_UI_SYSTEM_ROUTE_COVERAGE.md) โดยกำหนด pattern กลางว่า route/data loading ใช้ structural skeleton + shimmer (พร้อม static reduced-motion fallback), เพิ่ม full-shell Suspense fallback ระหว่าง protected actor/AppShell initialization, ส่วน mutation/action loading คง button spinner + pending label และเพิ่ม desktop sidebar แบบ expanded/collapsed ที่เก็บ UI preference ฝั่ง browser ทั้งหมดนี้ไม่เปลี่ยน navigation authorization, mobile drawer, business หรือ security behavior

**Phase 16A Canonical Patient Import Contract** เพิ่มหลักฐานเชิงปฏิบัติการจาก roster หลายแหล่งว่า DEMI มี common patient-import spreadsheet family ที่กว้างกว่า current minimal four-column importer. Full-field persistence ยังเป็น requirement-gated ตามห้า customer decisions ใน [Phase 16A contract](./phases/PHASE_16A_CANONICAL_PATIENT_IMPORT_CONTRACT.md); หลักฐานใหม่นี้ไม่เปลี่ยน accepted ADR หรือ current authorization boundary.

**Phase 16B.0 Patient Import Adapter V2 Compatibility Foundation** implement แล้วเป็น compatibility parsing/normalization/preview foundation สำหรับ operational `.xlsx` roster family, โดยยังส่งต่อและ persist เฉพาะ Patient core เดิมผ่าน server-side provisioning service. Full-field persistence ยังคง requirement-gated ตาม [Phase 16B.0 handoff](./phases/PHASE_16B0_PATIENT_IMPORT_ADAPTER_V2_COMPATIBILITY_FOUNDATION.md) และห้า customer decisions เดิม.

**Phase 16B.1 Patient Import Requirement Decision Closeout** ยืนยันว่า clinical values ใน roster เป็น initial pre-program patient data ที่ต้องอยู่ใน logical import workflow เดียวกับ Patient provisioning, field ประเภทเบาหวาน/กลุ่มเสี่ยงเป็น patient status/classification label ไม่ใช่ `DiabetesType` หรือ diagnosis, และ caregiver name เป็น display evidence สำหรับการ resolve ไปยัง Patient–OSM assignment เท่านั้น. Hospital / รพ.สต. parent-child hierarchy ยังเป็น `OPEN` และ shared effective date ต่อ batch ยังเป็น `PROVISIONAL` ตาม [Phase 16B.1 decision closeout](./phases/PHASE_16B1_PATIENT_IMPORT_REQUIREMENT_DECISION_CLOSEOUT.md).

**Phase 16C Patient Import Domain & Persistence Design** บันทึก design handoff แบบ documentation-only ใน [Phase 16C design](./phases/PHASE_16C_PATIENT_IMPORT_DOMAIN_PERSISTENCE_DESIGN.md): exact current Hospital scope ยังคงเป็น authorization boundary, source organization text ไม่ใช่ authority, OSM name ห้ามเป็น identity key และการ persist clinical/classification data ต้องผ่าน Phase 16D gates ที่ระบุไว้โดยไม่ตีความ requirement ใหม่.

**Phase 16D.1 Transaction-Composable Import Domain Foundation** implement แล้วตาม [Phase 16D.1 handoff](./phases/PHASE_16D1_TRANSACTION_COMPOSABLE_IMPORT_DOMAIN_FOUNDATION.md) โดยแยก server-only transaction primitives สำหรับ Patient core provisioning, Baseline และ Patient–OSM assignment; public services ยัง own validation, Serializable retry, error normalization และ standalone behavior เดิม ส่วน primitive recheck domain authorization/database invariants และเขียน audit ผ่าน caller-owned transaction เดียว. ไม่มี schema/migration หรือ expanded workbook persistence และ gates จาก Phase 16C ทั้งหมดยังไม่เปลี่ยน.

**Phase 16D.2 Initial Baseline Roster Import Persistence implement แล้ว** ตาม [Phase 16D.2 handoff](./phases/PHASE_16D2_INITIAL_BASELINE_ROSTER_IMPORT_PERSISTENCE.md): roster ที่มี approved initial measurements ใช้ shared `PatientBaseline.recordedOn` แบบ date-only ต่อ batch, preview/confirm binding ผูก file + actor + Hospital + effective date + import contract version และแต่ละ row ใช้ Serializable transaction เดียวสำหรับ Patient core + immutable Baseline reconciliation + bounded audits. `IMP-REQ-05` และหน่วย weight kg / height cm / waist cm / DTX mg/dL / HbA1c % ปิดแล้วสำหรับ operational roster; blank เป็น no assertion และค่าต่างกันไม่ overwrite. Classification vocabulary `กลุ่มเสี่ยง`/`เบาหวาน` ยืนยันแล้วแต่ lifecycle/authority/history ยังรอ Phase 16D.3; roster ยังไม่ persist classification, OSM, profile/address หรือ Hospital hierarchy และ safe OWNER-only assignment default ไม่เปลี่ยน.

คำถามเรื่อง owner สุดท้าย, field ownership, visibility, correction, lifecycle, retention และ actor-specific editability ที่ระบุใน Phase 10A ยังเป็น provisional/open requirements

Protected application UI ใช้ shared responsive shell, centralized capability-aware navigation, semantic Tailwind tokens และ small UI primitive layer ตาม [DEMI UI Foundation](./ui/DEMI_UI_FOUNDATION.md) โดย navigation visibility เป็น UX เท่านั้นและไม่แทน server authorization

## Phase 6A Patient Access and Assignment Contract

Phase 6A owner decisions are accepted. The implementation handoff is [Phase 6A Patient Access and Assignment](./phases/PHASE_6A_PATIENT_ACCESS_AND_ASSIGNMENT.md):

- An active `HOSPITAL` actor with a direct active `OWNER` or `MEMBER` membership may read Patients only through `PatientHospitalRelationship` rows for that same active Hospital. Profession does not change visibility.
- Parent/child Hospital hierarchy is not Patient authorization. Parent, child, sibling, and network metadata do not expand Patient read or mutation scope.
- OSM Patient read scope is `ASSIGNED_PATIENTS`, not Hospital-wide access. `OsmHospitalRelationship` alone is insufficient; B6.2 uses a first-class Hospital-specific assignment attached to `PatientHospitalRelationship`.
- Patient provisioning remains valid without assignment. B6.2 assignment is optional after provisioning, is controlled by active direct Hospital `OWNER` plus `patient:assign-osm`, allows one active OSM per Patient–Hospital relationship through a PostgreSQL partial unique index, preserves history, and fails access immediately when the OSM or its Hospital relationship is inactive.
- Platform `ADMIN` has no routine Patient-directory access. Governance/reconciliation access, if later needed, must be separately named, scoped, audited, and authorized.
- Phase 6B.1 is implemented as a Hospital-focused read-only slice: minimal display name/Hospital context/HN/opaque identifiers, bounded server-side name/HN search and offset pagination, stable ordering, no account/activation status by default, no clinical fields, and no Patient self-service portal. Authorization is enforced through the direct Hospital relationship predicate; OSM generic directory read and ADMIN routine read remain denied.
- Phase 6B.2 is implemented after B6.1 with `/app/patients/assigned` and OWNER assignment management under the existing Patient detail route. Phase 6B.3 profile editing, delete/restore/deactivation, transfer/Hospital change, Patient self-service expansion, and clinical workflows remain deferred or require future requirements.

## Phase 7B.0 Screening Working Prototype

Phase 7B.0 is implemented as a relationship-scoped requirement-validation workflow. The handoffs are [Phase 7A Screening Requirements](./phases/PHASE_7A_SCREENING_REQUIREMENTS.md) and [Phase 7B.0 Screening Working Prototype](./phases/PHASE_7B0_SCREENING_WORKING_PROTOTYPE.md):

- `/app/patients/[relationshipId]/screenings`, `/new`, and detail routes read through the authoritative `PatientHospitalRelationship` scope.
- Source-defined question/scoring versions, server-side response validation/scoring, serializable atomic persistence, bounded retry nonce, historical detail, and `screening.submitted` audit are implemented.
- Screening results do not automatically create or mutate Goals. Any Goal Plan is a separate explicit operation.
- Question sets and scoring remain provisional prototype definitions and are not clinical recommendations or final customer requirements.

## Phase 8A/8B.0 Goals & Activity Plan Working Prototype

The Phase 8A contract and Phase 8B.0 handoff are [Phase 8A Goals & Activity Plan Requirements](./phases/PHASE_8A_GOALS_AND_ACTIVITY_PLAN_REQUIREMENTS.md) and [Phase 8B.0 Goals & Activity Plan Working Prototype](./phases/PHASE_8B0_GOALS_AND_ACTIVITY_PLAN_WORKING_PROTOTYPE.md):

- `/app/patients/[relationshipId]/goals`, `/new`, and detail routes provide relationship-scoped Goal Plan history, explicit Primary Goal selection/creation, and historical detail for authorized Hospital users and exactly assigned OSM users; history is bounded to the newest 50 rounds.
- The prototype uses source-defined `demi-goals` / `legacy-prototype-v1` definitions, immutable `PatientGoalPlan` rounds with `PatientGoalItem` snapshots, optional Screening context through the independent Screening-owned `screening:read` boundary, automatic retention of the latest Screening source when it supplies prototype defaults, server-side template validation, serializable round allocation, per-form retry nonce, and bounded `goal_plan.created` audit. Goal history retains only opaque Screening source IDs and receives minimal historical summaries through one bounded Screening-owned batch query; denied optional Screening reads do not remove otherwise-authorized Goal history/detail access.
- Prototype capabilities are `goal:read` and `goal:plan`: active direct Hospital OWNER/MEMBER and active exact-assignment OSM are allowed; PATIENT and Platform ADMIN are denied; profession does not independently change authority.
- Goal Plan creation is never automatic from Screening. Primary goals, activity mappings, target defaults, units, authority, approval, visibility, and correction semantics remain provisional/open customer requirements. Patient self-service, edit/delete/amendment, adherence/progress, care plans, and clinical recommendations are not implemented.

## Phase 9A Appointment & Follow-up Requirement Contract

Phase 9A is complete as analysis/documentation: [Appointment & Follow-up Requirement Analysis](./phases/PHASE_9A_APPOINTMENT_AND_FOLLOWUP_REQUIREMENTS.md) records the pinned legacy evidence and the provisional contract for the future Phase 9B.0 Appointment and Phase 9C.0 Follow-up / Progress prototypes. It adds no Appointment or Follow-up implementation and does not make provisional business or clinical behavior customer-approved.

- The proposed slices inherit `PatientHospitalRelationship` scope, direct Hospital authorization, exact active `PatientOsmAssignment` for OSM access, server-side ActorContext/policy authority, profession neutrality, and the Platform ADMIN governance boundary.
- The proposed Follow-up contract keeps Goal Plan provenance explicit, favors immutable relationship-scoped rounds, and defers correction/amendment, attachments, clinical rules, and generic workflow behavior until requirements are confirmed.

## Phase 9B.0 Appointment Working Prototype

Phase 9B.0 is implemented as the relationship-scoped Appointment
requirement-validation workflow in [the Phase 9B.0 handoff](./phases/PHASE_9B0_APPOINTMENT_WORKING_PROTOTYPE.md):

- The Phase 9B.0 Hospital Work prototype introduced `/app/patients/[relationshipId]/appointments`, `/new`, detail, and edit/reschedule routes with bounded newest-first history and create/reschedule/cancel/complete/no-show operations. Current authority is action-specific: direct operational changes require valid Hospital Work authority; Patient and exact-assigned OSM interactions follow Phase 17D.0/17D.1.
- `PatientAppointment` is owned by the exact `PatientHospitalRelationship`; it stores a real PostgreSQL `TIMESTAMPTZ`, uses strict provisional type/status/location values, and retains creator/responsible-user distinctions.
- The Phase 9B.0 `appointment:read` / `appointment:manage` matrix was provisional historical behavior. The owner-approved Phase 17D.0 contract, implemented in Phase 17D.1, now defines the current action and scope matrix: Hospital Work authority owns direct operational mutations and request review; Patient SELF and exact-assigned OSM receive only their approved acknowledgement, cancellation-request, coordination, read, and create actions. Workspace selection and profession do not grant authority.
- Create, reschedule, and terminal mutations use server-side validation, serializable transactions, conditional stale-update checks, unique nonce retry semantics, and atomic bounded Appointment audit events. History/detail projections remain minimal and relationship-scoped.
- This Appointment prototype was not customer-approved when Phase 9B.0 was delivered; its interaction authority was later resolved by Phase 17D.0 and implemented in Phase 17D.1. Phase 9C.0 adds a separate Follow-up / Progress requirement-validation prototype; Appointment completion remains independent and does not create a Follow-up automatically.

## Phase 9C.0 Follow-up / Progress Working Prototype

Phase 9C.0 is implemented as a provisional, relationship-scoped Follow-up workflow in [the Phase 9C.0 handoff](./phases/PHASE_9C0_FOLLOWUP_PROGRESS_WORKING_PROTOTYPE.md):

- `/app/patients/[relationshipId]/followups`, `/new`, and detail routes provide bounded newest-first immutable Follow-up history, standalone recording, and optional linkage to a server-validated `COMPLETED` Appointment.
- `PatientFollowup` is owned by the exact `PatientHospitalRelationship`; relationship-scoped rounds use a database uniqueness invariant, serializable transaction, bounded retry, UUID nonce, and immutable request fingerprint.
- Follow-up history requires `followup:read`; its record CTA is derived independently from `followup:record`, and New Follow-up setup/create require `followup:record`. The current provisional matrix allows the same direct Hospital and exact-assigned OSM scopes for both capabilities, but read authority does not imply record authority.
- An explicitly selected historical Goal Plan may provide exact activity progress context. Goal Plan loading is optional enrichment: denied Goal read access leaves standalone Follow-up setup usable with no Goal options, while a selected Goal Plan is still validated strictly through the Goal-owned boundary. Activity progress is optional per activity; submitted codes are checked against that exact immutable plan and no Goal Plan means no fabricated progress rows.
- Provisional `followup:read` and `followup:record` policy allows active direct Hospital OWNER/MEMBER and exact active-assignment OSM, and denies unassigned OSM, PATIENT, and ADMIN-only actors. An ADMIN role does not revoke valid direct Hospital or exact-assigned OSM authority on a multi-role actor. Profession and Hospital hierarchy do not widen authority.
- Follow-up, activity progress, and `followup.created` audit persist atomically. Measurements, confidence, notes, and other sensitive clinical/free-text values are excluded from audit metadata. Follow-up creation has no hidden Appointment, Goal Plan, or Screening side effects.
- PostgreSQL integration tests verify relationship-scoped concurrent round allocation, concurrent identical nonce replay, and changed-payload nonce conflict behavior under the real serializable transaction and uniqueness constraints.
- Measurements, progress statuses, confidence, actor authority, Patient visibility, correction semantics, and clinical meaning remain provisional/open customer requirements. Implemented prototype behavior is not confirmed customer requirement.

## Phase 10A Patient Profile / Baseline / Status Tracking Requirements

Phase 9 is complete. Phase 10A is now complete as an analysis/provisional-contract phase in [the Phase 10A requirements and domain boundary document](./phases/PHASE_10A_PATIENT_PROFILE_BASELINE_STATUS_REQUIREMENTS.md); no product code, Prisma model, migration, route, form, or storage/upload behavior was added.

The provisional ownership conclusions are:

- `Person` remains the human identity source and `User` remains the authentication/account source. PatientProfile must stay bounded and must not absorb Hospital-local, clinical-history, status, or artifact data merely because legacy displayed them on one form.
- `PatientHospitalRelationship` owns HN and Hospital-specific context. Screening, Goal Plan, Appointment, and Follow-up retain their existing relationship-scoped ownership and explicit cross-domain references.
- Baseline is provisionally a dedicated relationship-owned Initial Snapshot. It must not be silently represented as `Followup(round = 0)`, derived from the first Screening/Follow-up, or populated with fabricated values.
- Legacy status tracking is primarily an image/evidence gallery. No generic status table or second Follow-up model is accepted; relationship lifecycle, clinical classification, event history, artifact metadata, and derived summaries must remain separate decisions.
- Artifacts are provisionally owned by one concrete business record, with metadata separate from binary storage and visibility inherited from the owner. A generic enterprise attachment framework and Patient self-service uploads remain deferred.
- Authorization continues to be server-side and fail-closed: direct active Hospital membership or exact active OSM assignment governs relationship access; hierarchy, profession, and ADMIN-only status do not silently widen routine patient authority. Patient self-service remains open.

The existing Patient Detail page was the 10B.0 foundation. Phase 10B.0 provided a provisional read-only profile subset; at that phase, profile editing remained blocked pending owner decisions. The later, bounded Patient general-profile decision is implemented in Phase 17E.1. Phase 10C.0 adds the Baseline / Initial State prototype and Phase 10D.0 adds relationship-level Patient Status Evidence / Artifact. Baseline fields/cardinality/correction, relationship lifecycle status, classification semantics, final artifact scope/lifecycle, and Patient permissions remain major unresolved business decisions.

## Phase 10B.0 Patient Profile Working Prototype

Phase 10B.0 is implemented as a provisional, read-only Patient Profile subset in the existing relationship-scoped Patient Detail workspace; details are in [the Phase 10B.0 handoff](./phases/PHASE_10B0_PATIENT_PROFILE_WORKING_PROTOTYPE.md):

- `PatientProfile` stores eight nullable prototype fields: date of birth, gender, phone number, address, emergency contact name/phone, occupation, and education level. This does not permanently resolve ownership; date of birth and gender may later belong to `Person`.
- Detail reuses the exact `PatientHospitalRelationship` authorization boundary for direct Hospital access and exact-assigned OSM access. ADMIN-only remains denied, while a valid scoped path on a multi-role actor remains usable.
- Profile values appear only in the authorized Patient Detail projection. Patient directory/list projections remain minimal and do not expose these fields; missing values render `ไม่ระบุ`.
- Profile editing, Patient self-service, generic artifacts, and arbitrary uploads remain deferred. Relationship-level image evidence is implemented separately in Phase 10D.0.

## Phase 10C.0 Baseline / Initial State Working Prototype

Phase 10C.0 is implemented as a provisional, immutable initial-state snapshot in [the Phase 10C.0 handoff](./phases/PHASE_10C0_BASELINE_INITIAL_STATE_WORKING_PROTOTYPE.md):

- `PatientBaseline` is a dedicated record owned by the exact `PatientHospitalRelationship`; it is not Follow-up round zero, Screening round zero, a PatientProfile field group, or a current-health status record. A unique relationship key allows one Baseline per relationship.
- `/app/patients/[relationshipId]/baseline` provides a mobile-friendly create form when absent and a read-only snapshot after creation. Patient Detail provides a bounded existence/date navigation card without loading the full Baseline payload.
- Creation uses the narrow `patient:baseline:create` capability, reuses the exact relationship `patient:read` boundary, derives `recordedByUserId` server-side, and allows active direct Hospital OWNER/MEMBER or exact active assigned OSM scope. ADMIN-only, unassigned OSM, Hospital hierarchy, profession, and Patient self-service do not widen authority.
- Baseline creation and minimal `patient_baseline.created` audit metadata commit atomically. Measurements and clinical/context text are excluded from audit metadata, and no Screening, Goal, Appointment, Follow-up, PatientProfile, assignment, classification, or artifact side effect is performed.
- The provisional field set, confidence scale, units, requiredness, correction/amendment behavior, care-episode cardinality, and future comparison semantics remain open owner requirements. Phase 10D.0 is implemented as a separate relationship-level image evidence prototype; Baseline attachments remain deferred.

## Phase 10D.0 Relationship-Level Patient Status Evidence / Artifact Prototype

Phase 10D.0 is implemented as a narrow, provisional relationship-level image evidence workflow; the full boundary and operational setup are documented in [the Phase 10D.0 handoff](./phases/PHASE_10D0_PATIENT_STATUS_ARTIFACTS_WORKING_PROTOTYPE.md):

- `PatientEvidenceArtifact` has exactly one concrete owner: `PatientHospitalRelationship`. Metadata is stored in PostgreSQL while the binary is stored in a private Supabase Storage bucket through a server-only adapter. No polymorphic attachment model, Baseline owner, or Follow-up owner was introduced.
- The browser accepts a JPEG, PNG, or WEBP source up to 25 MiB, decodes it, limits the longest edge to 2,560 pixels without upscaling, and sends only the resulting evidence file. Suitable files already within 8 MiB and the dimension limit may keep their original bytes; images that need processing are encoded as JPEG with bounded quality/dimension attempts. HEIC/HEIF remains unsupported.
- The server independently accepts only a non-empty normalized JPEG, PNG, or WEBP no larger than 8 MiB when the signature agrees with the declared media type. SHA-256 integrity metadata is computed from the uploaded normalized bytes; identical content does not imply clinical duplicate meaning.
- Upload, list, and protected view use exact relationship authorization. Direct active Hospital OWNER/MEMBER and exact active assigned OSM paths are allowed; valid multi-role paths remain valid, while ADMIN-only, PATIENT, hierarchy-only, wrong-Hospital, and unassigned OSM paths remain denied or hidden under the established anti-enumeration convention.
- Upload uses a narrow authenticated multipart Route Handler with exact relationship pre-authorization before body consumption, a bounded streamed multipart request (`8 MiB + 128 KiB` total and `8 MiB` actual normalized file), and a `Content-Length` check used only as an early optimization. Storage upload precedes a PostgreSQL transaction containing metadata plus bounded creation audit; a failed transaction triggers best-effort object compensation. Signed URLs are short-lived and never persisted.
- The UI supports create/list/view with Thai-first mobile cards. Delete, replacement, supersession, lifecycle, retention, Patient self-service, PDFs/documents, and generic document management remain explicitly deferred.

## Phase 3A Hospital Onboarding Contract

สัญญาและ checklist ของ slice นี้อยู่ที่ [Phase 3A Hospital Onboarding](./phases/PHASE_3A_HOSPITAL_ONBOARDING.md) ส่วน implementation อยู่ใน `src/modules/hospital-onboarding/`, `/hospital/onboarding` และ `/app/admin/hospital-onboarding`

> **Superseded in part (ADR-0018, Phase O1 — 2026-10-21).** หน้าขึ้นทะเบียนสาธารณะรับเฉพาะโรงพยาบาลแม่ข่าย ลูกข่ายสร้างโดย OWNER แม่ข่ายและเชิญผู้ดูแลคนแรกผ่านลิงก์เปิดใช้งาน
>
> **Superseded in part (ADR-0017, Phase N1 — 2026-10-21).** ผู้สมัครไม่ได้ match Hospital Master แล้ว และไม่มี seed import หรือ `npm run db:seed` อีกต่อไป Platform ADMIN ลงทะเบียน Hospital ทุกแห่งเป็น `PENDING_VERIFICATION` ที่ `/app/admin/hospitals` หน้าขึ้นทะเบียนสาธารณะแสดงเฉพาะ Hospital ที่ยัง PENDING และ ADMIN ถอน Hospital ที่ไม่มีผู้สมัครออกจากรายชื่อได้ (`RETIRED`) bullet เรื่อง Master matching, artifact 78 records, optional parent reference และ seed import ด้านล่างเป็นบันทึกประวัติของ Phase 3B

ส่วนที่ยืนยันแล้วสำหรับ Phase 3B:

- public onboarding มีเฉพาะ Hospital organization application ไม่มี generic signup หรือ role selection
- applicant ต้อง match controlled canonical Hospital Master entry โดย `hospitalCode` เป็น stable business identifier; external master provider ยัง unresolved
- manual Platform `ADMIN` เป็นผู้ review/approve/reject สำหรับ MVP
- approved normalized Hospital Master artifact มี 78 records; `HH` ถูก exclude และ `KANG`/`KHON` เป็น canonical corrections ที่ห้ามเปลี่ยน
- onboarding application แยกจาก `Hospital` และใช้ lifecycle `PENDING → APPROVED | REJECTED` เพื่อเก็บ rejected history และไม่สร้าง active Hospital ก่อน approval
- applicant identity ต้อง resolve ด้วย Thai National ID validation + HMAC และ reuse `Person`/`User` เดิมก่อนสร้างใหม่เสมอ
- National ID เป็น identity lookup input ไม่ใช่ ownership proof; existing account ที่พิสูจน์ไม่ได้ต้อง fail closed และคง non-active จน trusted review/reconciliation
- applicant ที่มีหลาย role หรือหลาย hospital membership ต้องใช้ core identity เดิม
- credential establishment ที่จำเป็นต้องใช้ user-owned password และ Phase 2.1 `provisionPasswordAuthIdentity()` จาก higher-level workflow; primitive นี้ไม่ใช่ public API
- approved applicant ได้ `HOSPITAL` role + ACTIVE `OWNER` HospitalMembership ของ Hospital ที่เป็น `ACTIVE`; Hospital Owner ไม่ได้ Platform `ADMIN`
- approval/rejection และ consistency-critical PostgreSQL writes รวม audit event ต้องเป็น atomic business operation
- cross-system Supabase Auth/PostgreSQL effect ใช้ compensation/reconciliation ไม่ใช่ fake distributed transaction
- capabilities ของ slice นี้มีเฉพาะ `hospital:onboard`, `hospital:review`, `hospital:approve`, `hospital:reject` และยังไม่ใช่ full capability matrix
- Server Actions เป็น web adapters; onboarding business operation อยู่ใน transport-agnostic Application Service และไม่ต้องสร้าง speculative `/api/v1`

Phase 3B implement persistence ตาม contract แล้ว: `Hospital` มี unique `hospitalCode` และ optional parent reference ที่ไม่ใช่ authorization primitive, ส่วน `HospitalOnboardingApplication` แยก lifecycle/history พร้อม reviewer attribution และ database guard สำหรับ pending claim เดียวต่อ Hospital การ import master ใช้ `prisma/seed/hospital-master-v2.json` และ `npm run db:seed` แบบ idempotent โดยใช้ stable `hospitalCode` upsert ไม่ลบ unrelated rows และไม่ reset `ACTIVE` status

## Phase 3C Platform Admin Bootstrap

Fresh environment ที่ยังไม่มี Platform `ADMIN` ใช้ trusted interactive CLI เป็น operational entry point เดียวสำหรับสร้าง Platform Admin คนแรก:

- รัน `npm run admin:bootstrap` จาก developer/server environment ที่ credentials ชี้ไปยัง DEMI database และ Supabase project ที่ต้องการ
- CLI รับ Thai National ID/ตัวระบุ Admin ที่ตั้งเอง, given name, family name และ user-owned password แบบ interactive; ไม่รับ identity/password ผ่าน argv และไม่แสดง password
- Admin identifier ใช้ bounded login schema เดียวกับ `/login` โดยไม่ตรวจ category/checksum; Hospital onboarding และ role อื่นยังใช้ strict Thai National ID schema เดิม
- Application Service ใช้ HMAC namespace `thai-national-id`, ปฏิเสธ existing Person/User และตรวจ `UserRole.ADMIN` โดยไม่กรอง User status
- สร้างเฉพาะ `Person` + `User(PROVISIONED)` แล้วเรียก `provisionPasswordAuthIdentity()` เดิม; หลังตรวจ `authSubject` mapping ใช้ final PostgreSQL `Serializable` transaction re-check ADMIN, เปลี่ยน User เป็น `ACTIVE`, สร้าง `ADMIN` role และ audit event `platform_admin.bootstrapped`
- Supabase Auth กับ PostgreSQL ใช้ explicit compensation/reconciliation; provider/local identity ที่สร้างโดย operation จะถูกลบได้เฉพาะเมื่อ ownership และ expected state ตรงกัน และไม่สร้าง success จาก partial authority
- ผลลัพธ์ไม่มี `HOSPITAL` role, `HospitalMembership` หรือ OWNER membership; Admin login ใช้ `/login` ด้วยตัวระบุที่ตั้งตอน bootstrap + password ส่วน role อื่นใช้ Thai National ID + password ตามปกติ
- ไม่มี public admin signup, hidden browser route, HTTP API หรือ client-controlled role input และยังไม่เพิ่ม admin management/recovery/invitation/password-reset governance
- database target ไม่ใช้ selector ใหม่: `DATABASE_URL`, `DIRECT_URL` และ Supabase credentials ของ process เป็นตัวกำหนด environment เช่นเดียวกับ setup เดิม ผู้ปฏิบัติงานต้องตรวจ target ก่อนรัน

รายละเอียด contract และ acceptance path อยู่ที่ [Phase 3C Platform Admin Bootstrap](./phases/PHASE_3C_PLATFORM_ADMIN_BOOTSTRAP.md)

## Phase 4A Workforce Provisioning and Activation Contract

Decision ที่ยืนยันแล้วสำหรับ Phase 4B อยู่ที่ [Phase 4A Workforce Provisioning](./phases/PHASE_4A_WORKFORCE_PROVISIONING.md) และ [ADR-0008](./adr/0008-workforce-provisioning-and-activation.md):

- Routine workforce provisioning ทำได้เฉพาะ actor ที่เป็น `HOSPITAL` + ACTIVE `OWNER` membership โดยตรงใน target Hospital ที่เป็น `ACTIVE`; ordinary Hospital member, Platform `ADMIN` และ parent/child hierarchy ไม่ bypass policy
- Hospital staff ใช้ `HOSPITAL` role + `HospitalMembership(MEMBER)` กับ `DOCTOR`, `NURSE`, `COORDINATOR` หรือ `OTHER`; profession เป็น classification ไม่ใช่ top-level role/authority
- OSM ใช้ `OSM` role + `OsmHospitalRelationship` แยก โดย unique `(userId, hospitalId)` และ row หมายถึง OSM–Hospital association เท่านั้น ไม่ใช่ area, assigned patient หรือ clinical scope
- Resolve/reuse `Person`/`User` และ preserve roles/relationships เดิมเสมอ; existing `ACTIVE` User ที่ `authSubject` map ถูกต้องเพิ่ม relationship เป็น `ACTIVE` ได้ทันทีโดยไม่ activate credential หรือเรียก provider ซ้ำ
- New workforce User/relationship เริ่ม `PROVISIONED`; first-time activation ใช้ opaque one-time activation credential โดย copy URL, QR และ assisted in-person เป็น presentation ของ capability เดียวกัน
- Target user เป็นผู้ตั้ง password เอง; Hospital staff ไม่รู้หรือกำหนด password, token plaintext ไม่เก็บใน DB และ activation ใช้ secure hash, expiry, single-use, revocation/regeneration และ concurrency-safe claim
- Copy link/QR ใช้ expiry default 24 ชั่วโมง และ assisted ใช้ 15 นาที; email, SMS และ LINE/LIFF ไม่ใช่ core dependency แต่อาจเป็น future delivery channels ส่วน ThaID และ external identity ต้องมี decision แยก
- Provider I/O อยู่นอก local PostgreSQL transaction และใช้ compensation/reconciliation เดิม หาก provider/local finalization ไม่สอดคล้อง

## Phase 4B Workforce Provisioning Implementation

Implementation handoff อยู่ที่ [Phase 4B Workforce Provisioning](./phases/PHASE_4B_WORKFORCE_PROVISIONING.md) และยึด invariant เหล่านี้:

- Staff ใช้ `HOSPITAL + HospitalMembership(MEMBER)` ส่วน OSM ใช้ `OSM + OsmHospitalRelationship` แยก โดย relationship ไม่ใช่ clinical/resource scope
- เฉพาะ `HOSPITAL` ที่มี direct `ACTIVE OWNER` membership ใน `ACTIVE` target Hospital จึง provision workforce ได้; Platform `ADMIN` และ parent/child relation ไม่ bypass policy
- New User เริ่ม `PROVISIONED` และใช้ one-time activation URL; QR/assisted เป็น presentation เดียวกัน, token เก็บเป็น digest, และ target user ตั้ง password เอง
- Existing `ACTIVE` User ที่ provider mapping ถูกต้อง reuse credential และรับ relationship ใหม่เป็น `ACTIVE` โดยไม่ activate หรือเรียก provider ซ้ำ
- Activation provider I/O อยู่นอก long local transaction และใช้ guarded compensation/reconciliation; provisioned/ambiguous account เข้า `/app` ไม่ได้

## Phase 5B.2 Patient First-Time Activation Implementation

Implementation handoff อยู่ที่ [Phase 5B.2 Patient First-Time Activation](./phases/PHASE_5B2_PATIENT_FIRST_TIME_ACTIVATION.md) และยึด invariant เหล่านี้:

- Patient activation เป็น optional operation ที่แยกจาก Patient provisioning และใช้ `PatientActivation` purpose-specific; single provisioning และ Excel import ไม่สร้าง activation และไม่ใช้ `WorkforceActivation` ร่วมกัน
- เฉพาะ ACTIVE `HOSPITAL` actor ที่มี direct active HospitalMembership ใน target Hospital ที่เป็น ACTIVE จึงออก activation ได้; capability แยกเป็น `patient:activation:issue` และ OSM ยังไม่อยู่ใน scope นี้
- Hospital จัดการ activation ผ่าน dedicated `/app/patients/activation` โดยค้นหาด้วย exact Thai National ID ผ่าน HMAC หรือ exact HN ใน Hospital scope; query คืนเฉพาะ activation projection แบบ bounded ไม่ใช่ generic Patient roster/read
- Patient activation ไม่เปลี่ยน `PatientProfile` หรือ `PatientHospitalRelationship`; เปลี่ยนเฉพาะ `User.authSubject`, `User.status` และ activation state ที่เกี่ยวข้อง
- One-time token เป็น random 256-bit URL-safe secret, เก็บเฉพาะ SHA-256 digest, มี expiry 24 ชั่วโมงใน reversible MVP และ QR เป็น presentation ของ URL เท่านั้น
- Provider I/O reuse existing server-only password-auth provisioning boundary และมี bounded 5-minute claim lease, stale-claim recovery เฉพาะเมื่อ local state สะอาด, compensation/reconciliation เมื่อ provider/local state ไม่สอดคล้องกัน
- Provider transport failure/timeout/5xx และ provider alias conflict แยกจาก definitive provider rejection; ambiguous outcome จะคง claim และ mark `reconciliationRequiredAt` เพื่อป้องกัน blind retry
- Existing ACTIVE User ที่มี valid provider mapping และ PATIENT domain state ไม่ต้อง activate ซ้ำและไม่แทนที่ `authSubject` เดิม

## Phase 2.1 National ID Login Adapter

ส่วนที่ implement แล้วใน Phase 2.1 มีขอบเขตดังต่อไปนี้:

- `/login` เป็นหน้าเข้าสู่ระบบภาษาไทยแบบ responsive รับ Thai National ID หรือ bounded Admin identifier และ user-owned password ผ่าน Server Action โดยไม่ต้องแสดงหรือขออีเมล
- Login input validate ด้วย Zod ฝั่ง server: trim เฉพาะช่องว่างรอบนอก, ต้องไม่ว่างและมี length bound ก่อนทำ HMAC/database/provider work; strict Thai National ID checksum ยังคงอยู่ที่ Hospital onboarding และ role อื่น
- server ใช้ identity service source เดิมคำนวณ HMAC ด้วย namespace `thai-national-id` แล้ว resolve `Person.identityKeyHash → Person → User` สำหรับทั้งสอง identifier แบบไม่เก็บ raw value
- Supabase password authentication ใช้ opaque internal alias ที่ derive จาก stable `User.id`; alias ไม่บรรจุ National ID ไม่ใช่อีเมลจริง/contact method และไม่ถูก expose ใน `ActorContext` หรือ browser
- หลัง provider authentication สำเร็จ ระบบ validate provider identity ด้วย `auth.getUser()` แล้วใช้ service เดิม resolve `User.authSubject` เป็น DEMI actor
- subject ที่ provider คืนต้องตรงกับ `User.authSubject` ที่ login identifier resolution เลือกไว้; mismatch ถูก deny และ local sign-out แบบ fail closed
- actor resolution แยกผล `UNAUTHENTICATED`, `APPLICATION_ACCESS_DENIED` และ `AUTHORIZED`; provider/database infrastructure failure ยังคง throw เป็น predictable infrastructure error
- เฉพาะ mapped `User.status = ACTIVE` ที่ resolve `ActorContext` ได้จึงเข้า `/app`; `PROVISIONED`, `INVITED`, `SUSPENDED` และ unmapped provider user ถูก deny
- login ไม่สร้าง `Person`, `User`, role หรือ hospital membership และไม่อ่าน authority จาก provider metadata หรือ browser state
- `/app` ตรวจ protected access ฝั่ง server และแสดง role จาก server-resolved `ActorContext` ใน shared application shell เท่านั้น
- `/` redirect ACTIVE actor ไป `/app` และ redirect สถานะอื่นไป `/login`; infrastructure failure ไม่ถูกแปลงเป็น anonymous state
- logout เรียก Supabase Auth server client ด้วย `scope: "local"` เพื่อ invalidate เฉพาะ current browser/device session และ redirect ไป `/login` โดยไม่แก้ DEMI identity/authorization records
- auth mutations ใช้ Supabase server client ที่กำหนดให้ cookie writes ต้องสำเร็จ; read-only Server Components ยังคงใช้ defensive cookie-write behavior ได้
- unknown National ID และ wrong password ให้ client-facing `INVALID_CREDENTIALS` ข้อความเดียวกัน; identity/provider/database infrastructure failure ยังแยกเป็น infrastructure error ภายใน
- National ID, `identityKeyHash`, password, provider alias, token และ cookie ไม่ถูก log หรือส่งกลับ client
- ไม่มี Prisma schema หรือ migration change ใน Phase 2.1 เพราะ `User.id` เป็น opaque stable alias source อยู่แล้ว และ `authSubject` ยังคงหมายถึง provider subject
- dedicated Supabase Admin client ใช้ `SUPABASE_SERVICE_ROLE_KEY` เฉพาะฝั่ง trusted server และแยกจาก SSR session client; privileged credential ไม่อยู่ใน Client Component, Server Action input หรือ response
- `provisionPasswordAuthIdentity()` รับ existing DEMI User และ user-owned password จาก trusted application workflow, reuse alias helper, สร้าง confirmed provider account แล้ว persist Supabase user ID ลง `User.authSubject`
- provisioning primitive ไม่สร้าง Person, ไม่ assign role/membership และไม่เปลี่ยน `User.status`; higher-level workflow ยังเป็นเจ้าของ business authorization และ lifecycle transition
- User ที่มี `authSubject` แล้วหรือ alias ที่มีอยู่ใน provider จะ fail closed เป็น conflict โดยไม่ overwrite/attach อัตโนมัติ
- operation ข้าม Supabase Auth กับ PostgreSQL ไม่ถูกทำเป็น fake transaction: หาก persist subject ล้มเหลวหลัง provider creation จะลบ provider user ที่เพิ่งสร้างเป็น compensation; cleanup failure เป็น infrastructure/reconciliation error และไม่รายงาน success
- Repository ยังไม่มี shared distributed login rate limiter; bounded validation และ provider safeguards เป็น boundary ปัจจุบัน ส่วน deployment-level rate limiting เป็น security follow-up ก่อนขยาย public exposure

Phase 2.1 ไม่ได้ implement provider-account transition สำหรับ workforce, LIFF identity linking, ThaID, native authentication, role capability matrix หรือ clinical workflows และ primitive นี้ยังไม่มี public endpoint หรือ caller-specific activation policy; Phase 3B Hospital Onboarding เป็น higher-level workflow แรกที่รับผิดชอบ policy, user-owned credential establishment และ approval lifecycle ของ applicant ส่วน Phase 4A เป็น decision contract และ Phase 4B implement workforce one-time activation workflow โดยไม่เปลี่ยน authentication adapter

## Phase 1 Foundation Implementation

ส่วนที่ implement แล้วใน foundation นี้มีขอบเขตดังต่อไปนี้:

- Prisma schema/migration สำหรับ `Person`, `User`, `UserRole`, `Hospital`, `HospitalMembership` และ `AuditEvent`
- `Person.identityKeyHash` เป็น opaque hash ของ identity reference ที่ผ่าน validation; Phase 2.1 กำหนด namespace `thai-national-id` สำหรับ interactive login แล้ว ส่วน external identity/provider link อื่นยังไม่ถูกล็อก
- Supabase Auth เป็น current server authentication adapter โดย provider subject map ผ่าน `User.authSubject`; Supabase user metadata ไม่ใช่ source of truth ของ DEMI authorization
- `ActorContext` load จาก active application `User`, roles และ hospital memberships ผ่าน Prisma
- Next.js 16 `proxy.ts` refreshes Supabase SSR cookies per request; `auth.getUser()` validates the provider identity before mapping to the application `User`
- fail-closed authorization primitives สำหรับ role requirement และ `GLOBAL`/`HOSPITAL`/`SELF`/`DENIED` scope เท่านั้น; primitive นี้ยังไม่ประกาศ full capability matrix หรือ OSM scope semantics นอกเหนือจาก Patient assignment contract ของ Phase 6A
- identity lookup ใช้ deterministic HMAC-SHA-256 ด้วย server-only `IDENTITY_HASH_SECRET`
- audit input boundary ที่จำกัด metadata และปฏิเสธ credential/identity secrets
- audit persistence รับ transaction-compatible Prisma client ได้ และ audit actor foreign key ไม่อนุญาต hard-delete User ที่มีประวัติ audit
- Prisma migration scripts ใช้ standard `prisma migrate dev`, `prisma migrate deploy` และ `prisma generate`; database/environment selection มาจาก credentials ที่ process ได้รับโดยตรง และ integration suite แยกใช้ dedicated test database
- สำหรับ local integration ใช้ `.env.integration` กับ `compose.integration.yaml` ซึ่งเปิด PostgreSQL แบบ disposable ที่ `127.0.0.1:55432`; `DATABASE_URL`, `DIRECT_URL` และ `DEMI_TEST_DATABASE_URL` ต้องชี้ฐานข้อมูล test เดียวกัน
- ให้เปิด disposable PostgreSQL ค้างไว้จาก Docker-enabled WSL terminal แล้วใช้ `npm run test:integration` เป็นคำสั่ง integration เดียวเพื่อ `prisma generate`, apply migrations และรัน integration tests; คำสั่งนี้ไม่เรียก Docker/WSL
- server-side health check ที่ไม่เปิดเผย secret หรือ internal error

Implementation directories และ commands ดูได้จาก [README](../README.md) และ [Architecture Baseline](./architecture/DEMI_ARCHITECTURE_BASELINE.md)

## Family / Caregiver Vocabulary

**Delegated caregiver**: An authenticated person/account receiving explicitly scoped access from a competent adult Patient through accepted voluntary delegation; no PATIENT role is required on the caregiver side. This is distinct from a legal representative and from an OSM caregiver.

**Care recipient**: The explicit Patient participant whose approved resources are the target of a directional delegation. The two customer perspectives describe the same authoritative relationship.

**Family member**: A social/kinship description, not an authorization grant. Whether non-relatives are eligible delegates remains a product decision.

**Caregiver invitation**: An expiring, revocable proposal addressed to an intended person for explicit acceptance. A link or QR transports the proposal and grants no Patient-resource authority.

**Emergency contact**: Contact information only; not an accepted Family relationship, account, delegation, consent giver or legal representative.

**OSM caregiver**: The operational OSM participant in PatientOsmAssignment; not a Family delegate. Import caregiver/coach wording must retain this domain meaning.

The [Phase 17F.0 Family / Caregiver Contract](./phases/PHASE_17F0_FAMILY_CAREGIVER_DELEGATED_ACCESS_CONTRACT.md) is CLOSED: P17F-G01..G08 are CLOSED / OWNER APPROVED by the explicit 2026-10-01 closeout. Phase 17F.1 implements only the relationship security foundation, documented in the [17F.1 handoff](./phases/PHASE_17F1_FAMILY_CAREGIVER_RELATIONSHIP_SECURITY_FOUNDATION.md); it does not close Family overall or authorize Patient-resource access. Existing ACTIVE User/Person recipients only; National ID is a server canonical/hash locator with exact authenticated recipient binding, never authority. Invitations expire after 24 hours; ACTIVE relationships have no automatic expiry in 17F.1. Patient revocation and own-caregiver ACTIVE withdrawal are audited and terminal with immediate authority loss after commit; pending rejection is separate. P17F-C07 remains ERRONEOUS / NOT A DECISION; G08 supplies the new withdrawal approval. Relationship acceptance remains ZERO-data; the only implemented delegated Patient-resource capability is now `family-appointment-read-v1`. P17F-L01/L02/L06 are now CLOSED / OWNER APPROVED only for the bounded appointment-read slice in [17F.2B closeout / implementation contract](./phases/PHASE_17F2B_DELEGATED_APPOINTMENT_READ_CONTRACT.md). Synthetic/demo 17F.2 appointment-read v1 is IMPLEMENTED; real-data delegated use remains externally governance-blocked. L03 QR (17F.3) is CLOSED / OWNER APPROVED; 17F.3 QR transport IMPLEMENTED; L04 re-audit/UAT and L05 future expiry/renewal remain OPEN; minors/legal authority deferred and Phase 17E.2 consent parked.

## Accepted Actors

Top-level business roles ที่ยืนยันแล้วมี 4 รายการ:

| Actor | Responsibility |
| --- | --- |
| `ADMIN` | DEMI Platform Admin ดูแล governance, hospital verification, audit, recovery, reconciliation และ exceptional cases ไม่ใช่ผู้ปฏิบัติงานประจำใน patient workflow |
| `HOSPITAL` | สมาชิกของโรงพยาบาลหรือองค์กรบริการสุขภาพ เป็น actor ฝั่งบริการ/ดูแลเคสภายใน capability และ scope ที่ business requirement อนุญาต |
| `OSM` | อสม. หรือ field operator ทำงานภาคสนามภายใน assigned-Patient scope ที่ Phase 6A ยืนยัน; geographic/clinical scope อื่นยังต้องมี requirement แยก |
| `PATIENT` | ผู้ป่วยที่เป็น actor ของระบบและทำ self-service ได้เฉพาะข้อมูลหรือ action ของตนที่ policy อนุญาต |

## Critical Architecture Rules

- `Person` คือบุคคลจริง และแยกจาก `User` ซึ่งเป็น application account
- หนึ่งคนต้องไม่ถูกสร้าง duplicate core identity เพียงเพราะมีหลาย role
- User มีหลาย role ได้
- User มีหลาย hospital membership ได้โดยไม่สร้าง User หรือ Person ซ้ำ
- Doctor/Nurse เป็น profession classification ก่อน ไม่ใช่ top-level authorization role
- Hospital Owner คือ `HOSPITAL` + owner membership และไม่ใช่ Platform `ADMIN`
- ไม่มี generic public signup ที่ให้ผู้ใช้เลือก role เอง
- Public signup ใช้สำหรับ Hospital organization onboarding
- Public hospital application เลือกได้เฉพาะ Hospital ที่ Platform ADMIN ลงทะเบียนไว้และยังเป็น `PENDING_VERIFICATION` โดยอ้างอิงด้วย stable `hospitalCode` (ADR-0017: ไม่มี Hospital Master); Hospital ที่ `RETIRED` ไม่แสดงและสมัคร/อนุมัติไม่ได้; ADR-0018: รับเฉพาะแม่ข่าย (role PARENT) ที่ไม่เคยเป็นลูกข่ายของ area ใด ลูกข่ายใช้คำเชิญจาก OWNER แม่ข่ายเท่านั้น ตรวจที่ server ทั้งรายชื่อ การค้นด้วยรหัส การสมัคร และการอนุมัติ
- MVP hospital verification เป็น manual Platform `ADMIN` decision และเก็บ application history แยกจาก Hospital lifecycle
- Staff/OSM ถูก provision จาก trusted Hospital context และไม่ self-assign role; Phase 4B จำกัด routine provisioning ที่ ACTIVE Hospital Owner ของ target Hospital โดยตรง
- Patient ที่ Hospital/OSM provision แล้วไม่ register ซ้ำ; หากจำเป็นต้องใช้ interactive account จึงใช้ first-time account activation แยกภายหลัง
- Workforce provisioning แยกจาก credential ownership; new staff/OSM ใช้ opaque one-time activation และ target user ตั้ง password เอง ส่วน existing ACTIVE User reuse credential เดิมโดยไม่ activate ซ้ำ
- Hospital/OSM ต้องไม่รู้หรือกำหนด patient secret credential
- OSM Hospital association แยกจาก `HospitalMembership` และยังไม่ใช่ patient, area หรือ clinical scope
- Authorization ตัดสินด้วย `Role + Capability + Scope` ผ่าน server-side policy และต้อง fail closed
- Browser, client state หรือ request parameter ไม่ใช่ authority สำหรับ permission หรือ scope
- Multi-record business operation ที่ consistency-critical ต้องเป็น transactional
- Admin เน้น governance/recovery ไม่ใช่ routine operational workflow

## Client and Transport Rules

- DEMI field UX เป็น mobile-first โดย `OSM` และ `PATIENT` ต้องใช้งานหลักได้ดีบน mobile devices
- Responsive Web เป็น implementation platform หลักในระยะแรก
- LIFF เป็น initial client/access channel ไม่ใช่ identity หรือ authorization authority
- Native mobile app เป็น future client และไม่อยู่ใน current implementation scope
- Server Actions เป็น web transport adapters
- HTTP APIs เป็น transport adapters สำหรับ client/integration ที่มี requirement จริง
- Application Services ต้อง transport-agnostic และ reuse ได้จากทั้ง Server Action และ HTTP API
- Business logic, Policy และ Prisma orchestration ต้องไม่อยู่ใน Server Actions หรือ Route Handlers
- HTTP API เพิ่มแบบ incremental; ไม่สร้าง endpoint แบบ speculative สำหรับทุก business operation
- LINE identity อาจเชื่อมเป็น external authentication method ของ DEMI User แต่ห้ามแทน `Person`, `User`, role, membership, capability หรือ scope

รายละเอียดและ open questions อยู่ที่ [ADR-0007](./adr/0007-client-transport-and-mobile-ready-architecture.md)

## Application Architecture

```text
Web → Server Action ─────────┐
                             │
LIFF → HTTP API? ────────────┼→ Application Service
                             │           ↓
Native → HTTP API (future) ──┘  Policy / Authorization
                                         ↓
                                       Prisma
                                         ↓
                                PostgreSQL / Supabase
```

| Layer | Responsibility |
| --- | --- |
| Client / UI | Responsive Web และ LIFF ในปัจจุบัน รวมถึง native app ในอนาคต; ทำ rendering/interaction แต่ไม่ตัดสิน authorization ขั้นสุดท้าย |
| Server Action / HTTP API | Peer transport adapters สำหรับ authentication/session resolution, transport validation, input mapping, service invocation และ client response mapping |
| Application Service | Orchestrate business operation, business rules, policy และ persistence โดยไม่กลายเป็น god module |
| Policy / Authorization | ประเมิน actor, role/membership, capability, target resource และ scope; ambiguity หรือ resolution failure ต้องจบด้วย deny |
| Prisma | Typed persistence, scoped queries และ transaction; ไม่ใช่ authorization engine |
| PostgreSQL / Supabase | เก็บและบังคับใช้ data integrity ตามที่กำหนด; managed provider ไม่ได้แทน application authorization |

UI, page component, Server Action และ Route Handler ต้องไม่ถือ business rule/query เป็น source of truth

> หาก agent เห็นว่า operation ต้องมี HTTP API ต้องระบุ current client/use case ที่ต้องใช้ endpoint นั้นก่อน เหตุผลว่า “native app อาจต้องใช้สักวัน” เพียงอย่างเดียวยังไม่เพียงพอ

## Phase 16D.3 Patient Classification Persistence

Phase 16D.3 implemented the confirmed operational classification field:
`กลุ่มเสี่ยง → RISK` and `เบาหวาน → DIABETES`. Classification is a patient-global
current row on `PatientProfile`, with append-only `PatientClassificationHistory` and
bounded `AuditEvent` writes in the same Serializable transaction. A patient without
a current row is unclassified; no `UNKNOWN` value or clear workflow was added.

Only active Hospital `OWNER`/`MEMBER` users with an active direct membership and an
exact active Patient-Hospital relationship may mutate it. OSM remains read-only for
this capability and ADMIN-only actors are denied routine mutation. Global state does
not broaden normal patient visibility.

Roster preview now persists valid classification values, treats an equal value as a
NOOP, and marks a differing value for explicit per-row confirmation. Confirmation
choices are schema-validated and HMAC-bound to actor, Hospital, file, contract,
effective date, source row, current value, and source value; current state is
rechecked before row persistence. Core, immutable Baseline, classification,
history, and audit remain atomic per row. Baseline effective-date semantics are
unchanged.

Patient detail shows current classification and bounded history. Patient lists can
filter by `ALL`, `RISK`, and `DIABETES`; current-state counts are Hospital-scoped and
do not count history rows.

Migration: `20260827120000_patient_classification_persistence`.

## Phase 16D.4 OSM / Coach Roster Assignment

Phase 16D.4 implemented the confirmed caregiver intent in `osmCaregiverName` as a
Hospital-scoped Patient–OSM assignment request. The resolver performs deterministic
exact normalized display-name matching against only active OSM users with an active
OSM–Hospital relationship in the server-selected active Hospital. It returns
`OSM_NOT_APPLICABLE`, `OSM_MATCHED`, `OSM_NOT_FOUND`, `OSM_AMBIGUOUS`,
`OSM_SELF_ASSIGNMENT_FORBIDDEN`, or `OSM_DATA_INVALID`; it never fuzzy-matches,
creates accounts, or searches another Hospital. The resolver removes actor-self
from selectable matches. A self-only exact match is review-required rather than
not-found; if another eligible OSM matches, that OSM is re-evaluated as the sole
selectable match.

The existing `PatientOsmAssignment` domain remains the only assignment source of
truth. Assignment mutation still requires an active Hospital `OWNER` and
`patient:assign-osm`; `MEMBER`, OSM, and ADMIN receive no assignment expansion.
Same-current assignments are idempotent NOOPs. A new assignment or a different
current assignment is not silently applied: the OWNER must explicitly confirm each
reassignment. This repository has no safe pre-existing workforce disambiguator for
OSM display, so visually indistinguishable `OSM_AMBIGUOUS` candidates remain
`NEEDS_REVIEW` with no public candidate list, dropdown, auto-pick, or selection
binding. Browser choices that are supported remain opaque HMAC-bound to actor,
Hospital, file fingerprint, effective date, contract version, row, normalized source,
candidate, and relevant current state; confirmation reparses and re-resolves the
workbook before reloading current state inside the row transaction. The remediation
contract is `phase-16d4-osm-assignment-v2`.

Each confirmed logical roster row now composes Patient core, Baseline,
classification, and OSM assignment in one Serializable transaction. Blank caregiver
means no assertion and never unassigns. Not-found, ambiguous, malformed, stale, or
OWNER-required assertions remain review states, and independent rows do not share a
transaction. Public preview data exposes display names only; ambiguous same-name
rows expose no candidate list or selection binding, and internal user IDs remain
server-side. The focused resolver/reconciliation module
keeps assignment rules separate from Patient provisioning; a broader roster
orchestrator extraction remains a recommended Phase 16D.5 hardening task.

`P16C-OSM-01` is closed as OWNER-only assignment authority. The remaining gates are
`IMP-REQ-03` Hospital/รพ.สต. hierarchy and `P16C-PROFILE-01` profile/contact/address
ownership. Neither gate was implemented or closed in Phase 16D.4. See the full
[Phase 16D.4 handoff](./phases/PHASE_16D4_OSM_ROSTER_RESOLUTION_RECONCILIATION_ASSIGNMENT.md).

## Phase 16D.4A Canonical Patient Import Template v1

Phase 16D.4A establishes `patient-import-template-v1` as DEMI's one official
production-facing Patient roster workbook. The blank, single-sheet artifact is
generated from the shared source-of-truth contract at
`src/modules/patient-provisioning/import/patient-import-template-contract.ts`, built
by `src/modules/patient-provisioning/import/patient-import-template.ts`, and served at
`/templates/demi-patient-import-template-v1.xlsx`. It has the approved 28-column A:AB
order, two-row header semantics, `L2` classification guidance, and the operational
vertical merges. Merge presentation is not parser authority: the adapter reads merge
masters once and treats continuations as empty, while independent duplicate header
rows still fail.

The production preview/confirm path uses strict canonical validation; legacy aliases
remain available only through explicit compatibility parsing and cannot redefine the
canonical contract. National ID, HN, phone, emergency-phone and postal-code input
columns are formatted as text, and classification guidance accepts only
`กลุ่มเสี่ยง` / `เบาหวาน`, with server validation remaining authoritative. The generated
artifact has no Patient rows or PII and is covered by semantic generator/parser drift
tests.

The workbook defines input structure, not persistence ownership. Current Patient core,
Baseline, classification and Phase 16D.4 OSM behavior remain unchanged; DOB, gender,
phone, address and emergency-contact fields remain non-persisted where currently
gated. `IMP-REQ-03` Hospital / รพ.สต. hierarchy and `P16C-PROFILE-01`
profile/contact/address persistence ownership remain OPEN. Phase 16D.5 has not
started; this handoff must be re-audited before that phase is considered.

## Phase 16D.5 Full Roster Import Orchestration & Compatibility Hardening

Phase 16D.5 extracts Patient roster preview/confirm orchestration from
`patient-provisioning-service.ts` into the server-only
`patient-roster-import-service.ts`, with a cohesive preview/state helper and
bounded roster contract types. The provisioning service now remains focused on
single-Patient provisioning, scopes, and one-way compatibility exports. The roster
service owns canonical preview, authoritative confirm-time re-evaluation, row
readiness, summary computation, and one Serializable transaction per executable
row; it composes the existing Patient core, Baseline, Classification, and OSM
transaction seams without copying their domain rules.

Production preview and confirm still use adapter `mode: "CANONICAL"` and the
`patient-import-template-v1` structural contract. `COMPATIBILITY` remains explicit
for legacy/support tests only; no production canonical-to-compatibility fallback
exists. HMAC binding, file/actor/Hospital/effective-date/runtime-contract checks,
opaque browser choices, server-derived authority, OWNER-only OSM mutation, exact
target-Hospital resolution, self/ambiguous safeguards, blank-source no-assertion,
and per-row atomicity remain intact.

Canonical Template v1 supports all 500 Patient records at Excel source rows 3–502;
reconciliation `rowNumber` remains the authoritative worksheet coordinate rather
than a 1–500 Patient ordinal. The source-row bound is technical XLSX range only,
while reconciliation choice arrays remain capped at 500 items and confirm still
requires a matching authoritative preview and binding.

Summary primary buckets are computed once from final row results and must sum to
the number of represented rows. Domain counters may overlap by design.
`ALREADY_EXISTS` is successful idempotence and is not an attention state. No schema,
migration, import-batch persistence, Hospital hierarchy, or gated profile/contact
persistence was added. `IMP-REQ-03` and `P16C-PROFILE-01` remain OPEN. See the
[Phase 16D.5 handoff](./phases/PHASE_16D5_FULL_ROSTER_IMPORT_ORCHESTRATION_HARDENING.md).

## Phase 16D.6 Import Preview / Confirmation UX Polish

Phase 16D.6 makes the already-confirmed canonical Patient roster workflow
operationally legible: the Template download and limits are visible, effective
date meaning is explained, selected-file state includes size and reset behavior,
preview summaries distinguish executable rows from idempotent and attention rows,
and the table shows actual Excel coordinates with masked identity and grouped
domain details. Classification changes and OWNER-controlled OSM reassignment are
explicit confirmations; initial OSM assignment and MEMBER `OWNER_REQUIRED`
limitations are visible without moving authority into the client.

Import remains independently executable per row. The UI explains partial imports,
disables confirmation when no row can execute, keeps `ALREADY_EXISTS` out of
attention counts, reports mixed/all-idempotent/all-blocked outcomes truthfully,
and offers category-specific recovery guidance plus `นำเข้าไฟล์ใหม่`. Recovery
distinguishes data review, explicit Classification/OSM confirmation, Owner-only
caregiver action, and failed-row retry. Preview badges project a confirmed
`NEEDS_REVIEW` row as `พร้อมนำเข้า` without mutating server classification;
executable count, attention count, and badge use the same readiness helper.
Canonical binding, confirm-time server re-evaluation, transaction boundaries,
classification vocabulary, OSM authority, Template v1 structure, persistence
fields, and schema remain unchanged. `IMP-REQ-03` Hospital / รพ.สต. hierarchy and
`P16C-PROFILE-01` profile/contact/address persistence ownership remain OPEN.
See the [Phase 16D.6 handoff](./phases/PHASE_16D6_IMPORT_PREVIEW_CONFIRMATION_UX_POLISH.md).

## Phase 16E Patient Import End-to-End Release Gate

The original 2026-08-28 Phase 16E audit examined the complete current Patient
roster import journey at
`41260bb47f1fc7b26396d7f66bba7556e179536a`. Canonical Template v1 remains the
production-only input boundary, the 500-record/source-row-502 contract remains
correct, and the confirmed Core/Baseline/Classification/OSM, authority, binding,
privacy projection, row atomicity, rollback, concurrency, result and recovery
semantics remain coherent. Required lint, typecheck, Prisma, unit and integration
checks passed.

The original audit recorded the release gate as **FIX REQUIRED**, not closed. A
source-backed parser resource boundary finding remained:
`readPatientImportCandidates()` fully loaded attacker-controlled XLSX content
through ExcelJS before decompressed ZIP/XML resource limits were enforced.
Separately, Phase 16B.0 documentation still recorded GitHub-side
cached/unreachable sensitive-workbook cleanup as unconfirmed; this was an
**EXTERNAL PRIVACY RELEASE BLOCKER** in that audit. This paragraph preserves the
audit-time conclusion; the current owner decision is recorded below.

`IMP-REQ-03` Hospital / รพ.สต. hierarchy and `P16C-PROFILE-01` profile/contact/address
persistence ownership remain OPEN and were not guessed or resolved by Phase 16E.
See the [Phase 16E release-gate audit](./phases/PHASE_16E_PATIENT_IMPORT_END_TO_END_RELEASE_GATE.md).

### Phase 16E.1 XLSX parser resource-boundary handoff

At the Phase 16E.1 handoff, Phase 16E.1 had implemented server-side XLSX ZIP/XML
resource hardening before ExcelJS
load, with bounded entries, decompressed bytes, worksheet parts/cells/rows,
coordinates, merges, duplicate/unsupported/encrypted/malformed handling and bounded
streaming XML inspection. The parser-resource blocker was remediated and awaited
independent re-audit. The overall Patient Import release gate at that handoff
remained **FIX REQUIRED**; the separate Phase 16E.2 **EXTERNAL PRIVACY RELEASE
BLOCKER** for GitHub historical sensitive-workbook cached/unreachable cleanup
remained open and was not accessed or changed here.

The Phase 16E.1 follow-up additionally verified actual decompressed bytes for every
non-directory XLSX file entry, including non-worksheet and binary/media parts. A
single `actualTotalUncompressedBytes` package counter enforces the 32 MiB actual
budget, while the existing declared central-directory budget and `yauzl` size
validation remain in place. Worksheet SAX inspection uses the same stream as the
counter; non-worksheet entries are drained without buffering. At that handoff, the
parser blocker was ready for re-audit and the overall Patient Import release gate
remained **FIX REQUIRED** pending the separate Phase 16E.2 external privacy
evidence.

### Current handoff (2026-08-29)

The Phase 16E Patient Import End-to-End Release Gate is **PASS / CLOSED**. Phase
16E.1 parser hardening passed re-audit and is **PASS / CLOSED**; the parser resource
blocker is **CLOSED**.

The current Patient Import capability is **STABLE / RELEASE-GATED FOR CURRENT
CONFIRMED DEMO/MVP SCOPE**. This is the confirmed bounded demo/MVP baseline, not a
claim that every future customer requirement is complete.

The historical GitHub cached/unreachable sensitive-object cleanup remains
**EXTERNAL OWNER-MANAGED FOLLOW-UP**, **NOT RELEASE-BLOCKING**, and **NOT RESOLVED**.
The project/repository owner will coordinate external confirmation separately. No
GitHub purge/cleanup completion is claimed. The current reachable repository tree
remains safe for the reviewed scope based on existing audit evidence, while the
historical external-object follow-up remains pending. These are distinct privacy
positions.

Open requirements remain `IMP-REQ-03` Hospital / รพ.สต. hierarchy and authority
semantics and `P16C-PROFILE-01` profile/contact/address persistence ownership.
See the [Phase 16E release-gate audit](./phases/PHASE_16E_PATIENT_IMPORT_END_TO_END_RELEASE_GATE.md)
for the full chronology and final release-governance decision.

## Phase 17A Customer Flow Canonicalization and UAT Contract

Phase 17A defines the next product target as a customer-testable UAT demo, not
only the requirement-gathering demo boundary recorded in Phase 15E.3. It maps
the customer-provided Patient, OSM, Hospital staff and Hospital Owner journeys
against the current runtime, preserves accepted identity/authorization/security
invariants, and classifies each capability with an ordered UAT backlog.
When the Phase 17A contract was issued, Patient self-service and patient appointment access were missing from runtime; existing
care workflows, operator appointments and Program factual reporting remained available within their current scopes. Phase 17A
itself changed no product code or schema. Phase 17B gives an authenticated Patient a Personal workspace and read access to
their own basic profile. **Phase 17C Patient Care Journey & Appointment Read is formally closed** after permanent TSX discovery was verified by the normal npm test run (**146 test files / 1,037 tests passed**): Personal now links to exact own
Hospital relationship care history and read-only appointment list/detail, using allowlisted projections over existing canonical
records. Care, Program and Appointment histories use bounded 50-record pages with older-page navigation. Baseline displays its
confirmed DTX mg/dL field; Follow-up/Final generic bloodSugar values remain withheld until unit/context is accepted. The Patient
path rechecks SELF ownership for every relationship/resource; no Patient writes or schema migration were added. At Phase 17C close, PAM/PROM meaning, Health Plan, appointment actions and other requirement-gated semantics remained closed; appointment interactions were subsequently resolved and implemented in Phase 17D.0/17D.1. At Phase 17C close, Login-page registration (AUTH-04) and Patient service requests/enrollment (CARE-07) were still gated; their owner-approved contracts were subsequently resolved and implemented in Phase 17E.3. Caregiver access and the other unresolved domains remain gated. A
parallel UAT Delivery / Environment Track covers environment, safe data, representative accounts, deployment, smoke checks,
reset/recovery, and customer handoff readiness.

The authoritative contract is
[Phase 17A Customer Flow Canonicalization and UAT Contract](./phases/PHASE_17A_CUSTOMER_FLOW_CANONICALIZATION_UAT_CONTRACT.md);
the implementation sequence is
[Phase 17 UAT Backlog](./phases/PHASE_17_UAT_BACKLOG.md). The Phase 17B scope and implementation handoff are recorded in the
[Patient Workspace & Own-Scope Foundation handoff](./phases/PHASE_17B_PATIENT_WORKSPACE_OWN_SCOPE_FOUNDATION.md), and the
Phase 17C implementation in [Patient Care Journey & Appointment Read](./phases/PHASE_17C_PATIENT_CARE_JOURNEY_APPOINTMENT_READ.md).
Use the Phase 17A contract for customer-flow scope and priorities; the Architecture Baseline and accepted ADRs continue to govern
security, identity, authorization and unresolved architecture invariants.

## Phase 17C closure and Phase 17D.1 appointment interactions

Phase 17C is formally closed after the permanent Vitest TSX discovery globs were verified and the normal repository suite passed with 146 test files and 1,037 tests. The exact handoff evidence is recorded in [Phase 17C](./phases/PHASE_17C_PATIENT_CARE_JOURNEY_APPOINTMENT_READ.md).

[Phase 17D.0](./phases/PHASE_17D0_APPOINTMENT_INTERACTION_CONTRACT_CONSOLIDATION.md) records the owner-approved resolution of P17D-APT-01 through P17D-APT-18. [Phase 17D.1](./phases/PHASE_17D1_APPOINTMENT_INTERACTION_IMPLEMENTATION.md) is formally closed after implementing Patient acknowledgement-only and cancellation-request actions, exact-assigned OSM coordination/proxy/create actions, direct Hospital cancellation review, truthful doctor/nurse/historical responsibility labels, appointment-time OSM snapshots, and allowlisted Thai Patient/Work views. Acknowledgement remains separate from AppointmentStatus; Patient and OSM do not directly reschedule or cancel, and DEMI has no reschedule-request workflow. P17D-NOTIF-01 remains open as an overall roadmap/UAT item. The owner-approved bounded appointment-only contract is in [17J.4A](./phases/PHASE_17J4A_OWNER_DECISION_CLOSEOUT.md); 17J.4B focused unit and PostgreSQL verification pass for synthetic fixtures only, and no real Push is authorized. Closeout verification for the original 17D.1 scope, including the browser viewport limitation, is recorded in the Phase 17D.1 handoff.

## Phase 17E.0 / 17E.1 Patient profile and account security; consent remains gated

[Phase 17E.0](./phases/PHASE_17E0_PROFILE_ACCOUNT_CONSENT_CONTRACT.md) records the owner-approved 2026-09-30 decisions for Patient general profile fields and UAT account scope. [Phase 17E.1](./phases/PHASE_17E1_PROFILE_ACCOUNT_SECURITY_IMPLEMENTATION.md) implements Patient SELF Hospital-scoped profile editing, authenticated password change, and assisted recovery. The approved fields exclude name, DOB, National ID, HN, and clinical data; Patient SELF does not mutate shared `PatientProfile`. Broader account governance and non-Patient recovery questions remain open. P17E-CONSENT-01..03 remain pending; no consent model, lifecycle, or 17E.2 behavior is approved or implemented.

## Phase 17E.3 Patient core business flow

[Phase 17E.3](./phases/PHASE_17E3_PATIENT_CORE_FLOW_GAP_CLOSURE.md) records the former UAT contract for AUTH-04 and CARE-07. The public Patient account-access request and OWNER review workflow were retired by [ADR-0020 Addendum RA-1](./adr/0020-self-registration-by-national-id.md). The current route requires an OWNER-added Patient roster record through Excel import under ADR-0019; the Patient then self-registers by national ID or uses an OWNER-issued invite/assisted activation. `PatientActivation` remains authoritative for invite and assisted activation.

The old `/patient/access-request` page, `/app/patients/access-requests` workspace, and request services/actions are removed. No new request is accepted and existing unresolved `PatientAccessRequest` rows stay unchanged and inert; the table, enums, foreign keys, and audits remain available to DBAs without a migration. Legacy linked activation still activates the Patient but does not advance request status. End-of-care continues to revoke the unclaimed activation and unlink its request reference.

“บริการของฉัน” creates a separate `PatientServiceRequest` under the Patient’s exact existing active Hospital relationship. `HospitalServiceOffering` exposes only SCREENING, FOLLOW_UP, and EMPOWERMENT request categories. Patient request/approval/start does not create a clinical Program or OSM assignment; an OSM selection is a validated exact-Hospital preference, while `PatientOsmAssignment` remains authoritative. Catalog management is direct OWNER-only for this UAT slice; exact direct OWNER/MEMBER Hospital scope reviews requests. No hierarchy or Platform ADMIN operational bypass is added. CARE-02, CARE-06, PAT-03, PAT-05, ACCOUNT-02 consent, Family/Caregiver, Medication, Wellness, Hospital content/contact, and Notifications remain separate gates. Phase 17E.2 remains parked. Phase 17F.0 is closed and Phase 17F.1 now implements the approved Family relationship security foundation; see the [17F.1 handoff](./phases/PHASE_17F1_FAMILY_CAREGIVER_RELATIONSHIP_SECURITY_FOUNDATION.md).

## Phase 17F.1 Family / Caregiver Relationship Security Foundation

Phase 17F.1 adds purpose-specific invitation and relationship persistence, a hashed 256-bit invitation secret with a 24-hour database-clock TTL, exact existing ACTIVE User/Person recipient binding through the canonical National-ID hash service, explicit authenticated accept/reject, Patient revocation, caregiver withdrawal, transactional audit and bounded management-only routes. PostgreSQL partial unique indexes enforce one actionable pending invite and one ACTIVE relationship per Patient/caregiver pair. The relationship is database-bound to the same Patient/caregiver pair as its source invitation. Both management perspectives include only the opposite participant’s givenName/familyName alongside lifecycle metadata so users can safely identify invitations and relationships before terminating them. These names are management identity metadata only; ACCEPTED source status remains enforced by the explicit acceptance service transaction.

At the historical 17F.1 closeout, the Patient-resource capability allowlist remained EMPTY. No caregiver Patient-profile, Hospital-profile, appointment, care, Screening, Baseline, Program, Goal Plan, Follow-up, Final, evidence, service-request, medication, clinical-record or emergency-contact access was added. Family remains separate from OSM assignment and emergency contacts. No CAREGIVER role, Patient impersonation, new-account onboarding, kinship verification or QR was added. See the [17F.1 implementation handoff](./phases/PHASE_17F1_FAMILY_CAREGIVER_RELATIONSHIP_SECURITY_FOUNDATION.md) for schema, routes, exact projection fields and verification evidence.

Phase 17F.3B: [QR decision pack](./phases/PHASE_17F3_FAMILY_INVITATION_QR_DECISION_PACK.md) retains 17F.3A source history and records approvals; [implementation contract](./phases/PHASE_17F3B_FAMILY_INVITATION_QR_CONTRACT.md) defines bounded handoff. **P17F-L03 CLOSED / OWNER APPROVED; Q18–Q29 = A; 17F.3 QR transport IMPLEMENTED**. L04 OPEN; L05 OPEN / FUTURE; Q5 real-data GOVERNANCE BLOCKED unchanged. ดู [17F.3 implementation handoff](./phases/PHASE_17F3_FAMILY_INVITATION_QR_IMPLEMENTATION.md): local transient QR และ generic preview-response hardening implement แล้ว; ไม่มี schema/migration/new authority/native integration. Login/fragment edges และ real-device QR scan ยัง L04 evidence-gated.

## Phase 17F.2B delegated appointment read decisions closed

[17F.2A decision pack](./phases/PHASE_17F2_DELEGATED_READ_DECISION_PACK.md) retains SELF implementation evidence and historical alternatives. [17F.2B closeout / implementation contract](./phases/PHASE_17F2B_DELEGATED_APPOINTMENT_READ_CONTRACT.md) records explicit owner-approved Q1–Q17 and **P17F-L01/L02/L06 CLOSED / OWNER APPROVED** for appointment read only. **17F.2 appointment-read v1 IMPLEMENTED for synthetic/demo data; delegated capability = `family-appointment-read-v1` only.** See the [implementation handoff](./phases/PHASE_17F2_DELEGATED_APPOINTMENT_READ_IMPLEMENTATION.md). The server-only `FAMILY_DELEGATED_APPOINTMENT_READ_ENABLED` operational gate defaults disabled, including development and production; enabling it is not privacy/controller approval. Real-data delegated deployment/UAT is GOVERNANCE BLOCKED until responsible external controller/privacy approval evidence exists; this does not block synthetic implementation/UAT.

Family delegated-data grant is separate from ZERO-data family-delegation-v1 relationship acceptance: Patient proposes one exact PHR; intended caregiver accepts immutable family-appointment-read-v1. Disclosed fields are exactly hospitalName, type, scheduledAt, durationMinutes, locationType, status; management givenName/familyName remain unchanged. Rolling upcoming 90-day SCHEDULED/CANCELLED window permits ongoing eligible same-PHR records; grant has no independent automatic expiry. Future Hospitals/PHRs and replacement relationships never inherit grants; expansion needs new immutable grant/version and acceptance. Exact grant/parent revoke or withdrawal is terminal authority loss after commit; Hospital/account temporary ineligibility denies only, same unchanged valid authority may resume. Adult voluntary designated trusted caregivers include non-relatives; no kinship type/verification, CAREGIVER role or impersonation. No mutations/export/other Patient resources. Lifecycle transactional audit, no durable ordinary per-read AuditEvent. See contract for authorization/acceptance criteria; no new ADR required.

## Open Requirements

รายการ canonical อยู่ที่ [Explicitly Unresolved Questions](./architecture/DEMI_ARCHITECTURE_BASELINE.md#23-explicitly-unresolved-questions) โดยประเด็นที่ยังห้ามล็อกในการ implementation ได้แก่:

- OSM scope นอกเหนือจาก Patient `ASSIGNED_PATIENTS`: area, geographic หรือ clinical scope ยังไม่ตัดสิน
- สิทธิ์ทั่วไปของ parent/main hospital ต่อ child hospitals ใน workflow ที่ไม่ใช่ Patient access ยังไม่ตัดสิน; ข้อยกเว้นคือ Parent per-Child-Hospital reporting ตาม [canonical requirement](./requirements/REPORTING_ACCESS_CANONICAL.md) ซึ่งยืนยันแล้วและมี RPT-NET-01 authorization, RPT-NET-02 consumer, RPT-NET-02B exact-Child source/projection/audit และ RPT-NET-02C summary fields ใน UI. Patient identifiers, clinical details และ Patient authorization ยังคงอยู่นอก Parent scope; Patient reads/mutations ใช้ direct Hospital scope ตามเดิม
- การแต่งตั้ง Hospital Owner เพิ่มเติม
- ความแตกต่างด้าน permission ระหว่าง Doctor/Nurse และผู้อนุมัติ care plan
- Patient-submitted health measurements and any future identity-correction/reconciliation workflow remain open; the separate bounded general profile field set is approved and implemented in [Phase 17E.1](./phases/PHASE_17E1_PROFILE_ACCOUNT_SECURITY_IMPLEMENTATION.md).
- การแจ้งเตือนนัดหมาย: LINE Messaging API เป็น transport ที่อนุมัติใน [Phase 17J.0](./phases/PHASE_17J0_LINE_OA_LIFF_ARCHITECTURE_IDENTITY_CONTRACT.md). [J4A owner closeout](./phases/PHASE_17J4A_OWNER_DECISION_CLOSEOUT.md) อนุมัติเฉพาะ appointment create, actual date/time reschedule และ canonical cancellation สำหรับ synthetic/demo; [17J.4B runtime](./phases/PHASE_17J4B_APPOINTMENT_NOTIFICATION_IMPLEMENTATION.md) ผ่าน focused unit และ PostgreSQL verification แล้ว แต่ไม่ปิด P17D-NOTIF-01 หรือ overall Phase 17J.4. Real Push, external privacy/governance approval และ real-provider/device UAT ไม่ได้อนุมัติ; Medication, follow-up, request-decision, additional-recipient และ general consent/preference expansion ยัง requirement-gated. ดู [Phase 17D.0](./phases/PHASE_17D0_APPOINTMENT_INTERACTION_CONTRACT_CONSOLIDATION.md) และ [Phase 17D.1](./phases/PHASE_17D1_APPOINTMENT_INTERACTION_IMPLEMENTATION.md).
- การ transfer/reassign patient โดย OSM และการเปลี่ยน hospital affiliation โดย patient
- หลักฐานและขั้นตอนสำหรับ hospital verification beyond the bounded Phase 17E.3 direct-check attestation
- ~~authoritative external Hospital Master provider~~ ปิดแล้วโดย ADR-0017: ไม่มี external Master, Platform ADMIN registration คือแหล่งข้อมูล Hospital; WB-PD-12 ปิดแล้วโดย ADR-0018: แม่ข่ายสมัครผ่านหน้าสาธารณะ ลูกข่ายใช้คำเชิญจาก OWNER แม่ข่าย ([WB-PD-12](./requirements/WB_ALIGNMENT_DECISIONS.md))
- hospital onboarding reapplication, competing claim และ existing account recovery semantics
- Long-term Patient activation proofing and identity-proofing beyond Phase 5B.2 remain open; Phase 17E.1 assisted recovery does not change activation semantics or approve automated delivery channels.
- P17F-L01/L02/L06 are CLOSED / OWNER APPROVED only for the bounded 17F.2B appointment-read contract. P17F-L03 QR CLOSED / OWNER APPROVED; 17F.3 QR transport IMPLEMENTED, L04 re-audit/UAT OPEN, L05 expiry/renewal OPEN / FUTURE; real-data delegated use requires external Q5 approval. Minors/legal representation remain deferred, Phase 17E.2 consent parked. Medication: 17G.0 CLOSED; Q30–Q53 CLOSED / OWNER APPROVED; MED-01 / Phase 17G.1 IMPLEMENTED / CLOSED for bounded Patient SELF Personal Medication only; see [implementation evidence](./phases/PHASE_17G1_PERSONAL_MEDICATION_IMPLEMENTATION_HANDOFF.md), [17G.0B closeout](./phases/PHASE_17G0B_MEDICATION_DECISION_CLOSEOUT.md) and [17G.1 contract](./phases/PHASE_17G1_PERSONAL_MEDICATION_IMPLEMENTATION_CONTRACT.md). No browser/device-UAT PASS is inferred. MED-02 REQUIREMENT-GATED; 17G.2 IMPLEMENTED / CLOSED for bounded Daily Medication Schedule with [automated implementation evidence](./phases/PHASE_17G2_DAILY_MEDICATION_SCHEDULE_IMPLEMENTATION_HANDOFF.md); 17G.3C IMPLEMENTED / CLOSED for bounded occurrence source; 17G.4A PASS / AUTOMATED RE-AUDIT COMPLETE; MED-01 automated scope ready for manual/UAT tracking; adherence DEFERRED; 17J.0 LINE architecture/transport CLOSED, while 17J.4 delivery remains gated by approved event semantics; P17F-L04 OPEN / deferred; Q5 unchanged GOVERNANCE BLOCKED.
- additional required staff/OSM profile fields นอกเหนือจาก minimum Phase 4A input
- clinical data ที่ต้องมี immutable/auditable history
- High-level Hospital/Global reporting audiences ถูกยืนยันใน [Phase 18C.1A](./phases/PHASE_18C1A_GLOBAL_REPORTING_REQUIREMENT_RECONCILIATION.md); field/metric semantics, population, per-actor capability/scope, clinical meaning, privacy/Data Controller approval และ export authorization ยังเปิด
- additional complex LIFF workflow after the 17J.1 account-link foundation, exact Thai UI copy for unlink/recovery, `/api/v1` operations, native authentication, offline/sync, native push/device capabilities และ trigger สำหรับเริ่ม native development. LINE topology and LIFF account-link authority are closed by [Phase 17J.0](./phases/PHASE_17J0_LINE_OA_LIFF_ARCHITECTURE_IDENTITY_CONTRACT.md); unlink/relink behavior is specified in [Phase 17J.1](./phases/PHASE_17J1_LINE_ACCOUNT_LINK_RICH_MENU_IMPLEMENTATION_CONTRACT.md), and multi-role menu Option C is approved in [Phase 17J.0B](./phases/PHASE_17J0B_MULTI_ROLE_RICH_MENU_DECISION_CLOSEOUT.md).

> หาก business rule ที่จำเป็นต่อ implementation ยังไม่มีในเอกสาร ห้ามเดา ให้ mark เป็น open requirement หรือขอ clarification

## Source of Truth

เรียงลำดับอำนาจจากสูงไปต่ำ:

1. Confirmed current business requirements
2. Accepted ADRs
3. [Architecture baseline](./architecture/DEMI_ARCHITECTURE_BASELINE.md)
4. `CONTEXT.md`
5. Legacy code เฉพาะ behavioral reference

เมื่อ accepted ADR ใหม่ supersede decision เดิม ต้อง update architecture baseline และ `CONTEXT.md` ใน change เดียวกันเพื่อไม่ให้คำแนะนำปัจจุบันขัดกัน

## Agent Working Rules

- รักษาไฟล์และข้อความภาษาไทยเป็น UTF-8 without BOM; ตรวจไม่ให้เกิด mojibake
- ให้ correctness มาก่อน abstraction และเลือก implementation ที่เรียบง่าย ดูแลได้
- ใช้ schema, policy และ business service ที่มีอยู่เป็น source of truth ก่อนสร้างของใหม่
- สร้าง authorization ฝั่ง server และ fail closed เสมอ; UI ใช้เพื่อ UX เท่านั้น
- ใช้ capability ที่มาจาก confirmed requirement ไม่สร้าง generic RBAC framework ล่วงหน้า
- ไม่สร้าง permission เพียงเพราะ profession ต่างกัน หาก requirement ไม่ได้กำหนด behavior ต่างกัน
- ไม่เดา OSM scope นอกเหนือจาก accepted Phase 6A assigned-Patient rule, hospital-network authority หรือ Patient scope อื่นที่ยังไม่มี requirement
- ไม่ bind DEMI identity/authorization เข้ากับ LINE identity หรือ client transport
- ไม่สร้าง HTTP API โดยไม่มี identified current consumer/use case
- ไม่ออก full database schema จาก conceptual entities ใน baseline โดยไม่มี task อนุมัติ
- เมื่อ architecture decision เปลี่ยนสาระสำคัญ ให้สร้าง ADR ใหม่เพื่อ supersede ฉบับเดิม แล้ว sync baseline/context

## Workforce onboarding v2 remediation (review e61cd863)

Current implementation/security restrictions supersede the historical Phase 4B/D3 summary above:
ACTIVE MEMBER can provision/read OSM only; OWNER retains direct staff/OSM management. Directory
queries are keyset-paginated and searchable; bulk submissions have durable actor/Hospital/kind/
payload-bound HMAC receipts with stable per-row replay outcomes and a 30-day key lifetime.
Global assisted password recovery (workforce and Patient-only) is deliberately unavailable
without approved independent account-owner proof, including for ADMIN and multi-role identities.
[ADR-0012](./adr/0012-global-credential-recovery-proof.md) supersedes the Phase 17E.1 assisted
recovery trust assumption without rewriting its history. Pending first-time
activation spanning Hospitals is also gated pending an explicit trust decision. Initial activation
now binds issuer/Hospital/relationship context and has durable provider-operation states; old
unbound credentials are revoked and ambiguous claimed RESETs quarantine application access.
This is remediation implementation, not production deployment or complete account-recovery
acceptance. See [ADR-0008 amendment](./adr/0008-workforce-provisioning-and-activation.md) and
[verification/runbook handoff](./phases/WORKFORCE_ONBOARDING_V2_REMEDIATION.md).

## WF-PHONE — เบอร์ติดต่อบุคลากร (2026-10-24)

**เบอร์ติดต่อบุคลากร:** เบอร์ที่ OWNER ระบุให้บุคลากรหรือ อสม. ในความสัมพันธ์กับโรงพยาบาลแต่ละแห่ง แยกจากข้อมูลตัวตนและเบอร์ผู้ป่วย; OWNER ของโรงพยาบาลนั้นดูและแก้ไขได้ ผู้ใช้ไม่แก้ไขเอง และรายการเดิมอาจยังไม่มีเบอร์

**เบอร์ติดต่อ อสม. ที่ดูแลปัจจุบัน:** เบอร์ของ อสม. ที่มีการมอบหมายปัจจุบันในความสัมพันธ์ผู้ป่วยนั้น เจ้าหน้าที่ OWNER/MEMBER ของโรงพยาบาล ACTIVE เดียวกันเห็นในบริบทการดูแล และผู้ป่วย SELF เห็นเฉพาะ อสม. ที่ดูแลตน ผู้ดูแล/ญาติไม่เห็นเบอร์บุคลากรใด ๆ; เบอร์เจ้าหน้าที่ไม่แสดงให้ผู้ป่วย ไม่มีเบอร์บุคลากรใน LINE, audit metadata, logs หรือใบเปิดใช้งาน
