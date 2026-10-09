# Phase 17J.4A — Proactive Notification Decision Pack and Implementation Readiness

## Current-status addendum — owner decisions closed (2026-10-09)

[Owner Decision Closeout](./PHASE_17J4A_OWNER_DECISION_CLOSEOUT.md) records J4A-OD01–OD10, Cutover Safety, and Honest Idempotency **APPROVED for isolated synthetic/demo implementation**. Its approved bounded scope supersedes the OPEN recommendation state below. This pack remains historical evidence of the pre-approval proposal and implementation-readiness review.

Phase 17J.4B now records **IMPLEMENTED / AUTOMATED VERIFICATION COMPLETE** for its bounded synthetic/demo scope after focused unit tests passed 7 files / 77 tests and focused PostgreSQL integration passed 1 file / 19 tests. This does not mark overall Phase 17J.4 complete/approved or close P17D-NOTIF-01. See [Phase 17J.4B implementation handoff](./PHASE_17J4B_APPOINTMENT_NOTIFICATION_IMPLEMENTATION.md) for scope, evidence, limitations, and next phase. Real Push, provider/device UAT, deployed activation, external privacy approval, environment/provider mutation, and production release remain unauthorized.

- **Historical preparation status: PROPOSAL READY FOR OWNER REVIEW — decisions were OPEN at that time.**
- **At preparation time, Phase 17J.4A was documentation only; Phase 17J.4 and P17D-NOTIF-01 were not complete or approved.**
- Repository evidence reviewed at baseline **8ff60f1dc06e964f59051122434b2b45681b2b3a**.
- This document changes no application code, schema, migration, dependency, environment, LINE resource, or deployment.

## 1. Purpose and already-approved boundaries

This pack proposes the smallest business and technical slice that could unlock Phase 17J.4B. Recommendations are not requirements until the owner explicitly decides them.

The following scope constraints are already supplied by the owner for this roadmap:

- Existing LINE Login/LIFF and legacy Link/Unlink remain the isolated demo/UAT baseline.
- Full LINE deauthorization, lifecycle activation, and bounded Recovery hardening stay in a separate backlog. Keep **DEMI_LINE_DISCONNECTION_ENABLED=false**.
- Do not provision or activate a LINE MINI App channel.
- Automated Recovery tests and the reviewed UAT matrix are prerequisites for future isolated UAT only; they do not complete real-provider UAT.
- No deployment, environment mutation, LINE provider authorization mutation, or production release is authorized.
- Continue the original Phase 17 roadmap. This decision pack does not reopen or implement Phase 17J.3D.

## 2. Current implementation truth

| Concern | Authoritative source and current behavior | Reusable capability | Notification-specific gap |
| --- | --- | --- | --- |
| Appointment creation | **createAppointment** in [appointment-service.ts](../../src/modules/appointments/services/appointment-service.ts) checks the current actor scope (direct Hospital or exact active OSM assignment), creates a SCHEDULED PatientAppointment, and records **appointment.created** in the same serializable transaction. A submission nonce makes a retried create return the original result. | Canonical appointment row, source transaction, current Hospital/OSM authorization, audit, retry/idempotency behavior. | No committed notification intent is written and no sender is called. |
| Date/time change | **rescheduleAppointment** updates a current SCHEDULED row with expected-version checking, advances updatedAt, supersedes pending cancellation requests, and records **appointment.rescheduled** in one transaction. | Canonical reschedule state and version; stale mutations conflict. | No durable notification event or stale-message suppression. |
| Cancellation | **cancelAppointment** performs a version-checked SCHEDULED-to-CANCELLED transition and records **appointment.cancelled** in the same transaction. Hospital approval uses the same operational transition and resolves the request atomically. | Canonical terminal status, transaction boundary, audit and current Hospital authority. | No notification intent. Duplicate terminal requests do not represent a new state change. |
| Patient acknowledgement | Patient SELF and exact-assigned OSM acknowledgement is recorded by **acknowledgeAppointment** against the current appointment version and audited as **appointment.acknowledged**. It is a separate immutable record and does not change AppointmentStatus. | Existing version-scoped acknowledgement and authorization checks. | No notification. It is not an appointment schedule change. |
| Cancellation request and Hospital decision | Patient SELF / exact-assigned OSM requests are persisted as PENDING with source appointment version and nonce; submission is audited as **appointment.cancellation_requested**. Current direct Hospital authority may approve or reject. Approval audits **appointment.cancellation_request.approved** and cancels the appointment as **appointment.cancelled** in the same transaction; rejection audits **appointment.cancellation_request.rejected** and leaves it scheduled. Reschedule/terminal transitions can supersede pending requests. | Request history, one-pending invariant, current actor/scope checks, atomic decision and cancellation. | No notification intent. No Patient-to-Hospital notification recipient policy exists. Rejection does not change the appointment itself. |
| LINE account binding | [line-account-binding schema](../../prisma/schema.prisma) binds a LINE subject to an existing DEMI User. Current active binding is identified by **unlinkedAt = null**; the line account service verifies identity and the existing DEMI session. Supabase Auth remains the DEMI authentication authority. | Current binding lookup, existing identity verification and authenticated DEMI User resolution. | A LINE subject or binding must never be treated as Patient authority. Notification eligibility needs a current Patient SELF resolution at send time. |
| LINE reachability | [line-reachability-service.ts](../../src/modules/line/services/line-reachability-service.ts) stores FRIEND / NOT_FRIEND / UNKNOWN and observation time from signed follow/unfollow events and link-time friendship verification. The existing Push eligibility helper accepts FRIEND only. | Stored reachability observation and fail-closed eligibility for known non-friends/unknown. | No freshness cutoff, proactive preference, or proof that a Push is visible to a user. |
| Reactive LINE Messaging | [line-reactive-appointment-service.ts](../../src/modules/line/services/line-reactive-appointment-service.ts) resolves a current binding, DEMI ActorContext and Patient SELF authority before a narrow read. [LineMessagingClient](../../src/modules/line/adapters/line-messaging-client.ts) implements Reply and Rich Menu APIs; [line-reactive-scheduler.ts](../../src/modules/line/transport/line-reactive-scheduler.ts) uses request-scoped after() work. | Server-side identity/authorization resolution, narrow presentation, provider adapter patterns and sanitized outcomes. | No Push method, proactive copy approval, durable notification outbox, retry worker, or per-Patient preference exists. Reactive Reply privacy approval does not authorize proactive Push content. |

### Evidence boundaries

- Appointment mutations and audits are transactionally persisted in the appointment service. Audit rows are evidence of source transitions, not a durable dispatch queue; do not poll audit logs as the notification source.
- LineWebhookEventReceipt is a unique webhook receipt for reactive transport deduplication. It is not an appointment notification intent or delivery record.
- The existing after() schedulers are best-effort post-response work. They do not recover pending notifications after process exit and are not a durable retry system.
- Current schema has no appointment notification preference/outbox/delivery-attempt model. The repository has no general queue or periodic notification worker.
- The reactive appointment message permits only Thai date/time and Hospital display name under a separate explicit privacy acknowledgement. That approval is expressly limited to the reactive Patient SELF command; it does not approve the same fields for proactive Push. See [17J.2A](./PHASE_17J2A_REACTIVE_MESSAGING_DECISION_CLOSEOUT.md).
- Existing [17J.0 official LINE platform evidence](./PHASE_17J0_LINE_OA_LIFF_ARCHITECTURE_IDENTITY_CONTRACT.md) records the Push retry-key and HTTP-acceptance caveats. Recheck official LINE documentation before implementing the adapter or setting the retry window.

## 3. Minimal business-flow proposal

### Recommended first slice, still pending approval

Send one LINE Push to the Patient only after an appointment is committed as created, rescheduled, or cancelled through the existing authorized source service. The first slice is event-driven; it does not schedule reminders before an appointment.

Exclude Patient acknowledgement, Patient/OSM cancellation-request submission, cancellation-request rejection, appointment completion/no-show, OSM/Hospital recipients, Family/Caregiver recipients, medication, and follow-up. A Hospital approval that cancels the appointment is represented by the canonical cancellation event; do not send a second request-decision message. These exclusions keep the initial event contract tied to canonical appointment state. A future request-decision notification needs its own recipient and copy decision.

### Proposed send flow

1. The existing appointment service validates the current actor and source scope and commits the state change and a small notification intent in the same database transaction.
2. A bounded worker claims due intents. Before each Push, it re-reads the appointment and exact Patient-Hospital relationship, confirms the event version is still current, resolves the current Patient DEMI User and current Patient SELF authority, then checks current binding, opt-in, and reachability.
3. If the source event is stale or the recipient is no longer eligible, the worker records a safe suppression outcome without calling LINE.
4. The worker constructs only the owner-approved fixed copy, calls LINE Push outside the database transaction, then stores the provider result category and bounded retry state.
5. A later appointment change, opt-out, unlink, or known ineligibility suppresses any not-yet-sent intent. A provider call already in flight cannot be atomically withdrawn.

The original appointment mutation already checked current Hospital authorization inside its source transaction. Delivery must independently verify that the appointment still belongs to the same current Patient-Hospital relationship and that the current Patient SELF identity/authorization and LINE binding remain valid. Neither the event actor captured in history nor LINE identity is an authorization credential.

### Proposed defaults and explicit owner decisions

Every row below is **OPEN — owner approval required**. The recommended column is a proposal only.

| ID | Decision needed | Recommended default | Tradeoff / other option | Status |
| --- | --- | --- | --- | --- |
| J4A-OD01 | Which events send? | Patient Push for create, reschedule, and canonical cancellation only. No reminders. Approval of a cancellation request produces the same cancellation event, not a second push. | Omitting rejected-request notices may leave a Patient to check DEMI. Including acknowledgement/request events broadens meaning and recipient rules; timed reminders need a separate due-time contract. | OPEN |
| J4A-OD02 | Who receives it? | The current Patient SELF user for the exact active Patient-Hospital relationship on the appointment. Never OSM, Hospital staff, Family/Caregiver, or a LINE-only identity in this slice. | A Hospital/OSM notification needs a separately owned recipient roster, role/scope policy, and disclosure decision. | OPEN |
| J4A-OD03 | When, timezone, and quiet hours? | Make each intent due immediately after commit and drain at the next bounded worker run. Do not calculate appointment-relative reminder times in 17J.4B. No timezone calculation is needed for this event-only default. | Immediate delivery may arrive overnight. If quiet hours are required, recommend Asia/Bangkok as the initial business timezone only after explicit approval; defer and coalesce while quiet, then revalidate staleness. The reactive display timezone does not approve this policy. | OPEN |
| J4A-OD04 | Is opt-in required? | Require a separate affirmative Patient preference for appointment updates over LINE, default OFF. Do not infer opt-in from LINE account linking, OA friendship, or the reactive command. Re-link after unlink requires fresh opt-in. This preference is purpose-specific and does not implement or replace Phase 17E.2 legal consent. | Default-on would reduce missed notices but increases disclosure and expectation risk. No preference surface/model currently exists. Product and privacy owners must approve the preference wording and evidence. | OPEN |
| J4A-OD05 | What proves LINE eligibility/reachability? | At each send require exactly one current active binding for the current Patient User and a known FRIEND observation. Proposed freshness ceiling: 30 days; older, UNKNOWN, NOT_FRIEND, missing, or conflicting observations suppress the event. | A freshness ceiling reduces reliance on old observations but may suppress a reachable user. No current process guarantees ongoing friendship reconciliation; Push acceptance cannot establish reachability. Approve the ceiling or explicitly choose another fail-closed policy. | OPEN |
| J4A-OD06 | What message may be exposed? | One generic text for all three events: “มีข้อมูลใน DEMI อัปเดตแล้ว กรุณาเข้าสู่ระบบ DEMI เพื่อตรวจสอบ”. No appointment wording, date/time, Hospital name, Patient name, type, location, staff, request status, identifiers, or clinical detail; no appointment deep link in v1. | More specific copy is more useful but exposes healthcare activity in chat history/previews and needs explicit proactive privacy approval. Even the generic copy needs review for the LINE notification-preview threat. | OPEN |
| J4A-OD07 | How are duplicates and stale events handled? | Persist one intent for each committed source version/event in the same transaction, with a database uniqueness constraint. Before send, require the current appointment version/status to match; suppress older pending versions. Repeated create nonce and no-op cancellation produce no extra intent. | Coalescing favors the latest state and may omit a transient intermediate change. Keeping every event can send contradictory messages. No approach provides exactly-once visible delivery. | OPEN |
| J4A-OD08 | What is retry/result semantics and retention? | One initial attempt plus at most two retries for transient/ambiguous failures, suggested after 1 and 4 minutes with jitter, using the same stable Push retry key and payload within LINE’s currently documented retry-key window. Treat a documented duplicate-key response as provider acceptance for that key only, never as delivery. Stop on permanent errors, stale/ineligible state, or exhausted retry window. Proposed purge of terminal operational rows after 30 days. | Retries can still fail; provider acceptance is not user receipt. Too many retries can duplicate a message outside provider idempotency guarantees. Retention needs operations/privacy approval. Verify current official LINE behavior when implementing. | OPEN |
| J4A-OD09 | What happens on opt-out or unlink? | Immediately prevent new attempts; suppress pending intents at the final eligibility check. Clear notification opt-in on unlink and require fresh opt-in after relink. Do not use an old binding, token, or prior consent for a new binding. | A provider request already submitted may still appear after unlink/opt-out. There is no provider recall guarantee. | OPEN |
| J4A-OD10 | How is proactive Push activated? | Use a separate server-side send gate defaulting OFF (candidate name: **DEMI_LINE_APPOINTMENT_NOTIFICATIONS_ENABLED=false**). Keep it independent from **DEMI_LINE_DISCONNECTION_ENABLED**. Enabling it remains a separate owner/environment action. | A host scheduler without a send gate can dispatch queued notifications whenever configured. No environment mutation or activation is part of this preparation. | OPEN |

No owner decision in this table is inferred from ADR-0009, from 17J.2 reactive approval, or from this recommendation pack.

## 4. Bounded Phase 17J.4B architecture

### Modules and persistence

| Responsibility | Minimal 17J.4B change after approval |
| --- | --- |
| Source event production | Reuse [appointment-service.ts](../../src/modules/appointments/services/appointment-service.ts). Add one appointment-owned outbox recorder used only in create, successful reschedule, and successful canonical cancellation paths. Do not make the Appointment service call LINE. Do not infer events from AuditEvent. |
| Durable intent | Add one purpose-specific Prisma model/table, for example **AppointmentLineNotification**, and one additive migration. Store appointment ID, source version, event kind, due/created timestamps, status, attempt count, next-attempt time, lease state, one stable retry key, and a sanitized last outcome. Unique key: appointment ID + source version + event kind. Store no message body, raw LINE ID, access token, or Patient/clinical payload. |
| Preference | If OD04 is approved, add only a purpose-specific Patient appointment-over-LINE opt-in with auditable version/time and binding-generation behavior. Do not create a generic notification preference framework or general consent system. |
| LINE eligibility and copy | Add a narrow server-only Patient appointment Push service that resolves the current binding and Patient SELF actor, checks the exact relationship/event version, opt-in, and approved reachability rule, then formats a fixed allowlisted message. Reuse the current actor resolution and reachability primitives; do not reuse Reply tokens or reactive copy approval. |
| Provider adapter | Extend **LineMessagingClient** with one text Push operation and stable retry-key support. Classify provider acceptance, transient errors, permanent errors, and ambiguous outcomes separately. HTTP success is PROVIDER_ACCEPTED, never DELIVERED. |
| Delivery trigger | Add one bounded drain service and one authenticated internal trigger for a periodic host scheduler. Check the separate default-OFF proactive-send gate; never reuse the disconnection gate. Claim rows with short database leases/locking, do provider I/O outside transactions, and settle results in a short transaction. Existing after() work is not the durable trigger. There is no generic job framework in this repository. |

### Event and transaction boundary

- Insert the outbox row in the same serializable transaction as the committed appointment mutation and existing audit. If the transaction rolls back, no notification intent survives.
- A successful Hospital cancellation-request approval emits only the canonical cancellation intent because status change and request resolution already share one transaction. A rejection and a request submission emit no intent in the proposed first slice.
- Do not call LINE from a source transaction or hold an appointment/binding lock during provider I/O.
- Re-read current appointment, status, source version, relationship, current Patient SELF authority, active LINE binding, opt-in, and reachability immediately before each attempt. Persist a safe suppression if any check fails.
- There remains a narrow unavoidable race after the final database check and before/in the external LINE request. The service must not claim a send can be revoked or a provider acceptance means delivery.

### Scheduling, idempotency, and failure handling

- Each source intent is durable and immediately due. A single-purpose internal worker runs on a bounded periodic schedule, with a small maximum batch per invocation. A host scheduler is required; none is present in the current repository. No deployment or scheduler activation is included here.
- Unique source-version key prevents duplicate intents from transaction retries or repeated commands. A lease prevents concurrent drains from processing one row at the same time. Lease expiry permits recovery after a worker crash.
- Revalidate before initial send and each retry. Superseded versions, opt-out, unlink, inactive user, no current Patient SELF relationship, stale reachability, or a non-current appointment are terminal suppressions.
- Retry only transient/ambiguous provider failures with a bounded attempt count and the exact same retry key/payload; use exponential backoff with jitter (the proposal is 1 minute then 4 minutes). Stop before the provider’s documented retry-key window expires; do not rotate to a new key for an ambiguous send. A documented duplicate-key response is provider acceptance for that key, not proof of delivery. Permanent provider failures are terminal.
- Keep outcome names truthful: PENDING, PROVIDER_ACCEPTED, RETRY_SCHEDULED, RETRY_EXHAUSTED/UNKNOWN, PERMANENT_FAILURE, and SUPPRESSED_* are candidates. Never expose or record a DELIVERED state without a separate delivery receipt source.
- Log only a safe event/outcome category, durations, and correlation/opaque outbox ID. Do not log the LINE subject, Push body, appointment date/time, Patient/relationship IDs, tokens, or provider request body.

### Required PostgreSQL persistence

A small durable outbox is justified because appointment state must commit independently of LINE availability, and process-local after() work cannot recover after a process exit. One row per source event/version is sufficient for this slice; no generic delivery-attempt ledger, conversation state, or multi-channel schema is needed. Use an additive migration only after owner decisions. Terminal-row retention must be approved before implementation.

## 5. Focused verification matrix for 17J.4B

| Layer | Required cases |
| --- | --- |
| Unit: event and formatter | Only create/reschedule/cancel intents; approval maps to one cancellation; acknowledgement, request submission/rejection, completion/no-show are excluded; generic approved copy contains no appointment data; source-version stale check suppresses older intent. |
| Unit: eligibility and outcomes | Current Patient SELF binding succeeds; LINE identity alone fails; inactive user, changed/missing Patient-Hospital ownership, unlinked/ambiguous binding, opt-out, UNKNOWN/NOT_FRIEND/stale reachability all suppress; provider acceptance is not labeled delivery. |
| Unit: worker/retry | Stable unique key across transaction retry and provider retry; bounded attempt count; permanent errors stop; transient/ambiguous errors reuse the key; stale/opted-out rows are not retried; expired lease is reclaimable. |
| PostgreSQL integration: atomicity | Create/reschedule/cancel and matching outbox row commit together; rollback leaves neither partial intent nor false audit; Hospital request approval writes exactly one cancellation intent in its transaction. |
| PostgreSQL integration: uniqueness/concurrency | Repeated create nonce, no-op cancellation, concurrent drain, duplicate source version, reschedule before drain, and unlink/opt-out before retry do not produce an unintended duplicate or stale Push attempt. |
| Adapter boundary | Fake LINE client verifies exact text Push payload, stable retry header, documented duplicate-key response classification, sanitized error mapping, and no call when eligibility fails. No real LINE message is sent by automated tests. |

Use targeted unit files, targeted PostgreSQL integration, typecheck/lint, and migration compatibility checks proportional to the approved code change. Do not run real-provider/device UAT or change environment/provider state without separate authorization.

## 6. Synthetic demo acceptance criteria

1. Use synthetic Hospital, synthetic activated Patient, and a fake LINE client only; no real Patient data or live provider credential is required. Verify the default-OFF send gate cannot call the provider adapter until separately enabled.
2. With the accepted opt-in and a current eligible binding, a committed create produces one durable due intent and the fake client receives only the owner-approved generic text.
3. Reschedule or cancellation before drain suppresses older versions; only the current eligible version can be attempted. Hospital cancellation approval produces one cancellation intent.
4. Acknowledgement, cancellation-request submission, and request rejection produce no Push in the approved initial slice.
5. Unlink, opt-out, inactive Patient, changed exact Hospital relationship, or failing reachability eligibility suppresses the attempt even if a row was queued earlier.
6. Duplicate mutations/retries and concurrent worker invocations do not create an unintended second provider request. Provider acceptance is shown only as acceptance, not user delivery.
7. The demo can show bounded retry/failure states with a fake client, and proves no appointment/Patient details appear in message content or logs.
8. Synthetic automated success is not real LINE/device UAT, provider authorization evidence, deployment approval, or customer requirement completion.

## 7. Risks, dependencies, and deferred scope

### Dependencies and risks

- All J4A-OD01–OD10 require explicit owner decisions; privacy/controller review is required for any proactive copy because the reactive date/time + Hospital-name approval is explicitly non-transferable.
- No notification preference, outbox, Push method, or periodic worker currently exists. A purpose-specific additive migration, one preference surface if approved, one Push adapter method, one bounded drain, and one authenticated scheduler trigger are the minimum new runtime pieces.
- Reachability observations can become stale, and LINE Push acceptance can occur without a visible message. The proposed freshness cutoff is a product/operations decision, not a current guarantee.
- The host scheduler and its authentication/configuration must be selected before claiming retry recovery. A local fake-client drain is enough for synthetic demo acceptance, not deployment readiness.
- LINE link/unlink state and current Patient/Hospital relationship are rechecked before send. This prevents stale authority from authorizing a send, but cannot retract an already accepted provider request.
- No real Patient data may appear in fixtures, docs, logs, payloads, or demo screenshots.

### Explicitly deferred

- Phase 17J.3D Full Disconnection/Recovery and lifecycle activation, including changing **DEMI_LINE_DISCONNECTION_ENABLED**.
- LINE MINI App provisioning, MINI channel activation, or Gateway.
- Medication Push/reminders, MED-02, adherence, and follow-up reminders without an approved due-event contract.
- Patient/OSM cancellation-request notification to Hospital, Hospital decision notice for rejection, OSM/Hospital/Family recipients, and caregiver delegation.
- Reminder timing, quiet-hour policy, general notification preferences, email/SMS/native Push, generic chatbot/conversation, and cross-domain notification framework.
- Production deployment, environment changes, provider authorization changes, live LINE message sends, and real-provider UAT.

## 8. Explicit next-phase handoff

**Next: owner review and explicit decisions for J4A-OD01 through J4A-OD10.** Record each selected option, decision owner, date, and any copy/privacy approval in this pack or a decision closeout. Do not start delivery implementation while a behavior-affecting decision remains unresolved.

After those approvals, **Phase 17J.4B — bounded appointment-only proactive LINE Push implementation** may begin using the approved slice above. It must not be described as completion of Phase 17J.4 or P17D-NOTIF-01 until the agreed implementation, automated verification, and any separately authorized UAT gates are actually complete.
